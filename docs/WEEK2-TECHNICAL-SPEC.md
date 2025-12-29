# Week 2 Technical Specification: Voice Intelligence + Graph Core

**Duration:** 5 days
**Goal:** Build the command ranking system, tiered suggestion UI, and graph indexing for backlinks

**Prerequisites:** Week 1 complete (Block IDs, Context Signals, Enhanced CRDT Schema v3)

---

## Overview

Week 2 builds on the foundation layer to create intelligent voice command surfacing and enable graph-based features:

| Days | Feature | Unlocks |
|------|---------|---------|
| 1-2 | Command Ranking System | Context-aware command suggestions, smart voice UX |
| 3 | Tiered Suggestion UI | Visual hierarchy for voice commands near cursor |
| 4-5 | Graph Indexing | Backlinks panel, semantic search, link graph visualization |

---

## Days 1-2: Command Ranking System

### Problem Statement

The current voice command system treats all commands equally. From `voice-mode-editor-context.md`:

> **Only surface commands that are both *possible* and *probable* right now.**

We need a scoring system that ranks commands based on:
1. What the user is doing (cursor/selection state)
2. What they just did (recent intent history)
3. What voice phase they're in
4. What would be costly to get wrong (destructiveness)

### Design Decisions

#### Scoring Formula

```typescript
score =
  contextRelevance * 0.40 +   // Selection + cursor location match
  recentIntentMatch * 0.25 +  // Same bucket as recent commands
  voicePhaseMatch * 0.20 +    // Allowed in current voice phase
  commandCostWeight * 0.10 +  // Destructive = lower unless explicit
  userAffinity * 0.05         // Future: learned preferences
```

#### Command Definition Schema

```typescript
// File: src/types/voiceCommand.ts (new)

export type CommandId = string;

export interface VoiceCommand {
  id: CommandId;
  name: string;                          // Display name: "Bold selection"
  examples: string[];                    // Voice triggers: ["bold", "make bold", "bold this"]
  bucket: IntentBucket;                  // From editorContext.ts

  // Execution requirements
  requiresSelection: boolean;            // Needs text selected?
  requiresNote: boolean;                 // Needs note open?
  allowedLocations: CursorLocation[];    // Where cursor can be
  allowedViewModes: ViewMode[];          // Which view modes
  allowedVoicePhases: VoicePhase[];      // Which voice phases

  // Risk assessment
  destructiveness: 'none' | 'low' | 'medium' | 'high';
  scope: 'inline' | 'block' | 'document' | 'vault';
  reversible: boolean;

  // Execution
  action: () => void | Promise<void>;
}

export interface ScoredCommand {
  command: VoiceCommand;
  score: number;
  breakdown: {
    contextRelevance: number;
    recentIntentMatch: number;
    voicePhaseMatch: number;
    commandCostWeight: number;
    userAffinity: number;
  };
}
```

### Implementation Plan

#### Day 1: Command Registry + Scoring Engine

**File: `src/voice/commandRegistry.ts`** (new)
```typescript
import { VoiceCommand, CommandId } from '@/types/voiceCommand';

class CommandRegistry {
  private commands: Map<CommandId, VoiceCommand> = new Map();

  register(command: VoiceCommand): void;
  unregister(id: CommandId): void;
  getAll(): VoiceCommand[];
  getById(id: CommandId): VoiceCommand | null;

  // Filter commands that CAN execute in current context
  getExecutableCommands(context: EditorContext): VoiceCommand[];
}

export const commandRegistry = new CommandRegistry();

// Register built-in commands
import { registerFormattingCommands } from './commands/formatting';
import { registerNavigationCommands } from './commands/navigation';
import { registerLinkCommands } from './commands/linking';
// etc.
```

