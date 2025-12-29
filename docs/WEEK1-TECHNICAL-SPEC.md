# Week 1 Technical Specification: Foundation Layer

**Duration:** 5 days
**Goal:** Build the foundational systems that all other features depend on

---

## Overview

Week 1 establishes three critical foundations:

| Days | Feature | Unlocks |
|------|---------|---------|
| 1-2 | Block IDs | Transclusion, granular linking, block-level context |
| 3-4 | Context Signal System | Smart command ranking, tiered UI, voice intelligence |
| 5 | Enhanced CRDT Schema | Supertags, graph indexing, backlinks |

---

## Days 1-2: Block IDs

### Problem Statement

Currently, Mutter tracks notes at the file level (`VaultNote` in `vaultMetadataDoc.ts`). To enable transclusion (`![[note#blockID]]`), granular backlinks, and block-level voice commands, we need stable IDs for individual blocks within documents.

### Design Decisions

#### ID Format
```
^[a-z0-9]{6}
```
- 6 lowercase alphanumeric characters (36^6 = 2.1 billion combinations)
- Prefix with `^` in markdown (Obsidian-compatible): `^abc123`
- Short enough to not clutter documents
- Human-typeable for manual references

#### ID Generation
```typescript
function generateBlockId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}
```

#### What Gets an ID
- Headings (H1-H6)
- Paragraphs (non-empty text blocks)
- List items (individual bullets/numbers)
- Code blocks
- Blockquotes

**NOT** assigned IDs:
- Empty lines
- Horizontal rules
- Front matter

### Storage Strategy

Block IDs live in **two places**:

1. **In the Markdown file** (source of truth for the ID itself)
   ```markdown
   # My Heading ^h1a2b3

   This is a paragraph with important content. ^p4d5e6

   - List item one ^l7g8h9
   - List item two ^li1j2k
   ```

2. **In the CRDT** (index for fast lookup)
   ```typescript
   // In VaultNote, add:
   blocks: Record<string, BlockInfo>;
   ```

### Implementation Plan

#### Day 1: Core Block ID System

**File: `src/editor/blockIds.ts`** (new)
```typescript
export interface BlockInfo {
  id: string;
  type: 'heading' | 'paragraph' | 'list-item' | 'code' | 'blockquote';
  level?: number; // For headings (1-6)
  lineStart: number;
  lineEnd: number;
  text: string; // First 100 chars for search/preview
}

export function generateBlockId(): string;
export function parseBlockId(line: string): string | null;
export function appendBlockId(line: string, id: string): string;
export function removeBlockId(line: string): string;

// Parse entire document, return blocks with their IDs
export function extractBlocks(content: string): BlockInfo[];

// Ensure all blocks have IDs, return modified content + block map
export function ensureBlockIds(content: string): {
  content: string;
  blocks: BlockInfo[];
  modified: boolean;
};
```

**File: `src/editor/blockIdExtension.ts`** (new)
CodeMirror extension that:
- Renders `^abc123` as subtle, non-intrusive decoration
- Hides block IDs when cursor is not on that line (like existing live preview)
- Provides `getBlockAtCursor()` for context signals

```typescript
import { EditorView, Decoration, DecorationSet } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';

export const blockIdField: StateField<DecorationSet>;
export const blockIdExtension: Extension;

// Get the block ID at current cursor position
export function getBlockAtCursor(view: EditorView): BlockInfo | null;

// Get all blocks in current document
export function getAllBlocks(view: EditorView): BlockInfo[];
```

#### Day 2: Integration & CRDT Storage

**File: `src/crdt/vaultMetadataDoc.ts`** (modify)
```typescript
// Add to VaultNote type:
export type VaultNote = {
  // ... existing fields ...
  blocks: Record<string, BlockInfo>; // blockId -> BlockInfo
  block_order: string[]; // Ordered list of block IDs
};

// Add new function:
export function updateNoteBlocks(params: {
  handle: DocHandle<VaultMetadataDoc>;
  noteId: string;
  blocks: BlockInfo[];
}): void;
```

**File: `src/components/Editor.tsx`** (modify)
- Add `blockIdExtension` to CodeMirror extensions
- On save, call `ensureBlockIds()` and `updateNoteBlocks()`
- Expose `currentBlock` state for context signals

### Testing Checklist

