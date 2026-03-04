# Mutter Architecture Map

> **Purpose:** Study guide for walking through the codebase with confidence. Know every layer, every pattern, and every tradeoff — and be ready to explain them.

---

## 1. The 30-Second Pitch

Mutter is a **voice-first markdown editor** built as a desktop app. The frontend is React/TypeScript running in a Tauri v2 webview. The backend is Rust, handling file I/O, speech-to-text (local Whisper models via whisper.cpp), text classification, and system integration. Voice data never leaves the machine.

**Why this matters for Nordson:** The architecture is a direct parallel to their stack — React UI ↔ native backend IPC ↔ system-level operations. Swap Tauri/Rust for Electron or WPF/C#, and the mental model is the same.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Tauri v2 Shell                          │
│  ┌────────────────────────┐  ┌───────────────────────────┐  │
│  │   React Frontend       │  │     Rust Backend          │  │
│  │                        │  │                           │  │
│  │  App.tsx (shell)       │  │  commands.rs (37K)        │  │
│  │    ├─ TabBar           │  │    ├─ audio/transcription │  │
│  │    ├─ Sidebar          │  │    ├─ text classification │  │
│  │    ├─ Editor (CM6)     │  │    ├─ file operations     │  │
│  │    ├─ RightPanel       │  │    └─ ML model management │  │
│  │    ├─ StatusBar        │  │                           │  │
│  │    ├─ Omnibox          │  │  config.rs (settings)     │  │
│  │    └─ Dialogs          │  │  file_watcher.rs          │  │
│  │                        │  │  vault_crdt_fs.rs         │  │
│  │  invoke() ─────────────│──│──► #[tauri::command]      │  │
│  │  CustomEvent bus ←─────│──│──► Tauri events           │  │
│  └────────────────────────┘  └───────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Frontend Component Tree

```
main.tsx
└─ AppWithConfig            (config loading wrapper)
   └─ App                   (1131 lines — the shell)
      ├─ EditorContextProvider    (React Context)
      │  └─ VaultMetadataProvider (React Context)
      │     ├─ TabBar             (tab management, nav buttons)
      │     ├─ Sidebar            (file tree, vault selection)
      │     │  └─ FileTree        (recursive file listing)
      │     ├─ StreamingTranscription (live voice feedback)
      │     ├─ Editor             (1278 lines — CodeMirror 6)
      │     │  ├─ AmbiguityPopover
      │     │  └─ VoiceSuggestions
      │     ├─ StatusBar          (word count, file info)
      │     ├─ Omnibox            (command palette)
      │     ├─ VoiceIndicator     (recording state UI)
      │     ├─ RightPanel         (collapsible sidebar)
      │     │  ├─ OutlinePanel
      │     │  ├─ BacklinksPanel
      │     │  ├─ SearchPanel
      │     │  └─ GraphPanel
      │     └─ [Dialogs]
      │        ├─ FileNavigatorDialog
      │        ├─ VoiceLogDialog
      │        ├─ SettingsDialog
      │        ├─ TextCleanupDialog
      │        ├─ CommandsDialog
      │        ├─ WhisperModelSelector
      │        └─ GraphDialog
      └─ Toaster (notifications)
```

### Red Flags to Own in Conversation

**App.tsx (1131 lines)** manages: tabs, voice state, dialog state, navigation history, vault metadata orchestration, keyboard shortcuts, zoom, file selection logic, system commands. This is a god component.

**Editor.tsx (1278 lines)** manages: CodeMirror setup, file loading/saving, voice transcription handling, text classification, undo history, ghost text, task extraction, content change events.

**Talking point:** "If I were refactoring this for a team, the first thing I'd do is extract a `useTabManager` hook from App.tsx, and pull the voice pipeline coordination into its own hook or context. The current shape works for a solo project but wouldn't scale for a team."

---

## 4. The Three Communication Patterns

This is the most important section for the interview. The codebase uses three distinct patterns for component communication, and you need to be able to explain each one and why it exists.

### Pattern 1: `invoke()` — Frontend ↔ Rust Backend IPC