**File: `src/voice/commandScorer.ts`** (new)
```typescript
import { VoiceCommand, ScoredCommand } from '@/types/voiceCommand';
import { EditorContext, IntentBucket } from '@/types/editorContext';

interface ScoringWeights {
  contextRelevance: number;    // 0.40
  recentIntentMatch: number;   // 0.25
  voicePhaseMatch: number;     // 0.20
  commandCostWeight: number;   // 0.10
  userAffinity: number;        // 0.05
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  contextRelevance: 0.40,
  recentIntentMatch: 0.25,
  voicePhaseMatch: 0.20,
  commandCostWeight: 0.10,
  userAffinity: 0.05,
};

export function scoreCommands(
  commands: VoiceCommand[],
  context: EditorContext,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): ScoredCommand[] {
  return commands
    .map(cmd => ({
      command: cmd,
      score: calculateScore(cmd, context, weights),
      breakdown: calculateBreakdown(cmd, context, weights),
    }))
    .sort((a, b) => b.score - a.score);
}

function calculateContextRelevance(cmd: VoiceCommand, context: EditorContext): number {
  let score = 0.0;

  // Selection match (highest weight within context relevance)
  if (cmd.requiresSelection) {
    if (context.cursor.type === 'inline-selection' ||
        context.cursor.type === 'block-selection') {
      score += 0.5;  // Strong boost
    } else {
      return 0;  // Can't execute, no relevance
    }
  } else if (context.cursor.type !== 'no-selection') {
    // Command doesn't need selection but user has one
    score += 0.2;  // Mild penalty (user likely wants selection-based cmd)
  }

  // Cursor location match
  if (cmd.allowedLocations.includes(context.cursorLocation)) {
    score += 0.3;
  }

  // View mode match
  if (cmd.allowedViewModes.includes(context.viewMode)) {
    score += 0.2;
  }

  return Math.min(score, 1.0);
}

function calculateRecentIntentMatch(cmd: VoiceCommand, context: EditorContext): number {
  if (context.recentIntents.length === 0) return 0.5;  // Neutral

  // Weight recent intents: most recent = 1.0, second = 0.6, third = 0.3
  const weights = [1.0, 0.6, 0.3];
  let score = 0;
  let totalWeight = 0;

  for (let i = 0; i < context.recentIntents.length; i++) {
    const weight = weights[i] ?? 0.1;
    if (context.recentIntents[i] === cmd.bucket) {
      score += weight;
    }
    totalWeight += weight;
  }

  return score / totalWeight;
}

function calculateVoicePhaseMatch(cmd: VoiceCommand, context: EditorContext): number {
  if (cmd.allowedVoicePhases.includes(context.voicePhase)) {
    return 1.0;
  }
  return 0.0;  // Not allowed in this phase
}

function calculateCommandCostWeight(cmd: VoiceCommand): number {
  // Higher score = safer command (inverse of destructiveness)
  switch (cmd.destructiveness) {
    case 'none': return 1.0;
    case 'low': return 0.8;
    case 'medium': return 0.5;
    case 'high': return 0.2;
  }
}
```

#### Day 2: Command Definitions + Integration

**File: `src/voice/commands/formatting.ts`** (new)
```typescript
import { VoiceCommand } from '@/types/voiceCommand';
import { commandRegistry } from '../commandRegistry';

const formattingCommands: VoiceCommand[] = [
  {
    id: 'format-bold',
    name: 'Bold selection',
    examples: ['bold', 'make bold', 'bold this', 'make it bold'],
    bucket: 'edit-selection',
    requiresSelection: true,
    requiresNote: true,
    allowedLocations: ['paragraph', 'heading', 'list', 'blockquote'],
    allowedViewModes: ['editor', 'split'],
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'none',
    scope: 'inline',
    reversible: true,
    action: () => {
      // Dispatch to editor
      window.dispatchEvent(new CustomEvent('mutter:execute-command', {
        detail: { command: 'bold' }
      }));
    },
  },
  {
    id: 'format-italic',
    name: 'Italicize selection',
    examples: ['italic', 'italicize', 'make italic', 'emphasize'],
    bucket: 'edit-selection',
    requiresSelection: true,
    requiresNote: true,
    allowedLocations: ['paragraph', 'heading', 'list', 'blockquote'],
    allowedViewModes: ['editor', 'split'],
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'none',
    scope: 'inline',
    reversible: true,
    action: () => {
      window.dispatchEvent(new CustomEvent('mutter:execute-command', {
        detail: { command: 'italic' }
      }));
    },
  },
  // ... heading 1-6, quote, code, strikethrough
];

export function registerFormattingCommands(): void {
  formattingCommands.forEach(cmd => commandRegistry.register(cmd));
}
```

**File: `src/voice/commands/navigation.ts`** (new)
```typescript
// Commands: go to top, go to bottom, next heading, previous heading, etc.
```

**File: `src/voice/commands/linking.ts`** (new)
```typescript
// Commands: create link, insert link, show backlinks, embed note
```

**File: `src/voice/commands/meta.ts`** (new)
```typescript
// Commands: undo, redo, cancel, help, stop listening
```

