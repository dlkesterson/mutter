/**
 * Transclusion Resolver Hook
 *
 * Resolves embed targets (![[Note Name#blockId]]) to their content.
 * Uses the manifest to find notes and the file system to read content.
 * Blocks are located by parsing the file content with extractBlocks.
 */

import { useCallback } from 'react';
import { emitMutterEvent } from '@/events';
import { useVaultMetadata } from '@/context/VaultMetadataContext';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { findNoteIdByPath } from '@/crdt/manifestDoc';
import { extractBlocks, findBlockById } from '@/editor/blockIds';

/**
 * Maximum characters to return for a full note embed
 * Prevents overwhelming the editor with very large embeds
 */
const MAX_EMBED_CHARS = 5000;

/**
 * Result of useTransclusionResolver hook
 */
export interface TransclusionResolverResult {
  /**
   * Resolve embed content
   * @param target - Note name or relative path
   * @param blockId - Block ID (or null for full note)
   * @returns The content to display
   * @throws Error if note or block not found
   */
  resolveEmbed: (target: string, blockId: string | null) => Promise<string>;

  /**
   * Navigate to the source note/block
   */
  jumpToSource: (target: string, blockId: string | null) => void;

  /**
   * Open the source for editing (same as jump for now)
   */
  editInPlace: (target: string, blockId: string | null) => void;
}

/**
 * Hook that provides transclusion resolution capabilities
 *
 * @param vaultPath - Path to the vault root directory
 * @returns Functions for resolving embeds and navigation
 *
 * @example
 * ```tsx
 * function Editor() {
 *   const { resolveEmbed, jumpToSource, editInPlace } = useTransclusionResolver(vaultPath);
 *
 *   // Use in transclusion extension
 *   const ext = transclusionExtension({
 *     resolveEmbed,
 *     onEdit: editInPlace,
 *     onJump: jumpToSource,
 *   });
 * }
 * ```
 */
export function useTransclusionResolver(
  vaultPath: string | null
): TransclusionResolverResult {
  const { manifest } = useVaultMetadata();

  /**
   * Normalize vault path (remove trailing slashes, normalize separators)
   */
  const normalizeVaultPath = (path: string): string => {
    return path.replaceAll('\\', '/').replace(/\/+$/g, '');
  };

  /**
   * Resolve a note target to its full path
   * Handles:
   * - Simple names: "My Note" -> finds "My Note.md"
   * - With extension: "My Note.md" -> uses as-is
   * - With path: "folder/My Note" -> finds "folder/My Note.md"
   */
  const resolveNotePath = (target: string): string => {
    return target.endsWith('.md') ? target : target + '.md';
  };

  /**
   * Resolve embed content from the vault
   */
  const resolveEmbed = useCallback(
    async (target: string, blockId: string | null): Promise<string> => {
      if (!manifest || !vaultPath) {
        throw new Error('Vault not loaded');
      }

      // Resolve target to relative path
      const targetPath = resolveNotePath(target);
      const noteId = findNoteIdByPath(manifest, targetPath);

      if (!noteId) {
        throw new Error(`Note not found: ${target}`);
      }

      const relPath = manifest.id_to_path[noteId];
      if (!relPath) {
        throw new Error(`Note path not found: ${target}`);
      }

      // Build full path and read file content
      const normalizedVault = normalizeVaultPath(vaultPath);
      const fullPath = `${normalizedVault}/${relPath}`;
      const content = await readTextFile(fullPath);

      // If no blockId, return full content (truncated)
      if (!blockId) {
        const truncated = content.slice(0, MAX_EMBED_CHARS);
        if (content.length > MAX_EMBED_CHARS) {
          return truncated + '\n\n[... content truncated ...]';
        }
        return truncated;
      }

      // Find specific block by ID
      // We use extractBlocks to get line ranges from the actual file content
      const blocks = extractBlocks(content);
      const block = findBlockById(blocks, blockId);

      if (!block) {
        throw new Error(`Block not found: #${blockId}`);
      }

      // Extract block content from file using line ranges
      const lines = content.split('\n');
      const blockLines = lines.slice(block.lineStart, block.lineEnd + 1);

      // Remove the block ID suffix from the last line for cleaner display
      const lastLine = blockLines[blockLines.length - 1];
      blockLines[blockLines.length - 1] = lastLine.replace(/ \^[a-z0-9]{6}$/, '');

      return blockLines.join('\n');
    },
    [manifest, vaultPath]
  );

  /**
   * Navigate to the source note/block
   */
  const jumpToSource = useCallback(
    (target: string, blockId: string | null) => {
      emitMutterEvent('mutter:navigate-wikilink', { target, blockId });
    },
    []
  );

  /**
   * Open source for editing (same as jump for now)
   */
  const editInPlace = useCallback(
    (target: string, blockId: string | null) => {
      emitMutterEvent('mutter:navigate-wikilink', { target, blockId });
    },
    []
  );

  return { resolveEmbed, jumpToSource, editInPlace };
}
