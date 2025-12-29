/**
 * Voice Suggestions Component
 *
 * Displays tiered voice command suggestions:
 * - Primary tier: Top 1-2 commands near cursor (highest confidence)
 * - Secondary tier: Next 2-3 alternatives
 * - Escape tier: Fixed bottom-right (undo, cancel, help)
 */

import { useCommandRanking, useCommandExecution } from '@/hooks/useCommandRanking';
import { useEditorContext } from '@/context/EditorContextProvider';
import type { ScoredCommand } from '@/types/voiceCommand';
import { Star, ChevronRight } from 'lucide-react';

interface VoiceSuggestionsProps {
  /** Screen position of the cursor for positioning suggestions */
  cursorPosition?: { x: number; y: number };
  /** Whether to show suggestions */
  visible: boolean;
}

export function VoiceSuggestions({ cursorPosition, visible }: VoiceSuggestionsProps) {
  const { primary, secondary, escape, ready } = useCommandRanking();
  const { context } = useEditorContext();
  const { execute } = useCommandExecution();

  // Don't render if not visible or in idle state
  if (!visible || context.voicePhase === 'idle' || !ready) {
    return null;
  }

  const handleExecute = async (scored: ScoredCommand) => {
    await execute(scored);
  };

  return (
    <>
      {/* Main suggestion panel - positioned near cursor */}
      {(primary.length > 0 || secondary.length > 0) && (
        <SuggestionPanel
          position={cursorPosition}
          primary={primary}
          secondary={secondary}
          onExecute={handleExecute}
        />
      )}

      {/* Escape tier - fixed position bottom-right */}
      {escape.length > 0 && (
        <EscapeTier commands={escape} onExecute={handleExecute} />
      )}
    </>
  );
}

interface SuggestionPanelProps {
  position?: { x: number; y: number };
  primary: ScoredCommand[];
  secondary: ScoredCommand[];
  onExecute: (cmd: ScoredCommand) => void;
}

function SuggestionPanel({
  position,
  primary,
  secondary,
  onExecute,
}: SuggestionPanelProps) {
  // Calculate position below cursor
  const style = position
    ? {
        position: 'absolute' as const,
        left: Math.max(100, Math.min(position.x, window.innerWidth - 300)),
        top: position.y + 24,
        zIndex: 1000,
      }
    : {
        position: 'fixed' as const,
        bottom: 120, // Above voice indicator
        right: 24,
        zIndex: 1000,
      };

  return (
    <div
      className="min-w-[200px] max-w-[300px] p-2 bg-surface/95 backdrop-blur-md border border-border/30 rounded-lg shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200"
      style={style}
    >
      {/* Primary tier */}
      {primary.length > 0 && (
        <div className="flex flex-col gap-1">
          {primary.map((scored) => (
            <button
              key={scored.command.id}
              className="flex items-center gap-2 px-3 py-2 w-full text-left rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              onClick={() => onExecute(scored)}
            >
              <Star className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 font-medium text-sm">
                {scored.command.name}
              </span>
              <span className="text-xs opacity-70 font-mono">
                {Math.round(scored.score * 100)}%
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Secondary tier */}
      {secondary.length > 0 && (
        <div className={`flex flex-col gap-0.5 ${primary.length > 0 ? 'mt-2 pt-2 border-t border-border/20' : ''}`}>
          {secondary.map((scored) => (
            <button
              key={scored.command.id}
              className="flex items-center gap-2 px-3 py-1.5 w-full text-left rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => onExecute(scored)}
            >
              <ChevronRight className="w-3 h-3 flex-shrink-0 opacity-50" />
              <span className="flex-1 text-sm">
                {scored.command.name}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {primary.length === 0 && secondary.length === 0 && (
        <div className="px-3 py-2 text-sm text-muted-foreground text-center">
          No matching commands
        </div>
      )}
    </div>
  );
}

interface EscapeTierProps {
  commands: ScoredCommand[];
  onExecute: (cmd: ScoredCommand) => void;
}

function EscapeTier({ commands, onExecute }: EscapeTierProps) {
  return (
    <div className="fixed bottom-8 left-8 flex gap-2 z-[999] animate-in fade-in duration-300">
      {commands.map((scored) => (
        <button
          key={scored.command.id}
          className="px-3 py-1.5 bg-surface/80 backdrop-blur-md border border-border/30 rounded-md text-muted-foreground hover:text-foreground hover:border-border text-xs font-medium transition-all hover:scale-105"
          onClick={() => onExecute(scored)}
        >
          {scored.command.name}
        </button>
      ))}
    </div>
  );
}

/**
 * Hook to get cursor screen position from CodeMirror view
 * To be used in Editor.tsx
 */
export function useCursorScreenPosition(view: any | null): { x: number; y: number } | null {
  if (!view) return null;

  try {
    const pos = view.state.selection.main.head;
    const coords = view.coordsAtPos(pos);
    if (coords) {
      return { x: coords.left, y: coords.bottom };
    }
  } catch {
    // View might not be ready
  }

  return null;
}
