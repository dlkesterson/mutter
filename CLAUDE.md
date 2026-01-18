# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mutter is a voice-first markdown editor with semantic command recognition, built with Tauri v2, React, and Rust + Candle ML. It provides a live preview markdown editor with voice control for hands-free writing and editing.

**Current Status:** Feature-complete, needs release pipeline (Forgejo CI/CD created but runners not configured)

**Version:** 0.3.0

## Development Commands

### Package Manager
This project uses **pnpm** (specified in `package.json`).

```bash
# Install dependencies
pnpm install

# Run Tauri desktop app in development
pnpm tauri:dev

# Build Vite frontend only
pnpm build

# Build complete desktop application
pnpm tauri:build

# Run Vite dev server only (for frontend testing without Tauri)
pnpm dev
```

### Testing

```bash
# Run tests in watch mode
pnpm test

# Run tests once (CI mode)
pnpm test:run

# Run a specific test file
pnpm test:run src/__tests__/unit/query-parser.test.ts

# Run tests matching a pattern
pnpm test:run -t "query parser"

# Run tests with coverage
pnpm test:coverage

# Run tests with Vitest UI
pnpm test:ui
```

Tests are organized in `src/__tests__/` with `unit/` and `integration/` subdirectories.

### Linting & Type Checking

```bash
# TypeScript type checking (no emit)
pnpm lint
```

### Model Management

```bash
# Download Whisper models (run from project root)
./download-model.sh

# Or download specific model from within the app:
# Settings → Whisper Model Selector → Choose model → Download
```

## Architecture

### Tech Stack

**Frontend (src/):**
- React 19 + TypeScript + Vite 7
- CodeMirror 6 (markdown editor with live preview)
- Tailwind CSS v4 + shadcn/ui components
- React Resizable Panels (flexible layout)
- Automerge 3.2.1 (CRDTs for vault metadata)
- Web Audio API (voice capture)

**Backend (src-tauri/):**
- Rust + Tauri v2
- whisper-rs 0.14 (whisper.cpp bindings for speech-to-text)
- Candle 0.8 (ML framework for BERT embeddings, with CUDA GPU support)
- Tokio (async runtime)
- Tauri plugins:
  - `plugin-dialog` - File/folder dialogs
  - `plugin-fs` - Filesystem access
  - `plugin-global-shortcut` - System-wide keyboard shortcuts
  - `plugin-clipboard-manager` - Clipboard operations
  - `plugin-shell` - Shell command execution
- File watcher: `notify` + `notify-debouncer-full` for vault change detection

**ML Models (Local):**
- Whisper (speech-to-text): GGML format models via whisper.cpp (Tiny, Base, Small, Medium, Large v3)
- BERT (semantic embeddings): sentence-transformers/all-MiniLM-L6-v2 for command understanding

### Project Structure

**Frontend (src/):**
- `components/` - React components (Editor, Sidebar, TabBar, voice UI, dialogs)
- `components/ui/` - shadcn/ui component library
- `components/graph/` - Graph visualization (react-force-graph-2d)
- `editor/` - CodeMirror extensions (livePreview.ts, theme.ts, commands.ts, autoPairs.ts, transclusionExtension.ts, blockIdExtension.ts)
- `hooks/` - Custom React hooks (useAudioRecorder.ts, useVaultMetadataCrdt.ts, useGraphData.ts)
- `voice/` - Voice command system (108 commands across 7 categories)
- `graph/` - Link parsing and graph building utilities
- `context/` - React contexts (VaultMetadataContext, EditorContextProvider)

**Backend (src-tauri/src/):**
- `ml.rs` - Whisper (whisper-rs) + BERT (Candle) ML inference
- `audio.rs` - Audio processing (VAD, ring buffer)
- `registry.rs` - Voice command registry with BERT embeddings
- `config.rs` - Settings management (XDG config files)
- `commands.rs` - Tauri command exports
- `file_watcher.rs` - File system change detection

### Voice Command Pipeline

The core architecture for voice-to-command:

1. **Audio Capture** (`audio.rs`): Web Audio API → ring buffer → VAD detects ~800ms silence
2. **Transcription** (`ml.rs`): Whisper model runs locally via Candle (no cloud API)
3. **Command Matching** (`registry.rs`): BERT embeddings compare to command registry
4. **Execution**: High confidence → execute; ambiguous → disambiguation UI

**Command Execution Flow:**
```
Voice → Whisper transcription → BERT embedding → cosine similarity → execute/disambiguate
```

### Live Preview Editor

`src/editor/livePreview.ts` uses CodeMirror 6 decorations to hide markdown syntax when cursor is outside that line. Syntax becomes visible only when editing.

### CodeMirror Extensions

The editor loads multiple ViewPlugins that rebuild decorations on document/viewport changes:

| Extension | File | Purpose |
|-----------|------|---------|
| `livePreviewPlugin` | `livePreview.ts` | Hides markdown syntax (bold, italic, links) when cursor not on line |
| `blockIdDecorationPlugin` | `blockIdExtension.ts` | Always hides block IDs (`^abc123`) from display |
| `transclusionExtension` | `transclusionExtension.ts` | Renders `![[Note#block]]` embeds as live widgets |

**Transclusion System:**
- Embeds (`![[Note]]` or `![[Note#blockId]]`) are replaced with live content widgets
- Content loaded asynchronously with loading/error states
- Async dispatches wrapped in try-catch to handle view destruction during unmount
- Uses `StateEffect` pattern for updating content after load

### Stream Mode (Experimental)

AI-assisted post-processing of transcriptions. After Whisper completes, optionally sends text to Claude/OpenAI/Ollama to remove fillers and add structure. Configure in Settings → Stream Mode.

### File System Watcher

`file_watcher.rs` watches vault for external changes. **Important**: Deliberately ignores content modifications to prevent reload loops during editing. Only reacts to create/delete/rename operations.

### Graph View Architecture

The graph view uses `react-force-graph-2d` to visualize note relationships:

```
VaultMetadataDoc (CRDT) → useGraphData hook → GraphView component
```

**Key files:**
- `src/hooks/useGraphData.ts` - Transforms CRDT notes/edges into graph format (uses `useMemo` for performance)
- `src/components/graph/GraphView.tsx` - Force-graph wrapper with `React.memo` to prevent resize jank
- `src/components/graph/GraphPanel.tsx` - Right sidebar panel with debounced resize handling
- `src/components/graph/graphConfig.ts` - Colors, forces, and performance thresholds

**Performance considerations:**
- Graph dimensions are debounced (100ms) via ResizeObserver
- `GraphView` skips re-renders for dimension changes < 10px
- Local graph (depth-limited BFS) used in panel; full graph only in dialog

### UI Layout Architecture

The main app layout in `App.tsx`:

```
┌─────────┬──────────────────────────┬─────────┐
│ Sidebar │     Main Content         │ Right   │
│ (left)  │  ┌────────────────────┐  │ Panel   │
│         │  │ TabBar             │  │         │
│ Collap- │  ├────────────────────┤  │ Collap- │
│ sible   │  │ Editor/ImageViewer │  │ sible   │
│ 48-256px│  │ or Empty State     │  │ 48-320px│
│         │  ├────────────────────┤  │         │
│         │  │ StatusBar          │  │         │
│         │  └────────────────────┘  │         │
└─────────┴──────────────────────────┴─────────┘
```

Both sidebars use `isCollapsed` state with smooth CSS transitions.

## Key Technical Details

### Configuration Management

**Location:** `~/.config/mutter/` (XDG standards, see `CONFIG_DESIGN.md`)

| File | Purpose | Sync Safe? |
|------|---------|------------|
| `settings.json` | User preferences, vault path, voice settings | ✓ Yes |
| `credentials.json` | API keys (Claude, OpenAI) | ✗ Never |
| `state.json` | Ephemeral UI state | Optional |

### Design System

