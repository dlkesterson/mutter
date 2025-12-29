# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mutter is a voice-first markdown editor with semantic command recognition, built with Tauri v2, React, and Rust + Candle ML. It provides a live preview markdown editor with voice control for hands-free writing and editing.

**Current Status:** Feature-complete, needs release pipeline (Forgejo CI/CD created but runners not configured)

**Version:** 0.2.0

## Development Commands

### Package Manager
This project uses **pnpm** (specified in `package.json`).

```bash
# Install dependencies
pnpm install

# Run Tauri desktop app in development
pnpm tauri:dev

# Build Next.js frontend only
pnpm build

# Build complete desktop application
pnpm tauri:build

# Run Vite dev server only (for frontend testing)
pnpm dev
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
- Candle 0.8 (ML framework for Whisper + BERT, with CUDA GPU support)
- Tokio (async runtime)
- Tauri plugins:
  - `plugin-dialog` - File/folder dialogs
  - `plugin-fs` - Filesystem access
  - `plugin-global-shortcut` - System-wide keyboard shortcuts
  - `plugin-clipboard-manager` - Clipboard operations
  - `plugin-shell` - Shell command execution
- File watcher: `notify` + `notify-debouncer-full` for vault change detection

**ML Models (Local):**
- Whisper (speech-to-text): Distil-Whisper or standard Whisper (Tiny, Base, Small, Medium, Large v3)
- BERT (semantic embeddings): For command understanding

### Project Structure

```
src/
├── components/
│   ├── Editor.tsx                    # CodeMirror markdown editor
│   ├── Sidebar.tsx                   # File navigation sidebar
│   ├── TabBar.tsx                    # Multi-tab editor with drag-drop reordering
│   ├── VoiceIndicator.tsx            # Microphone status UI
│   ├── StreamingTranscription.tsx    # Real-time transcription display
│   ├── AmbiguityPopover.tsx          # Command disambiguation UI
│   ├── WhisperModelSelector.tsx      # Model download & selection
│   ├── WaveformVisualizer.tsx        # Audio waveform display
│   ├── FileTree.tsx                  # Vault file tree
│   ├── QuickCapture.tsx              # Quick note capture (hash route: #/quick-capture)
│   ├── Omnibox.tsx                   # Command palette (Cmd+K)
│   ├── CrdtSpike.tsx                 # CRDT experimentation (hash route: #/crdt)
│   ├── ContextMenu.tsx               # Right-click context menus
│   ├── ErrorBoundary.tsx             # Error boundary component
│   ├── dialogs/
│   │   ├── settings-dialog.tsx       # App settings (includes Stream Mode)
│   │   ├── file-navigator-dialog.tsx # File picker
│   │   └── voice-log-dialog.tsx      # Voice command history
│   └── ui/                           # shadcn/ui components
├── editor/
│   ├── livePreview.ts                # Custom CodeMirror decorations (hide markdown syntax)
│   ├── theme.ts                      # Custom CodeMirror theme
│   ├── commands.ts                   # Editor command definitions
│   └── autoPairs.ts                  # Auto-close brackets/quotes
├── hooks/
│   ├── useAudioRecorder.ts           # Voice recording hook
│   └── useVaultMetadataCrdt.ts       # CRDT vault metadata hook
├── lib/
│   └── utils.ts                      # Utility functions (cn, etc.)
└── utils/
    └── storage.ts                    # LocalStorage utilities

src-tauri/src/
├── main.rs                           # Application entry point
├── lib.rs                            # Command registration
├── commands.rs                       # Tauri command exports (file ops, search, tasks)
├── ml.rs                             # Whisper + BERT ML inference
├── audio.rs                          # Audio processing (VAD, ring buffer)
├── config.rs                         # Settings management (XDG config files)
├── file_watcher.rs                   # File system change detection
├── system.rs                         # System utilities
├── device.rs                         # Device identification
├── vault_state.rs                    # Vault state management
├── vault_crdt_fs.rs                  # CRDT filesystem sync
└── registry.rs                       # Command registry with embeddings
```

### Key Features Explained

#### 1. Live Preview Editor

**Implementation:** `src/editor/livePreview.ts`

CodeMirror 6 with custom decorations that **hide markdown syntax** when cursor is outside:
- `**bold**` → shows as bold text
- `*italic*` → shows as italic text
- `# Heading` → shows as styled heading
- Syntax only visible when editing that specific line

**Editor Configuration:** `src/components/Editor.tsx`
- Markdown language support
- Custom theme (`src/editor/theme.ts`)
- Auto-save on blur
- Auto-pairs for brackets/quotes

#### 2. Voice Control Pipeline

