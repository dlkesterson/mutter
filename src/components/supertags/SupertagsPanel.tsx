/**
 * SupertagsPanel Component
 *
 * Right panel for managing supertag templates and viewing/editing
 * supertags applied to the current note.
 */

import { useState } from 'react';
import { Tag, Plus, Pencil, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSupertagDefinitions } from '@/hooks/useSupertagDefinitions';
import { useNoteSuperTags } from '@/hooks/useNoteSuperTags';
import { SupertagFieldEditor } from './SupertagFieldEditor';
import type { SupertagDefinition } from '@/types/supertag';

interface SupertagsPanelProps {
  noteId: string | null;
  onOpenCreator: () => void;
  onOpenApply: () => void;
  onEditTemplate: (id: string) => void;
  className?: string;
}

interface TemplateItemProps {
  definition: SupertagDefinition;
  onEdit: () => void;
  onDelete: () => void;
}

function TemplateItem({ definition, onEdit, onDelete }: TemplateItemProps) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-sm hover:bg-muted/50 group">
      <span className="text-sm flex-shrink-0">
        {definition.icon || '🏷️'}
      </span>
      <span className="text-sm flex-1 truncate">{definition.name}</span>
      <span className="text-xs text-muted-foreground">
        {definition.fields.length} field{definition.fields.length !== 1 ? 's' : ''}
      </span>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1 hover:bg-muted rounded-sm text-muted-foreground hover:text-foreground"
          title="Edit template"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={onDelete}
          className="p-1 hover:bg-destructive/20 rounded-sm text-muted-foreground hover:text-destructive"
          title="Delete template"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

interface AppliedTagItemProps {
  definition: SupertagDefinition;
  values: Record<string, any>;
  onUpdateValue: (fieldName: string, value: any) => void;
  onRemove: () => void;
}

function AppliedTagItem({ definition, values, onUpdateValue, onRemove }: AppliedTagItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasFields = definition.fields.length > 0;

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 bg-accent/5",
          hasFields && "cursor-pointer hover:bg-accent/10"
        )}
        onClick={() => hasFields && setIsExpanded(!isExpanded)}
      >
        {hasFields ? (
          isExpanded ? (
            <ChevronDown size={14} className="text-muted-foreground" />
          ) : (
            <ChevronRight size={14} className="text-muted-foreground" />
          )
        ) : (
          <span className="w-3.5" />
        )}
        <span className="text-sm">{definition.icon || '🏷️'}</span>
        <span className="text-sm font-medium flex-1">{definition.name}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-1 hover:bg-destructive/20 rounded-sm text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
          title="Remove tag"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {isExpanded && hasFields && (
        <div className="p-2 space-y-2 border-t border-border bg-background">
          {definition.fields.map((field) => (
            <div key={field.name} className="space-y-1">
              <label className="text-xs text-muted-foreground">{field.name}</label>
              <SupertagFieldEditor
                field={field}
                value={values[field.name]}
                onChange={(value) => onUpdateValue(field.name, value)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SupertagsPanel({
  noteId,
  onOpenCreator,
  onOpenApply,
  onEditTemplate,
  className,
}: SupertagsPanelProps) {
  const { definitions, remove: removeDefinition } = useSupertagDefinitions();
  const { instances, remove: removeInstance, updateValues } = useNoteSuperTags(noteId);
  const { getById } = useSupertagDefinitions();

  const handleDeleteTemplate = (id: string, name: string) => {
    if (confirm(`Delete supertag template "${name}"? This won't remove it from notes that already have it applied.`)) {
      removeDefinition(id);
    }
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Tag size={16} className="text-muted-foreground" />
        <span className="text-sm font-medium">Supertags</span>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Templates Section */}
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Templates
            </h3>
            <button
              onClick={onOpenCreator}
              className="p-1 hover:bg-muted rounded-sm text-muted-foreground hover:text-foreground"
              title="Create new template"
            >
              <Plus size={14} />
            </button>
          </div>

          {definitions.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 italic">
              No templates yet. Create one to get started.
            </p>
          ) : (
            <div className="space-y-0.5">
              {definitions.map((def) => (
                <TemplateItem
                  key={def.id}
                  definition={def}
                  onEdit={() => onEditTemplate(def.id)}
                  onDelete={() => handleDeleteTemplate(def.id, def.name)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* This Note Section */}
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              This Note
            </h3>
            {noteId && definitions.length > 0 && (
              <button
                onClick={onOpenApply}
                className="p-1 hover:bg-muted rounded-sm text-muted-foreground hover:text-foreground"
                title="Apply tag to note"
              >
                <Plus size={14} />
              </button>
            )}
          </div>

          {!noteId ? (
            <p className="text-xs text-muted-foreground/60 italic">
              Open a note to see its tags
            </p>
          ) : instances.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 italic">
              No tags applied to this note
            </p>
          ) : (
            <div className="space-y-2 group">
              {instances.map((instance) => {
                const definition = getById(instance.definitionId);
                if (!definition) return null;
                return (
                  <AppliedTagItem
                    key={instance.definitionId}
                    definition={definition}
                    values={instance.values}
                    onUpdateValue={(fieldName, value) => {
                      updateValues(instance.definitionId, {
                        ...instance.values,
                        [fieldName]: value,
                      });
                    }}
                    onRemove={() => removeInstance(instance.definitionId)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