- [ ] New documents get block IDs on first save
- [ ] Existing documents get IDs added (non-destructive)
- [ ] Block IDs survive edit operations
- [ ] Block IDs are visually subtle (like existing markdown syntax hiding)
- [ ] `getBlockAtCursor()` returns correct block
- [ ] CRDT stores block metadata correctly
- [ ] Block IDs are Obsidian-compatible (`^abc123` format)

---

## Days 3-4: Context Signal System

### Problem Statement

The voice command system currently treats all commands equally. From `voice-mode-editor-context.md`, we need to surface only commands that are "both possible and probable right now" based on editor state.

### Context Signals

```typescript
// File: src/types/editorContext.ts (new)

export type CursorState =
  | { type: 'no-selection' }
  | { type: 'inline-selection'; text: string; length: number }
  | { type: 'block-selection'; blockCount: number; blockIds: string[] }
  | { type: 'multi-block'; blockCount: number };

export type CursorLocation =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'task'
  | 'code-block'
  | 'blockquote'
  | 'empty';

export type VoicePhase =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'command-recognized'
  | 'command-ambiguous'
  | 'awaiting-confirmation'
  | 'executed'
  | 'undo-window';

export type ViewMode =
  | 'editor'
  | 'preview'
  | 'split'
  | 'graph'
  | 'canvas';

export interface EditorContext {
  // Cursor/Selection (highest weight for ranking)
  cursor: CursorState;
  cursorLocation: CursorLocation;
  currentBlockId: string | null;

  // Voice session state
  voicePhase: VoicePhase;

  // Recent intent (last 3 actions)
  recentIntents: IntentBucket[];

  // Document/View mode
  viewMode: ViewMode;

  // Document metadata
  noteId: string | null;
  notePath: string | null;
  hasUnsavedChanges: boolean;
}

export type IntentBucket =
  | 'edit-selection'
  | 'format-text'
  | 'structure-document'
  | 'navigate'
  | 'link-reference'
  | 'query-ai'
  | 'meta'; // undo, help, cancel
```

### Implementation Plan

#### Day 3: Context Provider & Signals

**File: `src/context/EditorContextProvider.tsx`** (new)
```typescript
import { createContext, useContext, useState, useCallback } from 'react';
import { EditorContext, VoicePhase, IntentBucket } from '@/types/editorContext';

const EditorContextContext = createContext<{
  context: EditorContext;
  updateCursor: (state: CursorState, location: CursorLocation, blockId: string | null) => void;
  setVoicePhase: (phase: VoicePhase) => void;
  recordIntent: (intent: IntentBucket) => void;
  setViewMode: (mode: ViewMode) => void;
} | null>(null);

export function EditorContextProvider({ children }: { children: React.ReactNode }) {
  const [context, setContext] = useState<EditorContext>(defaultContext);

  const updateCursor = useCallback((state, location, blockId) => {
    setContext(prev => ({
      ...prev,
      cursor: state,
      cursorLocation: location,
      currentBlockId: blockId,
    }));
  }, []);

  const recordIntent = useCallback((intent: IntentBucket) => {
    setContext(prev => ({
      ...prev,
      recentIntents: [intent, ...prev.recentIntents].slice(0, 3),
    }));
  }, []);

  // ... other updaters

  return (
    <EditorContextContext.Provider value={{ context, updateCursor, setVoicePhase, recordIntent, setViewMode }}>
      {children}
    </EditorContextContext.Provider>
  );
}

export function useEditorContext() {
  const ctx = useContext(EditorContextContext);
  if (!ctx) throw new Error('useEditorContext must be used within EditorContextProvider');
  return ctx;
}
```

**File: `src/hooks/useEditorContextSync.ts`** (new)
Hook that syncs CodeMirror state to context:
```typescript
import { EditorView } from '@codemirror/view';
import { useEditorContext } from '@/context/EditorContextProvider';
import { getBlockAtCursor } from '@/editor/blockIdExtension';

export function useEditorContextSync(view: EditorView | null) {
  const { updateCursor } = useEditorContext();

  useEffect(() => {
    if (!view) return;

    const update = () => {
      const selection = view.state.selection.main;
      const block = getBlockAtCursor(view);

      // Determine cursor state
      let cursorState: CursorState;
      if (selection.empty) {
        cursorState = { type: 'no-selection' };
      } else {
        const text = view.state.sliceDoc(selection.from, selection.to);
        cursorState = { type: 'inline-selection', text, length: text.length };
      }

      // Determine cursor location
      const location = detectCursorLocation(view, selection.from);

      updateCursor(cursorState, location, block?.id ?? null);
    };

    // Subscribe to selection changes
    const listener = EditorView.updateListener.of((update) => {
      if (update.selectionSet || update.docChanged) {
        update();
      }
    });

    // Initial sync
    update();
  }, [view, updateCursor]);
}
```

