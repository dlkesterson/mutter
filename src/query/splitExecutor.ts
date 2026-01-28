/**
 * Split Format Query Executor
 *
 * Executes parsed queries against the split document format:
 * - ManifestDoc: For path/title matching (instant)
 * - GraphCacheDoc: For link queries (instant)
 * - NoteDocs: For tag/date filters (requires loading)
 *
 * Strategy: Progressive filtering to minimize document loads
 * 1. Apply manifest filters (title text search)
 * 2. Apply graph cache filters (linked:, from:, has:links)
 * 3. Only load NoteDocs for filters that require them
 */

import type { ParsedQuery, FilterTerm, TextTerm, FilterOperator } from './parser';
import type { ManifestDoc } from '@/crdt/manifestDoc';
import type { GraphCacheDoc } from '@/crdt/graphCacheDoc';
import type { NoteDocManager } from '@/crdt/noteDocManager';
import type { NoteDoc } from '@/crdt/noteDoc';

/**
 * Lightweight note info for query results
 */
export interface QueryNoteInfo {
  id: string;
  relPath: string;
  title: string;
  /** Only populated if NoteDoc was loaded */
  updatedAt?: number;
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
 * Helper to derive title from file path
 */
function titleFromPath(relPath: string): string {
  const basename = relPath.split('/').pop() || relPath;
  return basename.replace(/\.md$/i, '') || 'Untitled';
}

/**
 * Check if a filter requires loading NoteDoc
 */
function filterRequiresNoteDoc(filter: FilterTerm): boolean {
  // Graph cache handles link-related filters
  const graphOnlyKeys = ['linked', 'from'];
  if (graphOnlyKeys.includes(filter.key)) return false;

  // has:links is handled by graph cache
  if (filter.key === 'has' && filter.value.toLowerCase() === 'links') return false;

  // Everything else (tag, dates, has:blocks/tags) requires NoteDoc
  return true;
}

/**
 * Check if query requires loading any NoteDocs
 */
function queryRequiresNoteDoc(query: ParsedQuery): boolean {
  for (const term of query.terms) {
    if (term.type === 'filter' && filterRequiresNoteDoc(term)) {
      return true;
    }
  }
  return false;
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
  graphCache: GraphCacheDoc | null,
  manifest: ManifestDoc
): boolean | null {
  if (!graphCache) return null; // Can't apply, skip

  switch (filter.key) {
    case 'linked': {
      // Note links TO the specified target
      const edges = Object.values(graphCache.edges).filter(
        (e) => e.sourceNoteId === noteId
      );
      // Find target note by title/path
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
      // Find source note by title/path
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
        // Has outgoing links
        return Object.values(graphCache.edges).some(
          (e) => e.sourceNoteId === noteId
        );
      }
      return null; // Other has: values need NoteDoc
    }

    default:
      return null; // Not a graph filter
  }
}

/**
 * Apply NoteDoc filter
 */
function matchesNoteDocFilter(noteDoc: NoteDoc, filter: FilterTerm): boolean {
  switch (filter.key) {
    case 'tag': {
      return noteDoc.tags.some(
        (t) => t.toLowerCase() === filter.value.toLowerCase()
      );
    }

    case 'created': {
      const noteDate = new Date(noteDoc.created_at);
      const filterDate = new Date(filter.value);
      return compareDates(noteDate, filterDate, filter.operator);
    }

    case 'updated': {
      const noteDate = new Date(noteDoc.updated_at);
      const filterDate = new Date(filter.value);
      return compareDates(noteDate, filterDate, filter.operator);
    }

    case 'has': {
      switch (filter.value.toLowerCase()) {
        case 'blocks':
          return Object.keys(noteDoc.blocks).length > 0;
        case 'tags':
          return noteDoc.tags.length > 0;
        default:
          return false;
      }
    }

    default:
      return false;
  }
}

/**
 * Compare two dates based on operator
 */
function compareDates(
  noteDate: Date,
  filterDate: Date,
  operator: FilterOperator
): boolean {
  const noteTime = noteDate.getTime();
  const filterTime = filterDate.getTime();

  switch (operator) {
    case '>':
      return noteTime > filterTime;
    case '>=':
      return noteTime >= filterTime;
    case '<':
      return noteTime < filterTime;
    case '<=':
      return noteTime <= filterTime;
    case '=':
      return noteDate.toDateString() === filterDate.toDateString();
    default:
      return false;
  }
}

/**
 * Execute a parsed query against the split document format
 */
export async function executeSplitQuery(params: {
  query: ParsedQuery;
  manifest: ManifestDoc;
  graphCache: GraphCacheDoc | null;
  noteManager: NoteDocManager | null;
}): Promise<SplitQueryResult> {
  const startTime = performance.now();
  const { query, manifest, graphCache, noteManager } = params;

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

  // Apply text filters (title matching) - no loading needed
  for (const term of query.terms) {
    if (term.type === 'text') {
      candidateIds = candidateIds.filter((id) => {
        const relPath = manifest.id_to_path[id];
        const title = titleFromPath(relPath);
        return matchesText(title, term);
      });
    }
  }

  // Apply graph cache filters - no loading needed
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
        return result !== null ? result : true; // If can't apply, don't filter
      });
    }
  }

  // Check if we need to load NoteDocs
  const needsNoteDoc = queryRequiresNoteDoc(query);
  let requiredNoteLoading = false;

  if (needsNoteDoc && noteManager) {
    requiredNoteLoading = true;

    // Load NoteDocs and apply remaining filters
    const noteDocFilters = query.terms.filter(
      (t) => t.type === 'filter' && filterRequiresNoteDoc(t as FilterTerm)
    ) as FilterTerm[];

    const filteredIds: string[] = [];

    for (const id of candidateIds) {
      try {
        const noteHandle = await noteManager.loadNote(id);
        const noteDoc = noteHandle.doc();
        if (!noteDoc) continue;

        let matches = true;
        for (const filter of noteDocFilters) {
          if (!matchesNoteDocFilter(noteDoc, filter)) {
            matches = false;
            break;
          }
        }

        if (matches) {
          filteredIds.push(id);
        }
      } catch (err) {
        // Note doesn't exist or failed to load, skip it
        console.warn(`[SplitExecutor] Failed to load note ${id}:`, err);
      }
    }

    candidateIds = filteredIds;
  }

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
    requiredNoteLoading,
  };
}

/**
 * Get suggestions for query completion
 */
export function getSplitQuerySuggestions(
  partialQuery: string,
  manifest: ManifestDoc | null
): string[] {
  const suggestions: string[] = [];

  if (!manifest) return suggestions;

  if (!partialQuery.trim()) {
    return ['tag:', 'linked:', 'created:>', 'has:'];
  }

  if (partialQuery.trim().endsWith('has:')) {
    return ['has:blocks', 'has:links', 'has:tags'];
  }

  return suggestions;
}
