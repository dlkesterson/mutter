/**
 * GraphView Component
 *
 * Core graph visualization using react-force-graph-2d.
 * Renders nodes (notes) and links (connections) with interactive features.
 */

import { useRef, useCallback, useEffect, useState, memo } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import type { GraphData, GraphNode, GraphCallbacks } from './types';
import {
  graphColors,
  forceConfig,
  visualConfig,
  getNodeColor,
  getNodeRadius,
  getLinkColor,
  getLinkWidth,
  performanceConfig,
} from './graphConfig';

interface GraphViewProps {
  /** Graph data to render */
  data: GraphData;
  /** Container width */
  width: number;
  /** Container height */
  height: number;
  /** Callbacks for interactions */
  callbacks?: GraphCallbacks;
  /** Current/active note ID for highlighting */
  activeNodeId?: string | null;
  /** Show labels on all nodes (vs hover only) */
  showAllLabels?: boolean;
  /** Enable zoom controls */
  enableZoom?: boolean;
  /** Enable pan controls */
  enablePan?: boolean;
}

function GraphViewInner({
  data,
  width,
  height,
  callbacks,
  activeNodeId,
  showAllLabels = false,
  enableZoom = true,
  enablePan = true,
}: GraphViewProps) {
  const graphRef = useRef<ForceGraphMethods<GraphNode>>(undefined);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  // Determine whether to show all labels based on node count
  const shouldShowAllLabels =
    showAllLabels || data.nodes.length <= performanceConfig.showAllLabelsThreshold;

  // Handle node click
  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      callbacks?.onNodeClick?.(node);
    },
    [callbacks]
  );

  // Handle node hover
  const handleNodeHover = useCallback(
    (node: GraphNode | null) => {
      setHoveredNode(node);
      callbacks?.onNodeHover?.(node);
    },
    [callbacks]
  );

  // Handle background click
  const handleBackgroundClick = useCallback(() => {
    callbacks?.onBackgroundClick?.();
  }, [callbacks]);

  // Custom node rendering
  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const radius = getNodeRadius(node);
      const color = getNodeColor(node);

      // Draw node circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
      ctx.fillStyle = color;
      ctx.fill();

      // Draw border for current node
      if (node.isCurrent) {
        ctx.strokeStyle = graphColors.labelTextActive;
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      // Draw label
      const showLabel = shouldShowAllLabels || hoveredNode?.id === node.id || node.isCurrent;

      if (showLabel) {
        const fontSize = visualConfig.labelFontSize / globalScale;
        ctx.font = `${fontSize}px IBM Plex Sans, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = node.isCurrent ? graphColors.labelTextActive : graphColors.labelText;

        // Text background for readability
        const label = node.name;
        const textWidth = ctx.measureText(label).width;
        const padding = 2 / globalScale;
        const labelY = y + radius + visualConfig.labelOffset / globalScale;

        ctx.fillStyle = `${graphColors.background}CC`;
        ctx.fillRect(
          x - textWidth / 2 - padding,
          labelY - padding,
          textWidth + padding * 2,
          fontSize + padding * 2
        );

        ctx.fillStyle = node.isCurrent ? graphColors.labelTextActive : graphColors.labelText;
        ctx.fillText(label, x, labelY);
      }
    },
    [shouldShowAllLabels, hoveredNode]
  );

  // Custom link rendering
  const linkColor = useCallback(
    (link: { source: string | GraphNode; target: string | GraphNode }) => {
      return getLinkColor(link, activeNodeId ?? null);
    },
    [activeNodeId]
  );

  const linkWidth = useCallback(
    (link: { source: string | GraphNode; target: string | GraphNode }) => {
      return getLinkWidth(link, activeNodeId ?? null);
    },
    [activeNodeId]
  );

  // Center on active node when it changes
  useEffect(() => {
    if (!graphRef.current || !activeNodeId) return;

    const node = data.nodes.find((n) => n.id === activeNodeId);
    if (node && node.x !== undefined && node.y !== undefined) {
      graphRef.current.centerAt(node.x, node.y, 500);
    }
  }, [activeNodeId, data.nodes]);

  // Initial zoom to fit
  useEffect(() => {
    if (!graphRef.current || data.nodes.length === 0) return;

    // Small delay to let force simulation settle
    const timer = setTimeout(() => {
      graphRef.current?.zoomToFit(400, 50);
    }, 100);

    return () => clearTimeout(timer);
  }, [data.nodes.length]);

  if (data.nodes.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground"
        style={{ width, height, backgroundColor: graphColors.background }}
      >
        <div className="text-center">
          <p className="text-sm">No connected notes</p>
          <p className="text-xs mt-1 opacity-60">
            Create links between notes to see the graph
          </p>
        </div>
      </div>
    );
  }

  return (
    <ForceGraph2D
      ref={graphRef}
      width={width}
      height={height}
      graphData={data}
      backgroundColor={graphColors.background}
      // Node configuration
      nodeId="id"
      nodeLabel=""
      nodeCanvasObject={nodeCanvasObject}
      nodePointerAreaPaint={(node, color, ctx) => {
        const radius = getNodeRadius(node as GraphNode) + 2;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI, false);
        ctx.fill();
      }}
      // Link configuration
      linkColor={linkColor}
      linkWidth={linkWidth}
      linkCurvature={visualConfig.linkCurvature}
      linkDirectionalParticles={0}
      // Force configuration
      d3AlphaDecay={forceConfig.alphaDecay}
      d3VelocityDecay={forceConfig.velocityDecay}
      warmupTicks={forceConfig.warmupTicks}
      cooldownTicks={forceConfig.cooldownTicks}
      // Interactions
      onNodeClick={handleNodeClick}
      onNodeHover={handleNodeHover}
      onBackgroundClick={handleBackgroundClick}
      enableZoomInteraction={enableZoom}
      enablePanInteraction={enablePan}
      enableNodeDrag={true}
      // Zoom
      minZoom={visualConfig.zoom.min}
      maxZoom={visualConfig.zoom.max}
    />
  );
}

/**
 * Memoized GraphView that skips re-renders when dimensions change minimally.
 * This prevents expensive re-renders during rapid resize events.
 */
export const GraphView = memo(GraphViewInner, (prev, next) => {
  // Skip re-render if dimensions changed by less than 10px
  const dimThreshold = 10;
  const dimUnchanged =
    Math.abs(prev.width - next.width) < dimThreshold &&
    Math.abs(prev.height - next.height) < dimThreshold;

  // Always re-render if data, activeNodeId, or other props changed
  if (prev.data !== next.data) return false;
  if (prev.activeNodeId !== next.activeNodeId) return false;
  if (prev.showAllLabels !== next.showAllLabels) return false;
  if (prev.callbacks !== next.callbacks) return false;
  if (prev.enableZoom !== next.enableZoom) return false;
  if (prev.enablePan !== next.enablePan) return false;

  // If dimensions are close enough, skip re-render
  return dimUnchanged;
});
