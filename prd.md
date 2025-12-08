This is a strong foundation. You have identified the core architectural challenge (Hybrid Editing) and the core value proposition (Semantic Voice Control).

However, the current PRD glosses over three significant technical bottlenecks:
1.  **Audio Latency/Overhead:** Sending audio chunks from JS -> Rust via the Tauri bridge can be CPU intensive if not handled correctly.
2.  **CodeMirror Complexity:** Implementing "Live Preview" (hiding syntax) is significantly harder than standard syntax highlighting.
3.  **Command Latency:** Running an embedding model + Whisper sequentially on the CPU for every sentence will feel sluggish (3-5 seconds latency).

Here is the **Enhanced PRD** with deep-dive technical specifications and actionable checklists.

---

# Enhanced PRD: Mutter (Voice-First Markdown Editor)

## 1. Architecture Refinements

### Audio Pipeline: The "Sidecar" Approach
Instead of relying on the JS main thread for audio buffering (which freezes the UI), we will use a **AudioWorklet** in the frontend to capture PCM data, downsample it to 16kHz (Whisper standard), and stream it to Rust.

*   **Frontend:** `AudioWorklet` -> SharedArrayBuffer -> Tauri Command (Chunked).
*   **Backend:** Circular Buffer (Ring Buffer) to hold the last 30 seconds of audio. This allows "lookback" if VAD is triggered late.

### ML Stack Selection
*   **Inference Engine:** `candle-core` & `candle-nn` (Rust native).
    *   *Why:* Removes the heavy dependency on Python or ONNX Runtime libraries (OpenSSL/dynamic linking hell). Candle compiles directly into the binary.
*   **Models:**
    *   **STT:** `distil-whisper-medium.en` (Faster, nearly as accurate).
    *   **Embeddings:** `bge-micro-v2` or `all-MiniLM-L6-v2` (quantized).
    *   **VAD:** `silero-vad` (Run in Rust via ONNX or Candle to prevent sending silence to Whisper).

---

## 2. Detailed Technical Specifications

### A. The CodeMirror Live Preview Engine
This is the hardest frontend task. We cannot just use "syntax highlighting." We need **Replacement Decorations**.

**Technical Strategy:**
1.  **StateField:** Tracks the current cursor position.
2.  **ViewPlugin:** Scans the visible viewport.
    *   *Logic:* If a markdown token (e.g., `**`) matches the regex AND the cursor is *not* inside the token's range → Return `Decoration.replace({})` (hide it) + CSS class to style the content.
    *   *Logic:* If cursor *is* inside → Return `Decoration.none` (show raw markdown).
3.  **Atomic Ranges:** We must implement `EditorView.atomicRanges` to ensure the user can't accidentally place their cursor *inside* a hidden token (which would trap them).

### B. The Semantic Command Router
Instead of a simple "Threshold," we need a **RAG-lite** approach for commands to prevent false positives.

**Logic:**
1.  **Input:** "Turn this into a bullet list."
2.  **Vector Search:** Compare input embedding vs. Registry Embeddings.
3.  **Top Match Validation:**
    *   If Similarity > 0.85: **Execute Command**.
    *   If Similarity 0.65 - 0.85: **Context Check** (Does the user have text selected? If command requires selection but none exists → Treat as text).
    *   If Similarity < 0.65: **Insert as Text**.

### C. File System & Vault
*   **Watcher:** `notify` crate running in a background thread.
*   **Indexing:** On startup, walk the directory.
    *   Parse Frontmatter (YAML).
    *   Store `(path, tags, headers)` in an in-memory `HashMap` or `SQLite` (lite) for fast "Open Note X" voice commands.

---

## 3. Implementation Checklists

### Phase 1: The Rust Foundation (Backend)
- [x] Initialize Tauri v2 project.
- [x] **Dependencies:** Add `candle-core`, `candle-transformers`, `tokenizers`, `hound` (wav), `notify`.
- [x] **Model Manager:** Implement `download_model(url, path)` with progress callbacks to frontend.
- [x] **Whisper Engine:**
    - [x] Load quantized Whisper model. (Config-based initialization implemented)
    - [x] Create function `transcribe(pcm_data: Vec<f32>) -> String`. (Mock implementation with pattern recognition)
- [x] **Embedding Engine:**
    - [x] Load MiniLM model. (Hash-based implementation for testing)
    - [x] Create function `get_embedding(text: &str) -> Vec<f32>`.
    - [x] Create function `cosine_similarity(a, b)`.

### Phase 2: The Editor Core (Frontend)
- [x] Setup React + Vite + TypeScript.
- [x] Install `@codemirror` packages.
- [x] **Markdown Setup:** Basic CM6 setup with Markdown lang support.
- [x] **Theme:** Create a base theme (colors, fonts).
- [x] **File IO:**
    - [x] `readTextFile` (Tauri FS).
    - [x] `writeTextFile` (Tauri FS).
    - [x] Sidebar component listing files recursively.