**File: `src/hooks/useCommandRanking.ts`** (new)
```typescript
import { useMemo } from 'react';
import { useEditorContext } from '@/context/EditorContextProvider';
import { commandRegistry } from '@/voice/commandRegistry';
import { scoreCommands, ScoredCommand } from '@/voice/commandScorer';

export interface RankedCommands {
  primary: ScoredCommand[];      // Top 1-2, score > 0.7
  secondary: ScoredCommand[];    // Next 2-3, score > 0.4
  escape: ScoredCommand[];       // Always: undo, cancel, help
  all: ScoredCommand[];          // Full ranked list
}

export function useCommandRanking(): RankedCommands {
  const { context } = useEditorContext();

  return useMemo(() => {
    // Get commands that can execute
    const executable = commandRegistry.getExecutableCommands(context);

    // Score and rank
    const scored = scoreCommands(executable, context);

    // Separate into tiers
    const primary = scored.filter(s => s.score >= 0.7).slice(0, 2);
    const secondary = scored.filter(s => s.score >= 0.4 && s.score < 0.7).slice(0, 3);

    // Escape commands always available
    const escape = scored.filter(s => s.command.bucket === 'meta').slice(0, 3);

    return { primary, secondary, escape, all: scored };
  }, [context]);
}
```

### Testing Checklist

- [ ] Command registry loads all built-in commands
- [ ] Scoring formula produces expected rankings:
  - [ ] Selection commands rank highest when text is selected
  - [ ] Recent intent affects ranking (formatting after formatting)
  - [ ] Destructive commands rank lower
- [ ] `getExecutableCommands()` filters out impossible commands
- [ ] Voice phase changes affect available commands
- [ ] `useCommandRanking` hook updates when context changes

---

## Day 3: Tiered Suggestion UI

### Problem Statement

Voice suggestions need visual hierarchy to guide users toward the most relevant action while maintaining escape hatches.

### Design Decisions

#### Visual Hierarchy

| Tier | Count | Size | Position | Purpose |
|------|-------|------|----------|---------|
| Primary | 1-2 | Large | Near cursor/waveform | Most likely action |
| Secondary | 2-3 | Medium | Below primary | Alternatives |
| Escape | 3 | Small | Fixed corner | Undo/Cancel/Help |

#### Positioning Strategy

```
┌─────────────────────────────────────────────┐
│ Editor                                       │
│                                              │
│   The quick brown fox |                      │
│                       ↓                      │
│              ┌─────────────────┐             │
│              │ ★ Bold selection │  ← Primary │
│              │   Italicize      │  ← Secondary
│              │   Create link    │             │
│              └─────────────────┘             │
│                                              │
└─────────────────────────────────────────────┘
┌───────┐
│ Undo  │ ← Escape tier (fixed position)
│ Cancel│
│ Help  │
└───────┘
```

### Implementation Plan

**File: `src/components/VoiceSuggestions.tsx`** (new)
```typescript
import { useCommandRanking, RankedCommands } from '@/hooks/useCommandRanking';
import { useEditorContext } from '@/context/EditorContextProvider';
import { ScoredCommand } from '@/types/voiceCommand';

interface VoiceSuggestionsProps {
  cursorPosition?: { x: number; y: number };
  visible: boolean;
}

export function VoiceSuggestions({ cursorPosition, visible }: VoiceSuggestionsProps) {
  const { primary, secondary, escape } = useCommandRanking();
  const { context, recordIntent } = useEditorContext();

  if (!visible || context.voicePhase === 'idle') {
    return null;
  }

  const handleExecute = (scored: ScoredCommand) => {
    scored.command.action();
    recordIntent(scored.command.bucket);
  };

  return (
    <>
      {/* Main suggestion panel - positioned near cursor */}
      <SuggestionPanel
        position={cursorPosition}
        primary={primary}
        secondary={secondary}
        onExecute={handleExecute}
      />

      {/* Escape tier - fixed position */}
      <EscapeTier commands={escape} onExecute={handleExecute} />
    </>
  );
}

function SuggestionPanel({
  position,
  primary,
  secondary,
  onExecute,
}: {
  position?: { x: number; y: number };
  primary: ScoredCommand[];
  secondary: ScoredCommand[];
  onExecute: (cmd: ScoredCommand) => void;
}) {
  // Calculate position below cursor
  const style = position ? {
    position: 'absolute' as const,
    left: position.x,
    top: position.y + 24,  // Below cursor
    transform: 'translateX(-50%)',  // Center horizontally
  } : {};

  return (
    <div className="voice-suggestions" style={style}>
      {/* Primary tier */}
      <div className="voice-suggestions-primary">
        {primary.map(scored => (
          <button
            key={scored.command.id}
            className="voice-suggestion-btn primary"
            onClick={() => onExecute(scored)}
          >
            <span className="suggestion-icon">★</span>
            <span className="suggestion-label">{scored.command.name}</span>
            <span className="suggestion-score">{Math.round(scored.score * 100)}%</span>
          </button>
        ))}
      </div>

      {/* Secondary tier */}
      {secondary.length > 0 && (
        <div className="voice-suggestions-secondary">
          {secondary.map(scored => (
            <button
              key={scored.command.id}
              className="voice-suggestion-btn secondary"
              onClick={() => onExecute(scored)}
            >
              <span className="suggestion-label">{scored.command.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EscapeTier({
  commands,
  onExecute,
}: {
  commands: ScoredCommand[];
  onExecute: (cmd: ScoredCommand) => void;
}) {
  return (
    <div className="voice-escape-tier">
      {commands.map(scored => (
        <button
          key={scored.command.id}
          className="voice-escape-btn"
          onClick={() => onExecute(scored)}
        >
          {scored.command.name}
        </button>
      ))}
    </div>
  );
}
```

