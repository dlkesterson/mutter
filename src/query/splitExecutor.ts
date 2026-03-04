/**
 * Split Format Query Executor
 *
 * Executes parsed queries against the vault index shims:
 * - manifest: For path/title matching (instant)
 * - graphCache: For link queries (instant)
 *
 * Tags are not currently supported.
 * Date filters (created:/updated:) are not supported without per-note metadata.
 */

import type { ParsedQuery, FilterTerm, TextTerm } from './parser';
import type { GraphEdge } from '@/types/vault';
import { titleFromPath } from '@/vault/vaultIndex';

/**
 * Lightweight note info for query results
 */
export interface QueryNoteInfo {
  id: string;
  relPath: string;
  title: string;
}

export interface SplitQueryResult {
  notes: QueryNoteInfo[];
  totalCount: number;
  executionTimeMs: number;
  query: ParsedQuery;
  /** Whether any NoteDocs were loaded */
  requiredNoteLoading: boolean;
}

/**
 * Apply text term filter (title matching)
 */
function matchesText(title: string, text: TextTerm): boolean {
  const searchValue = text.value.toLowerCase();
  const lowerTitle = title.toLowerCase();

  if (text.exact) {
    return lowerTitle.includes(searchValue);
  }

  // Word match - all words must appear
  const words = searchValue.split(/\s+/);
  return words.every((word) => lowerTitle.includes(word));
}

/**
 * Apply graph cache filter
 */
function matchesGraphFilter(
  noteId: string,
  filter: FilterTerm,
  graphCache: { edges: Record<string, GraphEdge>; backlink_index: Record<string, string[]> } | null,
  manifest: { id_to_path: Record<string, string>; path_index: Record<string, string> }
): boolean | null {
  if (!graphCache) return null;

  switch (filter.key) {
    case 'linked': {
      // Note links TO the specified target
      const edges = Object.values(graphCache.edges).filter(
        (e) => e.sourceNoteId === noteId
      );
      const targetNotes = Object.entries(manifest.id_to_path).filter(
        ([, path]) => {
          const title = titleFromPath(path);
          return (
            title.toLowerCase().includes(filter.value.toLowerCase()) ||
            path.toLowerCase().includes(filter.value.toLowerCase())
          );
        }
      );
      const targetIds = new Set(targetNotes.map(([id]) => id));
      return edges.some((e) => targetIds.has(e.targetNoteId));
    }

    case 'from': {
      // Note is linked FROM the specified source
      const backlinks = graphCache.backlink_index[noteId] ?? [];
      const sourceNotes = Object.entries(manifest.id_to_path).filter(
        ([, path]) => {
          const title = titleFromPath(path);
          return (
            title.toLowerCase().includes(filter.value.toLowerCase()) ||
            path.toLowerCase().includes(filter.value.toLowerCase())
          );
        }
      );
      const sourceIds = new Set(sourceNotes.map(([id]) => id));
      return backlinks.some((sourceId) => sourceIds.has(sourceId));
    }

    case 'has': {
      if (filter.value.toLowerCase() === 'links') {
        return Object.values(graphCache.edges).some(
          (e) => e.sourceNoteId === noteId
        );
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Execute a parsed query against the vault index shims
 */
export async function executeSplitQuery(params: {
  query: ParsedQuery;
  manifest: { id_to_path: Record<string, string>; path_index: Record<string, string> };
  graphCache: { edges: Record<string, GraphEdge>; backlink_index: Record<string, string[]> } | null;
}): Promise<SplitQueryResult> {
  const startTime = performance.now();
  const { query, manifest, graphCache } = params;

  // Start with all note IDs from manifest
  let candidateIds = Object.keys(manifest.id_to_path);

  // If no terms, return all notes
  if (query.terms.length === 0) {
    const notes = candidateIds.map((id) => {
      const relPath = manifest.id_to_path[id];
      return {
        id,
        relPath,
        title: titleFromPath(relPath),
      };
    });

    return {
      notes,
      totalCount: notes.length,
      executionTimeMs: performance.now() - startTime,
      query,
      requiredNoteLoading: false,
    };
  }

  // Apply text filters (title matching)
  for (const term of query.terms) {
    if (term.type === 'text') {
      candidateIds = candidateIds.filter((id) => {
        const relPath = manifest.id_to_path[id];
        const title = titleFromPath(relPath);
        return matchesText(title, term);
      });
    }
  }

  // Apply graph cache filters
  const graphFilters = query.terms.filter(
    (t) => t.type === 'filter' && ['linked', 'from'].includes((t as FilterTerm).key)
  ) as FilterTerm[];

  const hasLinksFilter = query.terms.find(
    (t) =>
      t.type === 'filter' &&
      (t as FilterTerm).key === 'has' &&
      (t as FilterTerm).value.toLowerCase() === 'links'
  );

  if (graphFilters.length > 0 || hasLinksFilter) {
    for (const filter of [...graphFilters, ...(hasLinksFilter ? [hasLinksFilter as FilterTerm] : [])]) {
      candidateIds = candidateIds.filter((id) => {
        const result = matchesGraphFilter(id, filter, graphCache, manifest);
        return result !== null ? result : true;
      });
    }
  }

  // Skip unsupported filters (tag:, created:, updated:, has:tags, has:blocks)
  // These require per-note metadata that no longer exists

  // Build result
  const notes = candidateIds.map((id) => {
    const relPath = manifest.id_to_path[id];
    return {
      id,
      relPath,
      title: titleFromPath(relPath),
    };
  });

  return {
    notes,
    totalCount: notes.length,
    executionTimeMs: performance.now() - startTime,
    query,
    requiredNoteLoading: false,
  };
}

/**
 * Get suggestions for query completion
 */
export function getSplitQuerySuggestions(
  partialQuery: string,
  manifest: { id_to_path: Record<string, string>; path_index: Record<string, string> } | null
): string[] {
  const suggestions: string[] = [];

  if (!manifest) return suggestions;

  if (!partialQuery.trim()) {
    return ['linked:', 'from:', 'has:links'];
  }

  if (partialQuery.trim().endsWith('has:')) {
    return ['has:links'];
  }

  return suggestions;
}
