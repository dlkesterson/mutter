/**
 * useQueryEngine Hook
 *
 * Provides query execution against the vault metadata with:
 * - DSL parsing and execution
 * - Recent query history
 * - Query suggestions/autocomplete
 */

import { useState, useCallback, useMemo } from 'react';
import { useVaultMetadata } from '@/context/VaultMetadataContext';
import { parseQuery, validateQuery, describeQuery } from '@/query/parser';
import { executeQuery, getQuerySuggestions } from '@/query/executor';
import type { QueryResult } from '@/query/executor';
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
  result: QueryResult | null;
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
  const { doc } = useVaultMetadata();

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
    (queryString?: string) => {
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

      setState((prev) => ({ ...prev, isExecuting: true }));

      const result = executeQuery(parsed, doc);

      setState((prev) => ({
        ...prev,
        query: queryToExecute,
        parsed,
        errors: [],
        result,
        isExecuting: false,
        description: describeQuery(parsed),
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
    },
    [state.query, doc, recentQueries]
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
    return getQuerySuggestions(state.query, doc);
  }, [state.query, doc]);

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
    label: 'With supertags',
    query: 'has:supertags',
    description: 'Notes that have any supertag',
  },
  {
    label: 'With links',
    query: 'has:links',
    description: 'Notes that link to other notes',
  },
  {
    label: 'With blocks',
    query: 'has:blocks',
    description: 'Notes that have block references',
  },
  {
    label: 'Recent (7 days)',
    query: `updated:>=${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`,
    description: 'Notes updated in the last week',
  },
];