#### Day 4: Voice Phase State Machine & Integration

**File: `src/hooks/useVoicePhase.ts`** (new)
```typescript
import { useEditorContext } from '@/context/EditorContextProvider';

export function useVoicePhase() {
  const { context, setVoicePhase } = useEditorContext();

  const startListening = () => setVoicePhase('listening');
  const startProcessing = () => setVoicePhase('processing');
  const commandRecognized = () => setVoicePhase('command-recognized');
  const commandAmbiguous = () => setVoicePhase('command-ambiguous');
  const awaitConfirmation = () => setVoicePhase('awaiting-confirmation');
  const commandExecuted = () => {
    setVoicePhase('executed');
    // Auto-transition to undo window after brief delay
    setTimeout(() => setVoicePhase('undo-window'), 500);
    // Clear undo window after 5 seconds
    setTimeout(() => setVoicePhase('idle'), 5500);
  };
  const reset = () => setVoicePhase('idle');

  return {
    phase: context.voicePhase,
    startListening,
    startProcessing,
    commandRecognized,
    commandAmbiguous,
    awaitConfirmation,
    commandExecuted,
    reset,
  };
}
```

**Modify: `src/App.tsx`**
- Wrap app in `<EditorContextProvider>`
- Pass context to voice components

**Modify: `src/components/Editor.tsx`**
- Use `useEditorContextSync(view)`
- Call `recordIntent()` after command execution

### Testing Checklist

- [ ] Context updates when cursor moves
- [ ] Context updates when selection changes
- [ ] Voice phase transitions correctly through states
- [ ] Recent intents tracked (max 3)
- [ ] Context accessible from any component via hook
- [ ] No performance degradation from context updates

---

## Day 5: Enhanced CRDT Schema

### Problem Statement

Current `VaultMetadataDoc` only tracks note-level metadata. We need:
1. Block-level data (from Days 1-2)
2. Supertag definitions (typed templates)
3. Graph edges (for backlinks)

### Schema Extensions

**File: `src/crdt/vaultMetadataDoc.ts`** (modify)

```typescript
export const VAULT_METADATA_SCHEMA_VERSION = 2 as const; // Bump version

// NEW: Supertag definitions
export type SupertagField = {
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multi-select' | 'checkbox';
  options?: string[]; // For select/multi-select
  default?: string | number | boolean;
};

export type SupertagDefinition = {
  id: string;
  name: string; // e.g., "project", "meeting", "person"
  icon?: string; // Emoji or icon name
  fields: SupertagField[];
  created_at: number;
  updated_at: number;
};

// NEW: Applied supertag instance
export type SupertagInstance = {
  definitionId: string;
  values: Record<string, string | number | boolean | string[]>;
};

// NEW: Graph edge for explicit links
export type GraphEdge = {
  id: string;
  sourceNoteId: string;
  sourceBlockId: string | null; // null = note-level link
  targetNoteId: string;
  targetBlockId: string | null;
  type: 'wiki-link' | 'embed' | 'reference';
  created_at: number;
};

// EXTENDED: VaultNote
export type VaultNote = {
  id: string;
  rel_path: string;
  title: string;
  tags: string[];
  links: string[]; // Keep for backwards compat
  created_at: number;
  updated_at: number;
  last_opened_at: number | null;

  // NEW in v2
  blocks: Record<string, BlockInfo>;
  block_order: string[];
  supertags: SupertagInstance[];
};

// EXTENDED: VaultMetadataDoc
export type VaultMetadataDoc = {
  schema_version: typeof VAULT_METADATA_SCHEMA_VERSION;
  meta: {
    created_at: number;
    vault_id: string;
  };
  notes: Record<string, VaultNote>;
  note_id_by_path: Record<string, string>;

  // NEW in v2
  supertag_definitions: Record<string, SupertagDefinition>;
  graph_edges: Record<string, GraphEdge>;
  backlink_index: Record<string, string[]>; // targetNoteId → edgeIds (bidirectional lookup)
};
```

### Migration Strategy

