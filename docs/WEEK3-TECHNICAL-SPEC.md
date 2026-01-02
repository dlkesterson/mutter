# Week 3 Technical Specification: Supertags + Transclusion + AI Voice

**Duration:** 5 days
**Goal:** Build supertag UI, live transclusion rendering, and AI-powered voice queries

**Prerequisites:** Week 1-2 complete (Block IDs, Context Signals, CRDT Schema v3, Command Ranking, Graph Indexing)

---

## Overview

Week 3 builds on the foundation and core systems to deliver user-facing features:

| Days | Feature | Unlocks |
|------|---------|---------|
| 1-2 | Supertag UI | Typed note templates, structured queries, task management |
| 3-4 | Transclusion | Live block embeds, content reuse, atomic note composition |
| 5 | AI Voice Queries | "Summarize notes on X", semantic search, intelligent answers |

---

## Pre-Week 3 Gap Closure

Before starting Week 3 features, address these gaps identified in the Architecture review:

### Gap 1: Backlinks UI Panel

**Status:** Data layer complete, UI missing

**Quick Implementation:**

**File: `src/components/BacklinksPanel.tsx`** (new)
```typescript
import { useBacklinks, BacklinkInfo } from '@/hooks/useBacklinks';
import { useVaultMetadataCrdt } from '@/hooks/useVaultMetadataCrdt';

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
```

**Integration:** Add to sidebar or as collapsible panel below editor.

### Gap 2: Voice Command Execution Wiring

**Status:** Commands dispatch events, but listener may be incomplete

**Verification Task:**
```typescript
// In Editor.tsx, ensure this listener exists:
useEffect(() => {
  const handleCommand = (event: CustomEvent<{ command: string }>) => {
    const { command } = event.detail;
    if (view) {
      executeCommand(view, command);
    }
  };

  window.addEventListener('mutter:execute-command', handleCommand as EventListener);
  return () => {
    window.removeEventListener('mutter:execute-command', handleCommand as EventListener);
  };
}, [view]);
```

---

## Days 1-2: Supertag UI

### Problem Statement

The CRDT already stores supertag definitions and instances:
- `SupertagDefinition`: Template with typed fields
- `SupertagInstance`: Applied to notes with values
- Functions: `createSupertagDefinition()`, `applySupertagToNote()`, `findNotesBySupertag()`, etc.

**Missing:** User interface for creating, applying, and querying supertags.

### Design Decisions

#### Supertag UX Flow

```
1. Create Template (Vault Settings or Omnibox)
   ┌─────────────────────────────────────┐
   │ New Supertag Template               │
   │ ┌─────────────────────────────────┐ │
   │ │ Name: [project         ]        │ │
   │ │ Icon: [folder-icon     ]        │ │
   │ └─────────────────────────────────┘ │
   │                                     │
   │ Fields:                             │
   │ ┌─────────────────────────────────┐ │
   │ │ + status   [select v]           │ │
   │ │   Options: active, paused, done │ │
   │ │ + due      [date   v]           │ │
   │ │ + priority [number v]           │ │
   │ │ [+ Add Field]                   │ │
   │ └─────────────────────────────────┘ │
   │                     [Cancel] [Save] │
   └─────────────────────────────────────┘

2. Apply to Note (Note Header or Omnibox)
   ┌─────────────────────────────────────┐
   │ [folder] project                    │
   │ ┌─────────────────────────────────┐ │
   │ │ status:   [active    v]         │ │
   │ │ due:      [2024-01-15  ]        │ │
   │ │ priority: [1           ]        │ │
   │ └─────────────────────────────────┘ │
   └─────────────────────────────────────┘

3. Query Notes (Omnibox or Voice)
   "Show all project notes where status is active"
   -> findNotesBySupertagField('project', 'status', 'active')
```

#### Visual Placement

| Location | Component | Purpose |
|----------|-----------|---------|
| Note Header | `SupertagBadges` | Show applied supertags as clickable badges |
| Editor Toolbar | "Add Supertag" button | Quick access to apply supertag |
| Omnibox | Supertag commands | Create, apply, query via keyboard |
| Settings | Supertag Manager | CRUD for supertag definitions |
| Voice | "Tag this as project" | Voice-driven application |

### Implementation Plan

#### Day 1: Supertag Components

**File: `src/types/supertag.ts`** (new)
```typescript
// Re-export from CRDT for convenience
export type {
  SupertagDefinition,
  SupertagField,
  SupertagFieldType,
  SupertagInstance
} from '@/crdt/vaultMetadataDoc';

// UI-specific types
export interface SupertagFormValues {
  name: string;
  icon: string;
  fields: SupertagFieldInput[];
}

export interface SupertagFieldInput {
  id: string; // For React key
  name: string;
  type: SupertagFieldType;
  options?: string[];
  default?: string | number | boolean;
}

export interface SupertagApplyValues {
  definitionId: string;
  values: Record<string, string | number | boolean | string[]>;
}
```

**File: `src/hooks/useSupertagDefinitions.ts`** (new)
```typescript
import { useMemo, useCallback } from 'react';
import { useVaultMetadataCrdt } from './useVaultMetadataCrdt';
import {
  getAllSupertagDefinitions,
  createSupertagDefinition,
  updateSupertagDefinition,
  deleteSupertagDefinition,
  SupertagDefinition,
  SupertagField,
} from '@/crdt/vaultMetadataDoc';

export function useSupertagDefinitions() {
  const { handle, doc, ready } = useVaultMetadataCrdt();

  const definitions = useMemo(() => {
    if (!doc) return [];
    return getAllSupertagDefinitions({ doc });
  }, [doc]);

  const create = useCallback(
    (params: { name: string; fields: SupertagField[]; icon?: string }) => {
      if (!handle) return null;
      return createSupertagDefinition({ handle, ...params });
    },
    [handle]
  );

  const update = useCallback(
    (id: string, updates: Partial<{ name: string; fields: SupertagField[]; icon: string }>) => {
      if (!handle) return;
      updateSupertagDefinition({ handle, id, ...updates });
    },
    [handle]
  );

  const remove = useCallback(
    (id: string) => {
      if (!handle) return;
      deleteSupertagDefinition({ handle, id });
    },
    [handle]
  );

  const getById = useCallback(
    (id: string) => definitions.find((d) => d.id === id) ?? null,
    [definitions]
  );

  return {
    definitions,
    create,
    update,
    remove,
    getById,
    ready,
  };
}
```

