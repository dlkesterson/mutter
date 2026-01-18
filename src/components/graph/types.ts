/**
 * Graph View Types
 *
 * TypeScript interfaces for the force-directed graph visualization.
 * These types align with react-force-graph-2d's expected data structures.
 */

/**
 * Node in the graph representing a note
 * Extends the library's expected node structure with custom properties
 */
export interface GraphNode {
  /** Unique node ID */
  id: string;
  /** Display label (note title) */
  name: string;
  /** Relative path to note file */
  relPath: string;
  /** Number of connections (used for node sizing) */
  connections: number;
  /** Whether this is the currently active note */
  isCurrent: boolean;
  /** Whether this is an orphan (no connections) */
  isOrphan: boolean;
  /** x position (set by force simulation) */
  x?: number;
  /** y position (set by force simulation) */
  y?: number;
  /** velocity x (set by force simulation) */
  vx?: number;
  /** velocity y (set by force simulation) */
  vy?: number;
  /** Fixed x position (for pinning) - undefined means not fixed */
  fx?: number;
  /** Fixed y position (for pinning) - undefined means not fixed */
  fy?: number;
  /** Allow additional properties from the library */
  [key: string]: unknown;
}

/**
 * Link in the graph representing a connection between notes
 */
export interface GraphLink {
  /** Unique edge ID */
  id: string;
  /** Source node ID */
  source: string | GraphNode;
  /** Target node ID */
  target: string | GraphNode;
  /** Type of link (wiki-link, embed, reference) */
  type: 'wiki-link' | 'embed' | 'reference';
}

/**
 * Complete graph data structure
 */
export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/**
 * Graph view options
 */
export interface GraphViewOptions {
  /** Maximum depth from current note (for local graph) */
  depth: number;
  /** Show orphan nodes */
  showOrphans: boolean;
  /** Node size scaling factor */
  nodeScale: number;
  /** Enable labels on all nodes (vs hover only) */
  showAllLabels: boolean;
}

/**
 * Graph interaction callbacks
 */
export interface GraphCallbacks {
  /** Called when a node is clicked */
  onNodeClick?: (node: GraphNode) => void;
  /** Called when a node is hovered */
  onNodeHover?: (node: GraphNode | null) => void;
  /** Called when background is clicked */
  onBackgroundClick?: () => void;
}