**File: `src/components/VoiceSuggestions.css`** (new)
```css
.voice-suggestions {
  z-index: 1000;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  min-width: 200px;
  max-width: 300px;
}

.voice-suggestions-primary {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.voice-suggestion-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}

.voice-suggestion-btn.primary {
  background: var(--accent-primary);
  color: white;
  font-size: 14px;
  font-weight: 500;
}

.voice-suggestion-btn.primary:hover {
  background: var(--accent-primary-hover);
}

.voice-suggestion-btn.secondary {
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
}

.voice-suggestion-btn.secondary:hover {
  background: var(--bg-hover);
}

.suggestion-score {
  margin-left: auto;
  font-size: 11px;
  opacity: 0.6;
}

.voice-suggestions-secondary {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Escape tier - fixed bottom right */
.voice-escape-tier {
  position: fixed;
  bottom: 16px;
  right: 16px;
  display: flex;
  gap: 8px;
  z-index: 999;
}

.voice-escape-btn {
  padding: 6px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  background: var(--bg-surface);
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
}

.voice-escape-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
```

**Modify: `src/components/Editor.tsx`**
- Track cursor screen position for suggestion placement
- Integrate `VoiceSuggestions` component
- Pass visibility based on voice phase

```typescript
// Add to Editor.tsx
const [cursorScreenPos, setCursorScreenPos] = useState<{ x: number; y: number } | null>(null);

// Update cursor position on selection change
useEffect(() => {
  if (!view) return;

  const updateCursorPos = () => {
    const pos = view.state.selection.main.head;
    const coords = view.coordsAtPos(pos);
    if (coords) {
      setCursorScreenPos({ x: coords.left, y: coords.bottom });
    }
  };

  // Listen for selection changes
  // ...
}, [view]);
```

### Testing Checklist

- [ ] Suggestions appear when voice phase is not idle
- [ ] Primary tier shows top 1-2 highest scored commands
- [ ] Secondary tier shows next 2-3 commands
- [ ] Escape tier always shows undo/cancel/help
- [ ] Clicking a suggestion executes the command
- [ ] Suggestions position correctly near cursor
- [ ] Suggestions disappear when voice phase returns to idle
- [ ] Intent is recorded after command execution

---

## Days 4-5: Graph Indexing

### Problem Statement

Currently, links are stored as simple string arrays on notes (`VaultNote.links`). To enable:
- Backlinks panel ("What links to this note?")
- Graph visualization
- Semantic search across connections

We need to:
1. Parse all notes on vault load to extract links
2. Create graph edges in the CRDT
3. Provide efficient query APIs

### Design Decisions

#### Link Extraction

Parse from markdown:
- `[[Note Name]]` → wiki-link to note
- `[[Note Name#blockId]]` → wiki-link to specific block
- `![[Note Name]]` → embed (transclusion)
- `![[Note Name#blockId]]` → embed specific block

#### Graph Building Strategy