This is Tauri's core mechanism. The frontend calls `invoke('command_name', { args })` which serializes to JSON, crosses the IPC bridge, and hits a `#[tauri::command]` Rust function. Returns are deserialized back.

**42 unique invoke commands across 7 categories:**

| Category | Commands | Called From |
|----------|----------|------------|
| **Audio/STT** | `transcribe_audio`, `transcribe_streaming`, `process_audio_chunk`, `update_vad_settings`, `has_loaded_model`, `load_whisper_model`, `download_whisper_model`, `download_model`, `is_model_downloaded` | `useAudioRecorder`, `App.tsx`, `WhisperModelSelector` |
| **File Operations** | `get_file_tree`, `create_note`, `rename_note`, `search_notes`, `move_file`, `delete_file`, `duplicate_file`, `open_daily_note`, `open_in_system` | `Sidebar`, `FileTree`, `App.tsx`, `Editor` |
| **Text Intelligence** | `classify_text`, `get_current_context`, `extract_tasks`, `create_agent_tracker_task` | `Editor.tsx` |
| **Config/Settings** | `get_settings_cmd`, `save_settings_cmd`, `get_credentials_cmd`, `save_credentials_cmd`, `get_state_cmd`, `save_state_cmd`, `get_config_dir_cmd` | `settings.tsx` (lib) |
| **Vault CRDT** | `write_vault_crdt_snapshot_cmd`, `list_vault_crdt_snapshots_cmd`, `read_vault_crdt_snapshot_cmd`, `vault_crdt_snapshot_relative_path_cmd`, `prune_vault_crdt_snapshots_cmd` | `useVaultMetadataCrdt` |
| **Vault State** | `get_or_create_vault_state_cmd`, `set_vault_metadata_doc_url_cmd`, `set_manifest_doc_url_cmd`, `get_mutter_device_id_cmd` | `useVaultMetadataCrdt`, `vault_state.rs` |
| **System** | `register_global_hotkey`, `append_to_inbox`, `close_quick_capture`, `start_vault_watcher`, `stop_vault_watcher` | `App.tsx`, `QuickCapture`, `Sidebar` |

**Key observation:** invoke calls are scattered directly in components — there's no service/bridge layer. In a team codebase you'd want a `services/tauriBridge.ts` that centralizes and types all IPC calls.

**Talking point:** "The invoke pattern maps directly to how you'd call a C# backend from a React frontend — the serialization boundary, the async nature, the command pattern. In a .NET/WPF context, this would be your IPC channel or REST API layer."

### Pattern 2: `CustomEvent` Bus — Cross-Component Communication

13 custom events on `window` for things that don't fit neatly into React's top-down data flow:

| Event | Purpose | Dispatched By → Listened By |
|-------|---------|---------------------------|
| `mutter:open-dialog` | Open panels/dialogs by name | Editor, voice commands → App |
| `mutter:open-settings` | Open settings dialog | SyncStatusIndicator → App |
| `mutter:create-note` | Trigger new note creation | App (keyboard) → Sidebar |
| `mutter:navigate` | Navigate to a note | Various → Various |
| `mutter:navigate-history` | Back/forward navigation | useNavigationHistory → App |
| `mutter:navigate-wikilink` | Follow wiki link | Editor → App |
| `mutter:reveal-in-explorer` | Scroll file tree to file | TabBar → Sidebar/FileTree |
| `mutter:scroll-to-line` | Scroll editor to line | OutlinePanel → Editor |
| `mutter:execute-command` | Execute named command | App (keyboard) → Editor |
| `mutter:apply-text-cleanup` | Apply cleaned text to editor | TextCleanupDialog → Editor |
| `mutter:edit-embed` | Edit transclusion | Editor internal |
| `mutter:query-executed` | Query completion notification | QueryPanel → SearchPanel |
| `mutter:voice-settings-changed` | Reload voice settings | SettingsDialog → App |

**Why this exists:** Some communication crosses component boundaries that would require deep prop drilling. The custom event pattern is a lightweight pub/sub.

