/**
 * AI Query Service
 *
 * Enables natural language queries against the vault:
 * 1. Builds embeddings for vault notes
 * 2. Performs semantic search using cosine similarity
 * 3. Uses LLM to synthesize answers from matching notes
 *
 * Uses the split document format (ManifestDoc + file system).
 */

import { getEmbedding, cosineSimilarity } from '@/lib/embedding-api';
import { queryLLM, LLMSettings } from './llm-service';
import type { ManifestDoc } from '@/crdt/manifestDoc';
import { readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';

/**
 * Lightweight note metadata for query results
 * (doesn't require loading full NoteDoc)
 */
export interface LightNote {
  id: string;
  relPath: string;
  title: string;
}

/**
 * Result of a vault query
 */
export interface QueryResult {
  /** Synthesized answer from the LLM */
  answer: string;
  /** Source notes that contributed to the answer */
  sources: Array<{
    note: LightNote;
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
 * Cache for note content (used for keyword search)
 * Maps noteId -> full content
 */
let contentCache: Map<string, string> = new Map();

/**
 * Clear the embedding cache
 * Useful when vault changes significantly
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
  contentCache.clear();
}

/**
 * Get current cache size
 */
export function getEmbeddingCacheSize(): number {
  return embeddingCache.size;
}

/**
 * Interface for persisted embedding data
 */
interface PersistedEmbeddings {
  version: string;
  embeddings: Array<{
    noteId: string;
    embedding: number[];
    contentHash: string;
  }>;
}

/**
 * Save embedding cache to file system
 * Saves to <vaultPath>/.mutter/embeddings.json
 */
export async function saveEmbeddingCache(vaultPath: string): Promise<void> {
  const normalizedVault = vaultPath.replaceAll('\\', '/').replace(/\/+$/g, '');
  const mutterDir = `${normalizedVault}/.mutter`;
  const filePath = `${mutterDir}/embeddings.json`;

  try {
    // Ensure .mutter directory exists
    if (!(await exists(mutterDir))) {
      await mkdir(mutterDir, { recursive: true });
    }

    // Convert cache to serializable format
    const data: PersistedEmbeddings = {
      version: '1.0',
      embeddings: Array.from(embeddingCache.values()),
    };

    await writeTextFile(filePath, JSON.stringify(data));
    console.log(`[AI Query] Saved ${embeddingCache.size} embeddings to ${filePath}`);
  } catch (err) {
    console.error('[AI Query] Failed to save embeddings:', err);
  }
}

/**
 * Load embedding cache from file system
 * Loads from <vaultPath>/.mutter/embeddings.json
 * @returns Number of embeddings loaded, or 0 if no cache file exists
 */
export async function loadEmbeddingCache(vaultPath: string): Promise<number> {
  const normalizedVault = vaultPath.replaceAll('\\', '/').replace(/\/+$/g, '');
  const filePath = `${normalizedVault}/.mutter/embeddings.json`;

  try {
    if (!(await exists(filePath))) {
      console.log('[AI Query] No cached embeddings found');
      return 0;
    }

    const content = await readTextFile(filePath);
    const data: PersistedEmbeddings = JSON.parse(content);

    // Validate version
    if (data.version !== '1.0') {
      console.warn('[AI Query] Incompatible embedding cache version, clearing');
      return 0;
    }

    // Populate cache
    embeddingCache.clear();
    for (const entry of data.embeddings) {
      embeddingCache.set(entry.noteId, entry);
    }

    console.log(`[AI Query] Loaded ${embeddingCache.size} embeddings from cache`);
    return embeddingCache.size;
  } catch (err) {
    console.error('[AI Query] Failed to load embeddings:', err);
    return 0;
  }
}

/**
 * Helper to derive title from file path
 */
function titleFromPath(relPath: string): string {
  const basename = relPath.split('/').pop() || relPath;
  return basename.replace(/\.md$/i, '') || 'Untitled';
}

/**
 * Build or update embeddings for all notes in the vault
 *
 * This should be called on vault load or when notes change.
 * Uses content hashing to avoid re-embedding unchanged notes.
 *
 * Uses manifest for note IDs/paths and reads content from file system.
 *
 * @param params - Manifest, vault path, and optional progress callback
 */
export async function buildVaultEmbeddings(params: {
  manifest: ManifestDoc;
  vaultPath: string;
  onProgress?: (current: number, total: number) => void;
}): Promise<{ processed: number; cached: number; failed: number }> {
  const noteIds = Object.keys(params.manifest.id_to_path);
  const normalizedVault = params.vaultPath.replaceAll('\\', '/').replace(/\/+$/g, '');

  let processed = 0;
  let cached = 0;
  let failed = 0;

  for (let i = 0; i < noteIds.length; i++) {
    const noteId = noteIds[i];
    const relPath = params.manifest.id_to_path[noteId];
    params.onProgress?.(i + 1, noteIds.length);

    try {
      // Read note content from file system
      const fullPath = `${normalizedVault}/${relPath}`;
      const content = await readTextFile(fullPath);

      // Simple content hash for change detection
      const contentHash = hashString(content);

      // Always cache the content for keyword search
      contentCache.set(noteId, content);

      // Check if we have a valid cached embedding
      const cached_entry = embeddingCache.get(noteId);
      if (cached_entry && cached_entry.contentHash === contentHash) {
        cached++;
        continue; // Already up to date
      }

      // Derive title from path
      const title = titleFromPath(relPath);

      // Generate embedding for note content
      // Use title + first 2000 chars for embedding (captures more context)
      const textForEmbedding = title + '\n\n' + content.slice(0, 2000);
      const response = await getEmbedding(textForEmbedding);

      embeddingCache.set(noteId, {
        noteId,
        embedding: response.embedding,
        contentHash,
      });

      processed++;
    } catch (err) {
      console.warn(`[AI Query] Failed to embed ${relPath}:`, err);
      failed++;
    }
  }

  console.log(
    `[AI Query] Embedding complete: ${processed} processed, ${cached} cached, ${failed} failed`
  );

  // Save cache to file system
  await saveEmbeddingCache(params.vaultPath);

  return { processed, cached, failed };
}

/**
 * Extract keywords from a query for hybrid search
 * Filters out common stop words
 */
function extractKeywords(query: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
    'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
    'below', 'between', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
    'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but',
    'if', 'or', 'because', 'until', 'while', 'about', 'against', 'this',
    'that', 'these', 'those', 'am', 'what', 'which', 'who', 'whom',
    'find', 'me', 'my', 'i', 'show', 'get', 'list', 'notes', 'note',
  ]);

  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

/**
 * Search the vault using hybrid approach: semantic + keyword matching
 *
 * @param params - Query text, manifest, vault path, and number of results
 * @returns Array of notes with combined scores, sorted by relevance
 */
export async function searchVault(params: {
  query: string;
  manifest: ManifestDoc;
  topK?: number;
}): Promise<Array<{ note: LightNote; similarity: number }>> {
  const { query, manifest, topK = 5 } = params;

  // Get query embedding for semantic search
  const queryResponse = await getEmbedding(query);
  const queryEmbedding = queryResponse.embedding;

  // Extract keywords for keyword matching
  const keywords = extractKeywords(query);

  // Score all cached notes with hybrid approach
  const scored: Array<{
    noteId: string;
    semanticScore: number;
    keywordScore: number;
    combinedScore: number;
  }> = [];

  for (const [noteId, cached] of embeddingCache) {
    const semanticScore = cosineSimilarity(queryEmbedding, cached.embedding);

    // Calculate keyword score if we have content cached
    let keywordScore = 0;
    const content = contentCache.get(noteId);
    if (content && keywords.length > 0) {
      const contentLower = content.toLowerCase();
      let matchedKeywords = 0;
      let totalMatches = 0;

      for (const keyword of keywords) {
        const regex = new RegExp(keyword, 'gi');
        const matches = contentLower.match(regex);
        if (matches) {
          matchedKeywords++;
          totalMatches += matches.length;
        }
      }

      // Keyword score: ratio of matched keywords + bonus for multiple occurrences
      keywordScore = (matchedKeywords / keywords.length) * 0.7 +
                     Math.min(totalMatches / 10, 0.3);
    }

    // Hybrid score: weight semantic (60%) and keyword (40%)
    // If no keywords, use pure semantic
    const combinedScore = keywords.length > 0
      ? semanticScore * 0.6 + keywordScore * 0.4
      : semanticScore;

    scored.push({ noteId, semanticScore, keywordScore, combinedScore });
  }

  // Sort by combined score (descending)
  scored.sort((a, b) => b.combinedScore - a.combinedScore);

  // Filter out low-relevance results (below 0.3 combined score)
  const filtered = scored.filter(s => s.combinedScore > 0.3);

  // Take top K
  const topResults = filtered.slice(0, topK);


  // Map back to notes using manifest
  return topResults
    .map(({ noteId, combinedScore }) => {
      const relPath = manifest.id_to_path[noteId];
      if (!relPath) return null;
      return {
        note: {
          id: noteId,
          relPath,
          title: titleFromPath(relPath),
        },
        similarity: combinedScore,
      };
    })
    .filter((r): r is { note: LightNote; similarity: number } => r !== null);
}

/**
 * Query the vault with natural language and get a synthesized answer
 *
 * Flow:
 * 1. Search for relevant notes using semantic similarity
 * 2. Build context from matched notes (reads from file system)
 * 3. Use LLM to synthesize an answer
 *
 * @param params - Query, manifest, vault path, LLM settings
 * @returns Answer with sources and timing
 */
export async function queryVault(params: {
  query: string;
  manifest: ManifestDoc;
  vaultPath: string;
  llmSettings: LLMSettings;
  topK?: number;
}): Promise<QueryResult> {
  const startTime = Date.now();
  const { query, manifest, vaultPath, llmSettings, topK = 5 } = params;
  const normalizedVault = vaultPath.replaceAll('\\', '/').replace(/\/+$/g, '');

  // 1. Search for relevant notes
  const searchResults = await searchVault({ query, manifest, topK });

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
      const fullPath = `${normalizedVault}/${note.relPath}`;
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
      console.warn(`[AI Query] Failed to read ${note.relPath}:`, err);
    }
  }

  const context = contextParts.join('\n\n---\n\n');

  // 3. Ask LLM to synthesize an answer
  const prompt = buildQueryPrompt(query, context);

  try {
    const answer = await queryLLM(prompt, llmSettings);

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
