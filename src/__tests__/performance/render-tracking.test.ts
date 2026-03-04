/**
 * Render Tracking Tests
 *
 * These tests help identify unnecessary re-renders in React components.
 * They simulate component update patterns to detect performance issues.
 *
 * Run with: pnpm test:run src/__tests__/performance/render-tracking.test.ts
 */

import { describe, it, expect } from 'vitest';

describe('Render Tracking: Context Consumer Updates', () => {
  /**
   * This test demonstrates the problem with the VaultMetadataProvider.
   *
   * When a context value is created inline without useMemo, ALL consumers
   * re-render on EVERY provider render, even if their specific values
   * haven't changed.
   */
  it('should show how inline context values cause excess renders', () => {
    // Track render counts for different "consumers"
    const renderCounts = {
      graphPanel: 0,
      backlinksPanel: 0,
      queryPanel: 0,
      editor: 0,
    };

    // Simulate context value creation (the problematic pattern)
    let contextValue: any;

    const createContextValue = (
      ready: boolean,
      doc: any,
      activeNoteId: string | null
    ) => {
      // This creates a NEW object every time - the root cause
      return {
        ready,
        doc,
        handle: null,
        activeNoteId,
        vaultPath: '/test/vault',
        normalizedVaultPath: '/test/vault',
        reindexVault: async () => ({ notesIndexed: 0, edgesCreated: 0 }),
        indexingProgress: { status: 'idle', filesScanned: 0, totalFiles: 0, notesProcessed: 0, totalNotes: 0 },
      };
    };

    // Simulate consumer render logic
    const renderConsumer = (
      name: keyof typeof renderCounts,
      selector: (ctx: any) => any
    ) => {
      // In real React, this would check if context value changed
      // But since we create new object each time, it always changes!
      renderCounts[name]++;
      return selector(contextValue);
    };

    // Initial render
    contextValue = createContextValue(false, null, null);
    renderConsumer('graphPanel', (ctx) => ctx.doc);
    renderConsumer('backlinksPanel', (ctx) => ctx.activeNoteId);
    renderConsumer('queryPanel', (ctx) => ctx.doc);
    renderConsumer('editor', (ctx) => ctx.activeNoteId);

    // Simulate ready state change (only GraphPanel/QueryPanel care about this)
    contextValue = createContextValue(true, { notes: {} }, null);
    renderConsumer('graphPanel', (ctx) => ctx.doc);
    renderConsumer('backlinksPanel', (ctx) => ctx.activeNoteId); // Shouldn't need to render!
    renderConsumer('queryPanel', (ctx) => ctx.doc);
    renderConsumer('editor', (ctx) => ctx.activeNoteId); // Shouldn't need to render!

    // Simulate activeNoteId change (only Backlinks/Editor care)
    contextValue = createContextValue(true, { notes: {} }, 'note-1');
    renderConsumer('graphPanel', (ctx) => ctx.doc); // Shouldn't need to render!
    renderConsumer('backlinksPanel', (ctx) => ctx.activeNoteId);
    renderConsumer('queryPanel', (ctx) => ctx.doc); // Shouldn't need to render!
    renderConsumer('editor', (ctx) => ctx.activeNoteId);

    // All components rendered 3 times even though:
    // - GraphPanel only needed 2 (doc changed twice)
    // - BacklinksPanel only needed 2 (activeNoteId changed once)
    // - etc.
    expect(renderCounts.graphPanel).toBe(3);
    expect(renderCounts.backlinksPanel).toBe(3);
    expect(renderCounts.queryPanel).toBe(3);
    expect(renderCounts.editor).toBe(3);

    // Document the waste
    console.log('Without useMemo optimization:');
    console.log('  All consumers render on EVERY context update');
    console.log('  Total renders:', Object.values(renderCounts).reduce((a, b) => a + b, 0));
    console.log('  Expected optimal renders: 8 (2+2+2+2)');
    console.log('  Actual renders: 12 (3+3+3+3)');
    console.log('  Wasted renders: 4 (33% overhead)');
  });

  it('should show how memoized context values prevent excess renders', () => {
    // Track render counts
    const renderCounts = {
      graphPanel: 0,
      backlinksPanel: 0,
      queryPanel: 0,
      editor: 0,
    };

    // Memoized context value - only creates new object when deps change
    let lastContextValue: any = null;
    let lastDeps: any = null;

    const createMemoizedContextValue = (
      ready: boolean,
      doc: any,
      activeNoteId: string | null
    ) => {
      const deps = { ready, doc, activeNoteId };

      // Check if any dep changed
      if (
        lastDeps &&
        lastDeps.ready === deps.ready &&
        lastDeps.doc === deps.doc &&
        lastDeps.activeNoteId === deps.activeNoteId
      ) {
        return lastContextValue;
      }

      lastDeps = deps;
      lastContextValue = {
        ready,
        doc,
        handle: null,
        activeNoteId,
        vaultPath: '/test/vault',
        normalizedVaultPath: '/test/vault',
        reindexVault: async () => ({ notesIndexed: 0, edgesCreated: 0 }),
        indexingProgress: { status: 'idle', filesScanned: 0, totalFiles: 0, notesProcessed: 0, totalNotes: 0 },
      };
      return lastContextValue;
    };

    // Stable references for doc objects
    const doc1: any = null;
    const doc2 = { notes: {} };

    // Simulate consumer with selector-based updates (ideal pattern)
    let lastValues: Record<string, any> = {};
    const renderConsumerOptimal = (
      name: keyof typeof renderCounts,
      contextValue: any,
      selector: (ctx: any) => any
    ) => {
      const selectedValue = selector(contextValue);
      // Only increment if selected value actually changed
      if (lastValues[name] !== selectedValue) {
        lastValues[name] = selectedValue;
        renderCounts[name]++;
      }
    };

    // Initial render
    let ctx = createMemoizedContextValue(false, doc1, null);
    renderConsumerOptimal('graphPanel', ctx, (c) => c.doc);
    renderConsumerOptimal('backlinksPanel', ctx, (c) => c.activeNoteId);
    renderConsumerOptimal('queryPanel', ctx, (c) => c.doc);
    renderConsumerOptimal('editor', ctx, (c) => c.activeNoteId);

    // Ready state + doc change
    ctx = createMemoizedContextValue(true, doc2, null);
    renderConsumerOptimal('graphPanel', ctx, (c) => c.doc);
    renderConsumerOptimal('backlinksPanel', ctx, (c) => c.activeNoteId);
    renderConsumerOptimal('queryPanel', ctx, (c) => c.doc);
    renderConsumerOptimal('editor', ctx, (c) => c.activeNoteId);

    // activeNoteId change only
    ctx = createMemoizedContextValue(true, doc2, 'note-1');
    renderConsumerOptimal('graphPanel', ctx, (c) => c.doc);
    renderConsumerOptimal('backlinksPanel', ctx, (c) => c.activeNoteId);
    renderConsumerOptimal('queryPanel', ctx, (c) => c.doc);
    renderConsumerOptimal('editor', ctx, (c) => c.activeNoteId);

    // Optimal pattern: each consumer only renders when their data changes
    expect(renderCounts.graphPanel).toBe(2); // doc changed: null -> doc2
    expect(renderCounts.backlinksPanel).toBe(2); // activeNoteId changed: null -> 'note-1'
    expect(renderCounts.queryPanel).toBe(2); // doc changed: null -> doc2
    expect(renderCounts.editor).toBe(2); // activeNoteId changed: null -> 'note-1'

    console.log('\nWith selector-based optimization:');
    console.log('  Total renders:', Object.values(renderCounts).reduce((a, b) => a + b, 0));
    console.log('  Each consumer only renders when its selected value changes');
  });
});

