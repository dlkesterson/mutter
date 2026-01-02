# Week 5 Technical Specification: Release Preparation + Integration Polish

**Duration:** 5 days
**Goal:** Integration testing, performance profiling, documentation, CI/CD pipeline, and release preparation

**Prerequisites:** Weeks 1-4 complete (Block IDs, Context Signals, CRDT Schema v3, Command Ranking, Graph Indexing, Supertags, Transclusion, AI Voice Queries, Sync Server, Confirmation UI, Query Engine)

---

## Overview

Week 5 completes the release preparation phase:

| Days | Focus | Deliverable |
|------|-------|-------------|
| 1 | Integration Testing | End-to-end workflow tests, cross-feature validation |
| 2 | Performance Profiling | Query optimization, sync latency, large vault handling |
| 3 | Documentation | User guide, query DSL reference, voice command help |
| 4 | CI/CD Pipeline | Forgejo runner setup, cross-platform build validation |
| 5 | Polish + Release | Bug fixes, UX improvements, version tagging |

---

## Pre-Week 5 Verification

Before starting Week 5, verify all Week 1-4 features work:

### Full Feature Verification Checklist

```bash
# Week 1: Foundation
# 1. Open a note → blocks have stable IDs (check .mutter/crdt/)
# 2. Editor context signals work (selection, cursor position, view mode)
# 3. CRDT metadata loads from vault

# Week 2: Voice Intelligence + Graph
# 1. Voice commands are ranked by context
# 2. Backlinks panel shows incoming links
# 3. Graph data persists in CRDT

# Week 3: Supertags + Transclusion + AI
# 1. Create supertag definition → badge appears
# 2. Apply to note → field values editable
# 3. ![[Note#block]] renders inline with edit/jump buttons
# 4. "Summarize notes about X" → AI response with sources

# Week 4: Sync + Query + Confirmation
# 1. Local sync server starts/stops from settings
# 2. Query panel: "type:project" returns matching notes
# 3. Destructive commands show confirmation (novice mode)
# 4. Progressive disclosure adapts to expertise level
```

---

## Day 1: Integration Testing

### Problem Statement

Individual features work in isolation, but we need to verify:
1. Cross-feature interactions (e.g., query results showing supertag badges)
2. Voice commands triggering all feature areas
3. CRDT sync maintaining consistency across all metadata types
4. Error handling at system boundaries

### Test Plan

#### 1.1 Cross-Feature Integration Tests

**File: `src/__tests__/integration/full-workflow.test.ts`** (new)
```typescript
/**
 * Integration tests for full user workflows
 *
 * These tests verify that features work together, not just in isolation.
 */

describe('Full Workflow Integration', () => {
  describe('Supertags + Query Engine', () => {
    it('query results should include supertag badges', async () => {
      // 1. Create note with supertag
      // 2. Execute query "type:project"
      // 3. Verify result includes supertag info
    });

    it('supertag field queries should filter correctly', async () => {
      // 1. Create notes with supertag + field values
      // 2. Query "project.status:active"
      // 3. Verify only matching notes returned
    });
  });

  describe('Transclusion + Backlinks', () => {
    it('transcluded content should update backlinks graph', async () => {
      // 1. Add ![[NoteA#block1]] to NoteB
      // 2. Verify backlinks panel on NoteA shows NoteB
    });

    it('editing transcluded source should update all embeddings', async () => {
      // 1. Edit block in source note
      // 2. Verify all transclusions reflect update
    });
  });

  describe('Voice + Confirmation + Query', () => {
    it('voice query command should open query panel with results', async () => {
      // 1. Simulate voice command "show all projects"
      // 2. Verify query panel opens
      // 3. Verify "type:project" query executed
    });

    it('destructive voice command should trigger confirmation', async () => {
      // 1. Set expertise to novice
      // 2. Simulate destructive command
      // 3. Verify confirmation dialog appears
    });
  });

  describe('Sync + CRDT Consistency', () => {
    it('supertag changes should sync across connections', async () => {
      // 1. Start local sync server
      // 2. Apply supertag to note
      // 3. Verify CRDT state includes supertag
      // 4. Simulate second client connection
      // 5. Verify supertag data syncs
    });

    it('query results should reflect synced data', async () => {
      // 1. Sync note with supertag from remote
      // 2. Execute local query
      // 3. Verify synced note appears in results
    });
  });
});
```

