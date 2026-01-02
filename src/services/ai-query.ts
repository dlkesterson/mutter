/**
 * AI Query Service
 *
 * Enables natural language queries against the vault:
 * 1. Builds embeddings for vault notes
 * 2. Performs semantic search using cosine similarity
 * 3. Uses LLM to synthesize answers from matching notes
 */

import { getEmbedding, cosineSimilarity } from '@/lib/embedding-api';
import { formatWithLLM, LLMSettings, FormattingContext } from './llm-formatter';
import { VaultMetadataDoc, VaultNote } from '@/crdt/vaultMetadataDoc';
import { readTextFile } from '@tauri-apps/plugin-fs';

/**
 * Result of a vault query
 */
export interface QueryResult {
  /** Synthesized answer from the LLM */
  answer: string;
  /** Source notes that contributed to the answer */
  sources: Array<{
    note: VaultNote;
    /** Relevance score 0-1 */
    relevance: number;
    /** First ~200 chars of the note */
    excerpt: string;
  }>;
  /** Total processing time in ms */
  processingTime: number;
}

/**
 * Cached note embedding
 */
export interface NoteEmbedding {
  noteId: string;
  embedding: number[];
  /** Hash of content to detect if re-embedding needed */
  contentHash: string;
}

/**
 * In-memory cache of note embeddings
 * Persisted across queries but not across sessions
 */
let embeddingCache: Map<string, NoteEmbedding> = new Map();

/**
 * Clear the embedding cache
 * Useful when vault changes significantly
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}

/**
 * Get current cache size
 */
export function getEmbeddingCacheSize(): number {
  return embeddingCache.size;
}

/**
 * Build or update embeddings for all notes in the vault
 *
 * This should be called on vault load or when notes change.
 * Uses content hashing to avoid re-embedding unchanged notes.
 *
 * @param params - Vault doc, path, and optional progress callback
 */
export async function buildVaultEmbeddings(params: {
  doc: VaultMetadataDoc;
  vaultPath: string;
  onProgress?: (current: number, total: number) => void;
}): Promise<{ processed: number; cached: number; failed: number }> {
  const notes = Object.values(params.doc.notes);
  const normalizedVault = params.vaultPath.replaceAll('\\', '/').replace(/\/+$/g, '');

  let processed = 0;
  let cached = 0;
  let failed = 0;

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    params.onProgress?.(i + 1, notes.length);

    try {
      // Read note content
      const fullPath = `${normalizedVault}/${note.rel_path}`;
      const content = await readTextFile(fullPath);

      // Simple content hash for change detection
      const contentHash = hashString(content);

      // Check if we have a valid cached embedding
      const cached_entry = embeddingCache.get(note.id);
      if (cached_entry && cached_entry.contentHash === contentHash) {
        cached++;
        continue; // Already up to date
      }

      // Generate embedding for note content
      // Use title + first 500 chars for embedding (balance relevance vs cost)
      const textForEmbedding = note.title + '\n\n' + content.slice(0, 500);
      const response = await getEmbedding(textForEmbedding);

      embeddingCache.set(note.id, {
        noteId: note.id,
        embedding: response.embedding,
        contentHash,
      });

      processed++;
    } catch (err) {
      console.warn(`[AI Query] Failed to embed ${note.rel_path}:`, err);
      failed++;
    }
  }

  console.log(
    `[AI Query] Embedding complete: ${processed} processed, ${cached} cached, ${failed} failed`
  );

  return { processed, cached, failed };
}

/**
 * Search the vault for notes semantically similar to a query
 *
 * @param params - Query text, vault doc, and number of results
 * @returns Array of notes with similarity scores, sorted by relevance
 */
