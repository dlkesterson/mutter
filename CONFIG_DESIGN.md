# Mutter Config Management Design

## Architecture Overview

**Goal**: Replace IndexedDB storage with file-based config management following XDG standards.

### File Structure

```
~/.config/mutter/
├── settings.json       # User preferences (safe to sync)
├── credentials.json    # Sensitive data (API keys, should NOT sync)
└── state.json          # Ephemeral UI state (window positions, collapsed panels)
```

### Why This Structure?

1. **settings.json** - Syncable preferences across devices
2. **credentials.json** - Machine-specific secrets (never sync via git/Syncthing)
3. **state.json** - UI state that can be rebuilt if lost

---

## Schema Definitions

### settings.json

```typescript
{
  "version": "1.0.0",
  "vault": {
    "path": "/home/user/Notes",
    "last_opened_file": "2025-12-27.md"
  },
  "editor": {
    "minimap_enabled": true,
    "theme": "dark",
    "font_size": 14
  },
  "voice": {
    "auto_stop_enabled": true,
    "auto_stop_timeout_ms": 3000,
    "selected_whisper_model": "base"
  },
  "stream_mode": {
    "enabled": true,
    "provider": "ollama",  // "claude" | "openai" | "ollama"
    "timeout_ms": 15000,
    "formatting": {
      "remove_fillers": true,
      "add_structure": true,
      "match_style": true
    }
  },
  "ai_providers": {
    "claude": {
      "model": "claude-sonnet-4-5-20251029"
    },
    "openai": {
      "model": "gpt-4-turbo-preview"
    },
    "ollama": {
      "url": "http://localhost:11434",
      "model": "qwen2.5:3b"
    }
  }
}
```

### credentials.json

```typescript
{
  "version": "1.0.0",
  "ai_providers": {
    "claude": {
      "api_key": "sk-ant-..."
    },
    "openai": {
      "api_key": "sk-..."
    }
  }
}
```

### state.json

```typescript
{
  "version": "1.0.0",
  "ui": {
    "voice_log_collapsed": false,
    "sidebar_width": 250,
    "last_settings_tab": "stream-mode"
  }
}
```

---

## Implementation Strategy

### Phase 1: Rust Settings Manager

Create `src-tauri/src/config.rs`:
- Define structs matching schemas
- Implement file I/O with atomic writes
- Add migration from IndexedDB → JSON
- Expose Tauri commands

### Phase 2: TypeScript Integration

Create `src/lib/settings.tsx`:
- Settings context provider
- Type-safe hooks: `useSettings()`, `useCredentials()`, `useState()`
- Auto-save on change
- Cache in memory to avoid file reads

### Phase 3: Migration

- Create migration command that reads from IndexedDB
- Writes to new JSON files
- Run migration on first launch of new version
- Keep IndexedDB for 1-2 versions for rollback

---

## Reusability Pattern

This design can be templated for other projects:

```
~/.config/{app-name}/
├── settings.json
├── credentials.json
└── state.json
```

**Common Files:**
- `config.rs` (Rust) or `config.ts` (Node.js)
- `settings-schema.ts` (TypeScript types)
- `migration.{rs|ts}` (One-time migration logic)

**Project-Specific:**
- Schema definitions (what settings exist)
- Default values
- Validation rules

---

## Benefits

1. **Cross-Device Sync**: `settings.json` can sync via Syncthing
2. **Security**: `credentials.json` stays local
3. **Debuggability**: JSON files can be manually edited/inspected
4. **Backups**: Easy to version control settings templates
5. **Consistency**: Same pattern across Mutter, Gattai, Agent-Tracker
6. **Migration Path**: Clear upgrade path from old storage

---

## Next Steps

1. Implement `src-tauri/src/config.rs`
2. Implement `src/lib/settings.tsx`
3. Create migration command
4. Update all components to use new API
5. Document pattern for Gattai/Agent-Tracker