See `DESIGN_SYSTEM.md` for full details. Key rules:
- **8px spacing grid** - all spacing must be multiples of 8
- **Color = meaning** - color only for state changes, errors, recording (Pacific Blue #00A0B4)
- **IBM Plex Sans/Mono** - no other fonts
- **Dark mode first** - #121212 background
- **Border-only buttons** by default (filled only for primary actions)

### Automerge Version Pinning

**Important:** Automerge is pinned to 3.2.1 via `pnpm.overrides` in `package.json`:

```json
"pnpm": {
  "overrides": {
    "@automerge/automerge": "3.2.1",
    "@lezer/common": "1.5.0"
  }
}
```

This ensures CRDT compatibility and prevents CodeMirror plugin crashes from version mismatches.

### Whisper Model Variants (GGML Format)

Models are downloaded from `ggerganov/whisper.cpp` on HuggingFace in GGML format:

| Model | Size | Speed | Accuracy | Languages |
|-------|------|-------|----------|-----------|
| `ggml-tiny.en` | 75 MB | Fastest | Lower | English |
| `ggml-base.en` | 142 MB | Fast | Good | English |
| `ggml-small.en` | 466 MB | Moderate | Better | English |
| `ggml-medium.en` | 1.5 GB | Slower | High | English |
| `ggml-large-v3` | 3.1 GB | Slowest | Highest | 99+ languages |

**Recommended:** `ggml-base.en` for a good balance of speed and accuracy.

**Download Location:**
- Models stored as `<app-data>/models/<model-name>.bin`
- Managed by `src-tauri/src/ml.rs` (ModelManager)
- UI selector in `src/components/WhisperModelSelector.tsx`

**Note:** whisper.cpp handles long audio natively via timestamp tokens - no manual chunking needed.

### State Management

No global state library. Uses React hooks + props drilling + LocalStorage (`utils/storage.ts`). Automerge for vault metadata (experimental).

## Common Workflows

### First Time Setup

```bash
# Install dependencies
pnpm install

# Run the app
pnpm tauri:dev

# In the app:
1. Click "Open Folder" → Select vault directory
2. Click "+ New Note" → Create first note
3. Click microphone icon → Enable voice
4. Download Whisper model (Settings → Model Selector)
```

### Adding a Voice Command

Voice commands are defined in TypeScript in `src/voice/commands/`. There are 7 command categories:

| File | Category | Examples |
|------|----------|----------|
| `formatting.ts` | Text formatting | bold, italic, headings, lists, tables |
| `navigation.ts` | Cursor/document navigation | go to line, scroll, search |
| `linking.ts` | Links and references | wiki links, embeds, backlinks |
| `meta.ts` | App control | undo, save, new note, view toggles |
| `supertags.ts` | Metadata/tagging | apply tag, set field, query tags |
| `query.ts` | AI queries | ask about selection, explain |
| `graphNavigation.ts` | Graph traversal | follow link, go back |

**To add a new command:**

1. **Define command** in the appropriate `src/voice/commands/*.ts` file:
   ```typescript
   {
     id: 'format-my-command',
     name: 'My Command',
     examples: ['my command', 'do my thing', 'make it happen'],
     bucket: 'format-text',
     requiresSelection: true,
     requiresNote: true,
     allowedLocations: ['paragraph', 'heading'],
     allowedViewModes: ['editor', 'split'],
     allowedVoicePhases: ['listening', 'command-recognized'],
     destructiveness: 'none',
     scope: 'inline',
     reversible: true,
     action: () => dispatchEditorCommand('myCommand'),
   }
   ```

2. **Handle the event** in `src/components/Editor.tsx`:
   ```typescript
   case 'myCommand':
     // Implement the action
     break;
   ```

3. **Run tests** to verify registration: `pnpm test:run -t "voice coverage"`

Commands dispatch via `CustomEvent('mutter:execute-command')` which Editor.tsx listens for.

### Building for Release

```bash
# Build production app
pnpm tauri:build

# Artifacts in: src-tauri/target/release/bundle/
```

**CI/CD (Forgejo):**
- Workflow created: `.forgejo/workflows/release.yml`
- Builds: Linux (AppImage, deb), Windows (MSI), macOS (DMG)
- **Blocker:** Forgejo runners not yet configured
- See Forever Tools Roadmap Phase 1.2 for runner setup

### Testing Voice Commands

1. **Enable microphone** (click mic icon)
2. **Select text** (for commands that require selection)
3. **Speak command** clearly
4. **Wait for silence** (~800ms)
5. **Check voice log** (right sidebar) for confidence scores

## Important Notes

### ML Framework Architecture

**Speech-to-Text:** Uses **whisper-rs** (Rust bindings to whisper.cpp) for Whisper inference. GGML format models are single files (~75MB-3GB). whisper.cpp handles long audio natively.

**Semantic Embeddings:** Uses **Candle** (pure Rust ML) for BERT embeddings, with CUDA GPU support. Falls back to CPU automatically.

**Critical**: `Cargo.toml` has `[profile.dev.package."*"] opt-level = 3` to optimize ML dependencies in debug builds.

### CRDT Sync (Experimental)

Vault metadata uses Automerge 3.2.1. See `docs/CRDT-CONVENTIONS.md` for sync strategy.

### File Naming Conventions

- **Components**: `PascalCase.tsx` (e.g., `Editor.tsx`)
- **Hooks**: `camelCase.ts` with `use` prefix (if any)
- **Utilities**: `camelCase.ts` (e.g., `storage.ts`)
- **Editor Extensions**: `camelCase.ts` (e.g., `livePreview.ts`)

### Linux Dependencies

For Tauri development on Linux:
```bash
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libasound2-dev libclang-dev cmake
```

**Notes:**
- `libasound2-dev` - audio engine support
- `libclang-dev` - whisper-rs bindgen (generates Rust bindings from C headers)
- `cmake` - builds whisper.cpp during compilation

### Hash-Based Routing

- `#/quick-capture` - Quick capture mode (minimal UI)
- `#/crdt?doc=<url>` - CRDT spike interface

## Related Documentation

- `README.md` - User-facing documentation with quick start guide
- `CONFIG_DESIGN.md` - Configuration architecture and XDG standards
- `DESIGN_SYSTEM.md` - Design principles, typography, spacing, colors
- `docs/CRDT-CONVENTIONS.md` - Automerge conventions and sync strategy
- `.forgejo/workflows/release.yml` - CI/CD workflow (pending runners)

## Common Pitfalls

1. **Automerge version mismatch**: Always use 3.2.1 (pinned in pnpm.overrides)
2. **@lezer/common version mismatch**: Pinned to 1.5.0 to prevent CodeMirror `'tags3'` or `'all'` crashes
3. **Model not downloaded**: Download model in Settings before using voice
4. **VAD too sensitive**: Adjust silence threshold if commands cut off early
5. **Selection required**: Some commands (bold, italic) require text selection first
6. **Microphone permissions**: Browser/OS must grant microphone access
7. **File watcher flooding**: The watcher deliberately ignores content modifications to prevent constant reloads while editing
8. **CUDA build errors**: If GPU acceleration fails to build, remove `features = ["cuda"]` from Cargo.toml dependencies
9. **Stream Mode API keys**: Store in `~/.config/mutter/credentials.json`, NOT in settings.json (which may sync)
10. **Tab state loss**: Tab state is ephemeral; closing a tab loses unsaved changes unless auto-saved
11. **Design system violations**: Use 8px spacing multiples; arbitrary spacing breaks the grid
12. **Auto-save loops**: Editor auto-save effect must check `content !== savedContent` to prevent CRDT spam


## Debugging

**Rust logs**: Run `pnpm tauri:dev`, logs appear in terminal. File watcher logs have `[FileWatcher]` prefix.

**Config files**: `~/.config/mutter/{settings,credentials,state}.json`

**Voice commands**: Open Voice Log dialog (right sidebar) to see transcription text, matched command, and confidence scores (0.0-1.0).

**CRDT state**: Check `<vault-path>/.mutter/state.json` and `.mutter/crdt/*/snapshots/`

Use 'bd' for task tracking.

