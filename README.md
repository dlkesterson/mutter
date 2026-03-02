# Mutter: Voice-First Markdown

<img src="banner.png" alt="Mutter Banner" width="100%" />

Most markdown editors expect your hands on the keyboard 100% of the time. **Mutter** is an experiment in writing and formatting notes using your voice, without sacrificing privacy or dealing with the lag of cloud-based STT.

It's built with a Rust backend (Tauri v2) to keep things fast and runs Whisper models locally via whisper.cpp, so your voice data never leaves your machine.

---

## Why Mutter?

I built this because I found myself constantly breaking my flow to toggle formatting or fix lists. Mutter treats voice as a first-class citizen, not just an accessibility afterthought.

* **Actually Private:** No telemetry. No cloud APIs for voice. Whisper runs locally on your CPU via whisper-rs (whisper.cpp bindings). Your audio never leaves your machine.
* **Context-Aware:** 108 voice commands across 7 categories. Say "make this a title" or "bold the selection" and it just works — matched via keyword similarity, no internet required.
* **Plain Markdown:** Your notes are plain `.md` files in a folder (vault). No proprietary format, no lock-in.

## Features

* **Live Preview Editor:** CodeMirror 6 with a distraction-free mode — markdown syntax (`**`, `#`, etc.) fades away when you aren't editing that line.
* **Voice Commands:** Formatting, navigation, linking, app control, and more — all by voice. See the voice log for transcription text and confidence scores.
* **Tabbed Editing:** Work on multiple notes at once with a tabbed interface.
* **Graph View:** Visualize links between your notes with an interactive force-directed graph.
* **Transclusions:** Embed content from other notes with `![[Note]]` or `![[Note#blockId]]` syntax.
* **Stream Mode (Experimental):** Optionally post-process transcriptions with Claude, OpenAI, or Ollama to clean up filler words and add structure. API keys stored locally, never in the repo.
* **Wiki Links:** `[[Note]]` linking between notes with backlink tracking.

---

## Getting Started

### Prerequisites

* **Node.js** (v18+) and **pnpm**
* **Rust** (1.77.2+)
* **Linux users:**
  ```bash
  sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libasound2-dev libclang-dev cmake
  ```

### Setup

```bash
git clone https://github.com/dlkesterson/mutter.git
cd mutter
pnpm install
pnpm tauri:dev
```

On first run, go to **Settings → Whisper Model Selector** and download a model. I recommend **ggml-base.en** — it's a good balance of speed and accuracy (~142 MB).

---

## Voice Commands

| If you say... | Mutter will... |
| --- | --- |
| "Make this bold" | Wrap the selection in `**` |
| "Heading one" | Add `#` to the start of the line |
| "Create a list" | Insert a bullet point |
| "Undo that" | Trigger editor undo |
| "New note" | Create a new note |
| "Link to [note]" | Insert a wiki link |

108 commands across formatting, navigation, linking, meta, query, and graph navigation categories.

---

## Tech Stack

* **Backend:** Rust + Tauri v2 + Tokio
* **Speech-to-Text:** whisper-rs (whisper.cpp bindings) — GGML format models from tiny (75 MB) to large-v3 (3.1 GB)
* **Command Matching:** Keyword-based Jaccard similarity (no ML needed)
* **Frontend:** React 19, TypeScript, Vite 7, Tailwind CSS v4
* **Editor:** CodeMirror 6 with custom live preview, block IDs, and transclusion extensions
* **UI Components:** shadcn/ui
* **CRDT (Experimental):** Automerge 3.2.1 for vault metadata

## License

MIT
