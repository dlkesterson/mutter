/**
 * File type detection utilities
 *
 * Determines how different file types should be handled in the editor.
 */

export type FileContentType = 'markdown' | 'image' | 'text' | 'binary';

/** Image file extensions */
const IMAGE_EXTENSIONS = new Set([
	'png',
	'jpg',
	'jpeg',
	'gif',
	'webp',
	'svg',
	'bmp',
	'ico',
	'tiff',
	'tif',
]);

/** Markdown file extensions */
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkd']);

/** Plain text file extensions (editable but not markdown) */
const TEXT_EXTENSIONS = new Set([
	'txt',
	'json',
	'yaml',
	'yml',
	'toml',
	'xml',
	'html',
	'css',
	'js',
	'ts',
	'tsx',
	'jsx',
	'py',
	'rs',
	'go',
	'sh',
	'bash',
	'zsh',
	'fish',
	'env',
	'gitignore',
	'dockerignore',
]);

/**
 * Get the file extension from a path (lowercase, without dot)
 */
export function getFileExtension(path: string): string {
	const parts = path.split('.');
	if (parts.length < 2) return '';
	return parts.pop()?.toLowerCase() || '';
}

/**
 * Determine the content type for a file based on its extension
 */
export function getFileContentType(path: string): FileContentType {
	const ext = getFileExtension(path);

	if (IMAGE_EXTENSIONS.has(ext)) {
		return 'image';
	}

	if (MARKDOWN_EXTENSIONS.has(ext)) {
		return 'markdown';
	}

	if (TEXT_EXTENSIONS.has(ext)) {
		return 'text';
	}

	// Default to binary for unknown types
	return 'binary';
}

/**
 * Check if a file is an image
 */
export function isImageFile(path: string): boolean {
	return getFileContentType(path) === 'image';
}

/**
 * Check if a file is editable text (markdown or plain text)
 */
export function isEditableFile(path: string): boolean {
	const type = getFileContentType(path);
	return type === 'markdown' || type === 'text';
}

/**
 * Check if a file should be rendered with the markdown editor
 */
export function isMarkdownFile(path: string): boolean {
	return getFileContentType(path) === 'markdown';
}