**Audio Capture:** `src-tauri/src/audio.rs`
- Web Audio API captures audio from microphone
- Ring buffer for continuous streaming
- VAD (Voice Activity Detection) detects silence (~800ms threshold)

**Transcription:** `src-tauri/src/ml.rs`
- Rust backend with Candle ML framework
- Whisper models run locally (no cloud API)
- **Streaming transcription**: Real-time visual feedback as you speak
- Model variants: Distil-Whisper (faster) or standard Whisper (more accurate)

**Command Recognition:** `src-tauri/src/registry.rs`
- BERT embeddings for semantic understanding
- Command registry with confidence scoring
- Disambiguation for ambiguous commands
- Context-aware execution (selection required/optional)

#### 3. Semantic Command Router

**Commands Registered:**
- **Formatting**: Bold, italic, heading 1-6, quote, list
- **Editor Actions**: Undo, redo, delete
- **Future**: Insert link, code block, table, etc.

**Command Execution Flow:**
1. Voice transcription → text
2. BERT embedding → vector
3. Compare to command embeddings → confidence scores
4. If confidence > threshold: Execute immediately
5. If ambiguous: Show disambiguation UI

**Voice Log:** Detailed history with:
- Transcription text
- Matched command + confidence score
- Execution time
- Interpretation debugging info

#### 4. File System

**Vault Structure:**
- User selects vault directory via "Open Folder"
- File tree displays `.md` files
- File watcher detects external changes
- Auto-save on blur

**CRDT Metadata (Experimental):**
- Uses Automerge 3.2.1 for vault metadata
- Pointer file: `.mutter/state.json`
- Snapshot sync: `.mutter/crdt/<docId>/snapshots/<deviceId>.am`
- Optional WebSocket relay for network sync

#### 5. Flexible Layout

**React Resizable Panels:**
- Left: File navigation (collapsible)
- Center: Editor (primary focus)
- Right: Voice log (collapsible)
- Layout persistence in localStorage

#### 6. Multi-Tab Editor

**Implementation:** `src/components/TabBar.tsx`

- Multiple files open simultaneously
- Drag-and-drop tab reordering
- Context menu: Close others, close to right, close all
- Preview mode (single-click) vs permanent tabs (double-click)
- Dirty state indicators (unsaved changes)

#### 7. Stream Mode (Experimental)

**Purpose:** AI-assisted transcription post-processing

After Whisper transcription completes, optionally send the raw text to an LLM to:
- Remove filler words ("um", "uh", "like")
- Add structure (paragraphs, headings)
- Match writing style of existing notes

**Configuration:** Settings → Stream Mode tab
- Providers: Claude, OpenAI, Ollama
- Timeout: Configurable (default 15s)
- Formatting options: Remove fillers, add structure, match style

**Implementation:**
- Frontend: `src/components/dialogs/settings-dialog.tsx`
- Backend: `src-tauri/src/config.rs` (StreamModeSettings)

#### 8. File System Watcher

**Implementation:** `src-tauri/src/file_watcher.rs`

- Watches vault directory for external changes
- Debounced events (prevents rapid re-renders)
- Filters noise: Ignores metadata, hidden files, sync files
- Only triggers on structural changes (create/delete/rename)
- **Does NOT reload on content modifications** (prevents constant reloads during editing)

## Key Technical Details

### Configuration Management

**Architecture:** File-based config following XDG standards (see `CONFIG_DESIGN.md`)

**Location:** `~/.config/mutter/`

**Files:**
- `settings.json` - User preferences (safe to sync via Syncthing)
  - Vault path, editor settings, voice settings
  - Stream Mode configuration
  - AI provider settings (models, URLs)
- `credentials.json` - Sensitive data (API keys, **never sync**)
  - Claude API key
  - OpenAI API key
- `state.json` - Ephemeral UI state (window positions, panel sizes)

**Implementation:**
- Backend: `src-tauri/src/config.rs` (Rust structs + file I/O)
- Frontend: Settings dialog reads/writes via Tauri commands
- **Migration:** IndexedDB → JSON files (one-time on version upgrade)

**Benefits:**
- Debuggable (can manually edit JSON)
- Syncable (settings.json across devices)
- Secure (credentials.json stays local)

### Design System

**Philosophy:** Dieter Rams' principles + Ink & Switch aesthetic (see `DESIGN_SYSTEM.md`)

