/**
 * Query Engine Integration Tests
 *
 * Tests the split format query engine with ManifestDoc and GraphCacheDoc.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock manifest with note paths
const mockManifest = {
  vault_id: 'test-vault',
  id_to_path: {
    'note-1': 'project-alpha.md',
    'note-2': 'meeting-notes.md',
    'note-3': 'personal/journal.md',
  },
  last_sync_at: Date.now(),
};

const mockGraphCache = {
  edges: {
    'edge-1': {
      id: 'edge-1',
      sourceNoteId: 'note-2',
      targetNoteId: 'note-1',
      linkType: 'wikilink',
    },
  },
  backlink_index: {
    'note-1': ['note-2'],
  },
  forward_link_index: {
    'note-2': ['note-1'],
  },
};

vi.mock('@/context/VaultMetadataContext', () => ({
  useVaultMetadata: () => ({
    manifest: mockManifest,
    graphCache: mockGraphCache,
    noteManager: null,
  }),
}));

// Import after mock setup
import { useQueryEngine } from '@/hooks/useQueryEngine';

describe('Query Engine Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Title Search (Manifest)', () => {
    // Titles derived from file paths: project-alpha.md → "project-alpha"
    it('finds notes by title text search', async () => {
      const { result } = renderHook(() => useQueryEngine());

      await act(async () => {
        await result.current.search('alpha');
      });

      expect(result.current.result?.notes).toHaveLength(1);
      expect(result.current.result?.notes[0].title).toBe('project-alpha');
    });

    it('finds notes matching partial title', async () => {
      const { result } = renderHook(() => useQueryEngine());

      await act(async () => {
        await result.current.search('meeting');
      });

      expect(result.current.result?.notes).toHaveLength(1);
      expect(result.current.result?.notes[0].title).toBe('meeting-notes');
    });

    it('returns all notes for empty query', async () => {
      const { result } = renderHook(() => useQueryEngine());

      await act(async () => {
        await result.current.search('');
      });

      expect(result.current.result?.notes).toHaveLength(3);
    });
  });

  describe('Link Queries (GraphCache)', () => {
    it('finds notes linking to target', async () => {
      const { result } = renderHook(() => useQueryEngine());

      await act(async () => {
        await result.current.search('linked:alpha');
      });

      // note-2 links to note-1 (project-alpha)
      expect(result.current.result?.notes).toHaveLength(1);
      expect(result.current.result?.notes[0].title).toBe('meeting-notes');
    });

    it('finds notes with any links using has:links', async () => {
      const { result } = renderHook(() => useQueryEngine());

      await act(async () => {
        await result.current.search('has:links');
      });

      expect(result.current.result?.notes).toHaveLength(1);
      expect(result.current.result?.notes[0].title).toBe('meeting-notes');
    });
  });

  describe('State Management', () => {
    it('tracks query in state', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.setQuery('tag:project');
      });

      expect(result.current.query).toBe('tag:project');
    });

    it('generates human-readable description', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.setQuery('tag:project');
      });

      expect(result.current.description).toContain('project');
      expect(result.current.description).toContain('tagged');
    });

    it('clears state correctly', async () => {
      const { result } = renderHook(() => useQueryEngine());

      await act(async () => {
        await result.current.search('alpha');
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
    it('saves queries to history', async () => {
      const { result } = renderHook(() => useQueryEngine());

      await act(async () => {
        await result.current.search('alpha');
      });

      expect(result.current.recentQueries).toContain('alpha');
    });

    it('does not duplicate queries', async () => {
      const { result } = renderHook(() => useQueryEngine());

      await act(async () => {
        await result.current.search('alpha');
      });
      await act(async () => {
        await result.current.search('alpha');
      });

      const count = result.current.recentQueries.filter((q) => q === 'alpha').length;
      expect(count).toBe(1);
    });

    it('removes queries from history', async () => {
      const { result } = renderHook(() => useQueryEngine());

      await act(async () => {
        await result.current.search('alpha');
      });

      expect(result.current.recentQueries).toContain('alpha');

      act(() => {
        result.current.removeRecentQuery('alpha');
      });

      expect(result.current.recentQueries).not.toContain('alpha');
    });

    it('clears all recent queries', async () => {
      const { result } = renderHook(() => useQueryEngine());

      await act(async () => {
        await result.current.search('alpha');
      });
      await act(async () => {
        await result.current.search('meeting');
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
      expect(result.current.suggestions).toContain('tag:');
      expect(result.current.suggestions).toContain('linked:');
    });

    it('suggests has: properties', () => {
      const { result } = renderHook(() => useQueryEngine());

      act(() => {
        result.current.setQuery('has:');
      });

      expect(result.current.suggestions).toContain('has:blocks');
      expect(result.current.suggestions).toContain('has:links');
      expect(result.current.suggestions).toContain('has:tags');
    });
  });

  describe('Validation', () => {
    it('validates date format', async () => {
      const { result } = renderHook(() => useQueryEngine());

      await act(async () => {
        await result.current.search('created:>invalid');
      });

      expect(result.current.errors).toHaveLength(1);
      expect(result.current.errors[0]).toContain('Invalid date format');
    });

    it('allows valid queries without errors', async () => {
      const { result } = renderHook(() => useQueryEngine());

      await act(async () => {
        await result.current.search('alpha');
      });

      expect(result.current.errors).toHaveLength(0);
    });
  });

  describe('Performance', () => {
    it('tracks execution time', async () => {
      const { result } = renderHook(() => useQueryEngine());

      await act(async () => {
        await result.current.search('alpha');
      });

      expect(result.current.result?.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.current.result?.executionTimeMs).toBeLessThan(100); // Should be fast
    });
  });
});
