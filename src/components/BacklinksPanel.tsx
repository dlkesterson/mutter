/**
 * Backlinks Panel Component
 *
 * Displays notes that link to the current note.
 * Provides navigation to source notes.
 */

import { useBacklinks, type BacklinkInfo } from '@/hooks/useBacklinks';
import { useGraphStats } from '@/hooks/useGraphStats';
import { ArrowUpRight, Link2, FileText, Hash } from 'lucide-react';

interface BacklinksPanelProps {
  /** ID of the current note */
  noteId: string | null;
  /** Callback when user clicks a backlink to navigate */
  onNavigate: (relPath: string) => void;
}

export function BacklinksPanel({ noteId, onNavigate }: BacklinksPanelProps) {
  const { backlinks, count, loading } = useBacklinks(noteId);
  const { incomingCount, outgoingCount } = useGraphStats(noteId);

  if (loading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading backlinks...
      </div>
    );
  }

  if (!noteId) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Open a note to see backlinks
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with stats */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Link2 className="w-4 h-4" />
          Backlinks
        </h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span title="Incoming links (backlinks)">
            ← {incomingCount}
          </span>
          <span title="Outgoing links">
            → {outgoingCount}
          </span>
        </div>
      </div>

      {/* Backlinks list */}
      <div className="flex-1 overflow-y-auto">
        {count === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-y divide-border/10">
            {backlinks.map((bl) => (
              <BacklinkItem
                key={bl.edge.id}
                backlink={bl}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="p-4 text-center">
      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted/30 flex items-center justify-center">
        <Link2 className="w-5 h-5 text-muted-foreground/50" />
      </div>
      <p className="text-sm text-muted-foreground mb-1">
        No backlinks yet
      </p>
      <p className="text-xs text-muted-foreground/60">
        Other notes that link here will appear
      </p>
    </div>
  );
}

interface BacklinkItemProps {
  backlink: BacklinkInfo;
  onNavigate: (relPath: string) => void;
}

function BacklinkItem({ backlink, onNavigate }: BacklinkItemProps) {
  const { edge, sourceNote } = backlink;

  return (
    <li>
      <button
        className="w-full px-4 py-3 text-left hover:bg-muted/30 transition-colors group"
        onClick={() => onNavigate(sourceNote.rel_path)}
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="mt-0.5 text-muted-foreground/60 group-hover:text-primary transition-colors">
            <FileText className="w-4 h-4" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Title */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground truncate">
                {sourceNote.title}
              </span>
              <ArrowUpRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            {/* Block reference if present */}
            {edge.sourceBlockId && (
              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                <Hash className="w-3 h-3" />
                <span className="font-mono">{edge.sourceBlockId}</span>
              </div>
            )}

            {/* Link type indicator */}
            <div className="flex items-center gap-2 mt-1.5">
              <LinkTypeBadge type={edge.type} />
              {/* Path preview */}
              <span className="text-xs text-muted-foreground/50 truncate">
                {sourceNote.rel_path}
              </span>
            </div>
          </div>
        </div>
      </button>
    </li>
  );
}

function LinkTypeBadge({ type }: { type: 'wiki-link' | 'embed' | 'reference' }) {
  const config = {
    'wiki-link': { label: 'link', className: 'bg-blue-500/10 text-blue-400' },
    'embed': { label: 'embed', className: 'bg-purple-500/10 text-purple-400' },
    'reference': { label: 'ref', className: 'bg-green-500/10 text-green-400' },
  };

  const { label, className } = config[type];

  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${className}`}>
      {label}
    </span>
  );
}

/**
 * Compact backlinks count for sidebar/header
 */
export function BacklinksCount({ noteId }: { noteId: string | null }) {
  const { count, loading } = useBacklinks(noteId);

  if (loading || !noteId) {
    return null;
  }

  if (count === 0) {
    return null;
  }

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-muted/50 text-muted-foreground rounded"
      title={`${count} backlink${count !== 1 ? 's' : ''}`}
    >
      <Link2 className="w-3 h-3" />
      {count}
    </span>
  );
}
