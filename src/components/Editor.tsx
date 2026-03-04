import { useEffect, useRef, useState } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorState, Compartment } from '@codemirror/state';
import { readTextFile, writeTextFile, writeFile } from '@tauri-apps/plugin-fs';
import { convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { showMinimap } from '@replit/codemirror-minimap';
import { livePreviewPlugin, cursorPosField } from '../editor/livePreview';
import { editorThemeExtension } from '../editor/theme';
import { executeCommand } from '../editor/commands';
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
import { extractBlocks, findBlockById } from '../editor/blockIds';
import { transclusionExtension } from '../editor/transclusionExtension';
import { pasteImageExtension } from '../editor/pasteImageExtension';
import '../editor/transclusion.css';
import { emitMutterEvent, useMutterEvent } from '../events';
import { useToast } from '../hooks/use-toast';
import { useEditorContextSync } from '../hooks/useEditorContextSync';
import { useVaultMetadata } from '../context/VaultMetadataContext';
import { getStorageItem, setStorageItem } from '../utils/storage';

const FONT_SIZE_MAP: Record<string, string> = {
	'14': '0.875rem',
	'16': '1rem',
	'18': '1.125rem',
	'20': '1.25rem',
	'22': '1.375rem',
};

interface EditorProps {
	filePath: string | null;
	audioState: 'idle' | 'listening' | 'processing' | 'executing';
	onContentSaved?: (content: string) => void;
	onContentChange?: (content: string) => void;
	onDirtyChange?: (isDirty: boolean) => void;
	/** Note ID for context tracking */
	noteId?: string | null;
	/** Vault path for transclusion resolution */
	vaultPath?: string | null;
	/** Navigate to a file (for transclusion jump or wiki link click) */
	onNavigate?: (target: string, blockId: string | null, newTab?: boolean) => void;
}

interface PartialTranscription {
	text: string;
	is_final: boolean;
	timestamp: number;
}

export default function Editor({
	filePath,
	audioState: _audioState,
	onContentSaved,
	onContentChange,
	onDirtyChange,
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
		syncCursorRef.current = syncCursor;
		vaultPathRef.current = vaultPath;
		onNavigateRef.current = onNavigate;
		manifestRef.current = manifest;
		filePathRef.current = filePath;
	}, [syncCursor, vaultPath, onNavigate, manifest, filePath]);

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

		const fontSizeRem = FONT_SIZE_MAP[editorFontSize] || '1rem';

		const fontSizeTheme = EditorView.theme({
			'&': {
				fontSize: fontSizeRem,
			},
		});

		viewRef.current.dispatch({
			effects: fontSizeCompartment.current.reconfigure(fontSizeTheme),
		});
	}, [editorFontSize]);

	// Listen for minimap toggle from settings
	useMutterEvent('mutter:toggle-minimap', ({ enabled }) => {
		setMinimapEnabled(enabled);
		setStorageItem('minimap_enabled', enabled);
	});

	// Listen for font size changes from settings
	useMutterEvent('mutter:update-editor-font-size', ({ size }) => {
		setEditorFontSize(size);
	});

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

	// Handle transcription results — always insert text at cursor
	const handleTranscription = (text: string) => {
		if (!viewRef.current) {
			console.warn('Editor not ready for transcription');
			return;
		}

		// Clear ghost text
		viewRef.current.dispatch({
			effects: clearGhostText.of(),
		});

		// Check if editor has content (file is loaded)
		if (viewRef.current.state.doc.length === 0 && !filePath) {
			console.warn('No file loaded. Please create or open a file first.');
			alert('Please create or open a file before using voice dictation.');
			return;
		}

		const { from } = viewRef.current.state.selection.main;
		const docLength = viewRef.current.state.doc.length;

		// Safety check: ensure cursor position is valid
		if (from > docLength) {
			console.error('Invalid cursor position:', from, 'document length:', docLength);
			return;
		}

		const insertLength = text.length;

		// Insert text at cursor
		viewRef.current.dispatch({
			changes: { from, insert: text },
		});

		// Flash effect on next frame after document updates
		requestAnimationFrame(() => {
			if (viewRef.current) {
				const currentDocLen = viewRef.current.state.doc.length;
				const safeTo = Math.min(from + insertLength, currentDocLen);

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
	};

	// Listen for transcription results from voice pipeline
	useMutterEvent('mutter:transcription-result', ({ text }) => {
		handleTranscription(text);
	});

	// Listen for command execution events (keyboard shortcuts, etc.)
	useMutterEvent('mutter:execute-command', ({ command }) => {
		console.log('[Editor] Received mutter:execute-command:', command);

		if (!viewRef.current) {
			console.warn('[Editor] No view available for command execution');
			return;
		}

		switch (command) {
			case 'insert-embed':
				emitMutterEvent('mutter:open-dialog', { dialog: 'insert-embed' });
				break;
			case 'cleanup-text': {
				const view = viewRef.current;
				const selection = view.state.selection.main;
				const hasSelection = selection.from !== selection.to;
				const textToClean = hasSelection
					? view.state.doc.sliceString(selection.from, selection.to)
					: view.state.doc.toString();
				const range = hasSelection
					? { from: selection.from, to: selection.to }
					: null;

				emitMutterEvent('mutter:open-dialog', {
					dialog: 'text-cleanup',
					text: textToClean,
					selectionRange: range,
				});
				break;
			}
			default:
				console.warn('[Editor] Unknown command:', command);
		}
	}, [noteId]);

	// Listen for scroll-to-line events from OutlinePanel
	useMutterEvent('mutter:scroll-to-line', ({ line }) => {
		if (!viewRef.current) return;

		const doc = viewRef.current.state.doc;
		const lineNumber = Math.max(1, Math.min(line, doc.lines));
		const lineInfo = doc.line(lineNumber);

		viewRef.current.dispatch({
			selection: { anchor: lineInfo.from },
			effects: EditorView.scrollIntoView(lineInfo.from, { y: 'start' }),
		});

		viewRef.current.focus();
	});

	// Listen for text cleanup apply events
	useMutterEvent('mutter:apply-text-cleanup', ({ cleanedText, range }) => {
		if (!viewRef.current) return;
		const view = viewRef.current;

		if (range) {
			view.dispatch({
				changes: { from: range.from, to: range.to, insert: cleanedText },
			});
		} else {
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: cleanedText },
			});
		}

		view.focus();
	});

	// Listen for wiki link navigation events from livePreview
	useMutterEvent('mutter:navigate-wikilink', ({ target, blockId, newTab }) => {
		if (onNavigate) {
			onNavigate(target, blockId, newTab);
		}
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
							fontSize: FONT_SIZE_MAP[editorFontSize] || '1rem',
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
						const noteId = currentManifest.path_index[targetPath] ?? null;
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
						lastBlockIdRef.current = blockId;

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
			console.time('[Editor] load file');
			readTextFile(filePath)
				.then((text) => {
					console.timeEnd('[Editor] load file');
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
				.catch((err) => {
					console.error('[Editor] Failed to load file:', err);
					console.timeEnd('[Editor] load file');
					setIsLoadingFile(false);
				});
		}, 100);
	}, [filePath]);

	// Track dirty state
	useEffect(() => {
		if (!filePath) return;
		const isDirty = content !== savedContent;
		onDirtyChange?.(isDirty);
	}, [content, savedContent, filePath]);

	// Auto-save content
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
		// Don't compute handle positions while editor is fading out for a file load —
		// the scroller has zero/collapsed bounds during the opacity-0 transition.
		if (isLoadingFile) {
			setContentRect(null);
			return;
		}

		const updateContentRect = () => {
			// Use scrollDOM which contains both gutters and content
			const cmScroller = viewRef.current?.scrollDOM;
			const container = editorRef.current;
			if (cmScroller && container) {
				const scrollerBounds = cmScroller.getBoundingClientRect();
				const containerBounds = container.getBoundingClientRect();
				// Skip if scroller hasn't laid out yet (zero width during transitions)
				if (scrollerBounds.width < 1 || containerBounds.width < 1) return;
				// Ensure minimum margin of 4px so handles are always visible/draggable
				setContentRect({
					left: Math.max(4, scrollerBounds.left - containerBounds.left),
					right: Math.max(4, containerBounds.right - scrollerBounds.right),
				});
			}
		};

		// Small delay to let CodeMirror finish layout after file load
		const timer = setTimeout(updateContentRect, 50);
		const observer = new ResizeObserver(updateContentRect);
		observer.observe(editorRef.current!);
		// Also observe the CodeMirror scroller — its layout changes on document swap
		// even when the outer container stays the same size
		if (viewRef.current.scrollDOM) {
			observer.observe(viewRef.current.scrollDOM);
		}

		return () => {
			clearTimeout(timer);
			observer.disconnect();
		};
	}, [viewReady, contentMaxWidth, isLoadingFile]);

	return (
		<div className='flex-1 flex flex-col overflow-hidden bg-background relative w-full'>
			<div
				ref={editorRef}
				className={`flex-1 overflow-auto transition-opacity duration-200 w-full ${
					isLoadingFile ? 'opacity-0' : 'opacity-100'
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
		</div>
	);
}
