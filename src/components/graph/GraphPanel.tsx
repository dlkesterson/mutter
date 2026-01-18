/**
 * GraphPanel Component
 *
 * Right sidebar panel showing local graph (current note + N degrees of connections).
 * Provides depth control and expand button to fullscreen dialog.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { GraphView } from './GraphView';
import { useLocalGraphData } from '@/hooks/useGraphData';
import { useVaultMetadata } from '@/context/VaultMetadataContext';
import type { GraphNode } from './types';

interface GraphPanelProps {
  /** Called when a node is clicked for navigation */
  onNavigate: (relPath: string) => void;
  /** Called when expand button is clicked */
  onExpand?: () => void;
}

export function GraphPanel({ onNavigate, onExpand }: GraphPanelProps) {
  const [depth, setDepth] = useState(2);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 320, height: 300 });

  // Get vault metadata context for stats
  const { graphCache, normalizedVaultPath, noteCount } = useVaultMetadata();

  // Get local graph data
  const { graphData, loading, nodeCount, edgeCount } = useLocalGraphData({ depth });

  // Get vault-wide stats from manifest and graph cache (O(1))
  const { totalNotes, totalEdges } = useMemo(() => {
    return {
      totalNotes: noteCount,
      totalEdges: graphCache ? Object.keys(graphCache.edges).length : 0,
    };
  }, [noteCount, graphCache]);

  // Update dimensions on resize (debounced to prevent lag during continuous resize)
  useEffect(() => {
    if (!containerRef.current) return;

    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };

    // Initial measurement
    updateDimensions();

    const handleResize = () => {
      // Clear any pending update
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      // Wait for resize to finish before updating
      resizeTimeout = setTimeout(updateDimensions, 100);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
    };
  }, []);

  // Handle node click for navigation
  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      if (node.relPath) {
        onNavigate(node.relPath);
      }
    },
    [onNavigate]
  );

  // Depth controls
  const decreaseDepth = useCallback(() => {
    setDepth((d) => Math.max(1, d - 1));
  }, []);

  const increaseDepth = useCallback(() => {
    setDepth((d) => Math.min(5, d + 1));
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Depth:</span>
          <button
            onClick={decreaseDepth}
            disabled={depth <= 1}
            className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
            title="Decrease depth"
          >
            <Minus size={14} />
          </button>
          <span className="text-xs font-mono w-4 text-center">{depth}</span>
          <button
            onClick={increaseDepth}
            disabled={depth >= 5}
            className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
            title="Increase depth"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          {onExpand && (
            <button
              onClick={onExpand}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              title="Expand to fullscreen"
            >
              <Maximize2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Graph container */}
      <div ref={containerRef} className="flex-1 min-h-0 relative">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <span className="text-xs">Loading graph...</span>
          </div>
        ) : (
          <GraphView
            data={graphData}
            width={dimensions.width}
            height={dimensions.height}
            activeNodeId={graphData.nodes.find((n) => n.isCurrent)?.id ?? null}
            callbacks={{
              onNodeClick: handleNodeClick,
            }}
            showAllLabels={nodeCount <= 15}
          />
        )}
      </div>

      {/* Footer stats */}
      <div className="px-3 py-1.5 border-t border-border text-xs text-muted-foreground space-y-1">
        <div>Local: {nodeCount} notes · {edgeCount} links</div>
        <div>Vault: {totalNotes} notes · {totalEdges} links</div>
        {normalizedVaultPath && (
          <div className="truncate text-[10px] opacity-60" title={normalizedVaultPath}>
            {normalizedVaultPath}
          </div>
        )}
      </div>
    </div>
  );
}
