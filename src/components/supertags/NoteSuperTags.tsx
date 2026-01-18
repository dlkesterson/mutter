/**
 * NoteSuperTags Component
 *
 * Displays supertags applied to a note with add functionality.
 * Clicking a badge expands it to show/edit field values.
 * Typically shown in the note header.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNoteSuperTags } from '@/hooks/useNoteSuperTags';
import { useSupertagDefinitions } from '@/hooks/useSupertagDefinitions';
import { SupertagApplyDialog } from '@/components/dialogs/supertag-apply-dialog';
import { SupertagFieldEditor } from './SupertagFieldEditor';
import type { SupertagDefinition, SupertagInstance } from '@/types/supertag';

interface NoteSuperTagsProps {
  noteId: string | null;
}

interface ExpandableBadgeProps {
  definition: SupertagDefinition;
  instance: SupertagInstance;
  isExpanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onUpdateValue: (fieldName: string, value: any) => void;
}

function ExpandableBadge({
  definition,
  instance,
  isExpanded,
  onToggle,
  onRemove,
  onUpdateValue,
}: ExpandableBadgeProps) {
  const hasFields = definition.fields.length > 0;

  return (
    <div
      className={cn(
        "inline-flex flex-col rounded-lg border border-border/50 overflow-hidden transition-all",
        isExpanded ? "bg-accent/5" : "bg-accent/10"
      )}
    >
      {/* Badge Header */}
      <button
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-1",
          "text-xs font-medium text-accent",
          "hover:bg-accent/20 transition-colors"
        )}
        onClick={onToggle}
      >
        {hasFields && (
          isExpanded ? (
            <ChevronDown size={12} className="text-muted-foreground" />
          ) : (
            <ChevronRight size={12} className="text-muted-foreground" />
          )
        )}
        {definition.icon && <span>{definition.icon}</span>}
        <span>{definition.name}</span>
        <span
          role="button"
          className="ml-1 p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Remove tag"
        >
          <X size={10} />
        </span>
      </button>

      {/* Expanded Field Editor */}
      {isExpanded && hasFields && (
        <div className="px-2 pb-2 pt-1 space-y-2 border-t border-border/50">
          {definition.fields.map((field) => (
            <div key={field.name} className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {field.name}
              </label>
              <SupertagFieldEditor
                field={field}
                value={instance.values[field.name]}
                onChange={(value) => onUpdateValue(field.name, value)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function NoteSuperTags({ noteId }: NoteSuperTagsProps) {
  const { instances, remove, updateValues } = useNoteSuperTags(noteId);
  const { getById } = useSupertagDefinitions();
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [expandedTagId, setExpandedTagId] = useState<string | null>(null);

  if (!noteId) return null;

  // Don't render anything if no instances - just show add button
  if (instances.length === 0) {
    return (
      <div className="flex items-center py-2">
        <button
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setApplyDialogOpen(true)}
        >
          + Add tag
        </button>
        <SupertagApplyDialog
          open={applyDialogOpen}
          onClose={() => setApplyDialogOpen(false)}
          noteId={noteId}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-2 py-2">
      {instances.map((instance) => {
        const definition = getById(instance.definitionId);
        if (!definition) return null;

        return (
          <ExpandableBadge
            key={instance.definitionId}
            definition={definition}
            instance={instance}
            isExpanded={expandedTagId === instance.definitionId}
            onToggle={() => {
              setExpandedTagId(
                expandedTagId === instance.definitionId ? null : instance.definitionId
              );
            }}
            onRemove={() => remove(instance.definitionId)}
            onUpdateValue={(fieldName, value) => {
              updateValues(instance.definitionId, {
                ...instance.values,
                [fieldName]: value,
              });
            }}
          />
        );
      })}
      <button
        className="text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        onClick={() => setApplyDialogOpen(true)}
      >
        + Add tag
      </button>
      <SupertagApplyDialog
        open={applyDialogOpen}
        onClose={() => setApplyDialogOpen(false)}
        noteId={noteId}
      />
    </div>
  );
}
