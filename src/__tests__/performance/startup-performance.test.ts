/**
 * Startup Performance Tests
 *
 * These tests measure and validate the performance of critical startup operations.
 * Run with: pnpm test:run src/__tests__/performance/startup-performance.test.ts
 */

import { describe, it, expect } from 'vitest';

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  // Context value creation should be instant (ideally <1ms)
  contextValueCreation: 5,
  // Graph building for 100 nodes should be fast
  graphBuild100Nodes: 50,
  // Graph building for 1000 nodes should be reasonable
  graphBuild1000Nodes: 500,
  // Memo computation for unchanged deps should be instant
  memoRecomputation: 1,
};

describe('Performance: Context Value Creation', () => {
  it('should create context value object quickly', () => {
    // Simulate what VaultMetadataContext.Provider does
    const createContextValue = () => ({
      ready: true,
      doc: { notes: {}, graph_edges: {}, note_id_by_path: {} },
      handle: null,
      activeNoteId: 'test-id',
      vaultPath: '/test/path',
      normalizedVaultPath: '/test/path',
      reindexVault: async () => ({ notesIndexed: 0, edgesCreated: 0 }),
      indexingProgress: { status: 'idle', filesScanned: 0, totalFiles: 0, notesProcessed: 0, totalNotes: 0 },
    });

    const iterations = 1000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      createContextValue();
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / iterations;

    console.log(`Context value creation: ${perCall.toFixed(3)}ms per call`);
    expect(perCall).toBeLessThan(THRESHOLDS.contextValueCreation);
  });

  it('should detect when useMemo would prevent recomputation', () => {
    // This tests the pattern that SHOULD be used but isn't
    let computeCount = 0;

    const computeExpensiveValue = (deps: { a: number; b: string }) => {
      computeCount++;
      return { ...deps, computed: true };
    };

    // Without memo - creates new object each time
    const deps = { a: 1, b: 'test' };
    computeExpensiveValue(deps);
    computeExpensiveValue(deps); // Same deps but computes again

    expect(computeCount).toBe(2); // This is the problem - no memoization
  });
});

describe('Performance: Graph Building', () => {
  // Helper to generate test data
  const generateNotes = (count: number) => {
    const notes: Record<string, { id: string; rel_path: string; title: string }> = {};
    for (let i = 0; i < count; i++) {
      const id = `note-${i}`;
      notes[id] = {
        id,
        rel_path: `folder-${Math.floor(i / 10)}/note-${i}.md`,
        title: `Note ${i}`,
      };
    }
    return notes;
  };

  const generateEdges = (noteCount: number, avgConnections: number = 3) => {
    const edges: Record<string, { id: string; sourceNoteId: string; targetNoteId: string; type: string }> = {};
    let edgeId = 0;

    for (let i = 0; i < noteCount; i++) {
      const connections = Math.min(avgConnections, noteCount - 1);
      for (let j = 0; j < connections; j++) {
        const targetIdx = (i + j + 1) % noteCount;
        edges[`edge-${edgeId}`] = {
          id: `edge-${edgeId}`,
          sourceNoteId: `note-${i}`,
          targetNoteId: `note-${targetIdx}`,
          type: 'wiki-link',
        };
        edgeId++;
      }
    }
    return edges;
  };

  it('should build full graph for 100 notes quickly', () => {
    const notes = generateNotes(100);
    const edges = generateEdges(100, 3);

    // Simulate buildFullGraph logic
    const buildFullGraph = () => {
      const connectionCounts = new Map<string, number>();
      const connectedNotes = new Set<string>();

      for (const edge of Object.values(edges)) {
        connectionCounts.set(edge.sourceNoteId, (connectionCounts.get(edge.sourceNoteId) || 0) + 1);
        connectionCounts.set(edge.targetNoteId, (connectionCounts.get(edge.targetNoteId) || 0) + 1);
        connectedNotes.add(edge.sourceNoteId);
        connectedNotes.add(edge.targetNoteId);
      }

      const nodes = Object.values(notes).map((note) => ({
        id: note.id,
        name: note.title,
        relPath: note.rel_path,
        connections: connectionCounts.get(note.id) || 0,
        isCurrent: false,
        isOrphan: !connectedNotes.has(note.id),
      }));

      const nodeIds = new Set(nodes.map((n) => n.id));
      const links = Object.values(edges)
        .filter((e) => nodeIds.has(e.sourceNoteId) && nodeIds.has(e.targetNoteId))
        .map((e) => ({
          id: e.id,
          source: e.sourceNoteId,
          target: e.targetNoteId,
          type: e.type,
        }));

      return { nodes, links };
    };

    const iterations = 100;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      buildFullGraph();
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / iterations;

    console.log(`Full graph build (100 notes): ${perCall.toFixed(2)}ms per call`);
    expect(perCall).toBeLessThan(THRESHOLDS.graphBuild100Nodes);
  });

  it('should build full graph for 1000 notes within threshold', () => {
    const notes = generateNotes(1000);
    const edges = generateEdges(1000, 5);

    const buildFullGraph = () => {
      const connectionCounts = new Map<string, number>();
      const connectedNotes = new Set<string>();

      for (const edge of Object.values(edges)) {
        connectionCounts.set(edge.sourceNoteId, (connectionCounts.get(edge.sourceNoteId) || 0) + 1);
        connectionCounts.set(edge.targetNoteId, (connectionCounts.get(edge.targetNoteId) || 0) + 1);
        connectedNotes.add(edge.sourceNoteId);
        connectedNotes.add(edge.targetNoteId);
      }

      const nodes = Object.values(notes).map((note) => ({
        id: note.id,
        name: note.title,
        relPath: note.rel_path,
        connections: connectionCounts.get(note.id) || 0,
        isCurrent: false,
        isOrphan: !connectedNotes.has(note.id),
      }));

      const nodeIds = new Set(nodes.map((n) => n.id));
      const links = Object.values(edges)
        .filter((e) => nodeIds.has(e.sourceNoteId) && nodeIds.has(e.targetNoteId))
        .map((e) => ({
          id: e.id,
          source: e.sourceNoteId,
          target: e.targetNoteId,
          type: e.type,
        }));

      return { nodes, links };
    };

    const iterations = 10;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      buildFullGraph();
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / iterations;

    console.log(`Full graph build (1000 notes): ${perCall.toFixed(2)}ms per call`);
    expect(perCall).toBeLessThan(THRESHOLDS.graphBuild1000Nodes);
  });

  it('should build local graph (BFS) efficiently', () => {
    // Generate test data (notes not needed for BFS benchmark, only edges)
    generateNotes(1000); // Called to match real-world scenario
    const edges = generateEdges(1000, 5);
    const depth = 2;
    const currentNoteId = 'note-500';

    const buildLocalGraph = () => {
      // Build adjacency list
      const adjacency = new Map<string, Set<string>>();
      for (const edge of Object.values(edges)) {
        if (!adjacency.has(edge.sourceNoteId)) adjacency.set(edge.sourceNoteId, new Set());
        if (!adjacency.has(edge.targetNoteId)) adjacency.set(edge.targetNoteId, new Set());
        adjacency.get(edge.sourceNoteId)!.add(edge.targetNoteId);
        adjacency.get(edge.targetNoteId)!.add(edge.sourceNoteId);
      }

      // BFS
      const visited = new Set<string>();
      const queue: Array<{ nodeId: string; d: number }> = [{ nodeId: currentNoteId, d: 0 }];
      visited.add(currentNoteId);

      while (queue.length > 0) {
        const { nodeId, d } = queue.shift()!;
        if (d < depth) {
          const neighbors = adjacency.get(nodeId);
          if (neighbors) {
            for (const neighborId of neighbors) {
              if (!visited.has(neighborId)) {
                visited.add(neighborId);
                queue.push({ nodeId: neighborId, d: d + 1 });
              }
            }
          }
        }
      }

      return { nodeCount: visited.size };
    };

    const iterations = 100;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      buildLocalGraph();
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / iterations;

    console.log(`Local graph BFS (1000 notes, depth 2): ${perCall.toFixed(2)}ms per call`);
    expect(perCall).toBeLessThan(50); // Should be very fast
  });
});

