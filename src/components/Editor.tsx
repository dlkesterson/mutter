import { useEffect, useRef, useState } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorState, Compartment } from '@codemirror/state';
import { readTextFile, writeTextFile, writeFile } from '@tauri-apps/plugin-fs';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
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
import {
	blockIdExtensionWithStyles,
	getBlockAtCursor,
} from '../editor/blockIdExtension';
import { extractBlocks, findBlockById, type BlockInfo } from '../editor/blockIds';
import { transclusionExtension } from '../editor/transclusionExtension';
import { pasteImageExtension } from '../editor/pasteImageExtension';
import { findNoteIdByPath } from '../crdt/manifestDoc';
import '../editor/transclusion.css';
import { useToast } from '../hooks/use-toast';
import { useEditorContextSync } from '../hooks/useEditorContextSync';
import { useEditorContext } from '../context/EditorContextProvider';
import { useVaultMetadata } from '../context/VaultMetadataContext';
import { commandToIntentBucket } from '../types/editorContext';
import { getStorageItem, setStorageItem } from '../utils/storage';
import AmbiguityPopover from './AmbiguityPopover';
import { VoiceSuggestions, useCursorScreenPosition } from './VoiceSuggestions';
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
	onContentChange?: (content: string) => void;
	onDirtyChange?: (isDirty: boolean) => void;
	/** Called when the cursor moves to a different block */
	onBlockChange?: (block: BlockInfo | null) => void;
	/** Note ID from CRDT for context tracking */
	noteId?: string | null;
	/** Vault path for transclusion resolution */
	vaultPath?: string | null;
	/** Navigate to a file (for transclusion jump or wiki link click) */
	onNavigate?: (target: string, blockId: string | null, newTab?: boolean) => void;
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
	onContentChange,
	onDirtyChange,
	onBlockChange,
	noteId,
	vaultPath,
	onNavigate,
}: EditorProps) {
	const { toast } = useToast();
	const editorRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const minimapCompartment = useRef(new Compartment());
	const fontSizeCompartment = useRef(new Compartment());
	const lastBlockIdRef = useRef<string | null>(null);
	const onBlockChangeRef = useRef(onBlockChange);
	const vaultPathRef = useRef(vaultPath);
	const onNavigateRef = useRef(onNavigate);
	const filePathRef = useRef(filePath);
	const { manifest } = useVaultMetadata();
	const manifestRef = useRef(manifest);
	const [content, setContent] = useState('');
	const [savedContent, setSavedContent] = useState('');
	const [minimapEnabled, setMinimapEnabled] = useState(false);
	const [editorFontSize, setEditorFontSize] = useState('16');
	const [isLoadingFile, setIsLoadingFile] = useState(false);
	const [viewReady, setViewReady] = useState(false);

	// Content width (readable line length) - controls maxWidth of text area
	const [contentMaxWidth, setContentMaxWidth] = useState(800);
	const [isResizingContent, setIsResizingContent] = useState(false);
	const resizeStartX = useRef(0);
	const resizeStartWidth = useRef(0);
	const resizeSide = useRef<'left' | 'right'>('right');
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

	// Context signal system
	const { recordIntent } = useEditorContext();
	const hasUnsavedChanges = content !== savedContent;

	// Sync editor state to context
	const { syncCursor } = useEditorContextSync(viewRef, {
		filePath,
		noteId: noteId ?? null,
		hasUnsavedChanges,
	});
	const syncCursorRef = useRef(syncCursor);

	// Keep refs in sync
	useEffect(() => {
		onBlockChangeRef.current = onBlockChange;
		syncCursorRef.current = syncCursor;
		vaultPathRef.current = vaultPath;
		onNavigateRef.current = onNavigate;
		manifestRef.current = manifest;
		filePathRef.current = filePath;
	}, [onBlockChange, syncCursor, vaultPath, onNavigate, manifest, filePath]);

	// Get cursor screen position for voice suggestions
	const cursorScreenPosition = useCursorScreenPosition(viewRef.current);

	// Load minimap setting from storage
	useEffect(() => {
		getStorageItem<boolean>('minimap_enabled').then((enabled) => {
			if (enabled !== null) {
				setMinimapEnabled(enabled);
			}
		});
	}, []);

	// Load editor font size from storage
	useEffect(() => {
		getStorageItem<string>('editor_font_size').then((size) => {
			if (size !== null) {
				setEditorFontSize(size);
			}
		});
	}, []);

	// Load content max width from storage (-1 means full width)
	useEffect(() => {
		getStorageItem<number>('editor_content_max_width').then((width) => {
			if (width !== null && (width === -1 || width >= 400)) {
				setContentMaxWidth(width);
			}
		});
	}, []);

	// Apply content max width to CodeMirror scroller (includes gutters + content)
	// Use -1 as a sentinel for "full width" (no max)
	useEffect(() => {
		if (viewReady && viewRef.current) {
			const cmScroller = viewRef.current.scrollDOM;
			const cmEditor = viewRef.current.dom;

			if (contentMaxWidth < 0) {
				// Full width mode - no constraint, no centering
				cmScroller.style.maxWidth = 'none';
				cmScroller.style.margin = '0';
				cmScroller.style.width = '100%';
				cmEditor.style.width = '100%';
			} else {
				cmScroller.style.maxWidth = `${contentMaxWidth}px`;
				cmScroller.style.margin = '0 auto';
				cmScroller.style.width = '';
				cmEditor.style.width = '';
			}
		}
	}, [viewReady, contentMaxWidth]);

	// Handle content width resize drag
	useEffect(() => {
		if (!isResizingContent) return;

		const handleMouseMove = (e: MouseEvent) => {
			const container = editorRef.current;
			if (!container) return;

			const containerWidth = container.offsetWidth;
			const deltaX = e.clientX - resizeStartX.current;
			// Left handle: drag left = expand, drag right = shrink
			// Right handle: drag right = expand, drag left = shrink
			const widthChange = resizeSide.current === 'left' ? -deltaX * 2 : deltaX * 2;
			const newWidth = Math.max(400, resizeStartWidth.current + widthChange);

			// If width exceeds container (with small margin), switch to full width mode
			if (newWidth >= containerWidth - 20) {
				setContentMaxWidth(-1); // -1 = full width
			} else {
				setContentMaxWidth(newWidth);
			}
		};

		const handleMouseUp = () => {
			setIsResizingContent(false);
			setStorageItem('editor_content_max_width', contentMaxWidth);
		};

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
		};
	}, [isResizingContent, contentMaxWidth]);

	// Update minimap when enabled state changes
	useEffect(() => {
		if (!viewRef.current) return;

		const minimapExtension = minimapEnabled
			? showMinimap.compute(['doc'], (_state) => ({
					create: (_view: EditorView) => {
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

	// Update editor font size when it changes
	useEffect(() => {
		if (!viewRef.current) return;

		// Convert font size string to rem (14px -> 0.875rem, 16px -> 1rem, etc.)
		const fontSizeMap: Record<string, string> = {
			'14': '0.875rem',
			'16': '1rem',
			'18': '1.125rem',
			'20': '1.25rem',
			'22': '1.375rem',
		};

		const fontSizeRem = fontSizeMap[editorFontSize] || '1rem';

		const fontSizeTheme = EditorView.theme({
			'&': {
				fontSize: fontSizeRem,
			},
		});

		viewRef.current.dispatch({
			effects: fontSizeCompartment.current.reconfigure(fontSizeTheme),
		});
	}, [editorFontSize]);

	// Expose toggle function globally for settings to call
	useEffect(() => {
		(window as any).toggleMinimap = (enabled: boolean) => {
			setMinimapEnabled(enabled);
			setStorageItem('minimap_enabled', enabled);
		};

		(window as any).updateEditorFontSize = (size: string) => {
			setEditorFontSize(size);
		};

		return () => {
			delete (window as any).toggleMinimap;
			delete (window as any).updateEditorFontSize;
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

		// Record intent for context tracking
		const commandName = JSON.stringify(command);
		recordIntent(commandToIntentBucket(commandName));
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
				// Classify the transcription
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

	// Listen for voice command execution events (from VoiceSuggestions, voice commands, etc.)
	useEffect(() => {
		const handleExecuteCommand = (event: CustomEvent<{ command: string; args?: any }>) => {
			const { command, args } = event.detail;
			console.log('[Editor] Received mutter:execute-command:', command, args);

			if (!viewRef.current) {
				console.warn('[Editor] No view available for command execution');
				return;
			}

			// Handle different command types
			switch (command) {
				case 'insert-embed':
					// Open embed insertion dialog
					window.dispatchEvent(new CustomEvent('mutter:open-dialog', {
						detail: { dialog: 'insert-embed' }
					}));
					break;
				case 'cleanup-text': {
					// Get selection or entire document for text cleanup
					const view = viewRef.current;
					const selection = view.state.selection.main;
					const hasSelection = selection.from !== selection.to;
					const textToClean = hasSelection
						? view.state.doc.sliceString(selection.from, selection.to)
						: view.state.doc.toString();
					const range = hasSelection
						? { from: selection.from, to: selection.to }
						: null;

					window.dispatchEvent(new CustomEvent('mutter:open-dialog', {
						detail: {
							dialog: 'text-cleanup',
							text: textToClean,
							selectionRange: range,
						}
					}));
					break;
				}
				case 'show-commands':
					window.dispatchEvent(new CustomEvent('mutter:open-dialog', {
						detail: { dialog: 'commands' }
					}));
					break;
				default:
					// Try to execute as a formatting/editor command
					try {
						const cmdAction = JSON.parse(command);
						executeCommand(viewRef.current, cmdAction);
					} catch {
						console.warn('[Editor] Unknown command:', command);
					}
			}
		};

		window.addEventListener('mutter:execute-command', handleExecuteCommand as EventListener);
		return () => {
			window.removeEventListener('mutter:execute-command', handleExecuteCommand as EventListener);
		};
	}, [noteId]);

	// Listen for scroll-to-line events from OutlinePanel
	useEffect(() => {
		const handleScrollToLine = (event: CustomEvent<{ line: number }>) => {
			if (!viewRef.current) return;

			const { line } = event.detail;
			const doc = viewRef.current.state.doc;

			// Clamp line number to valid range (1-indexed from OutlinePanel)
			const lineNumber = Math.max(1, Math.min(line, doc.lines));
			const lineInfo = doc.line(lineNumber);

			// Scroll to the line and move cursor there
			viewRef.current.dispatch({
				selection: { anchor: lineInfo.from },
				effects: EditorView.scrollIntoView(lineInfo.from, { y: 'start' }),
			});

			// Focus the editor
			viewRef.current.focus();
		};

		window.addEventListener('mutter:scroll-to-line', handleScrollToLine as EventListener);
		return () => {
			window.removeEventListener('mutter:scroll-to-line', handleScrollToLine as EventListener);
		};
	}, []);

	// Listen for text cleanup apply events
	useEffect(() => {
		const handleApplyCleanup = (event: CustomEvent<{
			cleanedText: string;
			range: { from: number; to: number } | null;
		}>) => {
			if (!viewRef.current) return;

			const { cleanedText, range } = event.detail;
			const view = viewRef.current;

			if (range) {
				// Replace selection
				view.dispatch({
					changes: { from: range.from, to: range.to, insert: cleanedText },
				});
			} else {
				// Replace entire document
				view.dispatch({
					changes: { from: 0, to: view.state.doc.length, insert: cleanedText },
				});
			}

			view.focus();
		};

		window.addEventListener('mutter:apply-text-cleanup', handleApplyCleanup as EventListener);
		return () => {
			window.removeEventListener('mutter:apply-text-cleanup', handleApplyCleanup as EventListener);
		};
	}, []);

	// Listen for wiki link navigation events from livePreview
	useEffect(() => {
		const handleWikiLinkNavigate = (e: CustomEvent<{ target: string; blockId: string | null; newTab?: boolean }>) => {
			const { target, blockId, newTab } = e.detail;
			if (onNavigate) {
				onNavigate(target, blockId, newTab);
			}
		};

		window.addEventListener('mutter:navigate-wikilink', handleWikiLinkNavigate as EventListener);
		return () => {
			window.removeEventListener('mutter:navigate-wikilink', handleWikiLinkNavigate as EventListener);
		};
	}, [onNavigate]);

	useEffect(() => {
		if (!editorRef.current) return;

		const state = EditorState.create({
			doc: content,
			extensions: [
				basicSetup,
				keymap.of([
					indentWithTab,
					// Ctrl/Cmd+B for bold
					{
						key: 'Mod-b',
						run: (view) => {
							executeCommand(view, { Format: { Bold: true } });
							return true;
						},
					},
					// Ctrl/Cmd+I for italic
					{
						key: 'Mod-i',
						run: (view) => {
							executeCommand(view, { Format: { Italic: true } });
							return true;
						},
					},
					// Ctrl/Cmd+` for inline code
					{
						key: 'Mod-`',
						run: (view) => {
							executeCommand(view, { Format: { Code: true } });
							return true;
						},
					},
				]),
				EditorView.lineWrapping,
				markdown({ codeLanguages: languages }),
				editorThemeExtension,
				fontSizeCompartment.current.of(
					EditorView.theme({
						'&': {
							fontSize: (() => {
								const fontSizeMap: Record<string, string> = {
									'14': '0.875rem',
									'16': '1rem',
									'18': '1.125rem',
									'20': '1.25rem',
									'22': '1.375rem',
								};
								return fontSizeMap[editorFontSize] || '1rem';
							})(),
						},
					})
				),
				cursorPosField,
				livePreviewPlugin,
				blockIdExtensionWithStyles,
				flashEffect,
				markdownAutoPairExtension,
				ghostTextExtension,
				// Transclusion extension for live embeds
				transclusionExtension({
					resolveEmbed: async (target, blockId) => {
						const currentManifest = manifestRef.current;
						const vp = vaultPathRef.current;
						if (!currentManifest || !vp) {
							throw new Error('Vault not loaded');
						}
						const normalizedVault = vp.replaceAll('\\', '/').replace(/\/+$/g, '');
						const targetPath = target.endsWith('.md') ? target : target + '.md';
						const noteId = findNoteIdByPath(currentManifest, targetPath);
						if (!noteId) {
							throw new Error(`Note not found: ${target}`);
						}
						const relPath = currentManifest.id_to_path[noteId];
						if (!relPath) {
							throw new Error(`Note path not found: ${target}`);
						}
						const fullPath = `${normalizedVault}/${relPath}`;
						const content = await readTextFile(fullPath);
						if (!blockId) {
							// Return full content (truncated for safety)
							const maxChars = 5000;
							if (content.length > maxChars) {
								return content.slice(0, maxChars) + '\n\n[... content truncated ...]';
							}
							return content;
						}
						// Find specific block
						const blocks = extractBlocks(content);
						const block = findBlockById(blocks, blockId);
						if (!block) {
							throw new Error(`Block not found: #${blockId}`);
						}
						const lines = content.split('\n');
						const blockLines = lines.slice(block.lineStart, block.lineEnd + 1);
						// Remove block ID suffix from display
						const lastLine = blockLines[blockLines.length - 1];
						blockLines[blockLines.length - 1] = lastLine.replace(/ \^[a-z0-9]{6}$/, '');
						return blockLines.join('\n');
					},
					onEdit: (target, blockId) => {
						// Navigate to edit the source
						onNavigateRef.current?.(target, blockId);
					},
					onJump: (target, blockId) => {
						// Navigate to the source
						onNavigateRef.current?.(target, blockId);
					},
				}),
				// Paste image extension - save images to same folder as note
				pasteImageExtension({
					onPasteImage: async (data: Uint8Array, mimeType: string) => {
						const currentFilePath = filePathRef.current;
						if (!currentFilePath) {
							toast({
								title: 'Cannot paste image',
								description: 'No file is open. Save the note first.',
								variant: 'destructive',
							});
							return null;
						}

						try {
							// Get directory of current file
							const lastSlash = currentFilePath.lastIndexOf('/');
							const dir =
								lastSlash > 0
									? currentFilePath.substring(0, lastSlash)
									: vaultPathRef.current;
							if (!dir) return null;

							// Generate unique filename
							const ext = mimeType.split('/')[1] || 'png';
							const filename = `image-${Date.now()}.${ext}`;
							const fullPath = `${dir}/${filename}`;

							// Save image
							await writeFile(fullPath, data);

							// Return asset:// URL for the webview to load
							return convertFileSrc(fullPath);
						} catch (err) {
							console.error('Failed to save pasted image:', err);
							toast({
								title: 'Failed to paste image',
								description:
									err instanceof Error ? err.message : 'Unknown error',
								variant: 'destructive',
							});
							return null;
						}
					},
				}),
				minimapCompartment.current.of(
					minimapEnabled
						? showMinimap.compute(['doc'], (_state) => ({
								create: (_view: EditorView) => {
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
						onContentChange?.(newContent);
					}

					// Track block changes and sync context on cursor movement
					if (update.selectionSet || update.docChanged) {
						const block = getBlockAtCursor(update.view);
						const blockId = block?.id ?? null;

						// Only fire callback if block changed
						if (blockId !== lastBlockIdRef.current) {
							lastBlockIdRef.current = blockId;
							onBlockChangeRef.current?.(block);
						}

						// Sync cursor state to EditorContext
						syncCursorRef.current?.();
					}
				}),
			],
		});

		viewRef.current = new EditorView({
			state,
			parent: editorRef.current,
		});

		// Mark view as ready so dependent effects can run
		setViewReady(true);

		return () => {
			viewRef.current?.destroy();
			viewRef.current = null;
			setViewReady(false);
		};
	}, []);

	useEffect(() => {
		if (!filePath) {
			// Clear editor when no file is open (all tabs closed)
			setIsLoadingFile(true);
			setContent('');
			setSavedContent('');
			if (viewRef.current) {
				viewRef.current.dispatch({
					changes: {
						from: 0,
						to: viewRef.current.state.doc.length,
						insert: '',
					},
				});
			}
			// Fade back in after clearing
			setTimeout(() => setIsLoadingFile(false), 100);
			return;
		}

		// Fade out before loading new file
		setIsLoadingFile(true);

		// Small delay to allow fade-out animation
		setTimeout(() => {
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
					// Fade back in after content loads
					setTimeout(() => setIsLoadingFile(false), 50);
				})
				.catch(console.error);
		}, 100);
	}, [filePath]);

	// Track dirty state
	useEffect(() => {
		if (!filePath) return;
		const isDirty = content !== savedContent;
		onDirtyChange?.(isDirty);
	}, [content, savedContent, filePath]);

	// Auto-save content
	// Note: Block ID auto-generation has been disabled to avoid polluting markdown files.
	// Existing block IDs in files are still parsed and displayed correctly.
	// Block IDs should only be added when explicitly creating block references.
	useEffect(() => {
		if (!filePath || !content) return;
		// Skip if content hasn't actually changed from saved version
		if (content === savedContent) return;

		const timer = setTimeout(() => {
			writeTextFile(filePath, content)
				.then(() => {
					setSavedContent(content);
					onContentSaved?.(content);
				})
				.catch(console.error);
		}, 500);

		return () => clearTimeout(timer);
	}, [content, savedContent, filePath, onContentSaved]);

	// Start resizing content width
	const startContentResize = (side: 'left' | 'right') => (e: React.MouseEvent) => {
		e.preventDefault();
		resizeStartX.current = e.clientX;
		// If in full-width mode (-1), use actual scroller width as starting point
		if (contentMaxWidth < 0 && viewRef.current) {
			resizeStartWidth.current = viewRef.current.scrollDOM.offsetWidth;
		} else {
			resizeStartWidth.current = contentMaxWidth;
		}
		resizeSide.current = side;
		setIsResizingContent(true);
	};

	// Track content element position for resize handles
	const [contentRect, setContentRect] = useState<{ left: number; right: number } | null>(null);

	useEffect(() => {
		if (!viewReady || !viewRef.current) return;

		const updateContentRect = () => {
			// Use scrollDOM which contains both gutters and content
			const cmScroller = viewRef.current?.scrollDOM;
			const container = editorRef.current;
			if (cmScroller && container) {
				const scrollerBounds = cmScroller.getBoundingClientRect();
				const containerBounds = container.getBoundingClientRect();
				// Ensure minimum margin of 4px so handles are always visible/draggable
				setContentRect({
					left: Math.max(4, scrollerBounds.left - containerBounds.left),
					right: Math.max(4, containerBounds.right - scrollerBounds.right),
				});
			}
		};

		// Update positions periodically and on resize
		updateContentRect();
		const interval = setInterval(updateContentRect, 500);
		const observer = new ResizeObserver(updateContentRect);
		observer.observe(editorRef.current!);

		return () => {
			clearInterval(interval);
			observer.disconnect();
		};
	}, [viewReady, contentMaxWidth]);

	return (
		<div className='flex-1 flex flex-col overflow-hidden bg-background relative w-full'>
			<div
				ref={editorRef}
				className={`flex-1 overflow-auto transition-opacity duration-200 w-full ${
					audioState === 'processing' || isLoadingFile ? 'opacity-0' : 'opacity-100'
				}`}
			/>

			{/* Content width resize handles */}
			{contentRect && (
				<>
					{/* Left handle */}
					<div
						className='absolute top-0 bottom-0 w-1.5 cursor-col-resize bg-border/40 hover:bg-primary/60 transition-colors z-10'
						style={{ left: contentRect.left - 3 }}
						onMouseDown={startContentResize('left')}
						onDoubleClick={() => {
							setContentMaxWidth(800);
							setStorageItem('editor_content_max_width', 800);
						}}
						title="Drag to resize content width, double-click to reset to 800px"
					/>
					{/* Right handle */}
					<div
						className='absolute top-0 bottom-0 w-1.5 cursor-col-resize bg-border/40 hover:bg-primary/60 transition-colors z-10'
						style={{ right: contentRect.right - 3 }}
						onMouseDown={startContentResize('right')}
						onDoubleClick={() => {
							setContentMaxWidth(800);
							setStorageItem('editor_content_max_width', 800);
						}}
						title="Drag to resize content width, double-click to reset to 800px"
					/>
				</>
			)}

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
			<VoiceSuggestions
				cursorPosition={cursorScreenPosition ?? undefined}
				visible={audioState === 'listening'}
			/>
		</div>
	);
}
