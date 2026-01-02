/**
 * Query Executor for Mutter
 *
 * Executes parsed queries against the CRDT vault metadata
 */

import type { ParsedQuery, FilterTerm, TextTerm, FilterOperator } from './parser';
import type { VaultMetadataDoc, VaultNote } from '@/crdt/vaultMetadataDoc';
import { getBacklinks } from '@/crdt/vaultMetadataDoc';

export interface QueryResult {
  notes: VaultNote[];
  totalCount: number;
  executionTimeMs: number;
  query: ParsedQuery;
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
    case 'type': {
      // Match supertag by definition name
      const definitions = Object.values(doc.supertag_definitions);
      const matchingDef = definitions.find(
        (d) => d.name.toLowerCase() === filter.value.toLowerCase()
      );
      if (!matchingDef) return false;
      return (
        note.supertags?.some((st) => st.definitionId === matchingDef.id) ?? false
      );
    }

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
        case 'supertag':
        case 'supertags':
          return (note.supertags?.length ?? 0) > 0;
        case 'links':
          return note.links.length > 0;
        case 'tags':
          return note.tags.length > 0;
        default:
          return false;
      }
    }

    default: {
      // Check if it's a supertag field filter (e.g., status:active)
      // Format: fieldName:value or type.fieldName:value
      const parts = filter.key.split('.');
      if (parts.length === 2) {
        // type.field format
        const [typeName, fieldName] = parts;
        const def = Object.values(doc.supertag_definitions).find(
          (d) => d.name.toLowerCase() === typeName.toLowerCase()
        );
        if (!def) return false;
        const instance = note.supertags?.find(
          (st) => st.definitionId === def.id
        );
        if (!instance) return false;
        return matchFieldValue(
          instance.values[fieldName],
          filter.value,
          filter.operator
        );
      }

      // Simple field name - check all supertags on the note
      for (const instance of note.supertags ?? []) {
        const fieldValue = instance.values[filter.key];
        if (fieldValue !== undefined) {
          if (matchFieldValue(fieldValue, filter.value, filter.operator)) {
            return true;
          }
        }
      }
      return false;
    }
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
 * Match a field value against a filter value
 */
function matchFieldValue(
  fieldValue: unknown,
  filterValue: string,
  operator: FilterOperator
): boolean {
  if (fieldValue === undefined || fieldValue === null) return false;

  // String comparison
  if (typeof fieldValue === 'string') {
    if (operator === '=') {
      return fieldValue.toLowerCase() === filterValue.toLowerCase();
    }
    return fieldValue.toLowerCase().includes(filterValue.toLowerCase());
  }

  // Number comparison
  if (typeof fieldValue === 'number') {
    const filterNum = parseFloat(filterValue);
    if (isNaN(filterNum)) return false;

    switch (operator) {
      case '>':
        return fieldValue > filterNum;
      case '>=':
        return fieldValue >= filterNum;
      case '<':
        return fieldValue < filterNum;
      case '<=':
        return fieldValue <= filterNum;
      case '=':
        return fieldValue === filterNum;
      default:
        return false;
    }
  }

  // Boolean comparison
  if (typeof fieldValue === 'boolean') {
    return fieldValue === (filterValue.toLowerCase() === 'true');
  }

  // Array comparison (multi-select)
  if (Array.isArray(fieldValue)) {
    return fieldValue.some(
      (v) => String(v).toLowerCase() === filterValue.toLowerCase()
    );
  }

  return false;
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
  doc: VaultMetadataDoc | null
): QueryResult {
  const startTime = performance.now();

  // Handle null doc
  if (!doc) {
    return {
      notes: [],
      totalCount: 0,
      executionTimeMs: 0,
      query,
    };
  }

  let notes = Object.values(doc.notes);

  // If no terms, return all notes
  if (query.terms.length === 0) {
    notes.sort((a, b) => b.updated_at - a.updated_at);
    return {
      notes,
      totalCount: notes.length,
      executionTimeMs: performance.now() - startTime,
      query,
    };
  }

  // Apply each term as a filter (AND logic)
  for (const term of query.terms) {
    if (term.type === 'filter') {
      notes = notes.filter((note) => matchesFilter(note, term, doc));
    } else {
      notes = notes.filter((note) => matchesText(note, term));
    }
  }

  // Sort by updated_at descending (most recent first)
  notes.sort((a, b) => b.updated_at - a.updated_at);

  const executionTimeMs = performance.now() - startTime;

  return {
    notes,
    totalCount: notes.length,
    executionTimeMs,
    query,
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
    return ['type:', 'tag:', 'linked:', 'created:>', 'has:'];
  }

  // If ends with "type:", suggest supertag names
  if (partialQuery.trim().endsWith('type:')) {
    const defs = Object.values(doc.supertag_definitions);
    return defs.map((d) => `type:${d.name}`);
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
    return ['has:blocks', 'has:supertags', 'has:links', 'has:tags'];
  }

  return suggestions;
}
