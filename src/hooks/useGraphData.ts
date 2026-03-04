/**
 * useGraphData Hook
 *
 * Transforms vault index data into graph format for visualization.
 * Uses manifest shim for note metadata and graphCache shim for edges.
 * Supports both full vault graphs and local graphs (limited by depth).
 */

import { useMemo } from 'react';
import { useVaultMetadata } from '@/context/VaultMetadataContext';
import type { GraphNode, GraphLink, GraphData, GraphViewOptions } from '@/components/graph/types';
import { titleFromPath } from '@/vault/vaultIndex';

const DEFAULT_OPTIONS: GraphViewOptions = {
  depth: 2,
  showOrphans: true,
  nodeScale: 1,
  showAllLabels: false,
};

/**
 * Build notes map from manifest shim for graph building
 */
function buildNotesFromManifest(manifest: { id_to_path: Record<string, string> }): Record<string, { id: string; rel_path: string; title: string }> {
  const notes: Record<string, { id: string; rel_path: string; title: string }> = {};
  for (const [noteId, relPath] of Object.entries(manifest.id_to_path)) {
    notes[noteId] = {
      id: noteId,
      rel_path: relPath,
      title: titleFromPath(relPath),
    };
  }
  return notes;
}

/**
 * Build the full vault graph
 */
function buildFullGraph(
  notes: Record<string, { id: string; rel_path: string; title: string }>,
  edges: Record<string, { id: string; sourceNoteId: string; targetNoteId: string; type: string }>,
  currentNoteId: string | null,
  options: GraphViewOptions
): GraphData {
  // Count connections for each note
  const connectionCounts = new Map<string, number>();
  const connectedNotes = new Set<string>();

  for (const edge of Object.values(edges)) {
    connectionCounts.set(edge.sourceNoteId, (connectionCounts.get(edge.sourceNoteId) || 0) + 1);
    connectionCounts.set(edge.targetNoteId, (connectionCounts.get(edge.targetNoteId) || 0) + 1);
    connectedNotes.add(edge.sourceNoteId);
    connectedNotes.add(edge.targetNoteId);
  }

  // Build nodes
  const nodes: GraphNode[] = [];
  for (const note of Object.values(notes)) {
    const isOrphan = !connectedNotes.has(note.id);

    // Skip orphans if not showing them
    if (isOrphan && !options.showOrphans) continue;

    nodes.push({
      id: note.id,
      name: note.title,
      relPath: note.rel_path,
      connections: connectionCounts.get(note.id) || 0,
      isCurrent: note.id === currentNoteId,
      isOrphan,
    });
  }

  // Build links (only include links where both nodes exist)
  const nodeIds = new Set(nodes.map((n) => n.id));
  const links: GraphLink[] = [];

  for (const edge of Object.values(edges)) {
    if (nodeIds.has(edge.sourceNoteId) && nodeIds.has(edge.targetNoteId)) {
      links.push({
        id: edge.id,
        source: edge.sourceNoteId,
        target: edge.targetNoteId,
        type: edge.type as GraphLink['type'],
      });
    }
  }

  return { nodes, links };
}

/**
 * Build a local graph centered on the current note
 * Shows notes within N degrees of connection
 */