export async function searchVault(params: {
  query: string;
  doc: VaultMetadataDoc;
  vaultPath: string;
  topK?: number;
}): Promise<Array<{ note: VaultNote; similarity: number }>> {
  const { query, doc, topK = 5 } = params;

  // Get query embedding
  const queryResponse = await getEmbedding(query);
  const queryEmbedding = queryResponse.embedding;

  // Score all cached notes
  const scored: Array<{ noteId: string; similarity: number }> = [];

  for (const [noteId, cached] of embeddingCache) {
    const similarity = cosineSimilarity(queryEmbedding, cached.embedding);
    scored.push({ noteId, similarity });
  }

  // Sort by similarity (descending) and take top K
  scored.sort((a, b) => b.similarity - a.similarity);
  const topResults = scored.slice(0, topK);

  // Map back to notes, filtering out any that no longer exist
  return topResults
    .map(({ noteId, similarity }) => ({
      note: doc.notes[noteId],
      similarity,
    }))
    .filter((r): r is { note: VaultNote; similarity: number } => r.note !== undefined);
}

/**
 * Query the vault with natural language and get a synthesized answer
 *
 * Flow:
 * 1. Search for relevant notes using semantic similarity
 * 2. Build context from matched notes
 * 3. Use LLM to synthesize an answer
 *
 * @param params - Query, vault data, LLM settings
 * @returns Answer with sources and timing
 */
export async function queryVault(params: {
  query: string;
  doc: VaultMetadataDoc;
  vaultPath: string;
  llmSettings: LLMSettings;
  topK?: number;
}): Promise<QueryResult> {
  const startTime = Date.now();
  const { query, doc, vaultPath, llmSettings, topK = 5 } = params;
  const normalizedVault = vaultPath.replaceAll('\\', '/').replace(/\/+$/g, '');

  // 1. Search for relevant notes
  const searchResults = await searchVault({ query, doc, vaultPath, topK });

  if (searchResults.length === 0) {
    return {
      answer: "I couldn't find any notes related to your query. Try building the index first or using different search terms.",
      sources: [],
      processingTime: Date.now() - startTime,
    };
  }

  // 2. Build context from top matches
  const contextParts: string[] = [];
  const sources: QueryResult['sources'] = [];

  for (const { note, similarity } of searchResults) {
    try {
      const fullPath = `${normalizedVault}/${note.rel_path}`;
      const content = await readTextFile(fullPath);

      // Take first 1000 chars as context
      const excerpt = content.slice(0, 1000);

      contextParts.push(`## ${note.title}\n${excerpt}`);
      sources.push({
        note,
        relevance: similarity,
        excerpt: excerpt.slice(0, 200) + (excerpt.length > 200 ? '...' : ''),
      });
    } catch (err) {
      console.warn(`[AI Query] Failed to read ${note.rel_path}:`, err);
    }
  }

  const context = contextParts.join('\n\n---\n\n');

  // 3. Ask LLM to synthesize an answer
  const prompt = buildQueryPrompt(query, context);

  // Create a FormattingContext for the LLM formatter
  // We're repurposing it for query answering
  const formattingContext: FormattingContext = {
    rawTranscription: prompt,
    cursorPosition: 0,
    surroundingText: {
      before: '',
      after: '',
    },
    documentStats: {
      hasHeaders: false,
      hasBullets: false,
    },
    settings: {
      removeFillers: false,
      addStructure: false,
      matchStyle: false,
    },
  };

  try {
    const answer = await formatWithLLM(formattingContext, llmSettings);

    return {
      answer: answer || 'The AI could not generate an answer. Please try again.',
      sources,
      processingTime: Date.now() - startTime,
    };
  } catch (err) {
    console.error('[AI Query] LLM error:', err);
    return {
      answer: `Error querying AI: ${err instanceof Error ? err.message : 'Unknown error'}`,
      sources,
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Build a prompt for the LLM to answer a query about notes
 */
function buildQueryPrompt(query: string, context: string): string {
  return `You are a helpful assistant with access to the user's notes.
Based on the following notes from their vault, answer their question.
Be concise but thorough. Reference specific notes when relevant.

USER'S NOTES:
${context}

USER'S QUESTION:
${query}

Provide a helpful, synthesized answer based on the notes above. If the notes don't contain relevant information, say so.`;
}

/**
 * Simple string hash for content change detection
 * Not cryptographic - just for comparison
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}
