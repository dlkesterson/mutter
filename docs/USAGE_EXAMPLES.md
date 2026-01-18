# Config Management Usage Examples

## Quick Reference

### Reading Settings

```typescript
import { useSettings } from '@/lib/settings';

function MyComponent() {
  const { settings } = useSettings();

  // Access nested settings with type safety
  const vaultPath = settings?.vault.path;
  const ollamaModel = settings?.ai_providers.ollama.model;
  const autoStop = settings?.voice.auto_stop_enabled;

  return <div>Vault: {vaultPath}</div>;
}
```

### Updating Settings

```typescript
import { useSettings } from '@/lib/settings';

function SettingsPanel() {
  const { settings, updateSettings } = useSettings();

  const handleVaultChange = async (newPath: string) => {
    await updateSettings(prev => ({
      ...prev,
      vault: { ...prev.vault, path: newPath }
    }));
  };

  const handleModelChange = async (newModel: string) => {
    await updateSettings(prev => ({
      ...prev,
      ai_providers: {
        ...prev.ai_providers,
        ollama: { ...prev.ai_providers.ollama, model: newModel }
      }
    }));
  };

  return (
    <div>
      <input
        value={settings?.ai_providers.ollama.model || ''}
        onChange={(e) => handleModelChange(e.target.value)}
      />
    </div>
  );
}
```

### Working with Credentials

```typescript
import { useCredentials } from '@/lib/settings';

function ApiKeyInput() {
  const { credentials, updateCredentials } = useCredentials();

  const updateClaudeKey = async (key: string) => {
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
      onChange={(e) => updateClaudeKey(e.target.value)}
      placeholder="Claude API Key"
    />
  );
}
```

### Managing UI State

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

  const updateSidebarWidth = async (width: number) => {
    await updateState(prev => ({
      ...prev,
      ui: { ...prev.ui, sidebar_width: width }
    }));
  };

  return (
    <div
      style={{ width: state?.ui.sidebar_width || 250 }}
      className={state?.ui.voice_log_collapsed ? 'collapsed' : ''}
    >
      <button onClick={toggleVoiceLog}>Toggle Voice Log</button>
    </div>
  );
}
```

## Migration Path for Existing Components

### Before (IndexedDB):

```typescript
// Old: App.tsx
import { getStorageItem, setStorageItem } from './utils/storage';

// Load
const [autoStopEnabled, setAutoStopEnabled] = useState(true);
useEffect(() => {
  const loadSettings = async () => {
    const enabled = await getStorageItem<boolean>('auto_stop_enabled');
    if (enabled !== null) setAutoStopEnabled(enabled);
  };
  loadSettings();
}, []);

// Save
const updateAutoStop = async (enabled: boolean) => {
  await setStorageItem('auto_stop_enabled', enabled);
  setAutoStopEnabled(enabled);
};
```

### After (File-based):

```typescript
// New: App.tsx
import { useSettings } from '@/lib/settings';

// No local state needed!
const { settings, updateSettings } = useSettings();

// Read
const autoStopEnabled = settings?.voice.auto_stop_enabled ?? true;

// Write
const updateAutoStop = async (enabled: boolean) => {
  await updateSettings(prev => ({
    ...prev,
    voice: { ...prev.voice, auto_stop_enabled: enabled }
  }));
};
```

## Component-by-Component Migration

### 1. App.tsx - Auto-stop Settings

**Old:**
```typescript
const [autoStopEnabled, setAutoStopEnabled] = useState(true);
const [autoStopTimeoutMs, setAutoStopTimeoutMs] = useState(3000);

useEffect(() => {
  const loadSettings = async () => {
    const enabled = await getStorageItem<boolean>('auto_stop_enabled');
    const timeout = await getStorageItem<number>('auto_stop_timeout_ms');
    if (enabled !== null) setAutoStopEnabled(enabled);
    if (timeout !== null) setAutoStopTimeoutMs(timeout);
  };
  loadSettings();
}, []);
```

**New:**
```typescript
const { settings } = useSettings();
const autoStopEnabled = settings?.voice.auto_stop_enabled ?? true;
const autoStopTimeoutMs = settings?.voice.auto_stop_timeout_ms ?? 3000;
// No useEffect needed! Settings auto-load from provider
```

### 2. Sidebar.tsx - Vault Path

**Old:**
```typescript
const loadVaultPath = async () => {
  const path = await getStorageItem<string>('vault_path');
  if (path) {
    setVaultPath(path);
    onVaultPathChange?.(path);
  }
};

