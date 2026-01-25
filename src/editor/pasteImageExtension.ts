import { EditorView } from '@codemirror/view';
import { readImage } from '@tauri-apps/plugin-clipboard-manager';

/**
 * Configuration for the paste image extension
 */
export interface PasteImageConfig {
	/**
	 * Called when an image is pasted. Should save the image and return the
	 * URL/path to insert in markdown, or null to cancel.
	 */
	onPasteImage: (data: Uint8Array, mimeType: string) => Promise<string | null>;
}

/**
 * Convert raw RGBA data to PNG using Canvas API
 */
async function rgbaToPng(
	rgbaData: Uint8Array,
	width: number,
	height: number
): Promise<Uint8Array> {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Could not get canvas context');

	const imageData = new ImageData(new Uint8ClampedArray(rgbaData), width, height);
	ctx.putImageData(imageData, 0, 0);

	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((b) => {
			if (b) resolve(b);
			else reject(new Error('Failed to create blob'));
		}, 'image/png');
	});

	const buffer = await blob.arrayBuffer();
	return new Uint8Array(buffer);
}

/**
 * CodeMirror extension that intercepts paste events containing images.
 * Uses Tauri's native clipboard API to read images since the web clipboard
 * API doesn't have access to system clipboard images in Tauri's WebView.
 */
export function pasteImageExtension(config: PasteImageConfig) {
	return EditorView.domEventHandlers({
		paste: (event: ClipboardEvent, view: EditorView) => {
			// Check for image in web clipboard first (works for some cases)
			const items = event.clipboardData?.items;
			if (items && items.length > 0) {
				for (const item of items) {
					if (item.type.startsWith('image/')) {
						event.preventDefault();
						const blob = item.getAsFile();
						if (blob) {
							handleWebClipboardImage(blob, item.type, view, config);
							return true;
						}
					}
				}
			}

			// Try Tauri's native clipboard for system screenshots
			event.preventDefault();
			handleTauriClipboardImage(view, config, event);
			return true;
		},
	});
}

async function handleWebClipboardImage(
	blob: File,
	mimeType: string,
	view: EditorView,
	config: PasteImageConfig
) {
	try {
		const buffer = await blob.arrayBuffer();
		const data = new Uint8Array(buffer);
		const relativePath = await config.onPasteImage(data, mimeType);
		if (relativePath) {
			insertMarkdownImage(view, relativePath);
		}
	} catch (err) {
		console.error('Failed to handle clipboard image:', err);
	}
}

async function handleTauriClipboardImage(
	view: EditorView,
	config: PasteImageConfig,
	originalEvent: ClipboardEvent
) {
	try {
		const image = await readImage();
		const { width, height } = await image.size();
		const rgbaData = await image.rgba();

		// Convert RGBA to PNG
		const pngData = await rgbaToPng(rgbaData, width, height);

		const relativePath = await config.onPasteImage(pngData, 'image/png');
		if (relativePath) {
			insertMarkdownImage(view, relativePath);
		}
	} catch {
		// No image in clipboard - let the original paste through
		// We already prevented default, so manually handle text paste
		const text = originalEvent.clipboardData?.getData('text');
		if (text) {
			view.dispatch({
				changes: {
					from: view.state.selection.main.from,
					to: view.state.selection.main.to,
					insert: text,
				},
			});
		}
	}
}

function insertMarkdownImage(view: EditorView, url: string) {
	const markdown = `![](${url})`;
	const pos = view.state.selection.main.head;
	view.dispatch({
		changes: { from: pos, insert: markdown },
		selection: { anchor: pos + markdown.length },
	});
}