```
On vault load:
  1. For each note in CRDT:
     a. Read markdown content from disk
     b. Parse for [[links]] and ![[embeds]]
     c. Resolve link targets to note IDs
     d. Create/update graph edges

On note save:
  1. Re-parse the saved note
  2. Remove old edges from this note
  3. Create new edges
  4. Backlink index updates automatically (via CRDT functions)
```

### Implementation Plan

#### Day 4: Link Parser + Graph Builder

**File: `src/graph/linkParser.ts`** (new)
```typescript
export interface ParsedLink {
  raw: string;                    // Original text: "[[Note Name#blockId]]"
  target: string;                 // Note name or path: "Note Name"
  blockId: string | null;         // Block reference: "blockId" or null
  type: 'wiki-link' | 'embed';    // [[]] vs ![[]]
  position: {                     // Position in source text
    start: number;
    end: number;
  };
}

// Regex patterns
const WIKI_LINK_REGEX = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|[^\]]+)?\]\]/g;
const EMBED_REGEX = /!\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|[^\]]+)?\]\]/g;

/**
 * Parse all links from markdown content
 */
export function parseLinks(content: string): ParsedLink[] {
  const links: ParsedLink[] = [];

  // Parse embeds first (they start with !)
  for (const match of content.matchAll(EMBED_REGEX)) {
    links.push({
      raw: match[0],
      target: match[1].trim(),
      blockId: match[2]?.trim() || null,
      type: 'embed',
      position: {
        start: match.index!,
        end: match.index! + match[0].length,
      },
    });
  }

  // Parse wiki links (exclude embeds by checking for !)
  for (const match of content.matchAll(WIKI_LINK_REGEX)) {
    // Skip if this is actually an embed (preceded by !)
    if (match.index! > 0 && content[match.index! - 1] === '!') {
      continue;
    }

    links.push({
      raw: match[0],
      target: match[1].trim(),
      blockId: match[2]?.trim() || null,
      type: 'wiki-link',
      position: {
        start: match.index!,
        end: match.index! + match[0].length,
      },
    });
  }

  return links;
}

/**
 * Extract unique link targets (for simple link array)
 */
export function extractLinkTargets(content: string): string[] {
  const links = parseLinks(content);
  const targets = new Set(links.map(l => l.target));
  return Array.from(targets).sort();
}
```