**Tradeoff to articulate:** "This works for a solo dev but creates implicit coupling — you can't trace the event flow from types alone. In a team setting, I'd replace this with a typed event emitter or move the state higher into context."

### Pattern 3: `window` Global Functions — The Escape Hatch

The most concerning pattern. Used for communication between App.tsx and Editor.tsx:

```typescript
// Editor.tsx sets:
(window as any).handleTranscription = handleTranscription;
(window as any).toggleMinimap = (enabled: boolean) => { ... };
(window as any).updateEditorFontSize = (size: string) => { ... };

// App.tsx calls:
if ((window as any).handleTranscription) {
  await (window as any).handleTranscription(result.text);
}
```

Also used for debug utilities: `(window as any).__MUTTER_DEBUG__` in commandRegistry, commandScorer, graphBuilder, useCommandRanking.

**Why this exists:** The voice pipeline lives in App.tsx (audio recording → STT → text), but the text handling lives in Editor.tsx (classify → execute command or insert text). Rather than lifting all editor logic to App, the Editor exposes a function globally.

**What to say:** "This is a pragmatic shortcut I'd refactor. The clean solution is a shared context or a dedicated VoicePipelineContext that both App and Editor subscribe to. The debug globals are fine — they're a console debugging tool, similar to React DevTools exposing internals."

---

## 5. State Management Map

### Where state lives:

| State | Location | Persistence |
|-------|----------|-------------|
| Tabs (open files, active tab, preview/pinned) | `App.tsx` useState | None (lost on refresh) |
| Voice recording state | `App.tsx` useState + `useAudioRecorder` hook | None |
| Dialog/panel open state | `App.tsx` useState | None |
| Navigation history | `useNavigationHistory` hook | None |
| Editor content, cursor position | `Editor.tsx` (CodeMirror state) | File system via Tauri |
| Editor context (cursor, voice phase, view mode) | `EditorContextProvider` (React Context) | None |
| Vault metadata (note IDs, tags, graph) | `VaultMetadataProvider` + CRDT (Automerge) | CRDT snapshots on disk |
| Settings, credentials, app state | `settings.tsx` lib → Rust config files | JSON files via Tauri |
| Voice settings (enabled, auto-stop timeout) | `App.tsx` useState, loaded from storage | Tauri storage |
| Last opened file | Tauri storage | Tauri storage |

### Two React Contexts:

1. **EditorContextProvider** — cursor state, voice phase, view mode, recent intents. Used by voice command ranking system to make context-aware suggestions.

2. **VaultMetadataProvider** — vault ID, active note ID, manifest, graph cache, note manager. The CRDT layer for multi-device sync.

---

## 6. Rust Backend Organization

```
src-tauri/src/
├── lib.rs           — Tauri app setup, plugin registration, command handler registration
├── main.rs          — Entry point (just calls lib::run())
├── commands.rs      — 37K, bulk of business logic: audio, STT, text classification,
│                      file ops, ML model management, task extraction
├── config.rs        — Settings/credentials/state persistence (JSON files)
├── audio.rs         — Audio processing utilities
├── ml.rs            — Whisper model loading, GGML format handling
├── registry.rs      — Voice command registry (108 commands, 7 categories)
├── file_watcher.rs  — File system watcher for vault changes (notify crate)
├── vault_crdt_fs.rs — CRDT snapshot read/write to disk
├── vault_state.rs   — Per-vault state (device ID, doc URLs)
├── device.rs        — Device ID generation/retrieval
└── system.rs        — System commands (open in OS file manager)
```

**Key Tauri patterns to understand:**
- `AppState` (managed state) holds ML model, audio pipeline state
- Commands receive `State<'_, AppState>` for shared state access
- `Arc<Mutex<>>` for thread-safe state in file watcher
- Tauri plugins for: fs, dialog, shell, clipboard, window-state, global-shortcut, log

---

## 7. Key Data Flows to Trace