**File: `src/hooks/useNoteSuperTags.ts`** (new)
```typescript
import { useMemo, useCallback } from 'react';
import { useVaultMetadataCrdt } from './useVaultMetadataCrdt';
import {
  getNoteSupertagInstances,
  applySupertagToNote,
  removeSupertagFromNote,
  SupertagInstance,
} from '@/crdt/vaultMetadataDoc';

export function useNoteSuperTags(noteId: string | null) {
  const { handle, doc, ready } = useVaultMetadataCrdt();

  const instances = useMemo(() => {
    if (!doc || !noteId) return [];
    return getNoteSupertagInstances({ doc, noteId });
  }, [doc, noteId]);

  const apply = useCallback(
    (definitionId: string, values: Record<string, any>) => {
      if (!handle || !noteId) return;
      applySupertagToNote({ handle, noteId, definitionId, values });
    },
    [handle, noteId]
  );

  const remove = useCallback(
    (definitionId: string) => {
      if (!handle || !noteId) return;
      removeSupertagFromNote({ handle, noteId, definitionId });
    },
    [handle, noteId]
  );

  const updateValues = useCallback(
    (definitionId: string, values: Record<string, any>) => {
      if (!handle || !noteId) return;
      // Remove and re-apply with new values (or implement updateSupertagValues)
      removeSupertagFromNote({ handle, noteId, definitionId });
      applySupertagToNote({ handle, noteId, definitionId, values });
    },
    [handle, noteId]
  );

  return {
    instances,
    apply,
    remove,
    updateValues,
    ready,
  };
}
```

**File: `src/components/supertags/SupertagBadge.tsx`** (new)
```typescript
import { SupertagDefinition, SupertagInstance } from '@/types/supertag';

interface SupertagBadgeProps {
  definition: SupertagDefinition;
  instance: SupertagInstance;
  onClick?: () => void;
  onRemove?: () => void;
}

export function SupertagBadge({
  definition,
  instance,
  onClick,
  onRemove,
}: SupertagBadgeProps) {
  return (
    <button
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                 bg-accent/10 text-accent text-xs font-medium
                 hover:bg-accent/20 transition-colors group"
      onClick={onClick}
    >
      {definition.icon && <span>{definition.icon}</span>}
      <span>{definition.name}</span>
      {onRemove && (
        <span
          role="button"
          className="ml-1 opacity-0 group-hover:opacity-100 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          x
        </span>
      )}
    </button>
  );
}
```

**File: `src/components/supertags/SupertagFieldEditor.tsx`** (new)
```typescript
import { SupertagField, SupertagFieldType } from '@/types/supertag';

interface SupertagFieldEditorProps {
  field: SupertagField;
  value: any;
  onChange: (value: any) => void;
}

export function SupertagFieldEditor({ field, value, onChange }: SupertagFieldEditorProps) {
  switch (field.type) {
    case 'text':
      return (
        <input
          type="text"
          className="w-full px-2 py-1 border rounded text-sm"
          value={value ?? field.default ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.name}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          className="w-full px-2 py-1 border rounded text-sm"
          value={value ?? field.default ?? 0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      );

    case 'date':
      return (
        <input
          type="date"
          className="w-full px-2 py-1 border rounded text-sm"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'checkbox':
      return (
        <input
          type="checkbox"
          className="w-4 h-4"
          checked={value ?? field.default ?? false}
          onChange={(e) => onChange(e.target.checked)}
        />
      );

    case 'select':
      return (
        <select
          className="w-full px-2 py-1 border rounded text-sm"
          value={value ?? field.default ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select...</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );

    case 'multi-select':
      // For multi-select, use checkboxes or a multi-select component
      const selected = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-1">
          {field.options?.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={(e) => {
                  if (e.target.checked) {
                    onChange([...selected, opt]);
                  } else {
                    onChange(selected.filter((v) => v !== opt));
                  }
                }}
              />
              {opt}
            </label>
          ))}
        </div>
      );

    default:
      return <span className="text-muted-foreground text-sm">Unsupported field type</span>;
  }
}
```

#### Day 2: Supertag Dialogs & Integration

**File: `src/components/dialogs/supertag-creator-dialog.tsx`** (new)
```typescript
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSupertagDefinitions } from '@/hooks/useSupertagDefinitions';
import { SupertagFieldInput, SupertagFieldType } from '@/types/supertag';
import { nanoid } from 'nanoid';

const FIELD_TYPES: { value: SupertagFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'select', label: 'Select' },
  { value: 'multi-select', label: 'Multi-select' },
];

interface SupertagCreatorDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SupertagCreatorDialog({ open, onClose }: SupertagCreatorDialogProps) {
  const { create } = useSupertagDefinitions();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [fields, setFields] = useState<SupertagFieldInput[]>([]);

  const addField = () => {
    setFields([
      ...fields,
      { id: nanoid(), name: '', type: 'text', options: [] },
    ]);
  };

  const updateField = (id: string, updates: Partial<SupertagFieldInput>) => {
    setFields(fields.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const removeField = (id: string) => {
    setFields(fields.filter((f) => f.id !== id));
  };

  const handleSave = () => {
    if (!name.trim()) return;

    create({
      name: name.trim(),
      icon: icon || undefined,
      fields: fields
        .filter((f) => f.name.trim())
        .map(({ id, ...field }) => ({
          ...field,
          name: field.name.trim(),
        })),
    });

    // Reset form
    setName('');
    setIcon('');
    setFields([]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Supertag Template</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-3">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="project, meeting, person..."
              />
            </div>
            <div>
              <Label htmlFor="icon">Icon</Label>
              <Input
                id="icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="[icon]"
                className="text-center"
              />
            </div>
          </div>

          <div>
            <Label>Fields</Label>
            <div className="space-y-2 mt-2">
              {fields.map((field) => (
                <div key={field.id} className="flex gap-2 items-start">
                  <Input
                    value={field.name}
                    onChange={(e) => updateField(field.id, { name: e.target.value })}
                    placeholder="Field name"
                    className="flex-1"
                  />
                  <select
                    value={field.type}
                    onChange={(e) =>
                      updateField(field.id, { type: e.target.value as SupertagFieldType })
                    }
                    className="px-2 py-2 border rounded text-sm"
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeField(field.id)}
                  >
                    x
                  </Button>
                </div>
              ))}
              {fields.length > 0 &&
                fields.some((f) => f.type === 'select' || f.type === 'multi-select') && (
                  <p className="text-xs text-muted-foreground">
                    Tip: Add options by editing after creation
                  </p>
                )}
            </div>
            <Button variant="outline" size="sm" onClick={addField} className="mt-2">
              + Add Field
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Create Supertag
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**File: `src/components/dialogs/supertag-apply-dialog.tsx`** (new)
```typescript
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSupertagDefinitions } from '@/hooks/useSupertagDefinitions';
import { useNoteSuperTags } from '@/hooks/useNoteSuperTags';
import { SupertagFieldEditor } from '@/components/supertags/SupertagFieldEditor';
import { SupertagDefinition } from '@/types/supertag';