describe('Performance: Re-render Prevention', () => {
  it('should detect unnecessary re-renders from object identity changes', () => {
    // This simulates the pattern in useGraphData where mergedOptions
    // is created fresh each render, potentially invalidating useMemo

    const DEFAULT_OPTIONS = { depth: 2, showOrphans: true };

    // Bad pattern - new object each call
    const getMergedOptionsBad = (options: Partial<typeof DEFAULT_OPTIONS>) => {
      return { ...DEFAULT_OPTIONS, ...options };
    };

    // Simulate multiple "renders" with same input
    const options = { depth: 3 };
    const result1 = getMergedOptionsBad(options);
    const result2 = getMergedOptionsBad(options);

    // These are NOT referentially equal even though values are the same
    expect(result1).not.toBe(result2);
    expect(result1).toEqual(result2); // But values ARE equal

    // This is why useMemo dependencies fail - object identity changes
  });

  it('should show how to properly memoize options', () => {
    // Good pattern - stable reference when values unchanged
    let lastInput: any = null;
    let lastResult: any = null;

    const getMergedOptionsGood = (options: any) => {
      // Simple shallow comparison
      if (lastInput && Object.keys(options).every((k) => lastInput[k] === options[k])) {
        return lastResult;
      }
      lastInput = { ...options };
      lastResult = { depth: 2, showOrphans: true, ...options };
      return lastResult;
    };

    const options = { depth: 3 };
    const result1 = getMergedOptionsGood(options);
    const result2 = getMergedOptionsGood(options);

    // Now they ARE referentially equal
    expect(result1).toBe(result2);
  });
});

describe('Performance: Audio State Updates', () => {
  it('should measure cost of frequent state updates', async () => {
    // Simulate the pattern in useAudioRecorder.ts:238
    // setRecentAudioSamples([...recentSamplesRef.current]);

    const samples: number[] = [];
    let stateUpdateCount = 0;

    // Simulate audio processing callback
    const processAudio = () => {
      // Add some samples
      const newSamples = new Array(4096).fill(0).map(() => Math.random());
      samples.push(...newSamples);

      // Keep last ~1 second at 16kHz
      while (samples.length > 16000) {
        samples.shift();
      }

      // This is expensive - creates new array and triggers React update
      const stateCopy = [...samples];
      stateUpdateCount++;

      return stateCopy;
    };

    // Simulate 1 second of audio processing (~3.9 callbacks)
    const callbacks = 4;
    const start = performance.now();
    for (let i = 0; i < callbacks; i++) {
      processAudio();
    }
    const elapsed = performance.now() - start;

    console.log(`Audio state updates: ${stateUpdateCount} updates in ${elapsed.toFixed(2)}ms`);
    console.log(`Average: ${(elapsed / callbacks).toFixed(2)}ms per update`);

    // Array copying itself is fast, but React re-renders are the problem
    expect(elapsed).toBeLessThan(50); // Pure JS should be very fast
  });
});