### Flow 1: Voice Command Execution
```
User speaks → Browser MediaRecorder → useAudioRecorder (PCM chunks)
  → invoke('process_audio_chunk') [streaming to Rust]
  → User stops / silence detected
  → invoke('transcribe_audio') → Whisper STT → text result
  → (window as any).handleTranscription(text)  [App → Editor global]
  → invoke('classify_text') → Rust keyword similarity scoring
  → Result: ExecuteCommand | InsertText | Ambiguous
  → executeCommand() applies to CodeMirror EditorView
```

### Flow 2: File Open
```
User clicks file in Sidebar/FileTree
  → handleFileSelect(path) in App.tsx
  → Tab management logic (reuse preview tab, create new, etc.)
  → setActiveTabId triggers re-render
  → Editor receives new filePath prop
  → readTextFile(filePath) via Tauri FS plugin
  → CodeMirror state reset with new content
  → setStorageItem('last_opened_file', path) for persistence
```

### Flow 3: Settings Persistence
```
Settings UI (SettingsDialog) → settings.tsx lib functions
  → invoke('save_settings_cmd', { settings })
  → Rust: serialize to JSON, write to config dir
  → On read: invoke('get_settings_cmd') → Rust reads JSON → deserialize → return
```

---

## 8. Honest Assessment: What's Good, What's Not

### Strengths (lead with these)
- **Clean separation of concerns at the process level** — UI logic in React, system operations in Rust, connected via typed IPC
- **CodeMirror 6 integration is sophisticated** — custom extensions for live preview, block IDs, transclusions, ghost text, auto-pairs
- **Voice command system is well-designed** — 108 commands with Jaccard similarity scoring, context-aware ranking, undo support
- **CRDT layer for vault metadata** — Automerge integration for eventual multi-device sync
- **Settings system is clean** — typed config with separated concerns (settings vs credentials vs state)

### Weaknesses (be honest if asked, have solutions ready)
- **App.tsx is a god component** — 1131 lines managing too many concerns. Solution: extract `useTabManager`, `useVoicePipeline`, `useDialogManager` hooks.
- **`(window as any)` globals** — The handleTranscription bridge between App and Editor should be a context or event. The debug globals are fine.
- **No service layer for invoke calls** — scattered across components. Solution: `services/tauriBridge.ts` with typed wrappers.
- **CustomEvent bus is untyped** — Works but creates implicit coupling. Could use a typed EventEmitter or Zustand.
- **No tests that exercise real behavior** — The `__tests__` directory exists but tests are likely shallow/generated.
- **commands.rs is 37K** — Same god-file problem on the Rust side. Should be split into modules.

---

## 9. Interview Talking Points

### "Walk me through the architecture"
"Mutter is a two-process desktop app. The React frontend handles all the UI — it's a tabbed editor with a sidebar, command palette, and voice controls. The Rust backend handles everything that needs system access: file I/O, speech-to-text via local Whisper models, and text classification for voice commands. They communicate through Tauri's IPC bridge, which is conceptually identical to how a React frontend would talk to a C# backend — JSON serialization across a process boundary, async command pattern."

### "How does the frontend talk to the backend?"
"Through Tauri's `invoke()` API — it's essentially an async RPC call. I have about 42 commands organized into categories: audio/STT, file operations, text intelligence, config persistence, and system integration. Each maps to a `#[tauri::command]` handler in Rust. The pattern is the same as calling a REST endpoint, but without HTTP overhead — direct IPC."

### "What would you change?"
"Three things. First, I'd extract the tab management and voice pipeline logic out of App.tsx into dedicated hooks — it's doing too much. Second, I'd create a typed service layer for the invoke calls instead of scattering them across components. Third, I'd replace the `window` global function pattern with a proper context for the voice pipeline. These are the kinds of refactors that matter when you go from solo dev to team collaboration."

### "What are you most proud of?"
"The voice command classification system. It takes raw transcription text, uses keyword-based Jaccard similarity to match against 108 registered commands, and factors in editor context — like whether there's a selection, what line you're on, what you did recently — to rank commands. It all runs locally with zero latency. The scoring system in `commandScorer.ts` and the context-aware ranking in `useCommandRanking.ts` are the most thoughtfully designed parts of the codebase."