**File: `src/graph/graphBuilder.ts`** (new)
```typescript
import type { DocHandle } from '@automerge/react';
import {
  VaultMetadataDoc,
  VaultNote,
  addGraphEdge,
  removeEdgesFromNote,
  findNoteIdByRelPath,
  GraphEdgeType,
} from '@/crdt/vaultMetadataDoc';
import { parseLinks, ParsedLink } from './linkParser';

interface GraphBuildResult {
  notesProcessed: number;
  edgesCreated: number;
  unresolvedLinks: Array<{ sourceNote: string; target: string }>;
}

/**
 * Resolve a link target to a note ID
 * Handles various formats:
 * - "Note Name" → find by title
 * - "folder/Note Name" → find by relative path
 * - "Note Name.md" → find by path with extension
 */
export function resolveLinkTarget(
  doc: VaultMetadataDoc,
  target: string
): string | null {
  // Try exact path match first
  const withMd = target.endsWith('.md') ? target : `${target}.md`;
  const byPath = findNoteIdByRelPath(doc, withMd);
  if (byPath) return byPath;

  // Try without .md
  const withoutMd = target.replace(/\.md$/i, '');
  const byPathNoExt = findNoteIdByRelPath(doc, withoutMd);
  if (byPathNoExt) return byPathNoExt;

  // Try title match
  for (const note of Object.values(doc.notes)) {
    if (note.title.toLowerCase() === target.toLowerCase()) {
      return note.id;
    }
    // Also check filename without path
    const filename = note.rel_path.split('/').pop()?.replace(/\.md$/i, '');
    if (filename?.toLowerCase() === target.toLowerCase()) {
      return note.id;
    }
  }

  return null;
}

/**
 * Build graph edges for a single note
 */
export function buildGraphForNote(params: {
  handle: DocHandle<VaultMetadataDoc>;
  sourceNoteId: string;
  sourceBlockId: string | null;
  content: string;
}): { edgesCreated: number; unresolvedLinks: string[] } {
  const doc = params.handle.doc();
  if (!doc) return { edgesCreated: 0, unresolvedLinks: [] };

  // Remove existing edges from this note
  removeEdgesFromNote({ handle: params.handle, sourceNoteId: params.sourceNoteId });

  // Parse links
  const links = parseLinks(params.content);
  const unresolvedLinks: string[] = [];
  let edgesCreated = 0;

  for (const link of links) {
    const targetNoteId = resolveLinkTarget(doc, link.target);

    if (!targetNoteId) {
      unresolvedLinks.push(link.target);
      continue;
    }

    addGraphEdge({
      handle: params.handle,
      sourceNoteId: params.sourceNoteId,
      sourceBlockId: params.sourceBlockId,
      targetNoteId,
      targetBlockId: link.blockId,
      type: link.type as GraphEdgeType,
    });

    edgesCreated++;
  }

  return { edgesCreated, unresolvedLinks };
}

/**
 * Build graph for entire vault
 * Called on vault load to index all links
 */
export async function buildVaultGraph(params: {
  handle: DocHandle<VaultMetadataDoc>;
  readNoteContent: (relPath: string) => Promise<string>;
  onProgress?: (processed: number, total: number) => void;
}): Promise<GraphBuildResult> {
  const doc = params.handle.doc();
  if (!doc) {
    return { notesProcessed: 0, edgesCreated: 0, unresolvedLinks: [] };
  }

  const notes = Object.values(doc.notes);
  const result: GraphBuildResult = {
    notesProcessed: 0,
    edgesCreated: 0,
    unresolvedLinks: [],
  };

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];

    try {
      const content = await params.readNoteContent(note.rel_path);
      const { edgesCreated, unresolvedLinks } = buildGraphForNote({
        handle: params.handle,
        sourceNoteId: note.id,
        sourceBlockId: null,
        content,
      });

      result.edgesCreated += edgesCreated;
      result.unresolvedLinks.push(
        ...unresolvedLinks.map(target => ({ sourceNote: note.rel_path, target }))
      );
    } catch (err) {
      console.warn(`[Graph] Failed to process ${note.rel_path}:`, err);
    }

    result.notesProcessed++;
    params.onProgress?.(i + 1, notes.length);
  }

  console.log(`[Graph] Built vault graph: ${result.edgesCreated} edges from ${result.notesProcessed} notes`);
  if (result.unresolvedLinks.length > 0) {
    console.log(`[Graph] ${result.unresolvedLinks.length} unresolved links`);
  }

  return result;
}
```

#### Day 5: Backlinks Hook + UI Integration

**File: `src/hooks/useBacklinks.ts`** (new)
```typescript
import { useMemo } from 'react';
import { useVaultMetadataCrdt } from './useVaultMetadataCrdt';
import { getBacklinks, VaultNote, GraphEdge } from '@/crdt/vaultMetadataDoc';

export interface BacklinkInfo {
  edge: GraphEdge;
  sourceNote: VaultNote;
  context?: string;  // Text around the link (for preview)
}

export function useBacklinks(noteId: string | null): {
  backlinks: BacklinkInfo[];
  count: number;
  loading: boolean;
} {
  const { doc, ready } = useVaultMetadataCrdt();

  const backlinks = useMemo(() => {
    if (!ready || !doc || !noteId) return [];

    const edges = getBacklinks({ doc, noteId });

    return edges
      .map(edge => {
        const sourceNote = doc.notes[edge.sourceNoteId];
        if (!sourceNote) return null;

        return {
          edge,
          sourceNote,
          // TODO: Load context from file content
        };
      })
      .filter((bl): bl is BacklinkInfo => bl !== null);
  }, [doc, noteId, ready]);

  return {
    backlinks,
    count: backlinks.length,
    loading: !ready,
  };
}
```

