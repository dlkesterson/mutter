# Mutter User Guide

Mutter is a voice-first markdown editor with semantic command recognition. This guide covers all features and how to use them effectively.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Voice Commands](#voice-commands)
3. [Query DSL Reference](#query-dsl-reference)
4. [Keyboard Shortcuts](#keyboard-shortcuts)
5. [Troubleshooting](#troubleshooting)

---

## Getting Started

### 1. Open a Vault

Click **"Open Folder"** in the sidebar and select your markdown vault directory. Mutter will scan for `.md` files and display them in the file tree.

### 2. Enable Voice

Click the **microphone icon** in the toolbar to enable voice input. Your browser may ask for microphone permissions.

### 3. Download a Whisper Model

Go to **Settings** (gear icon) **> Model Selector** and choose a model:

| Model | Speed | Accuracy | Memory |
|-------|-------|----------|--------|
| Distil-Whisper Tiny | Fastest | Lower | ~75MB |
| Distil-Whisper Small | Fast | Good | ~250MB |
| Distil-Whisper Medium | Moderate | Better | ~750MB |
| Whisper Medium | Slower | High | ~1.5GB |
| Whisper Large v3 | Slowest | Highest | ~3GB |

**Recommendation:** Start with **Distil-Whisper Small** for a good balance of speed and accuracy.

### 4. Start Speaking

1. Select text in the editor (for formatting commands)
2. Speak clearly: *"Make this bold"*
3. Wait for the pause detection (~800ms of silence)
4. Watch your text transform!

---

## Voice Commands

### Formatting Commands

| Say This | What Happens |
|----------|--------------|
| "Make bold" / "Bold this" | **Bolds** selected text |
| "Italicize" / "Make italic" | *Italicizes* selected text |
| "Strikethrough" / "Strike this" | ~~Strikes~~ selected text |
| "Inline code" / "Code this" | Makes `inline code` |
| "Heading 1" / "H1" / "Title" | Converts line to # Heading |
| "Heading 2" / "H2" / "Section" | Converts line to ## Heading |
| "Heading 3-6" | Converts to ### through ###### |
| "Quote this" / "Block quote" | Creates > blockquote |
| "Code block" | Creates fenced code block |

### Navigation Commands

| Say This | What Happens |
|----------|--------------|
| "Show backlinks" | Opens backlinks panel |
| "Open file [name]" | Opens the named file |
| "New note" | Creates a new note |
| "Close tab" | Closes current tab |

### Query Commands

| Say This | What Happens |
|----------|--------------|
| "Find work notes" | Opens query panel with `tag:work` |
| "Search for [term]" | Opens query panel with search term |

### AI Commands

| Say This | What Happens |
|----------|--------------|
| "Summarize notes about [topic]" | AI generates summary |
| "What do my notes say about [topic]" | AI queries your vault |
| "Explain this" | AI explains selected text |

---

## Query DSL Reference

Mutter includes a powerful query language for searching your vault.

### Basic Syntax

```
key:value           # Exact match
key:>value          # Greater than
key:>=value         # Greater than or equal
key:<value          # Less than
key:<=value         # Less than or equal
```

### Available Filters

| Filter | Description | Example |
|--------|-------------|---------|
| `tag:` | Notes with markdown tag | `tag:work` |
| `linked:` | Notes linking to target | `linked:[[Meeting]]` |
| `from:` | Notes linked from source | `from:[[Index]]` |
| `created:` | By creation date | `created:>2024-01-01` |
| `updated:` | By update date | `updated:>=2024-06-01` |
| `has:` | Has property | `has:links` |

### Has Properties

```
has:blocks      # Notes with block references
has:links       # Notes with outgoing links
has:tags        # Notes with markdown tags
```

### Text Search

```
"exact phrase"    # Exact phrase in title
word1 word2       # All words must appear (AND)
```

### Complex Queries

Combine multiple filters (AND logic):

```
tag:work created:>2024-01-01
has:links "meeting notes"
tag:project tag:active
```

### Query Examples

| Query | Returns |
|-------|---------|
| `tag:work` | All notes tagged #work |
| `created:>2024-06-01` | Notes created after June 1, 2024 |
| `has:links` | Notes with outgoing wiki links |
| `"weekly meeting"` | Notes with "weekly meeting" in title |

---

## Keyboard Shortcuts

### General

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Open command palette |
| `Cmd/Ctrl + O` | Open file |
| `Cmd/Ctrl + N` | New note |
| `Cmd/Ctrl + S` | Save current note |
| `Cmd/Ctrl + W` | Close current tab |
| `Cmd/Ctrl + Shift + K` | Toggle voice input |

### Formatting

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + B` | Bold |
| `Cmd/Ctrl + I` | Italic |
| `Cmd/Ctrl + Shift + S` | Strikethrough |
| `Cmd/Ctrl + E` | Inline code |

### Navigation

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + G` | Go to line |
| `Cmd/Ctrl + P` | Quick file open |
| `Cmd/Ctrl + Shift + F` | Search in vault |

### View

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + \` | Toggle sidebar |
| `Cmd/Ctrl + Shift + E` | Focus file explorer |

---

## Troubleshooting

### Voice Not Working

1. **Check microphone permissions**
   - Browser: Click lock icon in address bar, allow microphone
   - OS: System Preferences > Privacy > Microphone

2. **Verify Whisper model is downloaded**
   - Settings > Model Selector
   - If stuck on "Loading", try re-downloading

3. **Try a smaller model**
   - Large models may time out on slower machines
   - Start with Distil-Whisper Tiny

4. **Speak clearly with pauses**
   - Mutter detects silence to know when you're done
   - Pause ~1 second after commands

### Query Returns No Results

1. **Verify notes have expected tags**
   - Check for #hashtags in content

2. **Check date format**
   - Dates must be `YYYY-MM-DD` format
   - Example: `created:>2024-01-15`

3. **Try simpler query first**
   - Start with `tag:work` alone
   - Add filters one at a time

### Editor Performance Issues

1. **Large files**
   - Split very large notes into smaller ones
   - Consider archiving old content

2. **Too many open tabs**
   - Close unused tabs
   - Right-click tab > "Close Others"

3. **Memory usage**
   - Restart Mutter if slow after long sessions
   - Use smaller Whisper model

---

## Getting Help

- **In-app help**: Click the `?` icon or press `F1`
- **Report issues**: [GitHub Issues](https://github.com/anthropics/claude-code/issues)
- **Voice command tips**: Speak naturally, pause between commands

---

## Version Information

- **Current Version**: 0.3.0
- **Last Updated**: January 2026