function buildLocalGraph(
  notes: Record<string, { id: string; rel_path: string; title: string }>,
  edges: Record<string, { id: string; sourceNoteId: string; targetNoteId: string; type: string }>,
  currentNoteId: string,
  depth: number
): GraphData {
  if (!currentNoteId || depth < 1) {
    // Return just the current note if depth is 0
    const currentNote = notes[currentNoteId];
    if (currentNote) {
      return {
        nodes: [
          {
            id: currentNote.id,
            name: currentNote.title,
            relPath: currentNote.rel_path,
            connections: 0,
            isCurrent: true,
            isOrphan: true,
          },
        ],
        links: [],
      };
    }
    return { nodes: [], links: [] };
  }

  // Build adjacency list for efficient traversal
  const adjacency = new Map<string, Set<string>>();
  const edgeMap = new Map<string, typeof edges[string]>();

  for (const edge of Object.values(edges)) {
    // Add bidirectional connections for traversal
    if (!adjacency.has(edge.sourceNoteId)) adjacency.set(edge.sourceNoteId, new Set());
    if (!adjacency.has(edge.targetNoteId)) adjacency.set(edge.targetNoteId, new Set());

    adjacency.get(edge.sourceNoteId)!.add(edge.targetNoteId);
    adjacency.get(edge.targetNoteId)!.add(edge.sourceNoteId);

    // Store edge for later lookup
    const key = `${edge.sourceNoteId}:${edge.targetNoteId}`;
    edgeMap.set(key, edge);
  }

  // BFS to find nodes within depth
  const visited = new Set<string>();
  const queue: Array<{ nodeId: string; currentDepth: number }> = [{ nodeId: currentNoteId, currentDepth: 0 }];
  visited.add(currentNoteId);

  while (queue.length > 0) {
    const { nodeId, currentDepth } = queue.shift()!;

    if (currentDepth < depth) {
      const neighbors = adjacency.get(nodeId);
      if (neighbors) {
        for (const neighborId of neighbors) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            queue.push({ nodeId: neighborId, currentDepth: currentDepth + 1 });
          }
        }
      }
    }
  }

  // Count connections within the local graph
  const connectionCounts = new Map<string, number>();
  for (const nodeId of visited) {
    const neighbors = adjacency.get(nodeId);
    if (neighbors) {
      let localConnections = 0;
      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) localConnections++;
      }
      connectionCounts.set(nodeId, localConnections);
    }
  }

  // Build nodes
  const nodes: GraphNode[] = [];
  for (const nodeId of visited) {
    const note = notes[nodeId];
    if (note) {
      nodes.push({
        id: note.id,
        name: note.title,
        relPath: note.rel_path,
        connections: connectionCounts.get(note.id) || 0,
        isCurrent: note.id === currentNoteId,
        isOrphan: false,
      });
    }
  }

  // Build links (only between visited nodes)
  const links: GraphLink[] = [];
  const addedEdges = new Set<string>();

  for (const nodeId of visited) {
    const neighbors = adjacency.get(nodeId);
    if (neighbors) {
      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) {
          // Find the original edge
          const key1 = `${nodeId}:${neighborId}`;
          const key2 = `${neighborId}:${nodeId}`;

          // Avoid duplicate edges
          if (!addedEdges.has(key1) && !addedEdges.has(key2)) {
            const edge = edgeMap.get(key1) || edgeMap.get(key2);
            if (edge) {
              links.push({
                id: edge.id,
                source: edge.sourceNoteId,
                target: edge.targetNoteId,
                type: edge.type as GraphLink['type'],
              });
              addedEdges.add(key1);
              addedEdges.add(key2);
            }
          }
        }
      }
    }
  }

  return { nodes, links };
}

/**
 * Hook to get full vault graph data
 */
export function useFullGraphData(options: Partial<GraphViewOptions> = {}): {
  graphData: GraphData;
  loading: boolean;
  nodeCount: number;
  edgeCount: number;
} {
  const { ready, activeNoteId, manifest, graphCache } = useVaultMetadata();
  const showOrphans = options.showOrphans ?? DEFAULT_OPTIONS.showOrphans;
  const nodeScale = options.nodeScale ?? DEFAULT_OPTIONS.nodeScale;

  const graphData = useMemo(() => {
    if (!ready || !manifest) {
      return { nodes: [], links: [] };
    }

    const notes = buildNotesFromManifest(manifest);
    const edges = graphCache ? graphCache.edges : {};

    const mergedOptions = { ...DEFAULT_OPTIONS, showOrphans, nodeScale };
    return buildFullGraph(notes, edges, activeNoteId, mergedOptions);
  }, [manifest, graphCache, ready, activeNoteId, showOrphans, nodeScale]);

  return useMemo(() => ({
    graphData,
    loading: !ready,
    nodeCount: graphData.nodes.length,
    edgeCount: graphData.links.length,
  }), [graphData, ready]);
}

/**
 * Hook to get local graph data (centered on current note)
 */
export function useLocalGraphData(options: Partial<GraphViewOptions> = {}): {
  graphData: GraphData;
  loading: boolean;
  nodeCount: number;
  edgeCount: number;
} {
  const { ready, activeNoteId, manifest, graphCache } = useVaultMetadata();
  const depth = options.depth ?? DEFAULT_OPTIONS.depth;

  const graphData = useMemo(() => {
    if (!ready || !activeNoteId || !manifest) {
      return { nodes: [], links: [] };
    }

    const notes = buildNotesFromManifest(manifest);
    const edges = graphCache ? graphCache.edges : {};

    return buildLocalGraph(notes, edges, activeNoteId, depth);
  }, [manifest, graphCache, ready, activeNoteId, depth]);

  return useMemo(() => ({
    graphData,
    loading: !ready,
    nodeCount: graphData.nodes.length,
    edgeCount: graphData.links.length,
  }), [graphData, ready]);
}
