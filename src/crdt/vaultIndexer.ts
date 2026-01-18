/**
 * Vault Indexer
 *
 * Scans the vault filesystem to discover all markdown files
 * and registers them in the CRDT. This enables graph view and
 * link resolution for files that haven't been opened yet.
 */

import type { DocHandle } from '@automerge/react';
import { readDir } from '@tauri-apps/plugin-fs';
import type { VaultMetadataDoc } from './vaultMetadataDoc';
import { ensureVaultMetadataDocShape } from './vaultMetadataDoc';

/**
 * Result of vault indexing
 */
export interface IndexResult {
  filesScanned: number;
  newNotesAdded: number;
  alreadyIndexed: number;
  errors: string[];
}

/**
 * Recursively collect all markdown file paths in a directory
 */
async function collectMarkdownFiles(
  basePath: string,
  relativePath: string = ''
): Promise<string[]> {
  const files: string[] = [];
  const fullPath = relativePath ? `${basePath}/${relativePath}` : basePath;

  try {
    const entries = await readDir(fullPath);

    for (const entry of entries) {
      const entryRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      // Skip hidden files/folders and .mutter directory
      if (entry.name.startsWith('.')) continue;

      if (entry.isDirectory) {
        // Recurse into subdirectories
        const subFiles = await collectMarkdownFiles(basePath, entryRelPath);
        files.push(...subFiles);
      } else if (entry.name.endsWith('.md')) {
        files.push(entryRelPath);
      }
    }
  } catch (err) {
    console.warn(`[VaultIndexer] Failed to read directory ${fullPath}:`, err);
  }

  return files;
}

/**
 * Generate a unique ID for a note
 */
function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

/**
 * Extract title from relative path
 */
function titleFromRelPath(relPath: string): string {
  const base = relPath.split('/').pop() ?? relPath;
  return base.replace(/\.md$/i, '') || 'Untitled';
}

/**
 * Index all markdown files in the vault
 *
 * This function scans the vault directory recursively and registers
 * any markdown files not already in the CRDT. It's idempotent - running
 * it multiple times won't create duplicates.
 *
 * @param handle - CRDT document handle
 * @param vaultPath - Absolute path to vault root
 * @param onProgress - Optional progress callback
 * @returns Index result with statistics
 */
export async function indexVaultFiles(params: {
  handle: DocHandle<VaultMetadataDoc>;
  vaultPath: string;
  onProgress?: (scanned: number, total: number) => void;
}): Promise<IndexResult> {
  const { handle, vaultPath, onProgress } = params;

  console.log(`[VaultIndexer] Starting vault index for: ${vaultPath}`);

  const result: IndexResult = {
    filesScanned: 0,
    newNotesAdded: 0,
    alreadyIndexed: 0,
    errors: [],
  };

  // Collect all markdown files
  const files = await collectMarkdownFiles(vaultPath);
  console.log(`[VaultIndexer] Found ${files.length} markdown files`);

  const now = Date.now();

  // Process files in batches to avoid blocking
  const batchSize = 50;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);

    handle.change((doc: any) => {
      ensureVaultMetadataDocShape(doc, doc?.meta?.vault_id ?? 'unknown');

      for (const relPath of batch) {
        result.filesScanned++;

        // Check if already indexed
        const existingId = doc.note_id_by_path[relPath];
        if (existingId && doc.notes[existingId]) {
          result.alreadyIndexed++;
          continue;
        }

        // Create new note entry
        const id = newId();
        doc.note_id_by_path[relPath] = id;
        doc.notes[id] = {
          id,
          rel_path: relPath,
          title: titleFromRelPath(relPath),
          tags: [],
          links: [],
          created_at: now,
          updated_at: now,
          last_opened_at: null,
          blocks: {},
          block_order: [],
          supertags: [],
        };
        result.newNotesAdded++;
      }
    });

    onProgress?.(Math.min(i + batchSize, files.length), files.length);

    // Yield to event loop to keep UI responsive
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  console.log(
    `[VaultIndexer] Complete: ${result.newNotesAdded} new, ${result.alreadyIndexed} existing, ${result.errors.length} errors`
  );

  return result;
}

/**
 * Check if vault needs indexing
 * Returns true if the CRDT has significantly fewer notes than expected
 */
export async function vaultNeedsIndexing(params: {
  handle: DocHandle<VaultMetadataDoc>;
  vaultPath: string;
}): Promise<boolean> {
  const { handle, vaultPath } = params;

  const doc = handle.doc();
  if (!doc) return true;

  const indexedCount = Object.keys(doc.notes).length;

  // Quick check - if we have very few notes, likely needs indexing
  if (indexedCount < 100) return true;

  // Sample check - count files in a few directories
  try {
    const entries = await readDir(vaultPath);
    let totalMdFiles = entries.filter((e) => !e.isDirectory && e.name.endsWith('.md')).length;

    // Also count files in immediate subdirectories (common vault structure)
    for (const entry of entries) {
      if (entry.isDirectory && !entry.name.startsWith('.')) {
        try {
          const subEntries = await readDir(`${vaultPath}/${entry.name}`);
          totalMdFiles += subEntries.filter((e) => !e.isDirectory && e.name.endsWith('.md')).length;
        } catch {
          // Skip directories we can't read
        }
      }
    }

    // If we found significantly more files, needs indexing
    if (totalMdFiles > indexedCount) {
      console.log(`[VaultIndexer] Found ${totalMdFiles} files in sample, only ${indexedCount} indexed`);
      return true;
    }
  } catch {
    // Can't read, assume needs indexing
    return true;
  }

  return false;
}