const handleSelectVault = async () => {
  const selected = await openDialog({ directory: true });
  if (selected) {
    await setStorageItem('vault_path', selected);
    setVaultPath(selected as string);
    onVaultPathChange?.(selected as string);
  }
};
```

**New:**
```typescript
const { settings, updateSettings } = useSettings();

useEffect(() => {
  if (settings?.vault.path) {
    setVaultPath(settings.vault.path);
    onVaultPathChange?.(settings.vault.path);
  }
}, [settings?.vault.path]);

const handleSelectVault = async () => {
  const selected = await openDialog({ directory: true });
  if (selected) {
    await updateSettings(prev => ({
      ...prev,
      vault: { ...prev.vault, path: selected as string }
    }));
    // State updates automatically via useEffect above
  }
};
```

### 3. Editor.tsx - Stream Mode Settings

**Old:**
```typescript
const provider = await getStorageItem<'claude' | 'openai' | 'ollama'>('stream_mode_provider');
const timeoutMs = await getStorageItem<number>('stream_mode_timeout_ms');
const removeFillers = await getStorageItem<boolean>('stream_mode_remove_fillers');
const addStructure = await getStorageItem<boolean>('stream_mode_add_structure');
```

**New:**
```typescript
const { settings, credentials } = useSettings();

const provider = settings?.stream_mode.provider || 'ollama';
const timeoutMs = settings?.stream_mode.timeout_ms || 15000;
const removeFillers = settings?.stream_mode.formatting.remove_fillers ?? true;
const addStructure = settings?.stream_mode.formatting.add_structure ?? true;

// Get API key from credentials (not settings!)
const apiKey = credentials?.ai_providers[provider].api_key || '';
```

### 4. SettingsDialog.tsx - Complete Refactor

**Old:** (Multiple getStorageItem calls in useEffect)

**New:**
```typescript
import { useSettings, useCredentials } from '@/lib/settings';

function SettingsDialog({ open, onOpenChange }) {
  const { settings, updateSettings } = useSettings();
  const { credentials, updateCredentials } = useCredentials();

  // All settings available immediately
  const streamEnabled = settings?.stream_mode.enabled ?? false;
  const ollamaModel = settings?.ai_providers.ollama.model || 'qwen2.5:3b';
  const claudeKey = credentials?.ai_providers.claude.api_key || '';

  // Update functions
  const updateStreamEnabled = async (enabled: boolean) => {
    await updateSettings(prev => ({
      ...prev,
      stream_mode: { ...prev.stream_mode, enabled }
    }));
  };

  const updateClaudeKey = async (key: string) => {
    await updateCredentials(prev => ({
      ...prev,
      ai_providers: {
        ...prev.ai_providers,
        claude: { api_key: key }
      }
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Switch
        checked={streamEnabled}
        onCheckedChange={updateStreamEnabled}
      />
      <Input
        type="password"
        value={claudeKey}
        onChange={(e) => updateClaudeKey(e.target.value)}
      />
    </Dialog>
  );
}
```

## Benefits You Get

1. **No more scattered getStorageItem calls** - Settings load once via provider
2. **Type safety** - TypeScript knows the structure of your settings
3. **Reactive updates** - Components re-render when settings change
4. **Cleaner code** - No manual state management for settings
5. **File-based** - Settings in `~/.config/mutter/settings.json`
6. **Syncable** - Settings sync across devices via Syncthing
7. **Debuggable** - Open JSON files to inspect/modify settings

## Testing the Integration

1. **Start the app** - Should show "Migrating settings..." screen briefly
2. **Check files created**:
   ```bash
   ls -la ~/.config/mutter/
   # Should see: settings.json, credentials.json, state.json
   ```
3. **Inspect migrated data**:
   ```bash
   cat ~/.config/mutter/settings.json | jq .
   ```
4. **Test settings updates** - Change a setting in UI, verify file updates
5. **Test persistence** - Restart app, verify settings restored

## Troubleshooting

**Settings not loading?**
- Check browser console for errors
- Verify `~/.config/mutter/` directory exists and is writable
- Check `localStorage.getItem('config_migrated_v1')` is set

**Type errors?**
- Ensure all optional access uses `?.` operator
- Use `?? defaultValue` for fallbacks

**Settings not saving?**
- Check file permissions on `~/.config/mutter/`
- Look for Tauri command errors in console
- Verify Rust code compiled successfully

**Want to reset everything?**
```bash
# Remove config files
rm -rf ~/.config/mutter/

# Clear migration flag
# In browser console:
localStorage.removeItem('config_migrated_v1');

# Restart app - will recreate with defaults
```
