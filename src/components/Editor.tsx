import { useEffect, useRef, useState } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorState, Compartment } from '@codemirror/state';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { showMinimap } from '@replit/codemirror-minimap';
import { livePreviewPlugin, cursorPosField } from '../editor/livePreview';
import { editorThemeExtension } from '../editor/theme';
import { executeCommand, CommandAction } from '../editor/commands';
import { flashEffect, addFlash } from '../editor/flashEffect';
import { markdownAutoPairExtension } from '../editor/autoPairs';
import {
	ghostTextExtension,
	setGhostText,
	clearGhostText,
} from '../editor/ghostText';
import { useToast } from '../hooks/use-toast';
import { getStorageItem, setStorageItem } from '../utils/storage';
import AmbiguityPopover from './AmbiguityPopover';
import type { ExtractedTask } from '../types';

interface EditorProps {
	filePath: string | null;
	audioState: 'idle' | 'listening' | 'processing' | 'executing';
	onVoiceLogEntry?: (entry: {
		transcript: string;
		interpretation: string;
		confidence: number;
		action: 'command' | 'text' | 'ambiguous';
		timings?: {
			stt_ms?: number;
			embed_ms?: number;
			search_ms?: number;
			total_ms?: number;
		};
	}) => void;
	onSystemCommand?: (action: any) => void;
	onContentSaved?: (content: string) => void;
	onDirtyChange?: (isDirty: boolean) => void;
}

interface ClassificationResult {
	action: {
		InsertText?: string;
		ExecuteCommand?: CommandAction;
		Ambiguous?: {
			text: string;
			possible_command: CommandAction;
		};
	};
	confidence: number;
	requires_disambiguation: boolean;
}

interface PartialTranscription {
	text: string;
	is_final: boolean;
	timestamp: number;
}

