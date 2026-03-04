/**
 * Block ID System for Mutter
 *
 * Provides stable IDs for blocks within markdown documents.
 * IDs are stored inline in markdown (Obsidian-compatible format: ^abc123)
 * and indexed in the vault index for fast lookup.
 */

export type BlockType = 'heading' | 'paragraph' | 'list-item' | 'code-block' | 'blockquote';

export interface BlockInfo {
  id: string;
  type: BlockType;
  level?: number; // For headings (1-6)
  lineStart: number;
  lineEnd: number;
  text: string; // First 100 chars for search/preview
}

// Block ID format: 6 lowercase alphanumeric characters
const BLOCK_ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const BLOCK_ID_LENGTH = 6;

// Regex to match block IDs at end of line: space + ^abc123
const BLOCK_ID_REGEX = / \^([a-z0-9]{6})$/;


/**
 * Generate a new random block ID
 */
export function generateBlockId(): string {
  let id = '';
  for (let i = 0; i < BLOCK_ID_LENGTH; i++) {
    id += BLOCK_ID_CHARS[Math.floor(Math.random() * BLOCK_ID_CHARS.length)];
  }
  return id;
}

/**
 * Parse a block ID from the end of a line
 * Returns null if no valid ID found
 */
export function parseBlockId(line: string): string | null {
  const match = line.match(BLOCK_ID_REGEX);
  return match ? match[1] : null;
}

/**
 * Append a block ID to a line
 * If line already has an ID, returns unchanged
 */
export function appendBlockId(line: string, id: string): string {
  if (parseBlockId(line)) {
    return line; // Already has ID
  }
  return `${line} ^${id}`;
}

/**
 * Remove block ID from end of line
 */
export function removeBlockId(line: string): string {
  return line.replace(BLOCK_ID_REGEX, '');
}

/**
 * Get the text content of a line without the block ID
 */
export function getLineTextWithoutId(line: string): string {
  return removeBlockId(line).trim();
}

/**
 * Detect the type of a markdown block from its content
 */
function detectBlockType(line: string): { type: BlockType; level?: number } | null {
  const trimmed = line.trim();

  // Empty line - not a block
  if (!trimmed) {
    return null;
  }

  // Heading
  const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
  if (headingMatch) {
    return { type: 'heading', level: headingMatch[1].length };
  }

  // List item (bullet or numbered)
  if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
    return { type: 'list-item' };
  }

  // Task list item (special case of list item)
  if (/^[-*+]\s+\[[ x]\]\s+/.test(trimmed)) {
    return { type: 'list-item' };
  }

  // Blockquote
  if (trimmed.startsWith('>')) {
    return { type: 'blockquote' };
  }

  // Code block fence (we'll handle multi-line code blocks separately)
  if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
    return null; // Code fences themselves don't get IDs
  }

  // Horizontal rule - not a content block
  if (/^[-*_]{3,}$/.test(trimmed)) {
    return null;
  }

  // Default: paragraph
  return { type: 'paragraph' };
}

/**
 * Extract all blocks from a markdown document
 * Returns blocks with their IDs (if present) and positions
 */
export function extractBlocks(content: string): BlockInfo[] {
  const lines = content.split('\n');
  const blocks: BlockInfo[] = [];

  let inCodeBlock = false;
  let codeBlockStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track code block state
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockStart = i;
      } else {
        // End of code block - the closing fence may have an ID
        const existingId = parseBlockId(line);
        if (existingId || codeBlockStart >= 0) {
          // Create block for entire code block
          const codeContent = lines.slice(codeBlockStart, i + 1).join('\n');
          blocks.push({
            id: existingId || '',
            type: 'code-block',
            lineStart: codeBlockStart,
            lineEnd: i,
            text: codeContent.slice(0, 100),
          });
        }
        inCodeBlock = false;
        codeBlockStart = -1;
      }
      continue;
    }

    // Skip lines inside code blocks
    if (inCodeBlock) {
      continue;
    }

    // Detect block type
    const blockType = detectBlockType(line);
    if (!blockType) {
      continue; // Empty line, fence, or hr
    }

    const existingId = parseBlockId(line);
    const textWithoutId = getLineTextWithoutId(line);

    blocks.push({
      id: existingId || '',
      type: blockType.type,
      level: blockType.level,
      lineStart: i,
      lineEnd: i,
      text: textWithoutId.slice(0, 100),
    });
  }

  return blocks;
}

/**
 * Find a block by its ID in extracted blocks
 */
export function findBlockById(blocks: BlockInfo[], id: string): BlockInfo | null {
  return blocks.find(b => b.id === id) || null;
}

/**
 * Get the block at a specific line number
 */
export function getBlockAtLine(blocks: BlockInfo[], lineNumber: number): BlockInfo | null {
  return blocks.find(b => lineNumber >= b.lineStart && lineNumber <= b.lineEnd) || null;
}