**File: `src/components/BacklinksPanel.tsx`** (new)
```typescript
import { useBacklinks, BacklinkInfo } from '@/hooks/useBacklinks';

interface BacklinksPanelProps {
  noteId: string | null;
  onNavigate: (relPath: string) => void;
}

export function BacklinksPanel({ noteId, onNavigate }: BacklinksPanelProps) {
  const { backlinks, count, loading } = useBacklinks(noteId);

  if (loading) {
    return <div className="backlinks-panel loading">Loading backlinks...</div>;
  }

  if (count === 0) {
    return (
      <div className="backlinks-panel empty">
        <span className="backlinks-count">0 backlinks</span>
        <p className="backlinks-empty-text">
          No other notes link to this one yet.
        </p>
      </div>
    );
  }

  return (
    <div className="backlinks-panel">
      <h3 className="backlinks-header">
        <span className="backlinks-count">{count} backlink{count !== 1 ? 's' : ''}</span>
      </h3>

      <ul className="backlinks-list">
        {backlinks.map(bl => (
          <li key={bl.edge.id} className="backlink-item">
            <button
              className="backlink-link"
              onClick={() => onNavigate(bl.sourceNote.rel_path)}
            >
              <span className="backlink-title">{bl.sourceNote.title}</span>
              {bl.edge.sourceBlockId && (
                <span className="backlink-block">#{bl.edge.sourceBlockId}</span>
              )}
            </button>
            {bl.context && (
              <p className="backlink-context">{bl.context}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**File: `src/hooks/useGraphStats.ts`** (new)
```typescript
import { useMemo } from 'react';
import { useVaultMetadataCrdt } from './useVaultMetadataCrdt';
import { getNoteGraphStats } from '@/crdt/vaultMetadataDoc';