#### 1.2 Voice Command Coverage Tests

**File: `src/__tests__/integration/voice-coverage.test.ts`** (new)
```typescript
/**
 * Tests that voice commands correctly trigger all feature areas
 */

describe('Voice Command Coverage', () => {
  // Format commands
  const formatCommands = ['make bold', 'italicize', 'heading 1', 'quote this'];

  // Navigation commands
  const navCommands = ['show backlinks', 'open file', 'go to line 10'];

  // Query commands
  const queryCommands = ['show all projects', 'find active tasks', 'search notes'];

  // Supertag commands
  const supertagCommands = ['tag this as project', 'create new supertag'];

  // AI commands
  const aiCommands = ['summarize notes about', 'what do my notes say about'];

  formatCommands.forEach(cmd => {
    it(`"${cmd}" should trigger formatting`, async () => {
      // Test implementation
    });
  });

  // ... similar for other command categories
});
```

#### 1.3 Error Boundary Tests

**File: `src/__tests__/integration/error-handling.test.ts`** (new)
```typescript
/**
 * Tests that errors are handled gracefully at system boundaries
 */

describe('Error Handling', () => {
  describe('Query Engine Errors', () => {
    it('should show helpful error for invalid date format', () => {
      // Query: "created:>invalid"
      // Expect: Error "Invalid date format for created: use YYYY-MM-DD"
    });

    it('should handle missing vault gracefully', () => {
      // Query without vault loaded
      // Expect: Empty results, no crash
    });
  });

  describe('Sync Errors', () => {
    it('should show reconnecting status on connection loss', async () => {
      // 1. Connect to sync server
      // 2. Kill server
      // 3. Verify UI shows "reconnecting"
      // 4. Verify reconnect attempts (exponential backoff)
    });

    it('should not lose local changes during sync failure', async () => {
      // 1. Make local changes
      // 2. Simulate sync failure
      // 3. Verify changes persist locally
      // 4. Verify changes sync after reconnection
    });
  });

  describe('Transclusion Errors', () => {
    it('should show placeholder for missing block', () => {
      // ![[Note#nonexistent]]
      // Expect: "Block not found" placeholder
    });

    it('should show placeholder for missing note', () => {
      // ![[NonexistentNote#block]]
      // Expect: "Note not found" placeholder
    });
  });
});
```

### Testing Checklist

- [ ] All format commands work via voice
- [ ] All navigation commands work via voice
- [ ] Query commands open panel with correct query
- [ ] Supertag commands open dialogs/apply tags
- [ ] AI commands return summarized results
- [ ] Cross-feature data flows correctly
- [ ] Errors show user-friendly messages
- [ ] No crashes on edge cases

---

## Day 2: Performance Profiling

### Problem Statement

Mutter should remain responsive with:
- Large vaults (10k+ notes)
- Complex queries (multiple filters)
- Real-time sync (multiple devices)
- Voice transcription (streaming)

### Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Query execution | <100ms for 1k notes | `performance.now()` in executor |
| Vault load | <2s for 1k notes | Time from open to rendered tree |
| Sync latency | <500ms for changes | Time from edit to sync confirmed |
| Transcription | <3s for 10s audio | Time from silence to text |
| Editor keystroke | <16ms | Frame budget for 60fps |

### Implementation Plan

#### 2.1 Query Performance Optimization

