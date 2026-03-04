/**
 * useQueryEngine Hook
 *
 * Provides query execution against the vault metadata with:
 * - DSL parsing and execution
 * - Recent query history
 * - Query suggestions/autocomplete
 *
 * Uses the vault index (manifest + graph cache shims).
 */

import { useState, useCallback, useMemo } from 'react';
import { useVaultMetadata } from '@/context/VaultMetadataContext';
import { parseQuery, validateQuery, describeQuery } from '@/query/parser';
import { executeSplitQuery, getSplitQuerySuggestions, type SplitQueryResult } from '@/query/splitExecutor';
import type { ParsedQuery } from '@/query/parser';

const STORAGE_KEY = 'mutter:recent_queries';
const MAX_RECENT_QUERIES = 20;

export interface QueryEngineState {
  /** Current query string */
  query: string;
  /** Parsed query (null if parsing failed) */
  parsed: ParsedQuery | null;
  /** Query validation errors */
  errors: string[];
  /** Last execution result */
  result: SplitQueryResult | null;
  /** Whether a query is currently executing */
  isExecuting: boolean;
  /** Human-readable description of the query */
  description: string;
}

/**
 * Load recent queries from localStorage
 */
function loadRecentQueries(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

/**
 * Save recent queries to localStorage
 */
function saveRecentQueries(queries: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queries));
}

/**
 * Hook for executing queries against the vault metadata
 */
export function useQueryEngine() {
  const { manifest, graphCache } = useVaultMetadata();

  const [state, setState] = useState<QueryEngineState>({
    query: '',
    parsed: null,
    errors: [],
    result: null,
    isExecuting: false,
    description: 'All notes',
  });

  const [recentQueries, setRecentQueries] = useState<string[]>(loadRecentQueries);

  /**
   * Update query string and parse it
   */
  const setQuery = useCallback((queryString: string) => {
    const parsed = parseQuery(queryString);
    const errors = validateQuery(parsed);
    const description = describeQuery(parsed);

    setState((prev) => ({
      ...prev,
      query: queryString,
      parsed,
      errors,
      description,
    }));
  }, []);

  /**
   * Execute the current query
   */
  const search = useCallback(
    async (queryString?: string): Promise<SplitQueryResult | null> => {
      const queryToExecute = queryString ?? state.query;
      const parsed = parseQuery(queryToExecute);
      const errors = validateQuery(parsed);

      if (errors.length > 0) {
        setState((prev) => ({
          ...prev,
          query: queryToExecute,
          parsed,
          errors,
          description: describeQuery(parsed),
        }));
        return null;
      }

      if (!manifest) {
        setState((prev) => ({
          ...prev,
          query: queryToExecute,
          parsed,
          errors: ['Vault not loaded'],
          description: describeQuery(parsed),
        }));
        return null;
      }

      setState((prev) => ({
        ...prev,
        query: queryToExecute,
        parsed,
        errors: [],
        isExecuting: true,
        description: describeQuery(parsed),
      }));

      try {
        const result = await executeSplitQuery({
          query: parsed,
          manifest,
          graphCache,
        });

        setState((prev) => ({
          ...prev,
          result,
          isExecuting: false,
        }));

        // Save to recent queries (if non-empty and not duplicate)
        if (queryToExecute.trim() && !recentQueries.includes(queryToExecute.trim())) {
          const updated = [queryToExecute.trim(), ...recentQueries].slice(
            0,
            MAX_RECENT_QUERIES
          );
          setRecentQueries(updated);
          saveRecentQueries(updated);
        }

        return result;
      } catch (err) {
        console.error('[QueryEngine] Execution failed:', err);
        setState((prev) => ({
          ...prev,
          errors: [err instanceof Error ? err.message : 'Query execution failed'],
          isExecuting: false,
        }));
        return null;
      }
    },
    [state.query, manifest, graphCache, recentQueries]
  );

  /**
   * Clear the current query and results
   */
  const clear = useCallback(() => {
    setState({
      query: '',
      parsed: null,
      errors: [],
      result: null,
      isExecuting: false,
      description: 'All notes',
    });
  }, []);

  /**
   * Remove a query from recent history
   */
  const removeRecentQuery = useCallback((query: string) => {
    setRecentQueries((prev) => {
      const updated = prev.filter((q) => q !== query);
      saveRecentQueries(updated);
      return updated;
    });
  }, []);

  /**
   * Clear all recent queries
   */
  const clearRecentQueries = useCallback(() => {
    setRecentQueries([]);
    saveRecentQueries([]);
  }, []);

  /**
   * Get query suggestions based on partial input
   */
  const suggestions = useMemo(() => {
    return getSplitQuerySuggestions(state.query, manifest);
  }, [state.query, manifest]);

  /**
   * Get matching recent queries for autocomplete
   */
  const matchingRecentQueries = useMemo(() => {
    if (!state.query.trim()) return recentQueries.slice(0, 5);

    const lower = state.query.toLowerCase();
    return recentQueries
      .filter((q) => q.toLowerCase().includes(lower))
      .slice(0, 5);
  }, [state.query, recentQueries]);

  return {
    // State
    ...state,
    recentQueries,
    suggestions,
    matchingRecentQueries,

    // Actions
    setQuery,
    search,
    clear,
    removeRecentQuery,
    clearRecentQueries,
  };
}

/**
 * Preset queries for common operations
 */
export const PRESET_QUERIES = [
  { label: 'All notes', query: '', description: 'Show all notes in the vault' },
  {
    label: 'With links',
    query: 'has:links',
    description: 'Notes that link to other notes',
  },
];