export function useGraphStats(noteId: string | null) {
  const { doc, ready } = useVaultMetadataCrdt();

  return useMemo(() => {
    if (!ready || !doc || !noteId) {
      return { incomingCount: 0, outgoingCount: 0, totalConnections: 0 };
    }
    return getNoteGraphStats({ doc, noteId });
  }, [doc, noteId, ready]);
}
```

**Modify: `src/App.tsx` or vault loading logic**
```typescript
// On vault load, build the graph
useEffect(() => {
  if (!handle || !ready) return;

  const buildGraph = async () => {
    await buildVaultGraph({
      handle,
      readNoteContent: async (relPath) => {
        // Use Tauri to read file content
        const fullPath = `${vaultPath}/${relPath}`;
        return await invoke<string>('read_text_file', { path: fullPath });
      },
      onProgress: (processed, total) => {
        console.log(`[Graph] Indexing ${processed}/${total}`);
      },
    });
  };

  buildGraph();
}, [handle, ready, vaultPath]);
```

**Modify: `src/components/Editor.tsx`**
- On save, rebuild graph edges for the current note

```typescript
// In save handler
const handleSave = async () => {
  // ... existing save logic ...

  // Rebuild graph edges for this note
  if (handle && noteId) {
    buildGraphForNote({
      handle,
      sourceNoteId: noteId,
      sourceBlockId: null,  // TODO: Could use currentBlockId
      content: view.state.doc.toString(),
    });
  }
};
```

### Testing Checklist

- [ ] `parseLinks()` correctly extracts:
  - [ ] `[[Note Name]]` as wiki-link
  - [ ] `[[Note Name#blockId]]` with block reference
  - [ ] `![[Note Name]]` as embed
  - [ ] `[[Note Name|Alias]]` (alias ignored, target parsed)
- [ ] `resolveLinkTarget()` finds notes by:
  - [ ] Exact path match
  - [ ] Title match (case-insensitive)
  - [ ] Filename without extension
- [ ] Graph builds on vault load
- [ ] Graph updates on note save
- [ ] `useBacklinks()` returns correct backlinks
- [ ] BacklinksPanel displays linking notes
- [ ] Clicking backlink navigates to source note
- [ ] Unresolved links logged but don't break indexing

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/types/voiceCommand.ts` | Voice command type definitions |
| `src/voice/commandRegistry.ts` | Central command registry |
| `src/voice/commandScorer.ts` | Scoring algorithm |
| `src/voice/commands/formatting.ts` | Formatting command definitions |
| `src/voice/commands/navigation.ts` | Navigation command definitions |
| `src/voice/commands/linking.ts` | Linking command definitions |
| `src/voice/commands/meta.ts` | Meta command definitions (undo, cancel) |
| `src/hooks/useCommandRanking.ts` | Hook for ranked commands |
| `src/components/VoiceSuggestions.tsx` | Tiered suggestion UI |
| `src/components/VoiceSuggestions.css` | Suggestion styling |
| `src/graph/linkParser.ts` | Markdown link extraction |
| `src/graph/graphBuilder.ts` | Graph construction from vault |
| `src/hooks/useBacklinks.ts` | Backlinks query hook |
| `src/hooks/useGraphStats.ts` | Graph statistics hook |
| `src/components/BacklinksPanel.tsx` | Backlinks UI |

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/Editor.tsx` | Cursor position tracking, VoiceSuggestions integration, graph rebuild on save |
| `src/App.tsx` | Graph building on vault load |
| `src/context/EditorContextProvider.tsx` | Ensure recordIntent is exposed |

---

## End of Week 2 Verification

Run through this checklist before moving to Week 3:

### Command Ranking
```typescript
// In browser DevTools console:
// 1. Select some text
// 2. Check that selection-based commands rank highest
window.__MUTTER_DEBUG__.getCommandRanking()  // Should show bold/italic at top
```

### Tiered Suggestions
```
1. Enable voice mode (click mic)
2. Select text in editor
3. Verify:
   - Primary suggestions appear near cursor
   - Secondary suggestions below primary
   - Escape tier (undo/cancel) in corner
4. Click a suggestion → verifies execution
```

### Graph Indexing
```bash
# Check CRDT graph state
# In DevTools:
const doc = window.__MUTTER_DEBUG__.getCrdtDoc();
console.log('Edges:', Object.keys(doc.graph_edges).length);
console.log('Backlink index entries:', Object.keys(doc.backlink_index).length);

# Create a note with [[link]] and save
# Verify edge appears in graph_edges
```

### Backlinks
```
1. Create Note A with content "See [[Note B]]"
2. Save Note A
3. Open Note B
4. Check BacklinksPanel shows "Note A"
5. Click backlink → navigates to Note A
```

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         Voice Intelligence                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────────┐    ┌─────────────────┐    ┌───────────────┐ │
│  │ CommandRegistry │───►│ CommandScorer   │───►│ useCommand    │ │
│  │                 │    │                 │    │ Ranking       │ │
│  │ • All commands  │    │ • Score formula │    │               │ │
│  │ • Requirements  │    │ • Weights       │    │ • primary[]   │ │
│  │ • Actions       │    │ • Filtering     │    │ • secondary[] │ │
│  └─────────────────┘    └─────────────────┘    │ • escape[]    │ │
│                                                 └───────┬───────┘ │
│                                                         │         │
│                                                         ▼         │
│                                            ┌────────────────────┐ │
│                                            │ VoiceSuggestions   │ │
│                                            │ (Tiered UI)        │ │
│                                            └────────────────────┘ │
│                                                                    │
├──────────────────────────────────────────────────────────────────┤
│                         Graph Core                                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────────┐    ┌─────────────────┐    ┌───────────────┐ │
│  │ linkParser      │───►│ graphBuilder    │───►│ CRDT          │ │
│  │                 │    │                 │    │ graph_edges   │ │
│  │ • Parse [[]]    │    │ • Resolve links │    │ backlink_index│ │
│  │ • Parse ![[]]   │    │ • Create edges  │    └───────┬───────┘ │
│  └─────────────────┘    └─────────────────┘            │         │
│                                                         │         │
│  ┌─────────────────────────────────────────────────────┘         │
│  │                                                                │
│  ▼                                                                │
│  ┌─────────────────┐    ┌─────────────────┐                      │
│  │ useBacklinks    │───►│ BacklinksPanel  │                      │
│  │                 │    │                 │                      │
│  │ • Query edges   │    │ • Display links │                      │
│  │ • Get context   │    │ • Navigation    │                      │
│  └─────────────────┘    └─────────────────┘                      │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Design Decisions (Resolved)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Scoring weights** | 40/25/20/10/5 split | Context relevance most important; user affinity lowest (not implemented yet) |
| **Tier thresholds** | Primary ≥0.7, Secondary ≥0.4 | Empirical; can tune based on user testing |
| **Link parsing** | Regex-based | Simple, fast, sufficient for Obsidian-style links |
| **Graph rebuild** | Per-note on save | Full rebuild only on vault load; incremental on save |
| **Unresolved links** | Log warning, don't create edge | Allows forward references to not-yet-created notes |
| **Escape tier position** | Fixed bottom-right | Always visible, doesn't occlude editor content |

---

## Dependencies on Week 1

| Week 2 Feature | Depends On |
|----------------|------------|
| Command Ranking | `EditorContext` types, `useEditorContext` hook |
| Voice Phase Matching | `VoicePhase` type, `useVoicePhase` hook |
| Intent Tracking | `IntentBucket` type, `recordIntent` function |
| Graph Indexing | `graph_edges`, `backlink_index` in CRDT schema |
| Backlinks Query | `getBacklinks()`, `GraphEdge` type |
