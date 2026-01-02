/**
 * Query Executor Unit Tests
 *
 * Tests query execution against mock vault data
 */

import { describe, it, expect } from 'vitest';
import { executeQuery } from '@/query/executor';
import { parseQuery } from '@/query/parser';
import type { VaultMetadataDoc, VaultNote, SupertagDefinition, VAULT_METADATA_SCHEMA_VERSION } from '@/crdt/vaultMetadataDoc';

// Mock data factory
function createMockNote(overrides: Partial<VaultNote> = {}): VaultNote {
  return {
    id: `note-${Math.random().toString(36).slice(2)}`,
    title: 'Test Note',
    rel_path: 'test-note.md',
    tags: [],
    links: [],
    blocks: {},
    block_order: [],
    supertags: [],
    created_at: Date.now() - 86400000, // 1 day ago
    updated_at: Date.now(),
    last_opened_at: null,
    ...overrides,
  };
}

function createMockDoc(notes: VaultNote[]): VaultMetadataDoc {
  const notesMap: Record<string, VaultNote> = {};
  const noteIdByPath: Record<string, string> = {};
  for (const note of notes) {
    notesMap[note.id] = note;
    noteIdByPath[note.rel_path] = note.id;
  }

  return {
    schema_version: 3 as typeof VAULT_METADATA_SCHEMA_VERSION,
    meta: {
      created_at: Date.now(),
      vault_id: 'test-vault',
    },
    notes: notesMap,
    note_id_by_path: noteIdByPath,
    supertag_definitions: {
      'def-project': {
        id: 'def-project',
        name: 'project',
        fields: [
          { name: 'status', type: 'text' },
          { name: 'priority', type: 'number' },
        ],
        created_at: Date.now(),
        updated_at: Date.now(),
      } as SupertagDefinition,
      'def-task': {
        id: 'def-task',
        name: 'task',
        fields: [
          { name: 'done', type: 'checkbox' },
        ],
        created_at: Date.now(),
        updated_at: Date.now(),
      } as SupertagDefinition,
    },
    graph_edges: {},
    backlink_index: {},
  };
}

