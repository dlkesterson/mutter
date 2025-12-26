# Mutter - Voice-First Markdown Editor

> **Context for Gemini:** This file contains essential information about the `mutter` project, including architecture, development workflows, and coding conventions. Use this to orient yourself before making changes.

## 1. Project Overview

**Mutter** is a local-first, voice-controlled markdown editor. It combines a modern React frontend with a high-performance Rust backend to provide real-time speech-to-text, semantic command execution (e.g., "make this bold"), and a distraction-free writing environment.

### Core Value Props
*   **Voice-First:** Editing and formatting via natural language commands.
*   **Local Privacy:** All ML inference (Whisper, BERT) runs locally on the device.
*   **Live Preview:** Markdown syntax is hidden until you edit the line (via CodeMirror 6).
*   **CRDT-Ready:** Uses Automerge for data persistence and potential future sync.

## 2. Tech Stack

### Frontend (`src/`)
*   **Framework:** React 19 + TypeScript + Vite 7
*   **UI Library:** Tailwind CSS v4 + shadcn/ui
*   **Editor:** CodeMirror 6 (highly customized with decorations)
*   **State:** React Hooks + LocalStorage + Automerge (CRDTs)
*   **Build:** `pnpm`

### Backend (`src-tauri/`)
*   **Framework:** Tauri v2 (Rust)
*   **ML Framework:** Candle 0.8 (Pure Rust implementation of PyTorch)
    *   **STT:** Whisper (Distil & Standard models)
    *   **Embeddings:** BERT (for semantic command routing)
*   **Audio:** `cpal` / `miniaudio` (via `audio.rs`), `ringbuf` for VAD.
*   **Async:** Tokio

## 3. Architecture & Key Systems

### The Voice Pipeline
1.  **Capture:** Web Audio API captures microphone input.
2.  **VAD (Voice Activity Detection):** `src-tauri/src/audio.rs` detects speech vs. silence (~800ms threshold).
3.  **Inference:**
    *   Audio chunks -> Ring Buffer -> **Whisper Model** (Rust/Candle) -> Text.
    *   Text -> **BERT Model** -> Vector Embedding.
4.  **Routing:**
    *   The embedding is compared against a registry of command embeddings (`registry.rs`).
    *   High confidence match -> **Execute Command** (e.g., bold, delete).
    *   Low confidence/Ambiguous -> **Show Disambiguation UI**.
    *   No match -> **Insert Text**.

### The Editor (CodeMirror 6)
*   **Live Preview:** Implemented via `src/editor/livePreview.ts`. Hides Markdown syntax (e.g., `**`) unless the cursor is on the active line.
*   **Commands:** `src/editor/commands.ts` maps voice intents (string IDs) to EditorView transactions.

### Data & Persistence
*   **Files:** Direct filesystem access via Tauri `plugin-fs`.
*   **Metadata:** `src/crdt/` contains experimental logic for using Automerge to sync vault state.
*   **Automerge Version:** Pinned to **3.2.1** in `package.json` overrides. **Do not update this without verifying compatibility.**

## 4. Development Workflow

### Prerequisites
*   Node.js & pnpm
*   Rust (stable)
*   Linux dependencies (if on Linux): `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, etc.

### Common Commands

```bash
# Install dependencies (Frontend + Tauri)
pnpm install

# Run Development Server (Frontend + Rust Backend)
pnpm tauri:dev

# Build for Production
pnpm tauri:build

# Run Frontend Only (Mocking backend - limited functionality)
pnpm dev
```

### Model Management
Models (Whisper/BERT) are downloaded on first run or via `download-model.sh`. They live in the app's data directory.

## 5. Coding Conventions

*   **Style:** Follow existing ESLint/Prettier configs.
*   **React:** Functional components with Hooks. Avoid global state libraries unless necessary (use Context or passed props).
*   **Rust:** Idiomatic Rust. Use `anyhow` for error handling in commands.
*   **Naming:**
    *   Components: `PascalCase.tsx`
    *   Hooks: `useCamelCase.ts`
    *   Rust files: `snake_case.rs`
*   **Safety:**
    *   **Never** commit API keys (though this project uses local models, so fewer external keys are needed).
    *   Be careful with file system operations; always strictly validate paths.

## 6. Directory Structure Guide

*   `src/components/`: React UI components.
    *   `Editor.tsx`: The core writing surface.
    *   `VoiceIndicator.tsx`: Visual feedback for VAD/Processing.
*   `src/editor/`: CodeMirror specific logic (theme, keymaps, decorations).
*   `src-tauri/src/`: Rust backend.
    *   `ml.rs`: The heavy lifting (Whisper/BERT inference).
    *   `audio.rs`: Audio buffer and VAD logic.
    *   `registry.rs`: Semantic command definitions.
