/**
 * Query Engine Integration Tests
 *
 * Tests that the query engine integrates correctly with:
 * - useQueryEngine hook
 * - VaultMetadata context
 * - Supertag definitions
 * - Backlinks
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock the vault metadata context
const mockDoc = {
  vault_id: 'test-vault',
  notes: {
    'note-1': {
      id: 'note-1',
      title: 'Project Alpha',
      rel_path: 'project-alpha.md',
      tags: ['work', 'important'],
      links: ['Note B'],
      blocks: {},
      supertags: [{ definitionId: 'def-project', values: { status: 'active', priority: 5 } }],
      created_at: Date.now() - 86400000 * 7,
      updated_at: Date.now() - 86400000,
    },
    'note-2': {
      id: 'note-2',
      title: 'Meeting Notes',
      rel_path: 'meeting-notes.md',
      tags: ['work', 'meeting'],
      links: ['Project Alpha'],
      blocks: { 'block-1': { id: 'block-1', content: 'Action items' } },
      supertags: [{ definitionId: 'def-meeting', values: { date: '2024-01-15' } }],
      created_at: Date.now() - 86400000 * 3,
      updated_at: Date.now(),
    },
    'note-3': {
      id: 'note-3',
      title: 'Personal Journal',
      rel_path: 'personal/journal.md',
      tags: ['personal'],
      links: [],
      blocks: {},
      supertags: [],
      created_at: Date.now() - 86400000 * 30,
      updated_at: Date.now() - 86400000 * 10,
    },
  },
  supertag_definitions: {
    'def-project': {
      id: 'def-project',
      name: 'project',
      fields: [
        { id: 'f1', name: 'status', type: 'text' },
        { id: 'f2', name: 'priority', type: 'number' },
      ],
      color: '#00A0B4',
      created_at: Date.now(),
    },
    'def-meeting': {
      id: 'def-meeting',
      name: 'meeting',
      fields: [{ id: 'f3', name: 'date', type: 'date' }],
      color: '#FF5500',
      created_at: Date.now(),
    },
  },
  backlink_index: {
    'note-1': [{ sourceNoteId: 'note-2', sourceBlockId: null }],
  },
  last_sync_at: Date.now(),
};

// Mock the context
vi.mock('@/context/VaultMetadataContext', () => ({
  useVaultMetadata: () => ({ doc: mockDoc }),
}));

// Import after mock setup
import { useQueryEngine } from '@/hooks/useQueryEngine';

describe('Query Engine Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Query + Supertags', () => {
    it('finds notes by supertag type', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        // Pass query directly to search() to avoid state timing issues
        result.current.search('type:project');
      });

      expect(result.current.result?.notes).toHaveLength(1);
      expect(result.current.result?.notes[0].title).toBe('Project Alpha');
    });

    it('filters by supertag field values', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.search('status:active');
      });

      expect(result.current.result?.notes).toHaveLength(1);
      expect(result.current.result?.notes[0].supertags?.[0].values.status).toBe('active');
    });

    it('combines type and field filters', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.search('type:project priority:>3');
      });

      expect(result.current.result?.notes).toHaveLength(1);
      expect(result.current.result?.notes[0].title).toBe('Project Alpha');
    });

    it('returns notes with any supertag using has:supertags', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.search('has:supertags');
      });

      expect(result.current.result?.notes).toHaveLength(2);
      const titles = result.current.result?.notes.map((n) => n.title);
      expect(titles).toContain('Project Alpha');
      expect(titles).toContain('Meeting Notes');
    });
  });

  describe('Query + Tags', () => {
    it('finds notes by markdown tag', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.search('tag:work');
      });

      expect(result.current.result?.notes).toHaveLength(2);
    });

    it('combines supertag and markdown tag filters', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.search('type:project tag:work');
      });

      expect(result.current.result?.notes).toHaveLength(1);
      expect(result.current.result?.notes[0].title).toBe('Project Alpha');
    });
  });

  describe('Query + Links', () => {
    it('finds notes linking to target', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.search('linked:Alpha');
      });

      expect(result.current.result?.notes).toHaveLength(1);
      expect(result.current.result?.notes[0].title).toBe('Meeting Notes');
    });

    it('finds notes with any links', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.search('has:links');
      });

      expect(result.current.result?.notes).toHaveLength(2);
    });
  });

  describe('Query + Blocks', () => {
    it('finds notes with blocks', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.search('has:blocks');
      });

      expect(result.current.result?.notes).toHaveLength(1);
      expect(result.current.result?.notes[0].title).toBe('Meeting Notes');
    });
  });

  describe('Query State Management', () => {
    it('tracks query in state', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.setQuery('type:project');
      });

      expect(result.current.query).toBe('type:project');
    });

    it('generates human-readable description', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.setQuery('type:project');
      });

      expect(result.current.description).toContain('project');
      expect(result.current.description).toContain('supertag');
    });

    it('clears state correctly', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.search('type:project');
      });

      expect(result.current.result?.notes).toHaveLength(1);

      act(() => {
        result.current.clear();
      });

      expect(result.current.query).toBe('');
      expect(result.current.result).toBeNull();
    });
  });

  describe('Recent Queries', () => {
    it('saves queries to history', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.search('type:project');
      });

      expect(result.current.recentQueries).toContain('type:project');
    });

    it('does not duplicate queries', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.search('type:project');
        result.current.search('type:project');
      });

      const count = result.current.recentQueries.filter((q) => q === 'type:project').length;
      expect(count).toBe(1);
    });

    it('removes queries from history', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.search('type:project');
      });

      expect(result.current.recentQueries).toContain('type:project');

      act(() => {
        result.current.removeRecentQuery('type:project');
      });

      expect(result.current.recentQueries).not.toContain('type:project');
    });

    it('clears all recent queries', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.search('type:project');
        result.current.search('tag:work');
      });

      expect(result.current.recentQueries.length).toBeGreaterThan(0);

      act(() => {
        result.current.clearRecentQueries();
      });

      expect(result.current.recentQueries).toHaveLength(0);
    });
  });

  describe('Query Suggestions', () => {
    it('suggests filter keys for empty input', () => {
      const { result } = renderHook(() => useQueryEngine());

      // Initially empty query should have filter suggestions
      expect(result.current.suggestions).toContain('type:');
    });

    it('suggests supertag names after type:', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.setQuery('type:');
      });

      expect(result.current.suggestions).toContain('type:project');
      expect(result.current.suggestions).toContain('type:meeting');
    });

    it('suggests has: properties', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.setQuery('has:');
      });

      expect(result.current.suggestions).toContain('has:blocks');
      expect(result.current.suggestions).toContain('has:supertags');
    });
  });

  describe('Validation', () => {
    it('validates date format', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.search('created:>invalid');
      });

      expect(result.current.errors).toHaveLength(1);
      expect(result.current.errors[0]).toContain('Invalid date format');
    });

    it('allows valid queries without errors', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.search('type:project');
      });

      expect(result.current.errors).toHaveLength(0);
    });
  });

  describe('Performance', () => {
    it('tracks execution time', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.search('type:project');
      });

      expect(result.current.result?.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.current.result?.executionTimeMs).toBeLessThan(100); // Should be fast
    });
  });
});