describe('Query Executor', () => {
  describe('executeQuery', () => {
    it('returns all notes for empty query', () => {
      const notes = [
        createMockNote({ title: 'Note A' }),
        createMockNote({ title: 'Note B' }),
      ];
      const doc = createMockDoc(notes);
      const query = parseQuery('');

      const result = executeQuery(query, doc);

      expect(result.notes).toHaveLength(2);
      expect(result.totalCount).toBe(2);
    });

    it('returns empty result for null doc', () => {
      const query = parseQuery('type:project');
      const result = executeQuery(query, null);

      expect(result.notes).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });

    it('measures execution time', () => {
      const notes = [createMockNote()];
      const doc = createMockDoc(notes);
      const query = parseQuery('');

      const result = executeQuery(query, doc);

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('sorts results by updated_at descending', () => {
      const notes = [
        createMockNote({ title: 'Old', updated_at: 1000 }),
        createMockNote({ title: 'New', updated_at: 3000 }),
        createMockNote({ title: 'Middle', updated_at: 2000 }),
      ];
      const doc = createMockDoc(notes);
      const query = parseQuery('');

      const result = executeQuery(query, doc);

      expect(result.notes[0].title).toBe('New');
      expect(result.notes[1].title).toBe('Middle');
      expect(result.notes[2].title).toBe('Old');
    });
  });

  describe('type: filter', () => {
    it('filters by supertag type', () => {
      const notes = [
        createMockNote({
          title: 'Project A',
          supertags: [{ definitionId: 'def-project', values: {} }],
        }),
        createMockNote({
          title: 'Task B',
          supertags: [{ definitionId: 'def-task', values: {} }],
        }),
        createMockNote({ title: 'No Tags' }),
      ];
      const doc = createMockDoc(notes);
      const query = parseQuery('type:project');

      const result = executeQuery(query, doc);

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].title).toBe('Project A');
    });

    it('is case-insensitive', () => {
      const notes = [
        createMockNote({
          title: 'Project',
          supertags: [{ definitionId: 'def-project', values: {} }],
        }),
      ];
      const doc = createMockDoc(notes);

      const result1 = executeQuery(parseQuery('type:PROJECT'), doc);
      const result2 = executeQuery(parseQuery('type:Project'), doc);

      expect(result1.notes).toHaveLength(1);
      expect(result2.notes).toHaveLength(1);
    });

    it('returns empty for non-existent type', () => {
      const notes = [createMockNote()];
      const doc = createMockDoc(notes);
      const query = parseQuery('type:nonexistent');

      const result = executeQuery(query, doc);

      expect(result.notes).toHaveLength(0);
    });
  });

  describe('tag: filter', () => {
    it('filters by markdown tag', () => {
      const notes = [
        createMockNote({ title: 'Work Note', tags: ['work', 'important'] }),
        createMockNote({ title: 'Personal', tags: ['personal'] }),
        createMockNote({ title: 'No Tags', tags: [] }),
      ];
      const doc = createMockDoc(notes);
      const query = parseQuery('tag:work');

      const result = executeQuery(query, doc);

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].title).toBe('Work Note');
    });

    it('is case-insensitive', () => {
      const notes = [
        createMockNote({ title: 'Tagged', tags: ['Work'] }),
      ];
      const doc = createMockDoc(notes);

      const result = executeQuery(parseQuery('tag:work'), doc);

      expect(result.notes).toHaveLength(1);
    });
  });

  describe('linked: filter', () => {
    it('finds notes linking to target', () => {
      const notes = [
        createMockNote({ title: 'Note A', links: ['Meeting Notes', 'Other'] }),
        createMockNote({ title: 'Note B', links: ['Meeting Notes'] }),
        createMockNote({ title: 'Note C', links: ['Different'] }),
      ];
      const doc = createMockDoc(notes);
      const query = parseQuery('linked:Meeting');

      const result = executeQuery(query, doc);

      expect(result.notes).toHaveLength(2);
      const titles = result.notes.map((n) => n.title);
      expect(titles).toContain('Note A');
      expect(titles).toContain('Note B');
    });

    it('partial matches work', () => {
      const notes = [
        createMockNote({ title: 'Note', links: ['Meeting Notes 2024'] }),
      ];
      const doc = createMockDoc(notes);
      const query = parseQuery('linked:Meeting');

      const result = executeQuery(query, doc);

      expect(result.notes).toHaveLength(1);
    });
  });

  describe('has: filter', () => {
    it('filters notes with blocks', () => {
      const notes = [
        createMockNote({ title: 'With Blocks', blocks: { 'block-1': { id: 'block-1', type: 'paragraph', text: 'test' } } }),
        createMockNote({ title: 'No Blocks', blocks: {} }),
      ];
      const doc = createMockDoc(notes);
      const query = parseQuery('has:blocks');

      const result = executeQuery(query, doc);

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].title).toBe('With Blocks');
    });

    it('filters notes with supertags', () => {
      const notes = [
        createMockNote({
          title: 'Tagged',
          supertags: [{ definitionId: 'def-project', values: {} }],
        }),
        createMockNote({ title: 'Untagged' }),
      ];
      const doc = createMockDoc(notes);
      const query = parseQuery('has:supertags');

      const result = executeQuery(query, doc);

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].title).toBe('Tagged');
    });

    it('filters notes with links', () => {
      const notes = [
        createMockNote({ title: 'Has Links', links: ['Other Note'] }),
        createMockNote({ title: 'No Links', links: [] }),
      ];
      const doc = createMockDoc(notes);
      const query = parseQuery('has:links');

      const result = executeQuery(query, doc);

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].title).toBe('Has Links');
    });

    it('filters notes with tags', () => {
      const notes = [
        createMockNote({ title: 'Has Tags', tags: ['work'] }),
        createMockNote({ title: 'No Tags', tags: [] }),
      ];
      const doc = createMockDoc(notes);
      const query = parseQuery('has:tags');

      const result = executeQuery(query, doc);

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].title).toBe('Has Tags');
    });
  });

  describe('date filters', () => {
    it('filters by created date with > operator', () => {
      const jan1 = new Date('2024-01-01').getTime();
      const jan15 = new Date('2024-01-15').getTime();
      const feb1 = new Date('2024-02-01').getTime();

      const notes = [
        createMockNote({ title: 'Early', created_at: jan1 }),
        createMockNote({ title: 'Middle', created_at: jan15 }),
        createMockNote({ title: 'Late', created_at: feb1 }),
      ];
      const doc = createMockDoc(notes);
      const query = parseQuery('created:>2024-01-10');

      const result = executeQuery(query, doc);

      expect(result.notes).toHaveLength(2);
      const titles = result.notes.map((n) => n.title);
      expect(titles).toContain('Middle');
      expect(titles).toContain('Late');
    });

    it('filters by updated date with < operator', () => {
      const jan1 = new Date('2024-01-01').getTime();
      const feb1 = new Date('2024-02-01').getTime();

      const notes = [
        createMockNote({ title: 'Old', updated_at: jan1 }),
        createMockNote({ title: 'New', updated_at: feb1 }),
      ];
      const doc = createMockDoc(notes);
      const query = parseQuery('updated:<2024-01-15');

      const result = executeQuery(query, doc);

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].title).toBe('Old');
    });
  });

  describe('text search', () => {
    it('matches title with text term', () => {
      const notes = [
        createMockNote({ title: 'Meeting Notes 2024' }),
        createMockNote({ title: 'Project Plan' }),
        createMockNote({ title: 'Weekly Meeting Agenda' }),
      ];
      const doc = createMockDoc(notes);
      const query = parseQuery('meeting');

      const result = executeQuery(query, doc);

      expect(result.notes).toHaveLength(2);
    });

    it('requires all words for multi-word search', () => {
      const notes = [
        createMockNote({ title: 'Meeting Notes' }),
        createMockNote({ title: 'Project Meeting' }),
        createMockNote({ title: 'Notes Only' }),
      ];
      const doc = createMockDoc(notes);
      const query = parseQuery('meeting notes');

      const result = executeQuery(query, doc);

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].title).toBe('Meeting Notes');
    });

    it('exact phrase match requires contiguous words', () => {
      const notes = [
        createMockNote({ title: 'Meeting Notes Review' }),
        createMockNote({ title: 'Meeting with Notes' }),
      ];
      const doc = createMockDoc(notes);
      const query = parseQuery('"Meeting Notes"');

      const result = executeQuery(query, doc);

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].title).toBe('Meeting Notes Review');
    });
  });

  describe('supertag field filters', () => {
    it('filters by simple field name', () => {
      const notes = [
        createMockNote({
          title: 'Active Project',
          supertags: [{ definitionId: 'def-project', values: { status: 'active' } }],
        }),
        createMockNote({
          title: 'Paused Project',
          supertags: [{ definitionId: 'def-project', values: { status: 'paused' } }],
        }),
      ];
      const doc = createMockDoc(notes);
      const query = parseQuery('status:active');

      const result = executeQuery(query, doc);

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].title).toBe('Active Project');
    });

    it('filters by scoped field (type.field)', () => {
      const notes = [
        createMockNote({
          title: 'Project',
          supertags: [{ definitionId: 'def-project', values: { status: 'active' } }],
        }),
        createMockNote({
          title: 'Task',
          supertags: [{ definitionId: 'def-task', values: { status: 'active' } }],
        }),
      ];
      const doc = createMockDoc(notes);
      const query = parseQuery('project.status:active');

      const result = executeQuery(query, doc);

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].title).toBe('Project');
    });

    it('handles numeric field comparisons', () => {
      const notes = [
        createMockNote({
          title: 'High Priority',
          supertags: [{ definitionId: 'def-project', values: { priority: 5 } }],
        }),
        createMockNote({
          title: 'Low Priority',
          supertags: [{ definitionId: 'def-project', values: { priority: 1 } }],
        }),
      ];
      const doc = createMockDoc(notes);
      const query = parseQuery('priority:>3');

      const result = executeQuery(query, doc);

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].title).toBe('High Priority');
    });

    it('handles boolean field values', () => {
      const notes = [
        createMockNote({
          title: 'Done Task',
          supertags: [{ definitionId: 'def-task', values: { done: true } }],
        }),
        createMockNote({
          title: 'Pending Task',
          supertags: [{ definitionId: 'def-task', values: { done: false } }],
        }),
      ];
      const doc = createMockDoc(notes);
      const query = parseQuery('done:true');

      const result = executeQuery(query, doc);

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].title).toBe('Done Task');
    });
  });

  describe('combined filters', () => {
    it('applies AND logic for multiple filters', () => {
      const notes = [
        createMockNote({
          title: 'Active Project',
          supertags: [{ definitionId: 'def-project', values: { status: 'active' } }],
          tags: ['work'],
        }),
        createMockNote({
          title: 'Active Personal',
          supertags: [{ definitionId: 'def-project', values: { status: 'active' } }],
          tags: ['personal'],
        }),
        createMockNote({
          title: 'Paused Project',
          supertags: [{ definitionId: 'def-project', values: { status: 'paused' } }],
          tags: ['work'],
        }),
      ];
      const doc = createMockDoc(notes);
      const query = parseQuery('type:project status:active tag:work');

      const result = executeQuery(query, doc);

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].title).toBe('Active Project');
    });
  });
});