```typescript
// File: src/crdt/migrations.ts (new)

export function migrateVaultMetadataDoc(doc: any): void {
  const currentVersion = doc.schema_version ?? 1;

  if (currentVersion < 2) {
    // Migrate v1 -> v2
    console.log('[CRDT] Migrating vault metadata v1 -> v2');

    // Add new top-level fields
    if (!doc.supertag_definitions) doc.supertag_definitions = {};
    if (!doc.graph_edges) doc.graph_edges = {};
    if (!doc.backlink_index) doc.backlink_index = {};

    // Add new fields to existing notes
    for (const noteId of Object.keys(doc.notes ?? {})) {
      const note = doc.notes[noteId];
      if (!note.blocks) note.blocks = {};
      if (!note.block_order) note.block_order = [];
      if (!note.supertags) note.supertags = [];
    }

    doc.schema_version = 2;
  }
}

// Update ensureVaultMetadataDocShape to call migration
export function ensureVaultMetadataDocShape(doc: any, vaultId: string): void {
  migrateVaultMetadataDoc(doc);
  // ... existing shape enforcement
}
```

### New CRDT Functions

```typescript
// Supertag management
export function createSupertagDefinition(params: {
  handle: DocHandle<VaultMetadataDoc>;
  name: string;
  fields: SupertagField[];
  icon?: string;
}): string; // Returns definition ID

export function applySupertagToNote(params: {
  handle: DocHandle<VaultMetadataDoc>;
  noteId: string;
  definitionId: string;
  values: Record<string, any>;
}): void;

export function removeSupertagFromNote(params: {
  handle: DocHandle<VaultMetadataDoc>;
  noteId: string;
  definitionId: string;
}): void;

// Graph edge management (with bidirectional index maintenance)
export function addGraphEdge(params: {
  handle: DocHandle<VaultMetadataDoc>;
  sourceNoteId: string;
  sourceBlockId: string | null;
  targetNoteId: string;
  targetBlockId: string | null;
  type: 'wiki-link' | 'embed' | 'reference';
}): string {
  // Returns edge ID
  // Implementation must:
  // 1. Create edge in graph_edges
  // 2. Add edgeId to backlink_index[targetNoteId]
}

export function removeGraphEdge(params: {
  handle: DocHandle<VaultMetadataDoc>;
  edgeId: string;
}): void {
  // Implementation must:
  // 1. Look up edge to get targetNoteId
  // 2. Remove from backlink_index[targetNoteId]
  // 3. Delete from graph_edges
}

// Query helpers (fast O(1) lookup via backlink_index)
export function getBacklinks(params: {
  doc: VaultMetadataDoc;
  noteId: string;
  blockId?: string;
}): GraphEdge[] {
  // Use backlink_index for O(1) lookup instead of scanning all edges
  const edgeIds = doc.backlink_index[noteId] ?? [];
  return edgeIds
    .map(id => doc.graph_edges[id])
    .filter(edge => !blockId || edge.targetBlockId === blockId);
}

export function getOutgoingLinks(params: {
  doc: VaultMetadataDoc;
  noteId: string;
}): GraphEdge[];

export function findNotesBySupertagField(params: {
  doc: VaultMetadataDoc;
  definitionId: string;
  fieldName: string;
  value: any;
}): VaultNote[];
```

### Testing Checklist

