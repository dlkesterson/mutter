/**
 * Query Executor for Mutter
 *
 * Executes parsed queries against the CRDT vault metadata
 */

import type { ParsedQuery, FilterTerm, TextTerm, FilterOperator } from './parser';
import type { VaultMetadataDoc, VaultNote } from '@/crdt/vaultMetadataDoc';
import { getBacklinks } from '@/crdt/vaultMetadataDoc';

export interface QueryTiming {
  parseMs: number;
  indexLookupMs: number;
  filterMs: number;
  sortMs: number;
  totalMs: number;
}

export interface QueryResult {
  notes: VaultNote[];
  totalCount: number;
  executionTimeMs: number;
  query: ParsedQuery;
  timing?: QueryTiming;
}

/**
 * Check if a note matches a filter term
 */
function matchesFilter(
  note: VaultNote,
  filter: FilterTerm,
  doc: VaultMetadataDoc
): boolean {
  switch (filter.key) {
    case 'tag': {
      // Match markdown tag (case-insensitive)
      return note.tags.some(
        (t) => t.toLowerCase() === filter.value.toLowerCase()
      );
    }

    case 'linked': {
      // Note links TO the specified target (searches in links array)
      return note.links.some((l) =>
        l.toLowerCase().includes(filter.value.toLowerCase())
      );
    }

    case 'from': {
      // Note is linked FROM the specified source
      const edges = getBacklinks({ doc, noteId: note.id });
      const sourceNote = Object.values(doc.notes).find((n) =>
        n.title.toLowerCase().includes(filter.value.toLowerCase())
      );
      if (!sourceNote) return false;
      return edges.some((e) => e.sourceNoteId === sourceNote.id);
    }

    case 'created': {
      const noteDate = new Date(note.created_at);
      const filterDate = new Date(filter.value);
      return compareDates(noteDate, filterDate, filter.operator);
    }

    case 'updated': {
      const noteDate = new Date(note.updated_at);
      const filterDate = new Date(filter.value);
      return compareDates(noteDate, filterDate, filter.operator);
    }

    case 'has': {
      switch (filter.value.toLowerCase()) {
        case 'blocks':
          return Object.keys(note.blocks).length > 0;
        case 'links':
          return note.links.length > 0;
        case 'tags':
          return note.tags.length > 0;
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
 * Check if a note matches a text term (full-text search in title)
 */
function matchesText(note: VaultNote, text: TextTerm): boolean {
  const searchValue = text.value.toLowerCase();
  const noteTitle = note.title.toLowerCase();

  if (text.exact) {
    // Exact phrase match in title
    return noteTitle.includes(searchValue);
  }

  // Word match - all words must appear
  const words = searchValue.split(/\s+/);
  return words.every((word) => noteTitle.includes(word));
}

/**
 * Execute a parsed query against the vault metadata
 */
export function executeQuery(
  query: ParsedQuery,
  doc: VaultMetadataDoc | null,
  options?: { limit?: number; offset?: number }
): QueryResult {
  const timing: QueryTiming = {
    parseMs: 0,
    indexLookupMs: 0,
    filterMs: 0,
    sortMs: 0,
    totalMs: 0,
  };
  const startTime = performance.now();

  // Handle null doc
  if (!doc) {
    return {
      notes: [],
      totalCount: 0,
      executionTimeMs: 0,
      query,
      timing,
    };
  }

  let notes: VaultNote[];
  const indexStart = performance.now();
  notes = Object.values(doc.notes);
  timing.indexLookupMs = performance.now() - indexStart;

  // If no terms, return all notes
  if (query.terms.length === 0) {
    const sortStart = performance.now();
    notes.sort((a, b) => b.updated_at - a.updated_at);
    timing.sortMs = performance.now() - sortStart;
    timing.totalMs = performance.now() - startTime;

    return {
      notes,
      totalCount: notes.length,
      executionTimeMs: timing.totalMs,
      query,
      timing,
    };
  }

  // Apply filters
  const filterStart = performance.now();
  for (const term of query.terms) {
    if (term.type === 'filter') {
      notes = notes.filter((note) => matchesFilter(note, term, doc));
    } else {
      notes = notes.filter((note) => matchesText(note, term));
    }
  }
  timing.filterMs = performance.now() - filterStart;

  // Sort by updated_at descending (most recent first)
  const sortStart = performance.now();
  notes.sort((a, b) => b.updated_at - a.updated_at);
  timing.sortMs = performance.now() - sortStart;

  // Pagination support
  const totalCount = notes.length;
  const { limit, offset = 0 } = options || {};

  if (offset > 0 || limit) {
    notes = notes.slice(offset, limit ? offset + limit : undefined);
  }

  timing.totalMs = performance.now() - startTime;

  return {
    notes,
    totalCount,
    executionTimeMs: timing.totalMs,
    query,
    timing,
  };
}

/**
 * Get suggested completions for a partial query
 */
export function getQuerySuggestions(
  partialQuery: string,
  doc: VaultMetadataDoc | null
): string[] {
  const suggestions: string[] = [];

  if (!doc) return suggestions;

  // Suggest filter keys if nothing typed
  if (!partialQuery.trim()) {
    return ['tag:', 'linked:', 'created:>', 'has:'];
  }

  // If ends with "tag:", suggest tags from notes
  if (partialQuery.trim().endsWith('tag:')) {
    const allTags = new Set<string>();
    for (const note of Object.values(doc.notes)) {
      for (const tag of note.tags) {
        allTags.add(tag);
      }
    }
    return Array.from(allTags)
      .slice(0, 10)
      .map((t) => `tag:${t}`);
  }

  // If ends with "has:", suggest properties
  if (partialQuery.trim().endsWith('has:')) {
    return ['has:blocks', 'has:links', 'has:tags'];
  }

  return suggestions;
}