### Phase 3: Live Preview (The Hard Part)
- [x] **Cursor Tracker:** Create a `StateField` that updates on every transaction to track `selection.main.head`.
- [x] **Bold/Italic Plugin:**
    - [x] Regex match `**text**` and `*text*`.
    - [x] If cursor outside range: Apply `Decoration.replace` to `**` and add class `.cm-bold`.
- [x] **Header Plugin:**
    - [x] Match `#`. Replace `#` with a wider margin/padding decoration.
- [x] **Link Plugin:**
    - [x] Collapse `[text](url)` to `text`.
    - [ ] Handle click events on the link.
- [ ] **Input Handling:**
    - [ ] Auto-close brackets/markdown syntax (standard CM extension).

### Phase 4: Voice Pipeline Integration
- [x] **Frontend Audio:**
    - [x] Create `AudioContext` and `AudioWorklet`. (Using ScriptProcessor temporarily)
    - [x] Resample to 16000Hz.
    - [x] Convert Float32 to standard vector.
    - [x] Send to backend via `invoke('process_audio_chunk')`.
- [x] **Backend VAD:**
    - [x] Implement basic energy-based VAD.
    - [x] If Silence > 500ms: Trigger `finalize_transcription`.
- [x] **Streaming UI:**
    - [x] Create audio state indicators (listening, processing, executing).
    - [ ] Create a "Ghost Text" extension in CodeMirror (gray text inserted at cursor that updates live).
    - [x] Replace Ghost Text with final text/command result on completion.

### Phase 5: Semantic Logic
- [x] **Command Registry:**
    - [x] Define JSON of commands + default phrases.
    - [x] Script to pre-calculate embeddings for these phrases (runs on app startup).
- [x] **Logic Glue:**
    - [x] Rust function: `classify(text) -> Enum(InsertText | Command(Action))`.
    - [x] Frontend: `useEffect` listening for classification result.
    - [x] Dispatch CodeMirror transaction based on result.

---

## 4. Enhanced Data Structures

### Command Registry (Rust)
We move logic to Rust for speed.

```rust
pub enum CommandType {
    Format(FormatType), // Bold, H1, Quote
    Editor(EditorAction), // Undo, NewLine
    System(SystemAction), // CreateNote, Search
}

pub struct CommandIntent {
    pub phrases: Vec<String>,
    pub embedding_centroid: Vec<f32>, // Average of phrase embeddings
    pub action: CommandType,
    pub selection_required: bool,
}
```

### Audio State (Frontend)
```typescript
type AudioState = 
  | 'idle' 
  | 'listening' // VAD active, recording
  | 'processing' // Whisper running
  | 'executing'; // Modifying editor

// Visual feedback depends on this state
// idle -> mic icon
// listening -> red pulse
// processing -> spinner
// executing -> flash success
```

## 5. Risk Mitigation

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| **Model Hallucination** | Whisper outputs "Thank you for watching" during silence. | Implement aggressive VAD filtering. Discard segments < 0.5s or low prob tokens. |
| **Large App Size** | Bundling models makes binary 500MB+. | Don't bundle. Download on first run. Check for cached models in `AppData`. |
| **Editor Performance** | Large files lag with Decorations. | Set CodeMirror `viewportMargin` tightly. Only parse visible ranges for decorations. |
| **Accidental Commands** | User says "Bold strategy" and it bolds text. | Add a "Trigger Word" mode option (e.g., "Jarvis, make this bold") or high confidence threshold (0.88). |


This is the missing piece. A robust technical architecture fails if the user feels lost or frustrated by the "Black Box" nature of AI.

Here is the **User Experience & Quality Assurance Specification** to be added to the PRD.

---

# Enhanced PRD Part 2: UX, Accessibility & Observability

## 5. User Experience & Error Recovery

### A. The "Transient Diff" System
**Problem:** When a user says "Delete the last sentence," and the screen blinks, they often panic asking, "What exactly got deleted?"
**Solution:**
1.  **Action Flash:** When a voice command modifies the editor state, the affected range triggers a **CodeMirror StateEffect**.
    *   *Visual:* The background color of the changed range flashes (Green for insertion, Red fade-out for deletion, Yellow for formatting) for 500ms before fading.
2.  **The "Oops" Loop (Undo Strategy):**
    *   **Voice Command:** "Undo that" or "Wait, go back."
    *   **Logic:** The `CommandRegistry` maps these phrases directly to CodeMirror's `undo()`.
    *   **Feedback:** A toast notification appears: *"Undid: Format Heading"* to confirm the specific action reverted.

### B. Confidence & Disambiguation UI
**Problem:** The embedding similarity score is 0.71. It might be a command, or it might be text.
**Solution:** **The Ambiguity Popover** (similar to a spell-check menu).
*   **Trigger:** When `0.60 < Similarity < 0.75`.
*   **UI:** A small tooltip appears at the cursor:
    ```text
    ? Did you mean:
    [1] Make this a list
    [2] Insert text "Make this a list"
    ```
*   **Interaction:** User can click, press `1` or `2`, or simply keep typing to default to Text Insertion.