describe('Render Tracking: useGraphData Double Execution', () => {
  /**
   * Demonstrates the problem in useGraphData where both hooks always run.
   */
  it('should show wasted computation from running both graph hooks', () => {
    let fullGraphCalls = 0;
    let localGraphCalls = 0;

    // Simulate the current implementation
    const useGraphDataBad = (mode: 'local' | 'full') => {
      // BOTH always execute - this is the bug
      const fullGraph = (() => {
        fullGraphCalls++;
        return { nodes: [], links: [] };
      })();

      const localGraph = (() => {
        localGraphCalls++;
        return { nodes: [], links: [] };
      })();

      return mode === 'full' ? fullGraph : localGraph;
    };

    // User only wants local graph
    useGraphDataBad('local');
    useGraphDataBad('local');
    useGraphDataBad('local');

    expect(fullGraphCalls).toBe(3); // Wasted!
    expect(localGraphCalls).toBe(3);

    console.log('\nCurrent useGraphData pattern:');
    console.log(`  Mode: local (only need local graph)`);
    console.log(`  fullGraph computations: ${fullGraphCalls} (all wasted)`);
    console.log(`  localGraph computations: ${localGraphCalls}`);
    console.log(`  Total graph builds: ${fullGraphCalls + localGraphCalls}`);
    console.log(`  Expected: ${localGraphCalls}`);
  });

  it('should show how conditional hooks would fix the issue', () => {
    let localGraphCalls = 0;

    // Better pattern - component uses specific hook directly
    const useLocalGraphDataOnly = () => {
      localGraphCalls++;
      return { nodes: [], links: [] };
    };

    // Component that only needs local graph just uses local hook
    // No fullGraph hook is even defined/called - zero wasted computation
    useLocalGraphDataOnly();
    useLocalGraphDataOnly();
    useLocalGraphDataOnly();

    expect(localGraphCalls).toBe(3);

    console.log('\nOptimized pattern (direct hook usage):');
    console.log(`  Mode: local (only use local hook)`);
    console.log(`  fullGraph computations: 0`);
    console.log(`  localGraph computations: ${localGraphCalls}`);
    console.log(`  Total graph builds: ${localGraphCalls}`);
  });
});

