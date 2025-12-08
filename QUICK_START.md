# Mutter - Quick Start Guide

## 🎤 Voice-First Markdown Editor

### Installation & Setup

```bash
# Install dependencies
pnpm install

# Run in development
pnpm tauri:dev

# Build for production
pnpm tauri:build
```

### First Time Setup

1. Launch the app
2. Click **"Open Folder"** in the sidebar
3. Select a directory to use as your vault
4. Click **"+ New Note"** to create your first note
5. Click the **microphone icon** to enable voice commands

---

## 🗣️ Voice Commands

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

---

## ⌨️ Keyboard Shortcuts

### File Operations
- **Ctrl+S** - Save current note (auto-saves every 500ms)

### Editor (Standard CodeMirror)
- **Ctrl+Z** - Undo
- **Ctrl+Y** / **Ctrl+Shift+Z** - Redo
- **Ctrl+A** - Select all
- **Ctrl+C** / **Ctrl+V** / **Ctrl+X** - Copy/Paste/Cut

---

## 📝 Markdown Live Preview

### What Gets Hidden?

When your cursor moves away from markdown syntax, the symbols hide automatically:

| You Type | You See | Raw View |
|----------|---------|----------|
| `**bold text**` | **bold text** | Shows when cursor inside |
| `*italic text*` | *italic text* | Shows when cursor inside |
| `# Heading` | Heading (large, colored) | Shows when cursor on line |
| `[Link](url)` | Link (underlined) | Shows when cursor inside |
| `- List item` | • List item (styled) | Shows when cursor on line |

### Tip
Move your cursor *into* any markdown element to see/edit the raw syntax.

---

## 🎨 Customization

### Theme Colors
Edit `src/editor/theme.ts`:
```typescript
'.cm-heading-1': {
    fontSize: '2em',
    color: '#4ec9b0',  // Change this
}
```

### VAD Sensitivity
Edit `src/components/AudioControl.tsx`:
```typescript
const hasVoice = energy > 0.001;  // Lower = more sensitive
```

### Command Confidence
Edit `src-tauri/src/commands.rs`:
```rust
if similarity > 0.85 {  // Execute threshold
if similarity > 0.65 {  // Ambiguous threshold
```

---

## 🔧 Troubleshooting

### Audio Not Working
1. Check browser permissions (microphone access)
2. Make sure no other app is using the microphone
3. Try a different browser

### Commands Not Recognized
- Speak clearly and wait for silence
- Try exact phrases listed above
- Check console for transcription output

### Files Not Appearing
- Click "Open Folder" again
- Make sure folder contains `.md` files
- Check console for errors

### Build Errors
```bash
# Clean and rebuild
rm -rf src-tauri/target
pnpm install
cd src-tauri && cargo clean
pnpm tauri:dev
```

---

## 📚 Developer Notes

### Adding New Commands

1. **Define in Registry** (`src-tauri/src/registry.rs`):
```rust
CommandIntent {
    id: "my_command".to_string(),
    phrases: vec!["do something".to_string()],
    embedding: vec![0.0; 384],
    action: CommandAction::Format(MyFormat),
}
```

2. **Add to Execution** (`src/editor/commands.ts`):
```typescript
if (format.MyFormat !== undefined) {
    // Implement command logic
}
```

### Real Model Integration

Replace mock implementations in `src-tauri/src/ml.rs`:

```rust
// WhisperEngine::transcribe()
// 1. Convert audio to mel spectrogram
// 2. Load Whisper model weights
// 3. Run encoder/decoder
// 4. Decode tokens to text

// EmbeddingEngine::encode()
// 1. Tokenize input text
// 2. Load MiniLM model
// 3. Run through BERT layers
// 4. Mean pooling + normalize
```

---

## 🚀 Performance Tips

### Reduce Latency
1. Use smaller Whisper model (tiny vs base)
2. Reduce VAD silence threshold
3. Pre-load models on startup

### Memory Usage
- Models lazy-load on first use
- Audio buffer limited to 30 seconds
- File watcher debounced at 250ms

---

## 📊 Project Structure

```
mutter/
├── src/                    # Frontend (React + TypeScript)
│   ├── components/        # UI components
│   ├── editor/           # CodeMirror plugins
│   ├── hooks/            # React hooks
│   └── styles/           # CSS
├── src-tauri/            # Backend (Rust + Tauri)
│   └── src/
│       ├── commands.rs   # IPC endpoints
│       ├── ml.rs         # ML engines
│       ├── registry.rs   # Command matching
│       ├── audio.rs      # Audio processing
│       └── vault.rs      # File system
├── prd.md               # Product Requirements
└── IMPLEMENTATION_SUMMARY.md  # This guide
```

---

## 🐛 Reporting Issues

When reporting bugs, include:
1. Console output (F12 → Console)
2. Voice command attempted
3. Expected vs actual behavior
4. Browser and OS version

---

## 📄 License

MIT

---

**Made with Candle 🔥 and CodeMirror 📝**