**File: `src/query/executor.ts`** (modify)
```typescript
// Add query timing and optimization

export interface QueryResult {
  notes: VaultNote[];
  totalCount: number;
  executionTimeMs: number;
  query: ParsedQuery;
  // New: performance breakdown
  timing?: {
    parseMs: number;
    filterMs: number;
    sortMs: number;
    totalMs: number;
  };
}

/**
 * Optimized query execution with early termination
 */
export function executeQuery(
  query: ParsedQuery,
  doc: VaultMetadataDoc | null,
  options?: { limit?: number; offset?: number }
): QueryResult {
  const timing = { parseMs: 0, filterMs: 0, sortMs: 0, totalMs: 0 };
  const startTime = performance.now();

  if (!doc) {
    return { notes: [], totalCount: 0, executionTimeMs: 0, query };
  }

  // Optimization: If query has `type:` filter, start from supertag index
  const typeFilter = query.terms.find(
    (t) => t.type === 'filter' && t.key === 'type'
  ) as FilterTerm | undefined;

  let notes: VaultNote[];

  if (typeFilter) {
    // Use supertag index for faster initial filtering
    notes = getNotesBySupertag(doc, typeFilter.value);
    timing.filterMs = performance.now() - startTime;
  } else {
    notes = Object.values(doc.notes);
  }

  // Apply remaining filters
  const filterStart = performance.now();
  for (const term of query.terms) {
    if (term.type === 'filter' && term !== typeFilter) {
      notes = notes.filter((note) => matchesFilter(note, term, doc));
    } else if (term.type === 'text') {
      notes = notes.filter((note) => matchesText(note, term));
    }
  }
  timing.filterMs = performance.now() - filterStart;

  // Sort
  const sortStart = performance.now();
  notes.sort((a, b) => b.updated_at - a.updated_at);
  timing.sortMs = performance.now() - sortStart;

  // Pagination
  const { limit, offset = 0 } = options || {};
  const totalCount = notes.length;

  if (offset > 0 || limit) {
    notes = notes.slice(offset, limit ? offset + limit : undefined);
  }

  timing.totalMs = performance.now() - startTime;

  return {
    notes,
    totalCount,
    executionTimeMs: timing.totalMs,
    query,
    timing,
  };
}

/**
 * Get notes with a specific supertag (indexed lookup)
 */
function getNotesBySupertag(doc: VaultMetadataDoc, tagName: string): VaultNote[] {
  const def = Object.values(doc.supertag_definitions).find(
    (d) => d.name.toLowerCase() === tagName.toLowerCase()
  );

  if (!def) return [];

  return Object.values(doc.notes).filter(
    (note) => note.supertags?.some((st) => st.definitionId === def.id)
  );
}
```

#### 2.2 Sync Latency Measurement

**File: `src/hooks/useSyncStatus.ts`** (modify)
```typescript
// Add latency tracking

export interface SyncStatus {
  state: SyncState;
  peerCount: number;
  lastSyncAt: number | null;
  pendingChanges: number;
  error: string | null;
  // New: latency metrics
  latency?: {
    lastRoundTripMs: number;
    averageMs: number;
    samples: number[];
  };
}

// In useSyncStatus hook:
const measureLatency = useCallback(() => {
  const start = performance.now();
  // Send ping to sync server
  // On response:
  const latency = performance.now() - start;
  setStatus((prev) => ({
    ...prev,
    latency: {
      lastRoundTripMs: latency,
      averageMs: calculateAverage([...prev.latency?.samples || [], latency]),
      samples: [...(prev.latency?.samples || []).slice(-9), latency],
    },
  }));
}, []);
```

#### 2.3 Performance Dashboard (Dev Only)

**File: `src/components/dev/PerformancePanel.tsx`** (new)
```typescript
/**
 * Development-only performance monitoring panel
 *
 * Shows real-time metrics for:
 * - Query execution times
 * - Sync latency
 * - Editor render times
 * - Memory usage
 */

import { useState, useEffect } from 'react';
import { useSyncStatus } from '@/hooks/useSyncStatus';

interface PerformanceMetrics {
  queryTimes: number[];
  syncLatency: number[];
  editorFrameTimes: number[];
  memoryUsage: number;
}

export function PerformancePanel() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    queryTimes: [],
    syncLatency: [],
    editorFrameTimes: [],
    memoryUsage: 0,
  });

  const { latency } = useSyncStatus();

  useEffect(() => {
    // Listen for query execution events
    const handleQuery = (e: CustomEvent<{ executionTimeMs: number }>) => {
      setMetrics((prev) => ({
        ...prev,
        queryTimes: [...prev.queryTimes.slice(-19), e.detail.executionTimeMs],
      }));
    };

    window.addEventListener('mutter:query-executed', handleQuery as EventListener);
    return () => {
      window.removeEventListener('mutter:query-executed', handleQuery as EventListener);
    };
  }, []);

  // Memory monitoring
  useEffect(() => {
    const interval = setInterval(() => {
      if ('memory' in performance) {
        setMetrics((prev) => ({
          ...prev,
          memoryUsage: (performance as any).memory.usedJSHeapSize / 1024 / 1024,
        }));
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <div className="p-4 bg-muted text-xs font-mono space-y-2">
      <h3 className="font-bold">Performance Metrics</h3>
      <div>
        Query avg: {avg(metrics.queryTimes).toFixed(1)}ms
        (last: {metrics.queryTimes.at(-1)?.toFixed(1) || '-'}ms)
      </div>
      <div>
        Sync latency: {latency?.averageMs?.toFixed(0) || '-'}ms
      </div>
      <div>
        Memory: {metrics.memoryUsage.toFixed(1)}MB
      </div>
    </div>
  );
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
```

