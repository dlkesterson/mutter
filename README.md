# Mutter - Voice-First Markdown Editor

A voice-controlled markdown editor with semantic command recognition, built with Tauri v2, React, and Rust + Candle ML.

## Features

### ✅ Implemented
- **Live Preview Editor**: CodeMirror 6 with custom decorations that hide markdown syntax when cursor is outside
  - Bold (**text**), Italic (*text*), Headers (# text)
  - Syntax only shows when editing, hidden when reading
  
- **Voice Control Infrastructure**:
  - Audio capture with Web Audio API
  - VAD (Voice Activity Detection) with ring buffer
  - Rust backend with Candle ML framework integration
  
- **Semantic Command Router**:
  - Command registry with confidence-based matching
  - Disambiguation UI for ambiguous commands
  - Context-aware command execution (selection required/optional)

- **File System**:
  - Sidebar with file navigation
  - File watcher for vault changes
  - Auto-save functionality

### 🚧 In Progress
- **ML Models**: Whisper and embedding models scaffolded, ready for model files
- **AudioWorklet**: Currently using ScriptProcessor, needs AudioWorklet implementation
- **Model Download**: HTTP download with progress tracking ready

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm tauri:dev
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 7, CodeMirror 6
- **Backend**: Rust, Tauri v2, Candle 0.8 (ML), Tokio (async)
