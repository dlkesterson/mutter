/**
 * BacklinksPanel Component
 *
 * Displays all notes that link to the currently open note.
 * Uses the CRDT backlink_index for fast lookups.
 */

import { useBacklinks } from '@/hooks/useBacklinks';

interface BacklinksPanelProps {
  noteId: string | null;
  onNavigate: (relPath: string) => void;
}

export function BacklinksPanel({ noteId, onNavigate }: BacklinksPanelProps) {
  const { backlinks, count, loading } = useBacklinks(noteId);

  if (!noteId) return null;

  if (loading) {
    return (
      <div className="backlinks-panel p-4 text-muted-foreground text-sm">
        Loading backlinks...
      </div>
    );
  }

  if (count === 0) {
    return (
      <div className="backlinks-panel p-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">
          Backlinks
        </h3>
        <p className="text-xs text-muted-foreground/60">
          No other notes link to this one yet.
        </p>
      </div>
    );
  }

  return (
    <div className="backlinks-panel p-4">
      <h3 className="text-sm font-medium mb-3">
        {count} Backlink{count !== 1 ? 's' : ''}
      </h3>
      <ul className="space-y-2">
        {backlinks.map((bl) => (
          <li key={bl.edge.id}>
            <button
              className="w-full text-left px-2 py-1.5 rounded hover:bg-muted transition-colors"
              onClick={() => onNavigate(bl.sourceNote.rel_path)}
            >
              <span className="text-sm font-medium">{bl.sourceNote.title}</span>
              {bl.edge.sourceBlockId && (
                <span className="text-xs text-muted-foreground ml-1">
                  #{bl.edge.sourceBlockId}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
