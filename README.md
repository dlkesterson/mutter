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
  - **Streaming Transcription**: Real-time visual feedback of speech-to-text
  
- **Semantic Command Router**:
  - Command registry with confidence-based matching
  - Disambiguation UI for ambiguous commands
  - Context-aware command execution (selection required/optional)
  - **Voice Log**: Detailed history of voice interactions, including confidence scores, execution times, and interpretation debugging

- **User Interface**:
  - **Flexible Layout**: Resizable panels for file navigation, editor, and voice log
  - **Collapsible Sidebars**: Maximize writing space by collapsing navigation and logs
  - **Layout Persistence**: Remembers your panel sizes and preferences
  - **Dark Mode**: Optimized for focus

- **File System**:
  - Sidebar with file navigation
  - File watcher for vault changes
  - Auto-save functionality

- **Model Management**:
  - Integrated Whisper model downloader and selector
  - Support for Distil-Whisper and standard Whisper models (Tiny, Base, Small, Medium, Large v3)
  - Real-time download progress tracking
  - **Local Embeddings**: Uses BERT for semantic understanding of commands

## Quick Start

### Installation & Setup

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm tauri:dev

# Build for production
pnpm tauri:build
```

### First Time Setup

1. Launch the app
2. Click **"Open Folder"** in the sidebar to select your vault directory
3. Click **"+ New Note"** to create a note
4. Click the **microphone icon** to enable voice commands
5. On first use, you'll be prompted to download a Whisper model (Recommended: Distil Whisper Medium)

## Voice Commands

### Formatting
- **"Make this bold"** - Wraps selection in `**text**`
- **"Make this italic"** - Wraps selection in `*text*`
- **"Turn into heading"** or **"Heading one"** - Adds `# ` prefix
- **"Heading two"** - Adds `## ` prefix
- **"Quote this"** - Adds `> ` prefix
- **"Make this a list"** - Adds `- ` prefix

### Editor Actions
- **"Undo"** - Undo last change
- **"Redo"** - Redo last change
- **"Delete that"** - Delete selection

### Usage Tips
1. Select text first for commands that need selection (bold, italic)
2. For headings/lists, place cursor on the line
3. Wait for silence detection (~800ms) after speaking
4. Watch the microphone icon for feedback:
   - 🟢 Listening
   - ⏳ Processing
   - ✅ Executing

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 7, CodeMirror 6, Tailwind CSS v4, shadcn/ui, react-resizable-panels
- **Backend**: Rust, Tauri v2, Candle 0.8 (ML), Tokio (async)