- [ ] Schema version bumps to 2
- [ ] Migration runs on existing vaults without data loss
- [ ] Supertag definitions can be created/edited/deleted
- [ ] Supertags can be applied to notes
- [ ] Graph edges created when links parsed
- [ ] `getBacklinks()` returns correct results
- [ ] New notes get v2 schema fields by default

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/editor/blockIds.ts` | Block ID generation and parsing |
| `src/editor/blockIdExtension.ts` | CodeMirror extension for block IDs |
| `src/types/editorContext.ts` | TypeScript types for context signals |
| `src/context/EditorContextProvider.tsx` | React context for editor state |
| `src/hooks/useEditorContextSync.ts` | Sync CodeMirror → context |
| `src/hooks/useVoicePhase.ts` | Voice phase state machine |
| `src/crdt/migrations.ts` | CRDT schema migrations |

## Files to Modify

| File | Changes |
|------|---------|
| `src/crdt/vaultMetadataDoc.ts` | Add blocks, supertags, graph edges |
| `src/components/Editor.tsx` | Add block ID extension, context sync |
| `src/App.tsx` | Wrap in EditorContextProvider |
| `src/types.ts` | Export new types |

---

## End of Week 1 Verification

Run through this checklist before moving to Week 2:

### Block IDs
```bash
# Create a new note, add some content, save
# Verify: Block IDs appear in file (^abc123 format)
# Verify: IDs survive editing
# Verify: CRDT has block metadata
```

### Context Signals
```typescript
// In React DevTools, inspect EditorContextProvider
// Verify: cursor state updates on selection
// Verify: voicePhase transitions work
// Verify: recentIntents accumulates (max 3)
```

### CRDT Schema
```bash
# Open existing vault from v1
# Verify: Migration runs (check console)
# Verify: No data loss
# Verify: Can query backlinks
```

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         App.tsx                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                 EditorContextProvider                       │  │
│  │  ┌──────────────────┐  ┌─────────────────────────────────┐ │  │
│  │  │  Editor.tsx      │  │  VoiceIndicator.tsx             │ │  │
│  │  │  ┌────────────┐  │  │  ┌───────────────────────────┐  │ │  │
│  │  │  │ CodeMirror │  │  │  │ useVoicePhase()           │  │ │  │
│  │  │  │ + blockId  │  │  │  │ Reads: context.voicePhase │  │ │  │
│  │  │  │   Extension│  │  │  └───────────────────────────┘  │ │  │
│  │  │  └─────┬──────┘  │  └─────────────────────────────────┘ │  │
│  │  │        │         │                                       │  │
│  │  │  useEditorContextSync()                                  │  │
│  │  │  Updates: cursor, location, blockId                      │  │
│  │  └──────────────────┘                                       │  │
│  │                                                              │  │
│  │  EditorContext {                                             │  │
│  │    cursor: CursorState,                                      │  │
│  │    cursorLocation: 'heading' | 'paragraph' | ...,            │  │
│  │    currentBlockId: string | null,                            │  │
│  │    voicePhase: VoicePhase,                                   │  │
│  │    recentIntents: IntentBucket[],                            │  │
│  │    viewMode: ViewMode,                                       │  │
│  │  }                                                           │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                    VaultMetadataDoc (CRDT)                        │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ notes: {                                                    │  │
│  │   [noteId]: {                                               │  │
│  │     blocks: { [blockId]: BlockInfo },                       │  │
│  │     supertags: SupertagInstance[],                          │  │
│  │   }                                                         │  │
│  │ }                                                           │  │
│  │ supertag_definitions: { [id]: SupertagDefinition }          │  │
│  │ graph_edges: { [id]: GraphEdge }                            │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Design Decisions (Resolved)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Block ID visibility** | Cursor-aware hiding | IDs hidden unless cursor is on that line, matching existing live preview behavior for `**bold**`, `# headings`, etc. Consistent UX. |
| **ID collision handling** | Auto-regenerate on save | Silently regenerate duplicate IDs when file is saved, preserving the first occurrence. No user friction. |
| **Empty block handling** | No IDs for empty lines | Only meaningful content blocks get IDs. Cleaner files, fewer IDs to manage. |
| **Multi-supertag** | Yes, multiple allowed | A note can be both `#project` and `#meeting`. Fields from all supertags are merged in the UI. |
| **Graph edge storage** | Bidirectional | Store both forward and backward edges explicitly. Faster backlink reads at cost of more storage/sync. |

### Implications for Implementation

**Block ID Extension** (`blockIdExtension.ts`):
- Reuse the same decoration pattern from `livePreview.ts`
- Check if cursor line matches block line before hiding

**Save Handler** (`Editor.tsx`):
- After `ensureBlockIds()`, scan for duplicates
- Regenerate any duplicate IDs, keeping first occurrence
- Log regenerations for debugging

**Block Parsing** (`blockIds.ts`):
- Skip empty lines in `extractBlocks()`
- Only assign IDs to: headings, paragraphs with content, list items, code blocks, blockquotes

**Supertag Schema**:
- `VaultNote.supertags` is an array, not a single value
- UI must handle field name collisions (prefix with supertag name if ambiguous)

**Graph Edge Schema**:
```typescript
// Updated GraphEdge type for bidirectional storage
export type GraphEdge = {
  id: string;
  sourceNoteId: string;
  sourceBlockId: string | null;
  targetNoteId: string;
  targetBlockId: string | null;
  type: 'wiki-link' | 'embed' | 'reference';
  created_at: number;
};

// Store edges in both directions for fast lookups
// When adding edge A→B, also index under B for backlinks
// graph_edges keyed by edge ID
// Additional index: backlink_index[targetNoteId] = edgeId[]
```

**CRDT Schema Update**:
```typescript
export type VaultMetadataDoc = {
  // ... existing fields ...
  graph_edges: Record<string, GraphEdge>;
  backlink_index: Record<string, string[]>; // targetNoteId → edgeIds
};
```
