/**
 * Transclusion Resolver Hook
 *
 * Resolves embed targets (![[Note Name#blockId]]) to their content.
 * Uses the manifest shim to find notes and the file system to read content.
 * Blocks are located by parsing the file content with extractBlocks.
 */

import { useCallback } from 'react';
import { emitMutterEvent } from '@/events';
import { useVaultMetadata } from '@/context/VaultMetadataContext';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { extractBlocks, findBlockById } from '@/editor/blockIds';
import { normalizePath } from '@/vault/vaultIndex';

/**
 * Maximum characters to return for a full note embed
 * Prevents overwhelming the editor with very large embeds
 */
const MAX_EMBED_CHARS = 5000;

/**
 * Result of useTransclusionResolver hook
 */
export interface TransclusionResolverResult {
  resolveEmbed: (target: string, blockId: string | null) => Promise<string>;
  jumpToSource: (target: string, blockId: string | null) => void;
  editInPlace: (target: string, blockId: string | null) => void;
}

/**
 * Ensure a target has .md extension
 */
function resolveNotePath(target: string): string {
  return target.endsWith('.md') ? target : target + '.md';
}

/**
 * Hook that provides transclusion resolution capabilities
 */
export function useTransclusionResolver(
  vaultPath: string | null
): TransclusionResolverResult {
  const { manifest } = useVaultMetadata();

  const resolveEmbed = useCallback(
    async (target: string, blockId: string | null): Promise<string> => {
      if (!manifest || !vaultPath) {
        throw new Error('Vault not loaded');
      }

      const targetPath = resolveNotePath(target);
      const noteId = manifest.path_index[targetPath] ?? null;

      if (!noteId) {
        throw new Error(`Note not found: ${target}`);
      }

      const relPath = manifest.id_to_path[noteId];
      if (!relPath) {
        throw new Error(`Note path not found: ${target}`);
      }

      const normalizedVault = normalizePath(vaultPath);
      const fullPath = `${normalizedVault}/${relPath}`;
      const content = await readTextFile(fullPath);

      if (!blockId) {
        const truncated = content.slice(0, MAX_EMBED_CHARS);
        if (content.length > MAX_EMBED_CHARS) {
          return truncated + '\n\n[... content truncated ...]';
        }
        return truncated;
      }

      const blocks = extractBlocks(content);
      const block = findBlockById(blocks, blockId);

      if (!block) {
        throw new Error(`Block not found: #${blockId}`);
      }

      const lines = content.split('\n');
      const blockLines = lines.slice(block.lineStart, block.lineEnd + 1);

      const lastLine = blockLines[blockLines.length - 1];
      blockLines[blockLines.length - 1] = lastLine.replace(/ \^[a-z0-9]{6}$/, '');

      return blockLines.join('\n');
    },
    [manifest, vaultPath]
  );

  const jumpToSource = useCallback(
    (target: string, blockId: string | null) => {
      emitMutterEvent('mutter:navigate-wikilink', { target, blockId });
    },
    []
  );

  const editInPlace = useCallback(
    (target: string, blockId: string | null) => {
      emitMutterEvent('mutter:navigate-wikilink', { target, blockId });
    },
    []
  );

  return { resolveEmbed, jumpToSource, editInPlace };
}
