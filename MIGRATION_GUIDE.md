# Migration Guide: IndexedDB → File-Based Config

## Overview

This guide explains how to migrate from the old IndexedDB storage system to the new file-based configuration management.

## What's Changed?

**Before** (IndexedDB):
- Settings stored in browser's IndexedDB
- Scattered `getStorageItem`/`setStorageItem` calls
- No clear separation of settings vs credentials vs state
- Not syncable across devices

**After** (File-Based):
```
~/.config/mutter/
├── settings.json       # User preferences (syncable)
├── credentials.json    # API keys (local only)
└── state.json          # UI state (ephemeral)
```

## Migration Steps

### 1. Automatic Migration (Recommended)

Add migration to your app initialization:

```typescript
// In src/App.tsx or main entry point
import { ConfigProvider, migrateFromIndexedDB } from '@/lib/settings';
import { useState, useEffect } from 'react';

function App() {
  const [migrated, setMigrated] = useState(false);

  useEffect(() => {
    // Run migration once
    const migrate = async () => {
      const alreadyMigrated = localStorage.getItem('config_migrated_v1');

      if (!alreadyMigrated) {
        try {
          await migrateFromIndexedDB();
          localStorage.setItem('config_migrated_v1', 'true');
          console.log('✓ Migration complete');
        } catch (error) {
          console.error('Migration failed:', error);
        }
      }
      setMigrated(true);
    };

    migrate();
  }, []);

  if (!migrated) {
    return <div>Migrating settings...</div>;
  }

  return (
    <ConfigProvider>
      {/* Your app components */}
    </ConfigProvider>
  );
}
```

### 2. Manual Migration

If you prefer manual control:

```typescript
import { migrateFromIndexedDB, getConfigDir } from '@/lib/settings';

// Run migration
const result = await migrateFromIndexedDB();
console.log('Migrated data:', result);

// Check config directory
const configDir = await getConfigDir();
console.log('Config files at:', configDir);
```

## Usage Examples

### Reading Settings

**Old Way:**
```typescript
import { getStorageItem } from '@/utils/storage';

const vaultPath = await getStorageItem<string>('vault_path');
const ollamaModel = await getStorageItem<string>('ollama_model');
```

**New Way:**
```typescript
import { useSettings } from '@/lib/settings';

function MyComponent() {
  const { settings } = useSettings();

  // Type-safe access!
  const vaultPath = settings?.vault.path;
  const ollamaModel = settings?.ai_providers.ollama.model;

  return <div>Vault: {vaultPath}</div>;
}
```

### Writing Settings

**Old Way:**
```typescript
import { setStorageItem } from '@/utils/storage';

await setStorageItem('vault_path', '/home/user/Notes');
await setStorageItem('ollama_model', 'qwen2.5:3b');
```

**New Way:**
```typescript
import { useSettings } from '@/lib/settings';

function SettingsDialog() {
  const { settings, updateSettings } = useSettings();

  const handleVaultChange = async (path: string) => {
    await updateSettings(prev => ({
      ...prev,
      vault: { ...prev.vault, path }
    }));
  };

  const handleModelChange = async (model: string) => {
    await updateSettings(prev => ({
      ...prev,
      ai_providers: {
        ...prev.ai_providers,
        ollama: { ...prev.ai_providers.ollama, model }
      }
    }));
  };

  return <div>...</div>;
}
```

### Working with Credentials

```typescript
import { useCredentials } from '@/lib/settings';

function ApiKeyInput() {
  const { credentials, updateCredentials } = useCredentials();

  const handleKeyChange = async (key: string) => {
    await updateCredentials(prev => ({
      ...prev,
      ai_providers: {
        ...prev.ai_providers,
        claude: { api_key: key }
      }
    }));
  };

  return (
    <input
      type="password"
      value={credentials?.ai_providers.claude.api_key || ''}
      onChange={(e) => handleKeyChange(e.target.value)}
    />
  );
}
```

### UI State Management

```typescript
import { useState_ } from '@/lib/settings';

function Sidebar() {
  const { state, updateState } = useState_();

  const toggleVoiceLog = async () => {
    await updateState(prev => ({
      ...prev,
      ui: {
        ...prev.ui,
        voice_log_collapsed: !prev.ui.voice_log_collapsed
      }
    }));
  };

  return <div>...</div>;
}
```

## File Locations

### Linux/macOS:
```
~/.config/mutter/settings.json
~/.config/mutter/credentials.json
~/.config/mutter/state.json
```

### Windows:
```
C:\Users\{username}\.config\mutter\settings.json
C:\Users\{username}\.config\mutter\credentials.json
C:\Users\{username}\.config\mutter\state.json
```

## Benefits

1. **Type Safety**: Full TypeScript types, no more `any` or manual type assertions
2. **Syncable**: `settings.json` can sync via Syncthing across devices
3. **Security**: API keys stay in `credentials.json` (won't sync)
4. **Debuggable**: Open JSON files in editor to inspect/modify
5. **Atomic Writes**: No partial writes or corruption
6. **Versioning**: Schema versioning for future migrations

## Troubleshooting

**Settings not persisting?**
- Check file permissions in `~/.config/mutter/`
- Verify files exist with `ls ~/.config/mutter/`
- Check browser console for errors

**Migration failed?**
- Old IndexedDB data might be corrupted
- Try manual migration with error logging
- Fallback: Delete IndexedDB and use defaults

**Type errors?**
- Ensure all optional fields use `|| null` or `?? defaultValue`
- Check `Settings` interface matches Rust `Settings` struct

## Rollback

If needed, the old IndexedDB storage is untouched. You can rollback by:

1. Remove the config files: `rm -rf ~/.config/mutter/`
2. Remove the migration flag: `localStorage.removeItem('config_migrated_v1')`
3. Revert code changes

---

**Next Steps:**
- Update all components to use new hooks
- Remove old `getStorageItem`/`setStorageItem` calls
- Test settings persistence across app restarts
- Add Syncthing ignore rule for `credentials.json`
