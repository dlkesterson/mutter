/**
 * AI Query Hook
 *
 * Provides a React interface for querying the vault using natural language.
 * Uses ManifestDoc + file system for embeddings and queries.
 */

import { useState, useCallback, useEffect } from 'react';
import { useVaultMetadata } from '@/context/VaultMetadataContext';
import {
  QueryResult,
  getEmbeddingCacheSize,
  clearEmbeddingCache,
  buildVaultEmbeddings,
  queryVault,
  loadEmbeddingCache,
} from '@/services/ai-query';
import type { LLMSettings } from '@/services/llm-service';

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
 */
export function useAIQuery(
  vaultPath: string | null,
  llmSettings: LLMSettings
): UseAIQueryResult {
  const { manifest } = useVaultMetadata();

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);
  const [indexSize, setIndexSize] = useState(getEmbeddingCacheSize());

  // Load cached embeddings when vault path changes
  useEffect(() => {
    if (!vaultPath) return;

    loadEmbeddingCache(vaultPath).then((count) => {
      setIndexSize(count);
    });
  }, [vaultPath]);

  /**
   * Build or rebuild the embedding index for all notes
   */
  const buildIndex = useCallback(async () => {
    if (!manifest || !vaultPath) {
      setError('Vault not loaded');
      return;
    }

    setLoading(true);
    setError(null);
    setIndexProgress({ current: 0, total: Object.keys(manifest.id_to_path).length });

    try {
      const stats = await buildVaultEmbeddings({
        manifest,
        vaultPath,
        onProgress: (current, total) => {
          setIndexProgress({ current, total });
        },
      });

      setIndexSize(getEmbeddingCacheSize());
      console.log(`[AI Query] Index built: ${stats.processed} new, ${stats.cached} cached, ${stats.failed} failed`);
    } catch (err) {
      console.error('[AI Query] Index build failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to build index');
    } finally {
      setLoading(false);
      setIndexProgress(null);
    }
  }, [manifest, vaultPath]);

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
      if (!manifest || !vaultPath) {
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

      try {
        const queryResult = await queryVault({
          query: queryText,
          manifest,
          vaultPath,
          llmSettings,
        });

        setResult(queryResult);
      } catch (err) {
        console.error('[AI Query] Query failed:', err);
        setError(err instanceof Error ? err.message : 'Query failed');
      } finally {
        setLoading(false);
      }
    },
    [manifest, vaultPath, llmSettings]
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
