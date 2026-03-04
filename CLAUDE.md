# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mutter is a voice-first markdown editor built with Tauri v2, React, and Rust. It provides a live preview markdown editor with local voice dictation via Whisper for hands-free writing.

**Current Status:** Feature-complete with GitHub Actions CI/CD pipeline

**Version:** 0.3.0

## Development Commands

### Package Manager
This project uses **pnpm** (v10.18.3, specified via `packageManager` field in `package.json`).

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

Tests are organized in `src/__tests__/` with `unit/`, `integration/`, and `performance/` subdirectories. The test setup (`src/__tests__/setup.ts`) mocks localStorage, ResizeObserver, IntersectionObserver, and Tauri APIs (`@tauri-apps/api/core`, `@tauri-apps/api/event`, `@tauri-apps/plugin-dialog`).

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
- Web Audio API (voice capture)

**Backend (src-tauri/):**
- Rust + Tauri v2
- whisper-rs 0.14 (whisper.cpp bindings for speech-to-text)
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

### Project Structure

**Frontend (src/):**
- `components/` - React components (Editor, Sidebar, TabBar, voice UI, dialogs)
- `components/ui/` - shadcn/ui component library
- `components/graph/` - Graph visualization (react-force-graph-2d)
- `editor/` - CodeMirror extensions (livePreview.ts, theme.ts, commands.ts, autoPairs.ts, transclusionExtension.ts, blockIdExtension.ts)
- `hooks/` - Custom React hooks (useAudioRecorder.ts, useVaultIndex.ts, useGraphData.ts)
- `vault/` - In-memory vault index, link parser, and path utilities
- `context/` - React contexts (VaultMetadataContext, EditorContextProvider)
- `services/` - LLM integration (llm-service.ts supports Claude/OpenAI/Ollama), text cleanup with annotation parsing

**Backend (src-tauri/src/):**
- `ml.rs` - Whisper speech-to-text inference via whisper-rs
- `audio.rs` - Audio processing (VAD, ring buffer)
- `config.rs` - Settings management (XDG config files)
- `commands.rs` - Tauri command exports
- `file_watcher.rs` - File system change detection

### Voice Dictation Pipeline

1. **Audio Capture** (`audio.rs`): Web Audio API → ring buffer → VAD detects ~500ms silence
2. **Transcription** (`ml.rs`): Whisper model runs locally via whisper-rs (no cloud API)
3. **Insertion**: Transcribed text inserted at cursor position in the editor

```
Voice → Whisper transcription → insert at cursor
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

**Services layer (`src/services/`):**
- `llm-service.ts` - Unified LLM API (Claude, OpenAI, Ollama) with timeout handling
- `text-cleanup-service.ts` - Annotation-based text processing that parses `HEADING:<line>:<level>:<text>` and `BREAK:<line>` directives
- `text-cleanup-prompts.ts` - Prompt templates with hybrid mode detection for large documents

### File System Watcher

`file_watcher.rs` watches vault for external changes. **Important**: Deliberately ignores content modifications to prevent reload loops during editing. Only reacts to create/delete/rename operations.

### Graph View Architecture

The graph view uses `react-force-graph-2d` to visualize note relationships:

```
VaultIndex → useGraphData hook → GraphView component
```

**Key files:**
- `src/hooks/useGraphData.ts` - Transforms vault index data into graph format (uses `useMemo` for performance)
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

See `docs/DESIGN_SYSTEM.md` for full details. Key rules:
- **8px spacing grid** - all spacing must be multiples of 8
- **Color = meaning** - color only for state changes, errors, recording (Pacific Blue #00A0B4)
- **IBM Plex Sans/Mono** - no other fonts
- **Dark mode first** - #121212 background
- **Border-only buttons** by default (filled only for primary actions)

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

No global state library. Uses React hooks + props drilling + LocalStorage (`utils/storage.ts`). Vault metadata is an in-memory index (`src/vault/vaultIndex.ts`) rebuilt from the filesystem each session.

### Path Aliases

The project uses `@/` as an alias for `src/`:
```typescript
import { Button } from '@/components/ui/button';
```
Configured in both `tsconfig.json` and `vitest.config.ts`.

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

### Building for Release

```bash
# Build production app
pnpm tauri:build

# Artifacts in: src-tauri/target/release/bundle/
```

**CI/CD (GitHub Actions):**
- **CI** (`.github/workflows/ci.yml`): Runs on PRs to `main` — lint, test, frontend build, cargo check
- **Release** (`.github/workflows/release.yml`): Runs on push to `main` — builds Linux, Windows, macOS via `tauri-apps/tauri-action`
- **Branch protection**: `main` requires PR with passing CI checks; use `release/*` branches for release PRs

### Testing Voice Dictation

1. **Enable microphone** (click mic icon)
2. **Speak naturally** — words are transcribed and inserted at cursor
3. **Wait for silence** (~800ms) to trigger transcription
4. **Check voice log** (right sidebar) for transcription history

## Important Notes

### ML Framework Architecture

**Speech-to-Text:** Uses **whisper-rs** (Rust bindings to whisper.cpp) for Whisper inference. GGML format models are single files (~75MB-3GB). whisper.cpp handles long audio natively.

**Critical**: `Cargo.toml` has `[profile.dev.package."*"] opt-level = 3` to optimize Whisper inference in debug builds.

### File Naming Conventions

- **Components**: `PascalCase.tsx` (e.g., `Editor.tsx`)
- **Hooks**: `camelCase.ts` with `use` prefix (if any)
- **Utilities**: `camelCase.ts` (e.g., `storage.ts`)
- **Editor Extensions**: `camelCase.ts` (e.g., `livePreview.ts`)

### Rust Version

Requires Rust 1.77.2+ (specified in `Cargo.toml`). whisper-rs has specific compiler requirements.

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

## Related Documentation

- `README.md` - User-facing documentation with quick start guide
- `docs/USER-GUIDE.md` - Comprehensive user guide (voice dictation, query DSL, shortcuts)
- `docs/CONFIG_DESIGN.md` - Configuration architecture and XDG standards
- `docs/DESIGN_SYSTEM.md` - Design principles, typography, spacing, colors
- `.github/workflows/ci.yml` - CI checks (lint, test, build, cargo check)
- `.github/workflows/release.yml` - Release builds via tauri-apps/tauri-action

## Common Pitfalls

1. **@lezer/common version mismatch**: Pinned to 1.5.0 to prevent CodeMirror `'tags3'` or `'all'` crashes
2. **Model not downloaded**: Download model in Settings before using voice
3. **VAD too sensitive**: Adjust silence threshold if commands cut off early
4. **Selection required**: Some commands (bold, italic) require text selection first
5. **Microphone permissions**: Browser/OS must grant microphone access
6. **File watcher flooding**: The watcher deliberately ignores content modifications to prevent constant reloads while editing
7. **Stream Mode API keys**: Store in `~/.config/mutter/credentials.json`, NOT in settings.json (which may sync)
8. **Tab state loss**: Tab state is ephemeral; closing a tab loses unsaved changes unless auto-saved
9. **Design system violations**: Use 8px spacing multiples; arbitrary spacing breaks the grid
10. **Auto-save loops**: Editor auto-save effect must check `content !== savedContent` to prevent save spam


## Debugging

**Rust logs**: Run `pnpm tauri:dev`, logs appear in terminal. File watcher logs have `[FileWatcher]` prefix.

**Config files**: `~/.config/mutter/{settings,credentials,state}.json`

**Voice dictation**: Open Voice Log dialog (right sidebar) to see transcription history.

**Vault index**: The in-memory index is rebuilt from files each session — no persistent state to debug.