export default function Editor({
	filePath,
	audioState,
	onVoiceLogEntry,
	onSystemCommand,
	onContentSaved,
	onDirtyChange,
}: EditorProps) {
	const { toast } = useToast();
	const editorRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const minimapCompartment = useRef(new Compartment());
	const [content, setContent] = useState('');
	const [savedContent, setSavedContent] = useState('');
	const [minimapEnabled, setMinimapEnabled] = useState(true);
	const [ambiguityData, setAmbiguityData] = useState<{
		text: string;
		command: CommandAction;
		confidence: number;
		position: { top: number; left: number };
	} | null>(null);

	// Command History for Undo
	interface CommandHistoryEntry {
		id: string;
		timestamp: Date;
		command: CommandAction;
		beforeState: string;
		beforeSelection: { from: number; to: number };
		afterState: string;
	}
	const [commandHistory, setCommandHistory] = useState<CommandHistoryEntry[]>(
		[]
	);

	// Load minimap setting from storage
	useEffect(() => {
		getStorageItem<boolean>('minimap_enabled').then((enabled) => {
			if (enabled !== null) {
				setMinimapEnabled(enabled);
			}
		});
	}, []);

	// Update minimap when enabled state changes
	useEffect(() => {
		if (!viewRef.current) return;

		const minimapExtension = minimapEnabled
			? showMinimap.compute(['doc'], (state) => ({
					create: (view: EditorView) => {
						const dom = document.createElement('div');
						dom.className = 'cm-minimap';
						return { dom };
					},
					displayText: 'blocks',
					showOverlay: 'always',
			  }))
			: [];

		viewRef.current.dispatch({
			effects: minimapCompartment.current.reconfigure(minimapExtension),
		});
	}, [minimapEnabled]);

	// Expose toggle function globally for settings to call
	useEffect(() => {
		(window as any).toggleMinimap = (enabled: boolean) => {
			setMinimapEnabled(enabled);
			setStorageItem('minimap_enabled', enabled);
		};

		return () => {
			delete (window as any).toggleMinimap;
		};
	}, []);

	const executeVoiceCommand = (command: CommandAction) => {
		if (!viewRef.current) return;

		// Capture state before
		const beforeState = viewRef.current.state.doc.toString();
		const beforeSelection = {
			from: viewRef.current.state.selection.main.from,
			to: viewRef.current.state.selection.main.to,
		};

		// Execute
		executeCommand(viewRef.current, command);

		// Capture state after
		const afterState = viewRef.current.state.doc.toString();

		// Add to history
		setCommandHistory((prev) => [
			...prev,
			{
				id: Math.random().toString(36).substring(7),
				timestamp: new Date(),
				command,
				beforeState,
				beforeSelection,
				afterState,
			},
		]);
	};

	const undoLastVoiceCommand = () => {
		if (!viewRef.current || commandHistory.length === 0) {
			toast({
				title: 'Nothing to undo',
				description: 'No voice commands in history',
				variant: 'destructive',
			});
			return;
		}

		const lastCommand = commandHistory[commandHistory.length - 1];

		// Restore state
		viewRef.current.dispatch({
			changes: {
				from: 0,
				to: viewRef.current.state.doc.length,
				insert: lastCommand.beforeState,
			},
			selection: {
				anchor: lastCommand.beforeSelection.from,
				head: lastCommand.beforeSelection.to,
			},
		});

		setCommandHistory((prev) => prev.slice(0, -1));

		toast({
			title: 'Undid command',
			description: 'Restored previous state',
		});
	};

	// Listen for partial transcription events (Ghost Text)
	useEffect(() => {
		const unlisten = listen<PartialTranscription>(
			'transcription-partial',
			(event) => {
				if (viewRef.current && event.payload.text) {
					viewRef.current.dispatch({
						effects: setGhostText.of(event.payload.text),
					});
				}
			}
		);

		return () => {
			unlisten.then((f) => f());
		};
	}, []);

	// Handle transcription results
	useEffect(() => {
		const handleTranscription = async (text: string) => {
			if (!viewRef.current) {
				console.warn('Editor not ready for transcription');
				return;
			}

			// Clear ghost text
			viewRef.current.dispatch({
				effects: clearGhostText.of(),
			});

			// Check if editor has content (file is loaded)
			const docLength = viewRef.current.state.doc.length;
			if (docLength === 0 && !filePath) {
				console.warn(
					'No file loaded. Please create or open a file first.'
				);
				alert(
					'Please create or open a file before using voice commands.'
				);
				return;
			}

			try {
				const hasSelection =
					viewRef.current.state.selection.main.from !==
					viewRef.current.state.selection.main.to;

				// Get cursor context
				const pos = viewRef.current.state.selection.main.head;
				const line = viewRef.current.state.doc.lineAt(pos);
				const cursorContext = {
					line_text: line.text,
					line_number: line.number,
					is_start_of_line: pos === line.from,
					is_end_of_line: pos === line.to,
					previous_char:
						pos > 0
							? viewRef.current.state.doc.sliceString(
									pos - 1,
									pos
							  )
							: '',
					next_char:
						pos < viewRef.current.state.doc.length
							? viewRef.current.state.doc.sliceString(
									pos,
									pos + 1
							  )
							: '',
				};

				const classifyResult: {
					result: ClassificationResult;
					timings: {
						embed_ms: number;
						search_ms: number;
						total_ms: number;
					};
				} = await invoke('classify_text', {
					text,
					hasSelection,
					cursorContext,
					systemContext: await invoke('get_current_context'),
				});

				console.log('Classification timings:', classifyResult.timings);
				const result = classifyResult.result;

				// Log to voice log sidebar
				let actionType: 'command' | 'text' | 'ambiguous' = 'text';
				let interpretation = 'Insert text';

				if (result.action.ExecuteCommand) {
					actionType = 'command';
					const cmd = result.action.ExecuteCommand;
					if (cmd.Format) {
						interpretation = `Format: ${JSON.stringify(
							cmd.Format
						)}`;
					} else if (cmd.Editor) {
						interpretation = `Editor: ${cmd.Editor}`;
					} else if (cmd.System) {
						interpretation = `System: ${JSON.stringify(
							cmd.System
						)}`;
					} else if (cmd.AppSpecific) {
						interpretation = `App: ${cmd.AppSpecific}`;
					}
				} else if (result.action.Ambiguous) {
					actionType = 'ambiguous';
					interpretation = 'Requires disambiguation';
				}

				if (onVoiceLogEntry) {
					onVoiceLogEntry({
						transcript: text,
						interpretation,
						confidence: result.confidence,
						action: actionType,
						timings: classifyResult.timings,
					});
				}

				if (result.action.ExecuteCommand) {
					const cmd = result.action.ExecuteCommand;

					// Handle Undo Voice Command specifically
					if (cmd.Editor && 'UndoVoiceCommand' in cmd.Editor) {
						undoLastVoiceCommand();
					} else if (cmd.AppSpecific) {
						// Handle App Specific commands
						console.log('App Specific Command:', cmd.AppSpecific);

						if (cmd.AppSpecific === 'create_task') {
							// Handle task creation
							const selection = viewRef.current.state.selection.main;
							const hasSelection = selection.from !== selection.to;

							if (hasSelection) {
								// Use selected text as task description
								const taskDescription = viewRef.current.state.doc.sliceString(
									selection.from,
									selection.to
								);

								invoke('create_agent_tracker_task', {
									description: taskDescription,
									sourceFile: filePath || undefined,
								})
									.then(() => {
										toast({
											title: 'Task Created',
											description: `Created task: ${taskDescription}`,
										});
									})
									.catch((error) => {
										toast({
											title: 'Task Creation Failed',
											description: String(error),
											variant: 'destructive',
										});
									});
							} else {
								// Extract tasks from document
								const docContent = viewRef.current.state.doc.toString();

								invoke<ExtractedTask[]>('extract_tasks', { content: docContent })
									.then((tasks) => {
										if (tasks.length === 0) {
											toast({
												title: 'No Tasks Found',
												description: 'No unchecked tasks found in document',
												variant: 'destructive',
											});
										} else {
											// Create all unchecked tasks
											const uncheckedTasks = tasks.filter(t => !t.checked);

											if (uncheckedTasks.length === 0) {
												toast({
													title: 'No Unchecked Tasks',
													description: 'All tasks are already checked',
													variant: 'destructive',
												});
												return;
											}

											Promise.all(
												uncheckedTasks.map((task) =>
													invoke('create_agent_tracker_task', {
														description: task.description,
														sourceFile: filePath || undefined,
													})
												)
											)
												.then(() => {
													toast({
														title: 'Tasks Created',
														description: `Created ${uncheckedTasks.length} task(s) in Agent-Tracker`,
													});
												})
												.catch((error) => {
													toast({
														title: 'Task Creation Failed',
														description: String(error),
														variant: 'destructive',
													});
												});
										}
									})
									.catch((error) => {
										toast({
											title: 'Task Extraction Failed',
											description: String(error),
											variant: 'destructive',
										});
									});
							}
						} else {
							toast({
								title: 'App Command',
								description: `Action: ${cmd.AppSpecific}`,
							});
						}
					} else if (cmd.System) {
						// Handle System commands
						if (onSystemCommand) {
							onSystemCommand(cmd.System);
						}
					} else {
						const { from, to } =
							viewRef.current.state.selection.main;
						executeVoiceCommand(cmd);
						// Add flash effect for formatting commands
						viewRef.current.dispatch({
							effects: addFlash.of({ from, to, type: 'format' }),
						});
					}
					toast({
						title: 'Command Executed',
						description: `Executed: ${JSON.stringify(
							result.action.ExecuteCommand
						)}`,
						duration: 2000,
					});
				} else if (result.action.InsertText) {
					const { from } = viewRef.current.state.selection.main;
					const docLength = viewRef.current.state.doc.length;

					// Safety check: ensure cursor position is valid
					if (from > docLength) {
						console.error(
							'Invalid cursor position:',
							from,
							'document length:',
							docLength
						);
						return;
					}

					const textToInsert = result.action.InsertText;
					const insertLength = textToInsert.length;

					// Insert text without flash effect first
					viewRef.current.dispatch({
						changes: { from, insert: textToInsert },
					});

					// Then add flash effect on the next frame after document updates
					// Ensure the range is valid in the new document state
					requestAnimationFrame(() => {
						if (viewRef.current) {
							const currentDocLen =
								viewRef.current.state.doc.length;
							const safeTo = Math.min(
								from + insertLength,
								currentDocLen
							);

							if (from <= currentDocLen) {
								viewRef.current.dispatch({
									effects: addFlash.of({
										from,
										to: safeTo,
										type: 'insert',
									}),
								});
							}
						}
					});
				} else if (result.action.Ambiguous) {
					// Show disambiguation UI
					const coords = viewRef.current.coordsAtPos(
						viewRef.current.state.selection.main.from
					);
					if (coords) {
						setAmbiguityData({
							text: result.action.Ambiguous.text,
							command: result.action.Ambiguous.possible_command,
							confidence: result.confidence,
							position: {
								top: coords.top + 24,
								left: coords.left,
							},
						});
					}
				}
			} catch (error) {
				console.error('Error handling transcription:', error);
			}
		};

		// Expose function globally for AudioControl to call
		(window as any).handleTranscription = handleTranscription;

		return () => {
			delete (window as any).handleTranscription;
		};
	}, []);

	// Listen for streaming transcription events
	useEffect(() => {
		const unlistenPartial = listen(
			'transcription-partial',
			(event: any) => {
				if (viewRef.current) {
					const text = event.payload.text;
					viewRef.current.dispatch({
						effects: setGhostText.of(text),
					});
				}
			}
		);

		const unlistenProcessing = listen('transcription-processing', () => {
			// Maybe show a spinner or something
		});

		return () => {
			unlistenPartial.then((unlisten) => unlisten());
			unlistenProcessing.then((unlisten) => unlisten());
		};
	}, []);

	useEffect(() => {
		if (!editorRef.current) return;

		const state = EditorState.create({
			doc: content,
			extensions: [
				basicSetup,
				keymap.of([indentWithTab]),
				EditorView.lineWrapping,
				markdown({ codeLanguages: languages }),
				editorThemeExtension,
				cursorPosField,
				livePreviewPlugin,
				flashEffect,
				markdownAutoPairExtension,
				ghostTextExtension,
				minimapCompartment.current.of(
					minimapEnabled
						? showMinimap.compute(['doc'], (state) => ({
								create: (view: EditorView) => {
									const dom = document.createElement('div');
									dom.className = 'cm-minimap';
									return { dom };
								},
								displayText: 'blocks',
								showOverlay: 'always',
						  }))
						: []
				),
				EditorView.updateListener.of((update) => {
					if (update.docChanged) {
						const newContent = update.state.doc.toString();
						setContent(newContent);
					}
				}),
			],
		});

		viewRef.current = new EditorView({
			state,
			parent: editorRef.current,
		});

		return () => {
			viewRef.current?.destroy();
			viewRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (!filePath) return;

		readTextFile(filePath)
			.then((text) => {
				setContent(text);
				setSavedContent(text);
				if (viewRef.current) {
					viewRef.current.dispatch({
						changes: {
							from: 0,
							to: viewRef.current.state.doc.length,
							insert: text,
						},
					});
				}
			})
			.catch(console.error);
	}, [filePath]);

	// Track dirty state
	useEffect(() => {
		if (!filePath) return;
		const isDirty = content !== savedContent;
		onDirtyChange?.(isDirty);
	}, [content, savedContent, filePath]);

	// Auto-save
	useEffect(() => {
		if (!filePath || !content) return;

		const timer = setTimeout(() => {
			writeTextFile(filePath, content)
				.then(() => {
					setSavedContent(content);
					onContentSaved?.(content);
				})
				.catch(console.error);
		}, 500);

		return () => clearTimeout(timer);
	}, [content, filePath, onContentSaved]);

	return (
		<div className='flex-1 flex flex-col overflow-hidden bg-background'>
			<div
				ref={editorRef}
				className={`flex-1 overflow-auto transition-opacity duration-200 ${
					audioState === 'processing' ? 'opacity-70' : ''
				}`}
			/>
			{ambiguityData && (
				<AmbiguityPopover
					text={ambiguityData.text}
					possibleCommand={ambiguityData.command}
					confidence={ambiguityData.confidence}
					position={ambiguityData.position}
					onChoose={(resolution) => {
						if (!viewRef.current || !ambiguityData) return;

						const from = viewRef.current.state.selection.main.head;

						if (resolution === 'command') {
							executeCommand(
								viewRef.current,
								ambiguityData.command
							);
							viewRef.current.dispatch({
								effects: addFlash.of({
									from,
									to: from,
									type: 'command',
								}),
							});
						} else {
							viewRef.current.dispatch({
								changes: { from, insert: ambiguityData.text },
								effects: addFlash.of({
									from,
									to: from + ambiguityData.text.length,
									type: 'insert',
								}),
							});
						}
						setAmbiguityData(null);
					}}
					onDismiss={() => setAmbiguityData(null)}
				/>
			)}
		</div>
	);
}