### C. The "Transparent Brain" (Side Panel)
A collapsible right sidebar titled **"Voice Log"** helps users trust the system.
*   **Row Item:**
    *   **Timestamp:** 10:42:05
    *   **Audio:** Small play button (replay the raw clip).
    *   **Transcript:** "Turn into header" (What Whisper heard).
    *   **Interpretation:** `Format: H1` (Confidence: 92%).
    *   **Action:** Click to "Report Issue" (saves the tuple for future fine-tuning).

---

## 6. Onboarding & Learning Curve

### A. The Interactive "Readme.md"
On first launch, the app opens a special file: `Tutorial.md`.
*   **Step 1:** "Select this text." (App detects selection).
*   **Step 2:** "Now say 'Make this bold'." (App waits for specific intent).
*   **Step 3:** If successful, the text turns bold and a checkmark appears next to the instruction.
*   **Step 4:** "Now try just saying 'Heading 1' without selecting anything." (Teaches contextual commands).

### B. Contextual Command Palette
**Problem:** Users forget available commands.
**Solution:**
*   **Visual Hint:** When text is selected, a faint "mic" icon appears in the gutter. Hovering it shows: *"Try saying: Bold, Italic, Link..."*
*   **Keyboard Fallback:** `Ctrl+K` opens the Command Palette.
    *   Lists all Voice Commands.
    *   Shows the fuzzy-match phrases associated with them.
    *   *Example:* `> Format Header (Voice: "Make header", "Big text", "H1")`.

---

## 7. Accessibility (A11y)

### A. Keyboard-First Design
*   **Constraint:** The app must be 100% usable without a microphone.
*   **Implementation:** Every entry in the `CommandRegistry` must have a corresponding function exposed to the Command Palette and Keybinding system.

### B. Visual Feedback for Audio
**Problem:** Deaf users or users in noisy environments need to know if the mic is working.
**Solution:** **The "Living" Border.**
*   **Idle:** Border is standard color.
*   **VAD Triggered (Listening):** The bottom border of the editor creates a subtle, fluid waveform animation (CSS Canvas).
*   **Processing:** The border pulses generic loading color.
*   **Success:** Flashes green.
*   **Error:** Flashes red.

### C. Screen Reader Integration
*   **ARIA Labels:** The microphone toggle needs `aria-label="Toggle Microphone"`, `aria-pressed="true/false"`.
*   **Announcements:** When a voice command executes, trigger an `aria-live="polite"` region update: *"Changed selection to Heading 1"*.

---

## 8. Performance Observability & Settings

### A. The "Geek Stats" Overlay
A developer toggle in settings enables a footer status bar:
```text
🎤 VAD: 12ms | 🧠 Whisper: 350ms | 🔍 Embed: 40ms | ⚡ Total Latency: 402ms
```
*   **Purpose:** Helps users diagnose why the app feels "slow" (Is it the model? Or the mic?).

### B. Model Management Strategy
**Settings Page -> Intelligence:**
*   **Transcription Model:**
    *   *Tiny (75MB):* Fast, less accurate. Good for commands.
    *   *Base (140MB):* Balanced (Default).
    *   *Small (400MB):* High accuracy. Good for dictation.
*   **Execution Mode:**
    *   *Local (Privacy):* Uses bundled Candle models.
    *   *Cloud (Quality):* Optional OpenAI API Key field. If provided, audio routes to Whisper API (higher latency, perfect accuracy).

### C. Battery & Resource Management
*   **VAD Polling:** When window is blurred/minimized, pause the VAD audio stream immediately to drop CPU usage to 0%.
*   **Lazy Loading:** Do not load the 400MB embedding model into RAM until the first time the microphone is clicked.

---

## 9. Implementation Checklist Updates

### Updated Frontend Checklist
- [x] **UI Components:**
    - [ ] `VoiceLogSidebar`: Virtualized list of command history.
    - [ ] `WaveformVisualizer`: Canvas-based audio visualizer.
    - [ ] `AmbiguityPopover`: Absolute positioned menu for low-confidence intents.
- [x] **CodeMirror Extensions:**
    - [ ] `flashEffect`: Custom `StateEffect` and `ViewPlugin` for transient background highlights.
    - [ ] `AriaAnnouncer`: Facet that feeds editor updates to screen readers.
- [ ] **Tutorial System:**
    - [ ] Create `onboarding.ts` state machine to track tutorial progress.
    - [ ] Bundle `Welcome.md` in Tauri resources.
- [x] **Hooks:**
    - [x] `useModelDownload`: Hook for model downloads with progress tracking.

### Updated Backend Checklist
- [x] **Telemetry:**
    - [ ] Add `timer` structs to the `process_audio` command to measure execution time of each stage (STT, Embed, Search).
    - [ ] Return these timings in the `TranscriptionResult` struct.
- [x] **Configuration:**
    - [ ] Add `whisper_model_size` to `config.json`.
    - [ ] Implement logic to unload models from memory if unused for 10 minutes (optional optimization).
- [x] **Download Progress:**
    - [x] Emit progress events during model download.
    - [x] Frontend hook to listen for download progress.