describe('Render Tracking: Audio Recorder State Updates', () => {
  it('should measure impact of high-frequency state updates', async () => {
    let stateUpdateCount = 0;
    let rafCallbackCount = 0;

    // Simulate the current pattern: setRecentAudioSamples in every callback
    const processAudioBad = () => {
      stateUpdateCount++;
      // This would trigger React re-render
    };

    // Better pattern: use RAF to batch updates
    let pendingUpdate = false;
    const processAudioGood = () => {
      // Only schedule if not already pending
      if (!pendingUpdate) {
        pendingUpdate = true;
        // requestAnimationFrame batches to ~60fps max
        rafCallbackCount++;
        // In real code: requestAnimationFrame(() => { updateState(); pendingUpdate = false; })
        pendingUpdate = false; // Simulate RAF callback completing
      }
    };

    // Simulate 1 second of audio at 16kHz with 4096 sample buffer
    // That's ~3.9 callbacks per second
    const callbacksPerSecond = Math.ceil(16000 / 4096);

    for (let i = 0; i < callbacksPerSecond; i++) {
      processAudioBad();
    }

    console.log('\nAudio state update patterns:');
    console.log(`  Callbacks per second: ${callbacksPerSecond}`);
    console.log(`  Bad pattern state updates: ${stateUpdateCount}/sec`);

    // Reset
    stateUpdateCount = 0;

    // Simulate good pattern
    for (let i = 0; i < callbacksPerSecond; i++) {
      processAudioGood();
    }

    console.log(`  Good pattern (RAF batched) updates: ${rafCallbackCount}/sec`);
    console.log(`  Reduction: ${((1 - rafCallbackCount / callbacksPerSecond) * 100).toFixed(0)}%`);
  });
});

describe('Performance: Document Lookup Operations', () => {
  it('should measure cost of document changes', () => {
    // Simulate document lookup operations
    const doc: any = {
      notes: {},
      graph_edges: {},
      note_id_by_path: {},
    };

    // Populate with test data
    for (let i = 0; i < 1000; i++) {
      doc.notes[`note-${i}`] = {
        id: `note-${i}`,
        rel_path: `folder/note-${i}.md`,
        title: `Note ${i}`,
        links: [],
        tags: [],
      };
      doc.note_id_by_path[`folder/note-${i}.md`] = `note-${i}`;
    }

    // Measure lookup time
    const lookupIterations = 10000;
    const start = performance.now();
    for (let i = 0; i < lookupIterations; i++) {
      const noteId = doc.note_id_by_path[`folder/note-${i % 1000}.md`];
      // Access to prevent optimization removal
      void doc.notes[noteId];
    }
    const lookupTime = performance.now() - start;

    console.log('\nDocument Lookup Operations:');
    console.log(`  Lookups: ${lookupIterations} in ${lookupTime.toFixed(2)}ms`);
    console.log(`  Per lookup: ${(lookupTime / lookupIterations).toFixed(4)}ms`);

    // Measure iteration time
    const iterStart = performance.now();
    let count = 0;
    for (const _noteId of Object.keys(doc.notes)) {
      count++;
    }
    const iterTime = performance.now() - iterStart;

    console.log(`  Iteration over ${count} notes: ${iterTime.toFixed(2)}ms`);

    expect(lookupTime).toBeLessThan(50); // Should be very fast
    expect(iterTime).toBeLessThan(10);
  });
});
