# Mutter User Guide

Mutter is a voice-first markdown editor with semantic command recognition. This guide covers all features and how to use them effectively.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Voice Commands](#voice-commands)
3. [Query DSL Reference](#query-dsl-reference)
4. [Supertags](#supertags)
5. [Keyboard Shortcuts](#keyboard-shortcuts)
6. [Troubleshooting](#troubleshooting)

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
| "Show all projects" | Opens query panel with `type:project` |
| "Find active tasks" | Queries for `status:active` |
| "Search for [term]" | Opens query panel with search term |

### Supertag Commands

| Say This | What Happens |
|----------|--------------|
| "Tag this as project" | Applies #project supertag |
| "Create new supertag" | Opens supertag creation dialog |
| "Remove supertag" | Removes supertag from current note |

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
| `type:` | Notes with supertag | `type:project` |
| `tag:` | Notes with markdown tag | `tag:work` |
| `linked:` | Notes linking to target | `linked:[[Meeting]]` |
| `from:` | Notes linked from source | `from:[[Index]]` |
| `created:` | By creation date | `created:>2024-01-01` |
| `updated:` | By update date | `updated:>=2024-06-01` |
| `has:` | Has property | `has:supertags` |

### Has Properties

```
has:blocks      # Notes with block references
has:supertags   # Notes with any supertag
has:links       # Notes with outgoing links
has:tags        # Notes with markdown tags
```

### Supertag Field Filters

Query specific fields on supertags:

```
status:active              # Any supertag with status field
project.status:active      # Only Project supertag's status
priority:>5                # Numeric comparison
done:true                  # Boolean field
```

### Text Search

```
"exact phrase"    # Exact phrase in title
word1 word2       # All words must appear (AND)
```

### Complex Queries

Combine multiple filters (AND logic):

```
type:project status:active
tag:work created:>2024-01-01
has:links "meeting notes"
type:task priority:>3 done:false
```

### Query Examples

| Query | Returns |
|-------|---------|
| `type:project` | All notes with #project supertag |
| `tag:work status:active` | Work-tagged notes that are active |
| `created:>2024-06-01` | Notes created after June 1, 2024 |
| `has:blocks type:documentation` | Documentation with block refs |
| `"weekly meeting"` | Notes with "weekly meeting" in title |

---

## Supertags

Supertags add structured metadata to your notes, like database fields.

### Creating a Supertag

1. Open **Settings > Supertags**
2. Click **"Create New Supertag"**
3. Enter a name (e.g., "project")
4. Add fields:
   - **Text**: Free-form text
   - **Number**: Numeric values
   - **Date**: Date picker
   - **Select**: Dropdown options
   - **Checkbox**: True/false
   - **Relation**: Link to another note

### Applying Supertags

1. Open a note
2. Use **Cmd/Ctrl + K** and type "Apply supertag"
3. Select the supertag to apply
4. Fill in field values

### Querying by Supertag

Once applied, query notes by supertag type or field values:

```
type:project                    # All projects
type:project status:active      # Active projects
project.priority:>3             # High-priority projects
```

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

1. **Verify notes have expected supertags/tags**
   - Open a note and check for supertag badges
   - Check for #hashtags in content

2. **Check date format**
   - Dates must be `YYYY-MM-DD` format
   - Example: `created:>2024-01-15`

3. **Try simpler query first**
   - Start with `type:project` alone
   - Add filters one at a time

### Sync Not Connecting

1. **Check sync server is running**
   - Settings > Sync > Server Status
   - Should show "Running" or "Connected"

2. **Verify WebSocket URL**
   - Default: `ws://localhost:4554`
   - Custom server needs correct URL

3. **Check firewall settings**
   - Allow connections on port 4554
   - May need to whitelist Mutter

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