interface SupertagApplyDialogProps {
  open: boolean;
  onClose: () => void;
  noteId: string | null;
  preselectedDefinitionId?: string;
}

export function SupertagApplyDialog({
  open,
  onClose,
  noteId,
  preselectedDefinitionId,
}: SupertagApplyDialogProps) {
  const { definitions } = useSupertagDefinitions();
  const { apply, instances } = useNoteSuperTags(noteId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});

  // Set preselected or first available
  useEffect(() => {
    if (preselectedDefinitionId) {
      setSelectedId(preselectedDefinitionId);
    } else if (definitions.length > 0 && !selectedId) {
      // Filter out already applied
      const appliedIds = instances.map((i) => i.definitionId);
      const available = definitions.filter((d) => !appliedIds.includes(d.id));
      if (available.length > 0) {
        setSelectedId(available[0].id);
      }
    }
  }, [definitions, preselectedDefinitionId, instances, selectedId]);

  const selectedDefinition = definitions.find((d) => d.id === selectedId);

  // Reset values when definition changes
  useEffect(() => {
    if (selectedDefinition) {
      const defaultValues: Record<string, any> = {};
      selectedDefinition.fields.forEach((field) => {
        if (field.default !== undefined) {
          defaultValues[field.name] = field.default;
        }
      });
      setValues(defaultValues);
    }
  }, [selectedDefinition]);

  const handleApply = () => {
    if (!selectedId || !noteId) return;
    apply(selectedId, values);
    setValues({});
    onClose();
  };

  // Filter already applied supertags
  const appliedIds = instances.map((i) => i.definitionId);
  const availableDefinitions = definitions.filter((d) => !appliedIds.includes(d.id));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Apply Supertag</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {availableDefinitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              All supertags have been applied to this note.
            </p>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium">Select Supertag</label>
                <select
                  className="w-full mt-1 px-3 py-2 border rounded"
                  value={selectedId ?? ''}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  {availableDefinitions.map((def) => (
                    <option key={def.id} value={def.id}>
                      {def.icon} {def.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedDefinition && selectedDefinition.fields.length > 0 && (
                <div className="space-y-3">
                  <label className="text-sm font-medium">Field Values</label>
                  {selectedDefinition.fields.map((field) => (
                    <div key={field.name}>
                      <label className="text-xs text-muted-foreground">
                        {field.name}
                      </label>
                      <SupertagFieldEditor
                        field={field}
                        value={values[field.name]}
                        onChange={(v) =>
                          setValues({ ...values, [field.name]: v })
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={!selectedId || availableDefinitions.length === 0}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**File: `src/components/supertags/NoteSuperTags.tsx`** (new)
```typescript
import { useState } from 'react';
import { useNoteSuperTags } from '@/hooks/useNoteSuperTags';
import { useSupertagDefinitions } from '@/hooks/useSupertagDefinitions';
import { SupertagBadge } from './SupertagBadge';
import { SupertagApplyDialog } from '@/components/dialogs/supertag-apply-dialog';

interface NoteSuptertagsProps {
  noteId: string | null;
}

export function NoteSuperTags({ noteId }: NoteSuptertagsProps) {
  const { instances, remove } = useNoteSuperTags(noteId);
  const { getById } = useSupertagDefinitions();
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);

  if (!noteId) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      {instances.map((instance) => {
        const definition = getById(instance.definitionId);
        if (!definition) return null;
        return (
          <SupertagBadge
            key={instance.definitionId}
            definition={definition}
            instance={instance}
            onRemove={() => remove(instance.definitionId)}
          />
        );
      })}
      <button
        className="text-xs text-muted-foreground hover:text-foreground"
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
```

### Voice Commands for Supertags

**File: `src/voice/commands/supertags.ts`** (new)
```typescript
import { VoiceCommand } from '@/types/voiceCommand';
import { commandRegistry } from '../commandRegistry';

const supertagCommands: VoiceCommand[] = [
  {
    id: 'apply-supertag',
    name: 'Tag note',
    examples: [
      'tag this as project',
      'mark as meeting',
      'add project tag',
      'apply task tag',
    ],
    bucket: 'link-reference',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: ['paragraph', 'heading', 'list', 'blockquote', 'empty'],
    allowedViewModes: ['editor', 'split'],
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'none',
    scope: 'document',
    reversible: true,
    action: () => {
      window.dispatchEvent(
        new CustomEvent('mutter:execute-command', {
          detail: { command: 'open-supertag-dialog' },
        })
      );
    },
  },
  {
    id: 'show-supertag-notes',
    name: 'Show tagged notes',
    examples: [
      'show all projects',
      'find meetings',
      'list tasks',
      'show notes tagged as',
    ],
    bucket: 'query-ai',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: ['paragraph', 'heading', 'list', 'blockquote', 'empty'],
    allowedViewModes: ['editor', 'split', 'preview'],
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'none',
    scope: 'vault',
    reversible: false,
    action: () => {
      window.dispatchEvent(
        new CustomEvent('mutter:execute-command', {
          detail: { command: 'query-supertag' },
        })
      );
    },
  },
];

export function registerSupertagCommands(): void {
  supertagCommands.forEach((cmd) => commandRegistry.register(cmd));
}
```

### Testing Checklist

- [ ] Supertag definitions can be created with typed fields
- [ ] Supertag definitions can be edited and deleted
- [ ] Supertags can be applied to notes
- [ ] Supertag badges display on notes
- [ ] Field values can be edited
- [ ] Voice command "tag this as project" opens apply dialog
- [ ] `findNotesBySupertag()` returns correct results
- [ ] `findNotesBySupertagField()` filters by field values

---

## Days 3-4: Transclusion

### Problem Statement

Transclusion allows embedding one block's content inside another document:
- `![[Note Name]]` - Embed entire note
- `![[Note Name#blockId]]` - Embed specific block

The link parser already recognizes embeds (type: 'embed'). We need:
1. CodeMirror extension to render embeds inline
2. Edit-in-place capability
3. Live sync when source changes

### Design Decisions

#### Transclusion Rendering

```
Document A:
+---------------------------------------------+
| # Project Overview                          |
|                                             |
| Key points from meeting:                    |
| +---------------------------------------------+
| | ![[Meeting Notes#summary]]                  | <- Source text (hover/edit)
| | +---------------------------------------+   |
| | | We decided to focus on:               |   | <- Rendered content
| | | - Feature A                           |   |
| | | - Performance improvements            |   |
| | |           [Edit] [Jump to source]     |   |
| | +---------------------------------------+   |
| +---------------------------------------------+
|                                             |
| Next steps...                               |
+---------------------------------------------+
```

#### Interaction Modes

| Mode | Behavior |
|------|----------|
| View | Show rendered content, hide `![[]]` syntax |
| Hover | Show source reference, Edit/Jump buttons |
| Edit (in place) | Open inline editor for source block |
| Edit (source) | Navigate to source note at block |

### Implementation Plan

#### Day 3: Transclusion Extension Core

**File: `src/editor/transclusionExtension.ts`** (new)
```typescript
import {
  EditorView,
  Decoration,
  DecorationSet,
  WidgetType,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';
import { StateField, StateEffect, Range } from '@codemirror/state';
import { parseLinks, ParsedLink } from '@/graph/linkParser';

// Effect to update transclusion content
export const updateTransclusionContent = StateEffect.define<{
  embedId: string;
  content: string;
}>();

// Widget that renders transcluded content using safe DOM methods
class TransclusionWidget extends WidgetType {
  constructor(
    private embed: ParsedLink,
    private content: string | null,
    private loading: boolean,
    private error: string | null,
    private onEdit: () => void,
    private onJump: () => void
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-transclusion';

    if (this.loading) {
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'cm-transclusion-loading';
      const loadingSpan = document.createElement('span');
      loadingSpan.className = 'animate-pulse';
      loadingSpan.textContent = 'Loading embed...';
      loadingDiv.appendChild(loadingSpan);
      wrapper.appendChild(loadingDiv);
      return wrapper;
    }

    if (this.error) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'cm-transclusion-error';
      const errorSpan = document.createElement('span');
      errorSpan.textContent = '[!] ' + this.error;
      errorDiv.appendChild(errorSpan);
      wrapper.appendChild(errorDiv);
      return wrapper;
    }

    if (this.content) {
      const contentDiv = document.createElement('div');
      contentDiv.className = 'cm-transclusion-content';

      const bodyDiv = document.createElement('div');
      bodyDiv.className = 'cm-transclusion-body';
      // Use textContent for safety - render as preformatted text
      // For rich rendering, use a markdown-to-DOM library like marked + DOMPurify
      const pre = document.createElement('pre');
      pre.className = 'cm-transclusion-text';
      pre.textContent = this.content;
      bodyDiv.appendChild(pre);
      contentDiv.appendChild(bodyDiv);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'cm-transclusion-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'cm-transclusion-edit';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onEdit();
      });

      const jumpBtn = document.createElement('button');
      jumpBtn.className = 'cm-transclusion-jump';
      jumpBtn.textContent = 'Jump to source';
      jumpBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onJump();
      });

      actionsDiv.appendChild(editBtn);
      actionsDiv.appendChild(jumpBtn);
      contentDiv.appendChild(actionsDiv);
      wrapper.appendChild(contentDiv);
    }

    return wrapper;
  }

  eq(other: TransclusionWidget): boolean {
    return (
      this.embed.raw === other.embed.raw &&
      this.content === other.content &&
      this.loading === other.loading &&
      this.error === other.error
    );
  }

  ignoreEvent(): boolean {
    return false;
  }
}

// State for tracking transclusion content
interface TransclusionState {
  embeds: Map<string, {
    link: ParsedLink;
    content: string | null;
    loading: boolean;
    error: string | null;
  }>;
}

const transclusionState = StateField.define<TransclusionState>({
  create() {
    return { embeds: new Map() };
  },
  update(state, tr) {
    // Handle content updates
    for (const effect of tr.effects) {
      if (effect.is(updateTransclusionContent)) {
        const newEmbeds = new Map(state.embeds);
        const existing = newEmbeds.get(effect.value.embedId);
        if (existing) {
          newEmbeds.set(effect.value.embedId, {
            ...existing,
            content: effect.value.content,
            loading: false,
            error: null,
          });
        }
        return { embeds: newEmbeds };
      }
    }
    return state;
  },
});

// Decoration builder
function buildDecorations(
  view: EditorView,
  state: TransclusionState,
  onEdit: (link: ParsedLink) => void,
  onJump: (link: ParsedLink) => void
): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = view.state.doc.toString();
  const embeds = parseLinks(doc).filter((link) => link.type === 'embed');

  for (const embed of embeds) {
    const embedId = embed.target + '#' + (embed.blockId ?? 'full');
    const embedState = state.embeds.get(embedId);

    // Hide the ![[...]] syntax
    decorations.push(
      Decoration.replace({
        widget: new TransclusionWidget(
          embed,
          embedState?.content ?? null,
          embedState?.loading ?? true,
          embedState?.error ?? null,
          () => onEdit(embed),
          () => onJump(embed)
        ),
      }).range(embed.position.start, embed.position.end)
    );
  }

  return Decoration.set(decorations, true);
}

// Plugin that manages transclusion
export function transclusionExtension(config: {
  resolveEmbed: (target: string, blockId: string | null) => Promise<string>;
  onEdit: (target: string, blockId: string | null) => void;
  onJump: (target: string, blockId: string | null) => void;
}) {
  return [
    transclusionState,
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
          this.decorations = this.buildDecos(view);
          this.loadEmbeds(view);
        }

        update(update: ViewUpdate) {
          if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecos(update.view);
            this.loadEmbeds(update.view);
          }
        }

        buildDecos(view: EditorView): DecorationSet {
          const state = view.state.field(transclusionState);
          return buildDecorations(
            view,
            state,
            (link) => config.onEdit(link.target, link.blockId),
            (link) => config.onJump(link.target, link.blockId)
          );
        }

        async loadEmbeds(view: EditorView) {
          const doc = view.state.doc.toString();
          const embeds = parseLinks(doc).filter((l) => l.type === 'embed');
          const state = view.state.field(transclusionState);

          for (const embed of embeds) {
            const embedId = embed.target + '#' + (embed.blockId ?? 'full');
            if (!state.embeds.has(embedId)) {
              // Mark as loading
              state.embeds.set(embedId, {
                link: embed,
                content: null,
                loading: true,
                error: null,
              });

              try {
                const content = await config.resolveEmbed(
                  embed.target,
                  embed.blockId
                );
                view.dispatch({
                  effects: updateTransclusionContent.of({ embedId, content }),
                });
              } catch (err) {
                state.embeds.set(embedId, {
                  link: embed,
                  content: null,
                  loading: false,
                  error: err instanceof Error ? err.message : 'Failed to load',
                });
              }
            }
          }
        }
      },
      {
        decorations: (v) => v.decorations,
      }
    ),
  ];
}
```

**File: `src/editor/transclusion.css`** (new)
```css
.cm-transclusion {
  display: block;
  margin: 8px 0;
  padding: 12px;
  border-radius: 6px;
  background: var(--bg-muted);
  border: 1px solid var(--border-subtle);
}

.cm-transclusion-loading {
  color: var(--text-muted);
  font-size: 13px;
}

.cm-transclusion-error {
  color: var(--text-warning);
  font-size: 13px;
}

.cm-transclusion-content {
  position: relative;
}

.cm-transclusion-body {
  font-size: 14px;
  line-height: 1.5;
}

.cm-transclusion-text {
  margin: 0;
  padding: 0;
  font-family: inherit;
  white-space: pre-wrap;
  word-wrap: break-word;
  background: transparent;
}

.cm-transclusion-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
  opacity: 0;
  transition: opacity 0.15s;
}

.cm-transclusion:hover .cm-transclusion-actions {
  opacity: 1;
}

.cm-transclusion-edit,
.cm-transclusion-jump {
  padding: 4px 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.cm-transclusion-edit:hover,
.cm-transclusion-jump:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
```

#### Day 4: Embed Resolution & Integration

**File: `src/hooks/useTransclusionResolver.ts`** (new)
```typescript
import { useCallback } from 'react';
import { useVaultMetadataCrdt } from './useVaultMetadataCrdt';
import { invoke } from '@tauri-apps/api/core';
import {
  findNoteIdByRelPath,
  getBlockFromNote,
} from '@/crdt/vaultMetadataDoc';

export function useTransclusionResolver(vaultPath: string | null) {
  const { doc } = useVaultMetadataCrdt();

  const resolveEmbed = useCallback(
    async (target: string, blockId: string | null): Promise<string> => {
      if (!doc || !vaultPath) {
        throw new Error('Vault not loaded');
      }

      // Resolve target to note ID and path
      const targetPath = target.endsWith('.md') ? target : target + '.md';
      const noteId = findNoteIdByRelPath(doc, targetPath);

      if (!noteId) {
        throw new Error('Note not found: ' + target);
      }

      const note = doc.notes[noteId];
      if (!note) {
        throw new Error('Note not found: ' + target);
      }

      // Read file content
      const fullPath = vaultPath + '/' + note.rel_path;
      const content = await invoke<string>('read_text_file', { path: fullPath });

      if (!blockId) {
        // Return full note content (maybe truncate for safety)
        return content.slice(0, 5000); // Max 5000 chars for embeds
      }

      // Find specific block
      const blockInfo = getBlockFromNote({ doc, noteId, blockId });
      if (!blockInfo) {
        throw new Error('Block not found: #' + blockId);
      }

      // Extract block content from file
      const lines = content.split('\n');
      const blockLines = lines.slice(blockInfo.lineStart, blockInfo.lineEnd + 1);
      return blockLines.join('\n');
    },
    [doc, vaultPath]
  );

  const jumpToSource = useCallback(
    (target: string, blockId: string | null) => {
      // Dispatch navigation event
      window.dispatchEvent(
        new CustomEvent('mutter:navigate', {
          detail: { target, blockId },
        })
      );
    },
    []
  );

  const editInPlace = useCallback(
    (target: string, blockId: string | null) => {
      // Dispatch edit-in-place event
      window.dispatchEvent(
        new CustomEvent('mutter:edit-embed', {
          detail: { target, blockId },
        })
      );
    },
    []
  );

  return { resolveEmbed, jumpToSource, editInPlace };
}
```

**Modify: `src/components/Editor.tsx`**
```typescript
// Add to imports
import { transclusionExtension } from '@/editor/transclusionExtension';
import { useTransclusionResolver } from '@/hooks/useTransclusionResolver';
import '@/editor/transclusion.css';

// Inside Editor component:
const { resolveEmbed, jumpToSource, editInPlace } = useTransclusionResolver(vaultPath);

// Add to CodeMirror extensions array:
const extensions = useMemo(() => [
  // ... existing extensions
  transclusionExtension({
    resolveEmbed,
    onEdit: editInPlace,
    onJump: jumpToSource,
  }),
], [resolveEmbed, editInPlace, jumpToSource]);
```

### Voice Commands for Transclusion

**Add to `src/voice/commands/linking.ts`:**
```typescript
{
  id: 'insert-embed',
  name: 'Embed note',
  examples: [
    'embed note',
    'insert embed',
    'transclude note',
    'embed block from',
  ],
  bucket: 'link-reference',
  requiresSelection: false,
  requiresNote: true,
  allowedLocations: ['paragraph', 'empty'],
  allowedViewModes: ['editor', 'split'],
  allowedVoicePhases: ['listening', 'command-recognized'],
  destructiveness: 'none',
  scope: 'block',
  reversible: true,
  action: () => {
    window.dispatchEvent(
      new CustomEvent('mutter:execute-command', {
        detail: { command: 'insert-embed' },
      })
    );
  },
},
```

### Testing Checklist

- [ ] `![[Note Name]]` renders note content inline
- [ ] `![[Note Name#blockId]]` renders specific block
- [ ] Embed syntax hidden when not editing
- [ ] Edit button opens inline editor
- [ ] Jump button navigates to source
- [ ] Embeds update when source content changes
- [ ] Non-existent embeds show error message
- [ ] Large embeds are truncated

---

## Day 5: AI Voice Queries

### Problem Statement

Enable natural language queries against the vault:
- "Summarize my notes on project X"
- "What did I write about performance optimization?"
- "Find notes related to this topic"

This requires:
1. Semantic search using embeddings
2. LLM summarization of results
3. Voice input to search to summarize to voice/text output

### Existing Infrastructure

**Already in place:**
- `src/lib/embedding-api.ts`: `getEmbedding()`, `getBatchEmbeddings()`, `cosineSimilarity()`, `findMostSimilar()`
- `src/services/llm-formatter.ts`: `formatWithLLM()` with Claude/OpenAI/Ollama support
- `src/hooks/useEmbeddings.ts`: Hook for embedding operations
- Graph indexing with backlinks

### Design Decisions

#### Query Flow

```
User: "Summarize notes about voice commands"
         |
         v
+-------------------------------------+
| 1. Extract query embedding          |
|    getEmbedding("voice commands")   |
+-------------------------------------+
         |
         v
+-------------------------------------+
| 2. Search vault embeddings          |
|    findMostSimilar(queryEmb, vault) |
|    -> Top 5 relevant notes          |
+-------------------------------------+
         |
         v
+-------------------------------------+
| 3. Build context from matched notes |
|    Read content of top matches      |
+-------------------------------------+
         |
         v
+-------------------------------------+
| 4. LLM summarization                |
|    formatWithLLM(context + query)   |
|    -> Synthesized answer            |
+-------------------------------------+
         |
         v
+-------------------------------------+
| 5. Display/Speak result             |
|    Show in panel + optional TTS     |
+-------------------------------------+
```

### Implementation Plan

**File: `src/services/ai-query.ts`** (new)
```typescript
import { getEmbedding, cosineSimilarity } from '@/lib/embedding-api';
import { formatWithLLM, LLMSettings } from './llm-formatter';
import { VaultMetadataDoc, VaultNote } from '@/crdt/vaultMetadataDoc';
import { invoke } from '@tauri-apps/api/core';

export interface QueryResult {
  answer: string;
  sources: Array<{
    note: VaultNote;
    relevance: number;
    excerpt: string;
  }>;
  processingTime: number;
}

export interface NoteEmbedding {
  noteId: string;
  embedding: number[];
  contentHash: string; // To detect if re-embedding needed
}

// In-memory cache of note embeddings
let embeddingCache: Map<string, NoteEmbedding> = new Map();

/**
 * Build or update embeddings for all notes in the vault
 */
export async function buildVaultEmbeddings(params: {
  doc: VaultMetadataDoc;
  vaultPath: string;
  onProgress?: (current: number, total: number) => void;
}): Promise<void> {
  const notes = Object.values(params.doc.notes);

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    params.onProgress?.(i + 1, notes.length);

    try {
      // Read note content
      const fullPath = params.vaultPath + '/' + note.rel_path;
      const content = await invoke<string>('read_text_file', { path: fullPath });

      // Simple content hash
      const contentHash = hashString(content);

      // Check if we have a valid cached embedding
      const cached = embeddingCache.get(note.id);
      if (cached && cached.contentHash === contentHash) {
        continue; // Already up to date
      }

      // Generate embedding for note content
      // Use title + first 500 chars for embedding (balance relevance vs cost)
      const textForEmbedding = note.title + '\n\n' + content.slice(0, 500);
      const embedding = await getEmbedding(textForEmbedding);

      embeddingCache.set(note.id, {
        noteId: note.id,
        embedding,
        contentHash,
      });
    } catch (err) {
      console.warn('[AI Query] Failed to embed ' + note.rel_path + ':', err);
    }
  }
}

/**
 * Find notes most relevant to a query
 */
export async function searchVault(params: {
  query: string;
  doc: VaultMetadataDoc;
  vaultPath: string;
  topK?: number;
}): Promise<Array<{ note: VaultNote; similarity: number }>> {
  const { query, doc, topK = 5 } = params;

  // Get query embedding
  const queryEmbedding = await getEmbedding(query);

  // Score all notes
  const scored: Array<{ noteId: string; similarity: number }> = [];

  for (const [noteId, cached] of embeddingCache) {
    const similarity = cosineSimilarity(queryEmbedding, cached.embedding);
    scored.push({ noteId, similarity });
  }

  // Sort by similarity and take top K
  scored.sort((a, b) => b.similarity - a.similarity);
  const topResults = scored.slice(0, topK);

  // Map back to notes
  return topResults
    .map(({ noteId, similarity }) => ({
      note: doc.notes[noteId],
      similarity,
    }))
    .filter((r) => r.note !== undefined);
}

/**
 * Query the vault with natural language and get a summarized answer
 */
export async function queryVault(params: {
  query: string;
  doc: VaultMetadataDoc;
  vaultPath: string;
  llmSettings: LLMSettings;
  topK?: number;
}): Promise<QueryResult> {
  const startTime = Date.now();
  const { query, doc, vaultPath, llmSettings, topK = 5 } = params;

  // 1. Search for relevant notes
  const searchResults = await searchVault({ query, doc, vaultPath, topK });

  if (searchResults.length === 0) {
    return {
      answer: "I couldn't find any notes related to your query.",
      sources: [],
      processingTime: Date.now() - startTime,
    };
  }

  // 2. Build context from top matches
  const contextParts: string[] = [];
  const sources: QueryResult['sources'] = [];

  for (const { note, similarity } of searchResults) {
    try {
      const fullPath = vaultPath + '/' + note.rel_path;
      const content = await invoke<string>('read_text_file', { path: fullPath });

      // Take first 1000 chars as excerpt
      const excerpt = content.slice(0, 1000);

      contextParts.push('## ' + note.title + '\n' + excerpt);
      sources.push({
        note,
        relevance: similarity,
        excerpt: excerpt.slice(0, 200) + '...',
      });
    } catch (err) {
      console.warn('[AI Query] Failed to read ' + note.rel_path + ':', err);
    }
  }

  const context = contextParts.join('\n\n---\n\n');

  // 3. Ask LLM to synthesize an answer
  const prompt = buildQueryPrompt(query, context);

  const answer = await formatWithLLM({
    rawTranscription: prompt,
    surroundingText: '',
    cursorPosition: 0,
    documentStats: { wordCount: 0, charCount: 0 },
    settings: llmSettings,
  });

  return {
    answer,
    sources,
    processingTime: Date.now() - startTime,
  };
}

function buildQueryPrompt(query: string, context: string): string {
  return 'You are a helpful assistant with access to the user\'s notes.\n' +
    'Based on the following notes from their vault, answer their question.\n' +
    'Be concise but thorough. Reference specific notes when relevant.\n\n' +
    'USER\'S NOTES:\n' + context + '\n\n' +
    'USER\'S QUESTION:\n' + query + '\n\n' +
    'Provide a helpful, synthesized answer based on the notes above:';
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}
```

**File: `src/hooks/useAIQuery.ts`** (new)
```typescript
import { useState, useCallback } from 'react';
import { useVaultMetadataCrdt } from './useVaultMetadataCrdt';
import { queryVault, buildVaultEmbeddings, QueryResult } from '@/services/ai-query';
import { LLMSettings } from '@/services/llm-formatter';

export function useAIQuery(vaultPath: string | null, llmSettings: LLMSettings) {
  const { doc } = useVaultMetadataCrdt();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [indexProgress, setIndexProgress] = useState<{ current: number; total: number } | null>(null);

  const buildIndex = useCallback(async () => {
    if (!doc || !vaultPath) return;

    setLoading(true);
    setError(null);

    try {
      await buildVaultEmbeddings({
        doc,
        vaultPath,
        onProgress: (current, total) => {
          setIndexProgress({ current, total });
        },
      });
      setIndexProgress(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build index');
    } finally {
      setLoading(false);
    }
  }, [doc, vaultPath]);

  const query = useCallback(async (queryText: string) => {
    if (!doc || !vaultPath) {
      setError('Vault not loaded');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const queryResult = await queryVault({
        query: queryText,
        doc,
        vaultPath,
        llmSettings,
      });
      setResult(queryResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setLoading(false);
    }
  }, [doc, vaultPath, llmSettings]);

  return {
    query,
    buildIndex,
    loading,
    result,
    error,
    indexProgress,
  };
}
```

**File: `src/components/AIQueryPanel.tsx`** (new)
```typescript
import { useState } from 'react';
import { useAIQuery } from '@/hooks/useAIQuery';
import { LLMSettings } from '@/services/llm-formatter';

interface AIQueryPanelProps {
  vaultPath: string | null;
  llmSettings: LLMSettings;
  onNavigate: (relPath: string) => void;
}

export function AIQueryPanel({ vaultPath, llmSettings, onNavigate }: AIQueryPanelProps) {
  const { query, buildIndex, loading, result, error, indexProgress } = useAIQuery(
    vaultPath,
    llmSettings
  );
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      query(input.trim());
    }
  };

  return (
    <div className="ai-query-panel p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">AI Query</h3>
        <button
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={buildIndex}
          disabled={loading}
        >
          {indexProgress
            ? 'Indexing ' + indexProgress.current + '/' + indexProgress.total + '...'
            : 'Rebuild Index'}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your notes..."
          className="w-full px-3 py-2 border rounded text-sm"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="w-full px-3 py-2 bg-accent text-accent-foreground rounded text-sm
                     disabled:opacity-50"
        >
          {loading ? 'Thinking...' : 'Ask'}
        </button>
      </form>

      {error && (
        <div className="p-3 bg-destructive/10 text-destructive text-sm rounded">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="p-3 bg-muted rounded">
            <p className="text-sm whitespace-pre-wrap">{result.answer}</p>
            <p className="text-xs text-muted-foreground mt-2">
              {result.processingTime}ms
            </p>
          </div>

          {result.sources.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">
                Sources
              </h4>
              <ul className="space-y-1">
                {result.sources.map((source) => (
                  <li key={source.note.id}>
                    <button
                      className="text-left text-sm text-accent hover:underline"
                      onClick={() => onNavigate(source.note.rel_path)}
                    >
                      {source.note.title}
                      <span className="text-xs text-muted-foreground ml-2">
                        {Math.round(source.relevance * 100)}%
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### Voice Commands for AI Queries

**File: `src/voice/commands/query.ts`** (new)
```typescript
import { VoiceCommand } from '@/types/voiceCommand';
import { commandRegistry } from '../commandRegistry';

const queryCommands: VoiceCommand[] = [
  {
    id: 'summarize-notes',
    name: 'Summarize notes',
    examples: [
      'summarize notes about',
      'summarize my notes on',
      'what do my notes say about',
      'summarize notes related to',
    ],
    bucket: 'query-ai',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: ['paragraph', 'heading', 'list', 'blockquote', 'empty'],
    allowedViewModes: ['editor', 'split', 'preview'],
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'none',
    scope: 'vault',
    reversible: false,
    action: () => {
      window.dispatchEvent(
        new CustomEvent('mutter:execute-command', {
          detail: { command: 'ai-query', mode: 'summarize' },
        })
      );
    },
  },
  {
    id: 'find-related-notes',
    name: 'Find related notes',
    examples: [
      'find notes about',
      'search notes for',
      'find related notes',
      'what notes mention',
    ],
    bucket: 'query-ai',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: ['paragraph', 'heading', 'list', 'blockquote', 'empty'],
    allowedViewModes: ['editor', 'split', 'preview'],
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'none',
    scope: 'vault',
    reversible: false,
    action: () => {
      window.dispatchEvent(
        new CustomEvent('mutter:execute-command', {
          detail: { command: 'ai-query', mode: 'search' },
        })
      );
    },
  },
  {
    id: 'ask-vault',
    name: 'Ask about notes',
    examples: [
      'ask my notes',
      'question about notes',
      'what do i know about',
      'help me remember',
    ],
    bucket: 'query-ai',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: ['paragraph', 'heading', 'list', 'blockquote', 'empty'],
    allowedViewModes: ['editor', 'split', 'preview'],
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'none',
    scope: 'vault',
    reversible: false,
    action: () => {
      window.dispatchEvent(
        new CustomEvent('mutter:execute-command', {
          detail: { command: 'ai-query', mode: 'ask' },
        })
      );
    },
  },
];

export function registerQueryCommands(): void {
  queryCommands.forEach((cmd) => commandRegistry.register(cmd));
}
```

### Testing Checklist

- [ ] Vault embeddings build on startup (with progress indicator)
- [ ] `searchVault()` returns relevant notes
- [ ] `queryVault()` returns synthesized answer with sources
- [ ] AI Query panel accepts text input
- [ ] Voice command "summarize notes about X" works
- [ ] Clicking source note navigates to it
- [ ] Error handling for missing API keys
- [ ] Performance acceptable (< 5s for query on typical vault)

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/BacklinksPanel.tsx` | Backlinks UI (gap closure) |
| `src/types/supertag.ts` | Supertag type re-exports |
| `src/hooks/useSupertagDefinitions.ts` | Hook for supertag templates |
| `src/hooks/useNoteSuperTags.ts` | Hook for note's applied supertags |
| `src/components/supertags/SupertagBadge.tsx` | Tag badge component |
| `src/components/supertags/SupertagFieldEditor.tsx` | Field value editor |
| `src/components/supertags/NoteSuperTags.tsx` | Note header supertags |
| `src/components/dialogs/supertag-creator-dialog.tsx` | Create template dialog |
| `src/components/dialogs/supertag-apply-dialog.tsx` | Apply supertag dialog |
| `src/voice/commands/supertags.ts` | Supertag voice commands |
| `src/editor/transclusionExtension.ts` | CodeMirror embed rendering |
| `src/editor/transclusion.css` | Transclusion styles |
| `src/hooks/useTransclusionResolver.ts` | Embed content resolution |
| `src/services/ai-query.ts` | Semantic search + LLM query |
| `src/hooks/useAIQuery.ts` | AI query React hook |
| `src/components/AIQueryPanel.tsx` | AI query UI panel |
| `src/voice/commands/query.ts` | AI query voice commands |

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/Editor.tsx` | Add transclusion extension, wire command listener |
| `src/voice/commands/index.ts` | Register supertag and query commands |
| `src/voice/commands/linking.ts` | Add embed insertion command |
| `src/App.tsx` | Add BacklinksPanel, AIQueryPanel integration |

---

## End of Week 3 Verification

### Supertags
```typescript
// In DevTools console:
// 1. Create a supertag template
window.__MUTTER_DEBUG__.createSupertag({
  name: 'project',
  fields: [
    { name: 'status', type: 'select', options: ['active', 'paused', 'done'] },
    { name: 'due', type: 'date' },
  ],
});

// 2. Apply to current note
// 3. Verify badge appears in note header
// 4. Query: findNotesBySupertag('project')
```

### Transclusion
```markdown
1. Create "Source Note" with content and block ID:
   Some important content. ^abc123

2. In another note, add embed:
   ![[Source Note#abc123]]

3. Verify:
   - Content renders inline
   - Edit button appears on hover
   - Jump button navigates to source
```

### AI Queries
```
1. Ensure LLM API key configured (Settings -> Stream Mode)
2. Click "Rebuild Index" in AI Query panel
3. Wait for indexing to complete
4. Ask: "Summarize my notes about [topic that exists]"
5. Verify:
   - Answer is synthesized from multiple notes
   - Sources are listed with relevance scores
   - Clicking source navigates to note
```

### Voice Commands
```
1. Enable voice mode
2. Say: "Tag this as project"
   -> Verify supertag dialog opens

3. Say: "Summarize notes about voice commands"
   -> Verify AI query executes

4. Say: "Embed note [note name]"
   -> Verify embed syntax inserted
```

---

## Architecture Diagram

```
+--------------------------------------------------------------------------+
|                              WEEK 3 FEATURES                              |
+--------------------------------------------------------------------------+
|                                                                           |
|  +-----------------+   +-----------------+   +-------------------------+ |
|  |   SUPERTAGS     |   |  TRANSCLUSION   |   |     AI VOICE QUERIES    | |
|  +-----------------+   +-----------------+   +-------------------------+ |
|  |                 |   |                 |   |                         | |
|  | +-------------+ |   | +-------------+ |   | +---------------------+ | |
|  | | Creator     | |   | | Extension   | |   | | Voice Command       | | |
|  | | Dialog      | |   | | (CM6)       | |   | | "Summarize notes"   | | |
|  | +------+------+ |   | +------+------+ |   | +----------+----------+ | |
|  |        |        |   |        |        |   |            |            | |
|  |        v        |   |        v        |   |            v            | |
|  | +-------------+ |   | +-------------+ |   | +---------------------+ | |
|  | | useSuperTag | |   | | useTranscl. | |   | | getEmbedding()      | | |
|  | | Definitions | |   | | Resolver    | |   | | searchVault()       | | |
|  | +------+------+ |   | +------+------+ |   | +----------+----------+ | |
|  |        |        |   |        |        |   |            |            | |
|  |        v        |   |        v        |   |            v            | |
|  | +-------------+ |   | +-------------+ |   | +---------------------+ | |
|  | | CRDT        | |   | | Link Parser | |   | | formatWithLLM()     | | |
|  | | supertag_   | |   | | parseLinks  | |   | | Claude/OpenAI/      | | |
|  | | definitions | |   | | type:embed  | |   | | Ollama              | | |
|  | +-------------+ |   | +-------------+ |   | +---------------------+ | |
|  |                 |   |                 |   |                         | |
|  +-----------------+   +-----------------+   +-------------------------+ |
|                                                                           |
|  <-------------- Built on Week 1-2 Foundation --------------------------> |
|                                                                           |
|   Block IDs | Context Signals | CRDT Schema v3 | Command Ranking | Graph |
|                                                                           |
+--------------------------------------------------------------------------+
```

---

## Design Decisions (Resolved)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Supertag storage** | Array of instances per note | Allows multiple supertags on one note |
| **Transclusion rendering** | Replace decoration | Hide syntax, show content inline |
| **Embed truncation** | 5000 char limit | Prevent huge embeds breaking editor |
| **AI embedding scope** | Title + first 500 chars | Balance relevance vs. embedding cost |
| **AI query top-K** | 5 notes | Enough context without overwhelming LLM |
| **Embedding cache** | In-memory with content hash | Fast lookups, invalidate on change |
| **DOM construction** | Safe DOM methods | Avoid XSS via innerHTML |

---

## Risk Assessment

| Feature | Risk | Mitigation |
|---------|------|------------|
| **Supertag UI** | Low | CRDT layer complete, just UI work |
| **Transclusion** | Medium | CodeMirror decoration complexity; test with nested embeds |
| **AI Queries** | Medium | Depends on external LLM API; handle rate limits/errors gracefully |
| **Embedding build time** | Low | Run async with progress; cache aggressively |

---

## Dependencies on Weeks 1-2

| Week 3 Feature | Depends On |
|----------------|------------|
| Supertag UI | `SupertagDefinition`, `SupertagInstance` types, CRDT functions |
| Supertag Voice | Command registry, `useCommandRanking` |
| Transclusion | Block IDs, `parseLinks()` with embed support |
| AI Queries | `getEmbedding()`, `formatWithLLM()`, vault CRDT |
| Backlinks Panel | `getBacklinks()`, `backlink_index` |
