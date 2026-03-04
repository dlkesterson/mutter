# commands.rs → commands/ Module Refactor

## Current State
- `commands.rs`: 1163 lines, 23 command functions, 6 structs, all in one file
- Every command depends on `AppState` (shared Mutex-wrapped state)

## Target Structure

```
src-tauri/src/
├── commands/
│   ├── mod.rs           (~40 lines)  — AppState + re-exports
│   ├── notes.rs         (~400 lines) — file tree, CRUD, search, tasks
│   ├── transcription.rs (~280 lines) — audio processing, STT, classification
│   ├── models.rs        (~160 lines) — Whisper model download/load
│   └── app.rs           (~70 lines)  — global hotkey, inbox, quick capture
```

## Module Breakdown

### `commands/mod.rs` — Shared State + Re-exports
```rust
// AppState struct + Default impl (lines 14-30)
// pub use from each submodule
```
Keeps: `AppState`, all `pub use` re-exports
Why: Every submodule needs AppState via `State<'_, AppState>`. 
Defining it here avoids circular deps.

### `commands/notes.rs` — Note & File Operations
Moves here:
- `FileNode` struct (line 33)
- `SearchResult` struct (line 41)
- `ExtractedTask` struct (line 48)
- `get_file_tree` (line 55, ~50 lines)
- `open_daily_note` (line 106, ~34 lines)
- `search_notes` (line 141, ~45 lines)
- `create_note` (line 187, ~27 lines)
- `rename_note` (line 215, ~37 lines)
- `extract_tasks` (line 989, ~29 lines)
- `move_file` (line 1020, ~37 lines)
- `delete_file` (line 1058, ~16 lines)
- `duplicate_file` (line 1075, ~56 lines)
- `open_in_system` (line 1132, ~32 lines)

Imports needed: `serde`, `std::path`, `std::fs`, `tauri_plugin_shell`
No AppState dependency — these are all pure file system operations.

### `commands/transcription.rs` — Voice Pipeline
Moves here:
- `process_audio_chunk` (line 313, ~50 lines)
- `update_vad_settings` (line 364, ~11 lines)
- `transcribe_audio` (line 377, ~66 lines)
- `transcribe_streaming` (line 445, ~90 lines)
- `PartialTranscription` struct (line 525)
- `TranscriptionResult` struct (line 532)
- `classify_text` (line 539, ~277 lines) ← biggest single function
- `ClassificationResultWithTiming` struct (line 816)
- `PerformanceTimings` struct (line 822)

Imports needed: `AppState`, `crate::audio::*`, `crate::registry::*`, 
`crate::system::SystemContext`, `tauri::{Emitter, State}`, `serde`

### `commands/models.rs` — ML Model Management
Moves here:
- `DownloadProgress` struct (line 830)
- `download_model` (line 837, ~42 lines)
- `is_model_downloaded` (line 881, ~14 lines)
- `download_whisper_model` (line 897, ~42 lines)
- `load_whisper_model` (line 941, ~36 lines)
- `has_loaded_model` (line 979, ~8 lines)

Imports needed: `AppState`, `crate::ml::ModelManager`, 
`tauri::{Emitter, State}`, `serde`, `std::io::Write`

### `commands/app.rs` — App-Level Commands
Moves here:
- `register_global_hotkey` (line 253, ~11 lines)
- `append_to_inbox` (line 265, ~37 lines)
- `close_quick_capture` (line 304, ~7 lines)

Imports needed: `tauri::{Manager, AppHandle}`, 
`tauri_plugin_global_shortcut::GlobalShortcutExt`, `std::fs`

## Changes to lib.rs

The `invoke_handler` registration stays the same — just update the import paths:

```rust
// Before:
use commands::*;

// After (mod.rs re-exports everything, so this still works):
mod commands;
use commands::*;
```

No change needed to the `tauri::generate_handler![]` macro call since 
all functions are re-exported through `commands::mod.rs`.

## Execution Order

1. Create `src-tauri/src/commands/` directory
2. Create `mod.rs` with AppState + re-exports
3. Move notes functions → `notes.rs`
4. Move transcription functions → `transcription.rs`
5. Move model functions → `models.rs`
6. Move app functions → `app.rs`
7. Delete old `commands.rs`
8. Verify `cargo check` passes
9. Update architecture map

## Dead Code to Clean Up
- Frontend calls `invoke('create_agent_tracker_task', {...})` in Editor.tsx 
  (lines 535 and 579) but this command doesn't exist in the backend.
  Remove these frontend calls or add a stub that returns an error.
