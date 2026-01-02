/**
 * AI Query Hook
 *
 * Provides a React interface for querying the vault using natural language.
 * Handles:
 * - Building/rebuilding the embedding index
 * - Executing queries with loading states
 * - Error handling and progress reporting
 */

import { useState, useCallback } from 'react';
import { useVaultMetadata } from '@/context/VaultMetadataContext';
import {
  queryVault,
  buildVaultEmbeddings,
  QueryResult,
  getEmbeddingCacheSize,
  clearEmbeddingCache,
} from '@/services/ai-query';
import type { LLMSettings } from '@/services/llm-formatter';

/**
 * Progress state for embedding index build
 */
export interface IndexProgress {
  current: number;
  total: number;
}

/**
 * Result of the useAIQuery hook
 */
export interface UseAIQueryResult {
  /** Execute a natural language query */
  query: (queryText: string) => Promise<void>;
  /** Build or rebuild the embedding index */
  buildIndex: () => Promise<void>;
  /** Clear the embedding cache */
  clearIndex: () => void;
  /** Whether a query or indexing operation is in progress */
  loading: boolean;
  /** The most recent query result */
  result: QueryResult | null;
  /** Error message if the last operation failed */
  error: string | null;
  /** Progress during index building */
  indexProgress: IndexProgress | null;
  /** Number of notes currently in the index */
  indexSize: number;
}

/**
 * Hook for AI-powered vault queries
 *
 * @param vaultPath - Path to the vault root
 * @param llmSettings - LLM configuration (provider, API key, model)
 * @returns Query and indexing functions with state
 *
 * @example
 * ```tsx
 * function QueryPanel() {
 *   const { query, buildIndex, loading, result, error } = useAIQuery(vaultPath, llmSettings);
 *
 *   return (
 *     <div>
 *       <button onClick={buildIndex} disabled={loading}>Build Index</button>
 *       <input onSubmit={(e) => query(e.target.value)} />
 *       {result && <div>{result.answer}</div>}
 *       {error && <div className="error">{error}</div>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useAIQuery(
  vaultPath: string | null,
  llmSettings: LLMSettings
): UseAIQueryResult {
  const { doc } = useVaultMetadata();

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);
  const [indexSize, setIndexSize] = useState(getEmbeddingCacheSize());

  /**
   * Build or rebuild the embedding index for all notes
   */
  const buildIndex = useCallback(async () => {
    if (!doc || !vaultPath) {
      setError('Vault not loaded');
      return;
    }

    setLoading(true);
    setError(null);
    setIndexProgress({ current: 0, total: Object.keys(doc.notes).length });

    try {
      await buildVaultEmbeddings({
        doc,
        vaultPath,
        onProgress: (current, total) => {
          setIndexProgress({ current, total });
        },
      });
      setIndexProgress(null);
      setIndexSize(getEmbeddingCacheSize());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build index');
    } finally {
      setLoading(false);
    }
  }, [doc, vaultPath]);

  /**
   * Clear the embedding cache
   */
  const clearIndex = useCallback(() => {
    clearEmbeddingCache();
    setIndexSize(0);
    setResult(null);
  }, []);

  /**
   * Execute a query against the vault
   */
  const query = useCallback(
    async (queryText: string) => {
      if (!doc || !vaultPath) {
        setError('Vault not loaded');
        return;
      }

      if (!queryText.trim()) {
        setError('Please enter a query');
        return;
      }

      // Check if index has been built
      if (getEmbeddingCacheSize() === 0) {
        setError('Please build the index first');
        return;
      }

      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const queryResult = await queryVault({
          query: queryText,
          doc,
          vaultPath,
          llmSettings,
        });
        setResult(queryResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Query failed');
      } finally {
        setLoading(false);
      }
    },
    [doc, vaultPath, llmSettings]
  );

  return {
    query,
    buildIndex,
    clearIndex,
    loading,
    result,
    error,
    indexProgress,
    indexSize,
  };
}