### Profiling Checklist

- [ ] Query execution <100ms for 1k notes
- [ ] Type filter uses index optimization
- [ ] Sync latency <500ms average
- [ ] No memory leaks over 1hr session
- [ ] Editor maintains 60fps during typing
- [ ] Voice transcription <3s for 10s audio

---

## Day 3: Documentation

### Problem Statement

Users need:
1. Getting started guide
2. Voice command reference
3. Query DSL reference
4. Keyboard shortcuts
5. Troubleshooting guide

### Documentation Plan

#### 3.1 User Guide

**File: `docs/USER-GUIDE.md`** (new)
```markdown
# Mutter User Guide

Mutter is a voice-first markdown editor with semantic command recognition.

## Getting Started

### 1. Open a Vault
Click "Open Folder" and select your markdown vault directory.

### 2. Enable Voice
Click the microphone icon in the toolbar to enable voice input.

### 3. Download Whisper Model
Go to Settings → Model Selector → Choose a model → Download

**Recommended models:**
- **Quick transcription**: Distil-Whisper Tiny (fastest, lower accuracy)
- **Balanced**: Distil-Whisper Small (good balance)
- **High accuracy**: Whisper Medium (slower, best accuracy)

### 4. Speak Commands
Select text and speak commands like:
- "Make this bold"
- "Create heading 1"
- "Link to [note name]"

---

## Voice Commands

### Formatting
| Command | What it does |
|---------|--------------|
| "Make bold" | **Bolds** selected text |
| "Italicize" | *Italicizes* selected text |
| "Heading 1-6" | Applies heading level |
| "Quote this" | Creates blockquote |
| "Make list" | Converts to bullet list |

### Navigation
| Command | What it does |
|---------|--------------|
| "Show backlinks" | Opens backlinks panel |
| "Open file [name]" | Opens named file |
| "Go to line [N]" | Jumps to line number |

### Query
| Command | What it does |
|---------|--------------|
| "Show all projects" | Queries `type:project` |
| "Find active tasks" | Queries `status:active` |
| "Search for [term]" | Opens query panel |

### AI
| Command | What it does |
|---------|--------------|
| "Summarize notes about [topic]" | AI summary |
| "What do my notes say about [topic]" | AI query |

---

## Query DSL Reference

### Filter Syntax

```
key:value
key:>value
key:>=value
key:<value
key:<=value
```

### Available Filters

| Filter | Description | Example |
|--------|-------------|---------|
| `type:` | Notes with supertag | `type:project` |
| `tag:` | Notes with markdown tag | `tag:work` |
| `linked:` | Notes linking to target | `linked:[[Meeting]]` |
| `from:` | Notes linked from source | `from:[[Index]]` |
| `created:` | Creation date | `created:>2024-01-01` |
| `updated:` | Update date | `updated:>=2024-06-01` |
| `has:` | Has property | `has:supertags` |

### Field Filters

Query supertag fields directly:

```
status:active          # Any supertag with status field
project.status:active  # Only Project supertag's status field
priority:>5           # Numeric comparison
```

### Text Search

```
"exact phrase"  # Exact match in title
word1 word2     # All words must appear
```

### Examples

```
type:project status:active
tag:work created:>2024-01-01
has:links "meeting notes"
type:task priority:>3
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Open command palette |
| `Cmd/Ctrl + O` | Open file |
| `Cmd/Ctrl + S` | Save file |
| `Cmd/Ctrl + B` | Bold |
| `Cmd/Ctrl + I` | Italic |
| `Cmd/Ctrl + Shift + K` | Toggle voice |