**Key Principles:**
- Color only when meaningful (state changes, errors, recording)
- 8px spacing grid (all spacing is multiples of 8)
- IBM Plex Sans + IBM Plex Mono fonts
- Dark mode first (#121212 background)
- Pacific Blue accent (#00A0B4) for critical states

**Typography:**
- Headings: Bold/SemiBold IBM Plex Sans
- Body: Regular IBM Plex Sans
- Code/timestamps: IBM Plex Mono
- Type scale: 1.250 Major Third ratio

**Components:**
- Border-only buttons by default (Rams style)
- Filled buttons only for primary actions
- 2px Pacific Blue focus rings
- Timeline connectors for chronological logs

### Automerge Version Pinning

**Important:** Automerge is pinned to 3.2.1 via `pnpm.overrides` in `package.json`:

```json
"pnpm": {
  "overrides": {
    "@automerge/automerge": "3.2.1"
  }
}
```

This ensures CRDT compatibility across all dependencies.

### Whisper Model Variants

**Distil-Whisper** (Recommended):
- Faster inference
- Lower memory usage
- Good accuracy for clean audio
- Models: tiny, base, small, medium

**Standard Whisper**:
- Higher accuracy
- Slower inference
- Better for noisy audio
- Models: tiny, base, small, medium, large-v3

**Download Location:**
- Models stored in Tauri app data directory
- Managed by `src-tauri/src/ml.rs`
- UI selector in `src/components/WhisperModelSelector.tsx`

### Voice Activity Detection (VAD)

**How it works:**
1. Capture audio in chunks
2. Calculate RMS (root mean square) energy
3. If energy > threshold: "speech detected"
4. If energy < threshold for ~800ms: "silence detected" → finalize transcription

**Ring Buffer:**
- Stores last N chunks of audio
- Allows including audio from just before speech started
- Prevents cutting off first syllable

### CodeMirror Extensions

**Custom Extensions:**
1. **Live Preview** (`editor/livePreview.ts`):
   - Replaces markdown syntax with styled text
   - Only shows syntax when cursor is on that line
   - Uses CodeMirror decorations

2. **Auto Pairs** (`editor/autoPairs.ts`):
   - Auto-closes brackets, quotes, etc.
   - Skips closing character if already present

3. **Custom Theme** (`editor/theme.ts`):
   - Dark mode optimized
   - Custom colors for syntax highlighting

### State Management

**No global state library.** Uses:
- React hooks (useState, useEffect, useMemo, useRef)
- Props drilling for simple data flow
- LocalStorage for persistence (`utils/storage.ts`)
- Automerge for vault metadata (experimental)

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

1. **Define command** in `src-tauri/src/registry.rs`:
   ```rust
   Command {
       name: "insert_link",
       examples: vec!["insert link", "add link", "make this a link"],
       requires_selection: true,
       action: CommandAction::InsertLink,
   }
   ```

2. **Add action handler** in `src/components/Editor.tsx`:
   ```typescript
   case 'insert_link':
     const url = prompt('Enter URL:');
     if (url) editor.dispatch(insertLink(selection, url));
     break;
   ```

3. **Generate BERT embeddings** (automatically on startup)

4. **Test**: Speak "insert link" while text is selected

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

### Candle ML Framework

Mutter uses **Candle** (not PyTorch or ONNX) for ML inference:
- Pure Rust ML framework
- No Python runtime required
- **CUDA GPU support enabled** (10x faster transcription on NVIDIA GPUs)
- Automatically falls back to CPU if CUDA unavailable
- Models run entirely locally

**Model Loading:**
- First use: Downloads model from HuggingFace
- Subsequent uses: Loads from app data directory
- Model selector shows download progress

**GPU Acceleration:**
- Cargo.toml dependencies use `features = ["cuda"]`
- Candle detects CUDA at runtime
- Debug builds: Dependencies optimized (`opt-level = 3`) for acceptable ML performance

### CRDT Sync Strategy

**Current:** Experimental spike with manual URL pasting

**Planned:**
- Vault metadata stored in `.mutter/state.json`
- Per-device snapshots in `.mutter/crdt/<docId>/snapshots/`
- Synced via Syncthing (file-based) or WebSocket relay (network)
- See `docs/CRDT-CONVENTIONS.md` and `docs/VAULT-METADATA-CRDT.md`

### Performance Considerations

**Voice Processing:**
- Whisper inference runs in Rust backend (non-blocking)
- Streaming transcription for instant feedback
- Smaller models (Tiny, Base) for faster response
- Larger models (Medium, Large) for better accuracy

**Editor:**
- CodeMirror 6 is highly optimized for large documents
- Live preview decorations only compute for visible viewport
- Auto-save debounced to prevent excessive writes

### File Naming Conventions

- **Components**: `PascalCase.tsx` (e.g., `Editor.tsx`)
- **Hooks**: `camelCase.ts` with `use` prefix (if any)
- **Utilities**: `camelCase.ts` (e.g., `storage.ts`)
- **Editor Extensions**: `camelCase.ts` (e.g., `livePreview.ts`)

### Linux Dependencies

For Tauri development on Linux:
```bash
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libasound2-dev
```

**Note:** `libasound2-dev` is required for audio engine support.

### Build Optimization

**Cargo Profile (Important):**

`Cargo.toml` contains a special optimization for development:

```toml
[profile.dev.package."*"]
opt-level = 3
```

This ensures ML dependencies (Candle, Whisper, BERT) are optimized even in debug builds, preventing slow inference times during development. Without this, Whisper transcription would take 10-30 seconds instead of 1-3 seconds.

### Global Shortcuts

**Implementation:** `tauri-plugin-global-shortcut`

System-wide keyboard shortcuts can be registered for:
- Quick capture window (open from anywhere)
- Start/stop voice recording
- Custom commands

**Configuration:** Via Tauri's global shortcut API in `src-tauri/src/lib.rs`

### Hash-Based Routing

**Routes:**
- `#/quick-capture` - Quick capture mode (minimal UI for fast note-taking)
- `#/crdt?doc=<url>` - CRDT spike interface (paste Automerge URL)

**Detection:** App.tsx monitors `window.location.hash` and renders appropriate component

## Related Documentation

- `README.md` - User-facing documentation with quick start guide
- `CONFIG_DESIGN.md` - Configuration architecture and XDG standards
- `DESIGN_SYSTEM.md` - Design principles, typography, spacing, colors
- `docs/CRDT-CONVENTIONS.md` - Automerge conventions and sync strategy
- `.forgejo/workflows/release.yml` - CI/CD workflow (pending runners)

## Future Work (Forever Tools Roadmap)

**Phase 1.2 - Forgejo CI/CD:**
- Install and register Forgejo runners (Linux, Windows, macOS)
- Test release pipeline with version tag
- Validate cross-platform builds

**Phase 2.4 - Mutter Integration:**
- Task creation from notes (parse `- [ ]` checkboxes)
- Link notes to Agent-Tracker tasks
- Voice command: "create task for this note"
- Explore Mutter ↔ Agent-Tracker sync
- Optional: Voice control for task management

## Common Pitfalls

1. **Automerge version mismatch**: Always use 3.2.1 (pinned in pnpm.overrides)
2. **Model not downloaded**: Download model in Settings before using voice
3. **VAD too sensitive**: Adjust silence threshold if commands cut off early
4. **Selection required**: Some commands (bold, italic) require text selection first
5. **Microphone permissions**: Browser/OS must grant microphone access
6. **File watcher flooding**: The watcher deliberately ignores content modifications to prevent constant reloads while editing
7. **CUDA build errors**: If GPU acceleration fails to build, remove `features = ["cuda"]` from Cargo.toml dependencies
8. **Stream Mode API keys**: Store in `~/.config/mutter/credentials.json`, NOT in settings.json (which may sync)
9. **Tab state loss**: Tab state is ephemeral; closing a tab loses unsaved changes unless auto-saved
10. **Design system violations**: Use 8px spacing multiples; arbitrary spacing breaks the grid

## Testing Changes

```bash
# Run in development
pnpm tauri:dev

# Test voice commands:
1. Open app
2. Select text
3. Click microphone
4. Speak command
5. Check voice log for confidence scores
```

## Debugging Tips

### Rust Backend Debugging

```bash
# View Rust logs in development
pnpm tauri:dev  # Logs appear in terminal

# Inspect config files
cat ~/.config/mutter/settings.json
cat ~/.config/mutter/credentials.json
cat ~/.config/mutter/state.json
```

### CRDT Debugging

```bash
# Check vault CRDT state
cat <vault-path>/.mutter/state.json
ls <vault-path>/.mutter/crdt/*/snapshots/

# View WebSocket URL
# Open DevTools → localStorage → 'mutter:crdt_ws_url'
```

### File Watcher Debugging

The file watcher logs events to Rust console. Look for:
- `[FileWatcher]` prefix in logs
- Events triggering sidebar refresh
- **Note:** Content modifications are deliberately filtered out

### Voice Command Debugging

1. Open Voice Log dialog (right sidebar)
2. Check:
   - Raw transcription text
   - Matched command
   - Confidence score (0.0-1.0)
   - Execution result
3. If command not matching:
   - Check if transcription is accurate
   - Try more explicit phrases from command examples in `registry.rs`
   - Consider adding new examples to command definition

### Performance Profiling

```bash
# ML inference timing
# Check Rust logs for:
# - Whisper transcription duration
# - BERT embedding duration
# - Total pipeline time

# Frontend performance
# Use React DevTools Profiler
# Check CodeMirror decorations (livePreview.ts can be expensive on large docs)
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/)
- [Tauri Extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

MIT
