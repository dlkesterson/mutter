# Mutter Lean Refactor Plan

**Goal:** Reduce memory/GPU usage while keeping Voice Mode (Whisper transcription)

**Created:** 2026-01-26

---

## Phase 1: Dead Code Cleanup ✅ COMPLETE

### Frontend Dead Code
- [x] Delete `src/test-webgpu-embeddings.ts`
- [x] Remove `@xenova/transformers` from `package.json`
- [x] Remove `@types/three` and `@webgpu/types` (related deps)
- [x] Delete `src/components/WaveformVisualizer.tsx`
- [x] Delete `src/components/dev/PerformancePanel.tsx`
- [x] Delete `src/components/dev/` directory

### Backend Dead Code
- [x] Remove sync server: `src-tauri/src/sync_server.rs`
- [x] Remove sync server from `src-tauri/src/lib.rs` (state + commands)
- [x] Delete `src/hooks/useSyncServer.ts`
- [x] Delete `src/components/sync/SyncSettingsPanel.tsx`
- [x] Delete `src/components/sync/` directory
- [x] Remove embedding-server sidecar from lib.rs setup
- [x] Delete `src-tauri/binaries/` directory (all sidecars)
- [x] Remove externalBin from tauri.conf.json

---

## Phase 2: Remove Supertag System ✅ COMPLETE

### Frontend Components
- [x] Delete `src/components/supertags/` directory
- [x] Delete `src/components/dialogs/supertag-*-dialog.tsx` (3 files)
- [x] Delete `src/hooks/useNoteSuperTags.ts`
- [x] Delete `src/hooks/useSupertagDefinitions.ts`
- [x] Delete `src/voice/commands/supertags.ts`
- [x] Remove supertag imports from `src/voice/commands/index.ts`
- [x] Delete `src/types/supertag.ts`

### App.tsx Cleanup
- [x] Remove supertag dialog imports and state
- [x] Remove supertag panel references
- [x] Remove DialogType entries for supertags

### Query System
- [x] Remove supertag query suggestions from `src/query/parser.ts`
- [x] Remove supertag query suggestions from `src/query/executor.ts`

### Other Cleanup
- [x] Remove SyncStatusIndicator from StatusBar.tsx
- [x] Clean up HelpPanel (remove supertags tab)
- [x] Clean up SearchPanel (remove type:project example)
- [x] Clean up QueryPanel (remove supertag examples)
- [x] Clean up Editor.tsx (remove supertag commands)

**Note:** CRDT supertag types kept for backward compatibility with existing vault data.
The data structures don't cost runtime performance - they're just not used.

---

## Phase 3: Remove BERT Embeddings / Simplify Voice Commands ✅ COMPLETE

### Architecture Change
Voice command matching now uses keyword/Jaccard similarity instead of BERT embeddings:
```
Before: Spoken text → BERT embedding → cosine similarity with command embeddings → best match
After:  Spoken text → normalize → keyword extraction → Jaccard similarity → best match
```

### Backend Changes
- [x] Add `phrase_similarity()` function to `registry.rs` with keyword-based matching
- [x] Update `find_best_match()` to use text-based similarity instead of embeddings
- [x] Remove `EmbeddingEngine` from `commands.rs` AppState
- [x] Remove `get_embedding`, `load_embedding_model`, `initialize_embeddings` commands
- [x] Remove `download_model_from_hub` command (was for BERT models)
- [x] Remove `EmbeddingEngine` struct from `ml.rs`
- [x] Remove `cosine_similarity` function from `ml.rs`
- [x] Remove `download_from_hub` function from `ml.rs`
- [x] Remove Candle imports from `ml.rs`
- [x] Remove Candle dependencies from `Cargo.toml`:
  - `candle-core`
  - `candle-nn`
  - `candle-transformers`
  - `tokenizers`
  - `safetensors`

### Frontend Changes
- [x] Remove embedding initialization calls from `App.tsx`
- [x] Delete `src/lib/embedding-api.ts`
- [x] Delete `src/services/ai-query.ts` (used embeddings for semantic search)
- [x] Delete `src/hooks/useAIQuery.ts`
- [x] Delete `src/components/AIQueryPanel.tsx`
- [x] Simplify `SearchPanel.tsx` (remove AI Search mode, keep Query DSL)
- [x] Remove `ai-query` case from `Editor.tsx`
- [x] Simplify `voice/commands/query.ts` (remove AI query commands, keep cleanup-text)
- [x] Remove unused llmSettings calculation from `App.tsx`

**Note:** Text cleanup feature (cleanup-text voice command) still works - it uses the LLM service
directly, not embeddings.

---

## Phase 4: Simplify CRDT (Local-Only) ✅ COMPLETE

Removed WebSocket sync, keeping local-only CRDT:
- [x] Delete `src/crdt/syncAdapter.ts` (WebSocket connection manager)
- [x] Delete `src/hooks/useSyncStatus.ts` (sync status hook)
- [x] Simplify `src/crdt/repo.ts` (remove all sync functions)
- [x] Remove `@automerge/automerge-repo-network-websocket` from package.json
- [x] Remove `ws` from package.json
- [x] Remove `@types/ws` from devDependencies

**What's kept:**
- IndexedDB storage (local persistence)
- BroadcastChannel network adapter (same-machine tab sync)

**Note:** Automerge is still used for CRDT operations. It provides conflict-free
local edits and tab synchronization without needing a server.

---

## Progress Log

### 2026-01-26
- Created refactor plan
- Completed Phase 1: Dead Code Cleanup
- Completed Phase 2: Remove Supertag System
- Completed Phase 3: Remove BERT Embeddings
  - Removed ~2.5GB of ML model dependencies (Candle, tokenizers, safetensors)
  - Voice commands now use fast keyword matching instead of BERT inference
  - AI Query feature removed (required embeddings for semantic search)
  - Both Rust and TypeScript compile successfully
- Completed Phase 4: Remove WebSocket Sync
  - Removed 86 npm packages
  - CRDT now local-only (IndexedDB + BroadcastChannel for tab sync)
  - All 4 phases complete!

---

## Files to Keep (Reference)

**Voice Mode (Essential):**
- `src-tauri/src/ml.rs` (Whisper only - BERT removed)
- `src-tauri/src/audio.rs`
- `src-tauri/src/registry.rs` (keyword matching)
- `src/hooks/useAudioRecorder.ts`
- `src/voice/commands/` (formatting, navigation, meta, linking, graphNavigation, query)

**Graph View (Keep):**
- `src/components/graph/`
- `src/hooks/useGraphData.ts`
- `react-force-graph-2d` dependency

**Core Editor:**
- `src/components/Editor.tsx`
- `src/editor/` (all extensions)
- CodeMirror dependencies

**LLM Text Processing (Keep):**
- `src/services/llm-service.ts` (Claude/OpenAI/Ollama API)
- `src/services/text-cleanup-service.ts`
- `src/components/dialogs/TextCleanupDialog.tsx`