---

## Troubleshooting

### Voice not working
1. Check microphone permissions (browser/OS)
2. Verify Whisper model is downloaded
3. Try a smaller model if transcription is slow

### Sync not connecting
1. Check sync server is running (Settings → Sync)
2. Verify WebSocket URL is correct
3. Check firewall settings

### Query returns no results
1. Verify notes have expected supertags/tags
2. Check date format (YYYY-MM-DD)
3. Try simpler query first

---

## Support

Report issues at: https://github.com/anthropics/claude-code/issues
```

#### 3.2 In-App Help Panel

**File: `src/components/HelpPanel.tsx`** (new)
```typescript
import { useState } from 'react';

type HelpSection = 'voice' | 'query' | 'shortcuts' | 'supertags';

export function HelpPanel() {
  const [section, setSection] = useState<HelpSection>('voice');

  return (
    <div className="help-panel p-4 space-y-4">
      <h3 className="text-sm font-medium">Help</h3>

      {/* Tab navigation */}
      <div className="flex gap-2 border-b border-border pb-2">
        {(['voice', 'query', 'shortcuts', 'supertags'] as const).map((s) => (
          <button
            key={s}
            className={`text-xs px-2 py-1 rounded ${
              section === s
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setSection(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="text-sm space-y-3">
        {section === 'voice' && <VoiceHelp />}
        {section === 'query' && <QueryHelp />}
        {section === 'shortcuts' && <ShortcutsHelp />}
        {section === 'supertags' && <SupertagsHelp />}
      </div>
    </div>
  );
}

function VoiceHelp() {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground">Speak commands while text is selected:</p>
      <ul className="space-y-1 text-xs">
        <li><code>"make bold"</code> - Bold text</li>
        <li><code>"heading 1"</code> - H1 heading</li>
        <li><code>"show backlinks"</code> - Open panel</li>
        <li><code>"summarize notes about X"</code> - AI query</li>
      </ul>
    </div>
  );
}

function QueryHelp() {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground">Query syntax:</p>
      <ul className="space-y-1 text-xs">
        <li><code>type:project</code> - Notes with supertag</li>
        <li><code>tag:work</code> - Notes with tag</li>
        <li><code>created:{'>'}2024-01-01</code> - By date</li>
        <li><code>has:links</code> - Notes with links</li>
      </ul>
    </div>
  );
}

function ShortcutsHelp() {
  return (
    <div className="space-y-2">
      <ul className="space-y-1 text-xs">
        <li><kbd>Cmd+K</kbd> - Command palette</li>
        <li><kbd>Cmd+O</kbd> - Open file</li>
        <li><kbd>Cmd+B</kbd> - Bold</li>
        <li><kbd>Cmd+I</kbd> - Italic</li>
      </ul>
    </div>
  );
}

function SupertagsHelp() {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground">Supertags add typed metadata to notes:</p>
      <ol className="space-y-1 text-xs list-decimal list-inside">
        <li>Create definition (Settings → Supertags)</li>
        <li>Add fields (text, date, select, etc.)</li>
        <li>Apply to notes via command palette</li>
        <li>Query by type or fields</li>
      </ol>
    </div>
  );
}
```

### Documentation Checklist

- [ ] User guide covers all features
- [ ] Voice command reference is complete
- [ ] Query DSL documented with examples
- [ ] Keyboard shortcuts listed
- [ ] Troubleshooting section helpful
- [ ] In-app help panel added

---

## Day 4: CI/CD Pipeline

### Problem Statement

Currently:
- Forgejo workflow exists (`.forgejo/workflows/release.yml`)
- Runners not configured
- No automated testing
- No cross-platform build validation

### Implementation Plan

#### 4.1 Forgejo Runner Setup

**Runner Requirements:**
- Linux (x86_64): Build AppImage, .deb
- Windows (x86_64): Build MSI, .exe
- macOS (ARM64): Build DMG, .app

**Runner Installation Script:**
```bash
#!/bin/bash
# setup-forgejo-runner.sh

# Install Forgejo runner
curl -Lo forgejo-runner https://code.forgejo.org/forgejo/runner/releases/download/v3.3.0/forgejo-runner-3.3.0-linux-amd64
chmod +x forgejo-runner

# Register with Forgejo instance
./forgejo-runner register \
  --instance https://your-forgejo.example.com \
  --token YOUR_RUNNER_TOKEN \
  --name "linux-builder" \
  --labels "linux,x86_64"

# Install as systemd service
sudo ./forgejo-runner install
sudo systemctl enable forgejo-runner
sudo systemctl start forgejo-runner
```

#### 4.2 Enhanced Release Workflow

**File: `.forgejo/workflows/release.yml`** (modify)
```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install

      - name: Type check
        run: pnpm tsc --noEmit

      - name: Lint
        run: pnpm lint

      - name: Unit tests
        run: pnpm test

  build-linux:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install system dependencies
        run: |
          sudo apt update
          sudo apt install -y \
            libwebkit2gtk-4.1-dev \
            libgtk-3-dev \
            libayatana-appindicator3-dev \
            librsvg2-dev \
            libasound2-dev

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install

      - name: Build Tauri app
        run: pnpm tauri:build

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: linux-builds
          path: |
            src-tauri/target/release/bundle/appimage/*.AppImage
            src-tauri/target/release/bundle/deb/*.deb

  build-windows:
    needs: test
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install

      - name: Build Tauri app
        run: pnpm tauri:build

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: windows-builds
          path: |
            src-tauri/target/release/bundle/msi/*.msi
            src-tauri/target/release/bundle/nsis/*.exe

  build-macos:
    needs: test
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install

      - name: Build Tauri app
        run: pnpm tauri:build

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: macos-builds
          path: |
            src-tauri/target/release/bundle/dmg/*.dmg

  release:
    needs: [build-linux, build-windows, build-macos]
    runs-on: ubuntu-latest
    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4

      - name: Create release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            linux-builds/*
            windows-builds/*
            macos-builds/*
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### 4.3 Pre-commit Hooks

**File: `.husky/pre-commit`** (new)
```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Type check
pnpm tsc --noEmit

# Lint
pnpm lint --max-warnings 0

# Format check
pnpm prettier --check "src/**/*.{ts,tsx}"
```

### CI/CD Checklist

- [ ] Forgejo runners installed and registered
- [ ] Linux build succeeds (AppImage, deb)
- [ ] Windows build succeeds (MSI)
- [ ] macOS build succeeds (DMG)
- [ ] Tests run before build
- [ ] Artifacts uploaded to release
- [ ] Pre-commit hooks configured

---

## Day 5: Polish + Release

### Problem Statement

Final polish before release:
1. Bug fixes from integration testing
2. UX improvements based on usage
3. Version bump and changelog
4. Release tag and announcement

### Implementation Plan

#### 5.1 Bug Fix Priority List

Track and fix issues found during Days 1-4:

| Priority | Issue | Component | Status |
|----------|-------|-----------|--------|
| P0 | Crashes, data loss | Any | Must fix |
| P1 | Feature not working | Week 1-4 features | Should fix |
| P2 | UX issues | UI polish | Nice to have |
| P3 | Minor annoyances | Any | Defer |

#### 5.2 Version Bump

**File: `package.json`** (modify)
```json
{
  "version": "0.3.0"
}
```

**File: `src-tauri/Cargo.toml`** (modify)
```toml
[package]
version = "0.3.0"
```

**File: `src-tauri/tauri.conf.json`** (modify)
```json
{
  "version": "0.3.0"
}
```

#### 5.3 Changelog

**File: `CHANGELOG.md`** (new/modify)
```markdown
# Changelog

## [0.3.0] - 2025-01-XX

### Added
- **Query Engine**: Search notes with DSL syntax (`type:project status:active`)
- **Supertags**: Create typed metadata templates with custom fields
- **Transclusion**: Embed content with `![[Note#block]]` syntax
- **AI Voice Queries**: "Summarize notes about X" command
- **Sync Server**: Local Automerge sync via Tauri sidecar
- **Confirmation UI**: Risk-based confirmations with progressive disclosure
- **Backlinks Panel**: View incoming links to current note
- **Block IDs**: Stable identifiers for granular linking

### Changed
- Editor context signals for smarter voice commands
- Command ranking based on context and history
- Settings moved to file-based config (XDG standards)

### Fixed
- Various voice command recognition improvements
- CRDT sync stability improvements

## [0.2.0] - 2024-XX-XX
- Initial voice command support
- Live preview markdown editor
- Multi-tab interface
```

#### 5.4 Release Checklist

```bash
# 1. Ensure all tests pass
pnpm tsc --noEmit
pnpm test

# 2. Update version in all files
# package.json, Cargo.toml, tauri.conf.json

# 3. Update CHANGELOG.md

# 4. Commit version bump
git add -A
git commit -m "chore: bump version to 0.3.0"

# 5. Create annotated tag
git tag -a v0.3.0 -m "Release 0.3.0 - Query Engine, Supertags, Sync"

# 6. Push with tags
git push origin main --tags

# 7. CI/CD builds and creates release
# 8. Update download links in README
```

### Release Checklist

- [ ] All P0/P1 bugs fixed
- [ ] Version bumped in all files
- [ ] Changelog updated
- [ ] Release tag created
- [ ] CI/CD builds succeeded
- [ ] Artifacts attached to release
- [ ] README updated with new features

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/__tests__/integration/full-workflow.test.ts` | Cross-feature integration tests |
| `src/__tests__/integration/voice-coverage.test.ts` | Voice command coverage tests |
| `src/__tests__/integration/error-handling.test.ts` | Error boundary tests |
| `src/components/dev/PerformancePanel.tsx` | Dev-only performance monitoring |
| `docs/USER-GUIDE.md` | Comprehensive user documentation |
| `src/components/HelpPanel.tsx` | In-app help panel |
| `.husky/pre-commit` | Pre-commit hooks |
| `CHANGELOG.md` | Version changelog |

## Files to Modify

| File | Changes |
|------|---------|
| `src/query/executor.ts` | Add performance timing, index optimization |
| `src/hooks/useSyncStatus.ts` | Add latency tracking |
| `.forgejo/workflows/release.yml` | Enhanced CI/CD with tests |
| `package.json` | Version bump, test scripts |
| `src-tauri/Cargo.toml` | Version bump |
| `src-tauri/tauri.conf.json` | Version bump |

---

## Success Criteria

By end of Week 5:
- [ ] All Week 1-4 features work together correctly
- [ ] Query execution <100ms for 1k notes
- [ ] User documentation complete
- [ ] CI/CD pipeline builds all platforms
- [ ] Version 0.3.0 released with changelog
- [ ] No P0/P1 bugs remaining

---

## Risk Assessment

| Task | Risk | Mitigation |
|------|------|------------|
| Integration bugs | 🟡 Medium | Thorough testing, prioritize fixes |
| Performance issues | 🟡 Medium | Profile early, optimize hot paths |
| CI runner setup | 🔴 High | May need self-hosted runners for Tauri |
| Cross-platform builds | 🟡 Medium | Test on real hardware, not just CI |
| Release timing | 🟢 Low | Features complete, just polish |

---

## Architecture Diagram

```
+------------------------------------------------------------------------------+
|                              WEEK 5 ACTIVITIES                                |
+------------------------------------------------------------------------------+
|                                                                               |
|  Day 1: Integration     Day 2: Performance    Day 3: Documentation           |
|  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐             |
|  │ Cross-feature   │   │ Query timing    │   │ User guide      │             |
|  │ Voice coverage  │   │ Sync latency    │   │ Query DSL ref   │             |
|  │ Error handling  │   │ Memory profile  │   │ In-app help     │             |
|  └─────────────────┘   └─────────────────┘   └─────────────────┘             |
|                                                                               |
|  Day 4: CI/CD          Day 5: Release                                         |
|  ┌─────────────────┐   ┌─────────────────┐                                   |
|  │ Runner setup    │   │ Bug fixes       │                                   |
|  │ Build pipeline  │   │ Version bump    │                                   |
|  │ Pre-commit      │   │ Changelog       │                                   |
|  └─────────────────┘   └─────────────────┘                                   |
|                                                                               |
|  <--------------------- Built on Weeks 1-4 --------------------->            |
|                                                                               |
|   Block IDs | Supertags | Transclusion | AI Queries | Sync | Query Engine    |
|                                                                               |
+------------------------------------------------------------------------------+
```
