/**
 * Graph View Configuration
 *
 * Force simulation settings and visual styling following the design system.
 * Colors use the design system palette (#121212 background, #00A0B4 Pacific Blue accent).
 */

import type { GraphNode } from './types';

// ============================================================================
// Color Configuration (following DESIGN_SYSTEM.md)
// ============================================================================

export const graphColors = {
  /** Background color (dark theme) */
  background: '#121212',

  /** Default node fill */
  nodeFill: '#3A3A3A',

  /** Current/active note highlight (Pacific Blue) */
  nodeActive: '#00A0B4',

  /** Orphan node (dimmed) */
  nodeOrphan: '#2A2A2A',

  /** Node border */
  nodeBorder: '#4A4A4A',

  /** Link color */
  link: 'rgba(42, 42, 42, 0.4)',

  /** Link color when connected to active node */
  linkActive: 'rgba(0, 160, 180, 0.5)',

  /** Label text color */
  labelText: '#E0E0E0',

  /** Label text for current note */
  labelTextActive: '#FFFFFF',
} as const;

// ============================================================================
// Force Simulation Configuration
// ============================================================================

export const forceConfig = {
  /** Link distance (pixels) */
  linkDistance: 60,

  /** Charge strength (negative = repulsion) */
  chargeStrength: -120,

  /** Center force strength */
  centerStrength: 0.05,

  /** Collision radius multiplier (relative to node size) */
  collisionRadiusMultiplier: 1.5,

  /** Alpha decay (simulation cooling rate) */
  alphaDecay: 0.0228,

  /** Velocity decay (friction) */
  velocityDecay: 0.4,

  /** Warmup ticks (run simulation before rendering) */
  warmupTicks: 50,

  /** Cooldown ticks (run after interaction) */
  cooldownTicks: 100,
} as const;

// ============================================================================
// Node Sizing
// ============================================================================

export const nodeConfig = {
  /** Base node radius (pixels) */
  baseRadius: 4,

  /** Maximum node radius */
  maxRadius: 16,

  /** Minimum node radius */
  minRadius: 3,

  /** Size scaling based on connections (logarithmic) */
  sizeScale: (connections: number): number => {
    if (connections === 0) return nodeConfig.minRadius;
    const scaled = nodeConfig.baseRadius + Math.log2(connections + 1) * 2;
    return Math.min(nodeConfig.maxRadius, Math.max(nodeConfig.minRadius, scaled));
  },
} as const;

// ============================================================================
// Visual Settings
// ============================================================================

export const visualConfig = {
  /** Link width */
  linkWidth: 1,

  /** Link width for connections to active node */
  linkWidthActive: 2,

  /** Link curvature (0 = straight, 1 = full arc) */
  linkCurvature: 0.1,

  /** Label font size */
  labelFontSize: 10,

  /** Label offset from node center */
  labelOffset: 8,

  /** Zoom range */
  zoom: {
    min: 0.1,
    max: 8,
    initial: 1,
  },

  /** Pan limits (null = unlimited) */
  panLimits: null as null | { x: [number, number]; y: [number, number] },
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get node color based on state
 */
export function getNodeColor(node: GraphNode): string {
  if (node.isCurrent) return graphColors.nodeActive;
  if (node.isOrphan) return graphColors.nodeOrphan;
  return graphColors.nodeFill;
}

/**
 * Get node radius based on connections
 */
export function getNodeRadius(node: GraphNode): number {
  // Current node gets a slight boost
  const base = nodeConfig.sizeScale(node.connections);
  return node.isCurrent ? base * 1.3 : base;
}

/**
 * Get link color based on whether it connects to active node
 */
export function getLinkColor(
  link: { source: string | GraphNode; target: string | GraphNode },
  activeNodeId: string | null
): string {
  if (!activeNodeId) return graphColors.link;

  const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
  const targetId = typeof link.target === 'string' ? link.target : link.target.id;

  if (sourceId === activeNodeId || targetId === activeNodeId) {
    return graphColors.linkActive;
  }
  return graphColors.link;
}

/**
 * Get link width based on whether it connects to active node
 */
export function getLinkWidth(
  link: { source: string | GraphNode; target: string | GraphNode },
  activeNodeId: string | null
): number {
  if (!activeNodeId) return visualConfig.linkWidth;

  const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
  const targetId = typeof link.target === 'string' ? link.target : link.target.id;

  if (sourceId === activeNodeId || targetId === activeNodeId) {
    return visualConfig.linkWidthActive;
  }
  return visualConfig.linkWidth;
}

// ============================================================================
// Performance Thresholds
// ============================================================================

export const performanceConfig = {
  /** Nodes below this count: show all labels */
  showAllLabelsThreshold: 30,

  /** Nodes above this count: reduce visual complexity */
  reduceComplexityThreshold: 200,

  /** Nodes above this count: use WebGL (future) */
  webglThreshold: 1000,

  /** Maximum nodes to render (performance limit) */
  maxNodes: 2000,
} as const;
