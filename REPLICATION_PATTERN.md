# Config Management Pattern - Replication Guide

## Overview

This document explains how to replicate the Mutter config management pattern to other projects in your personal suite (Gattai, Agent-Tracker, etc.).

The pattern works across **any tech stack**: pnpm/npm/bun, Tauri/Electron, Rust/TypeScript/Python, because it's based on simple JSON files following XDG standards.

---

## Core Pattern

### Directory Structure (Universal)

```
~/.config/{app-name}/
├── settings.json       # User preferences (safe to sync via Syncthing)
├── credentials.json    # Sensitive data (never sync)
└── state.json          # Ephemeral UI state (can lose without issue)
```

### File Purposes

1. **settings.json** - Durable user preferences
   - Default models/providers
   - UI preferences (theme, font size)
   - Feature flags
   - Project/workspace paths

2. **credentials.json** - Sensitive secrets
   - API keys
   - Auth tokens
   - Database passwords

3. **state.json** - Transient UI state
   - Window positions/sizes
   - Collapsed panels
   - Last selected tab
   - Recently opened files

---

## Implementation by Tech Stack

### For Tauri Apps (Rust + TypeScript)

**Example: Mutter, or a future Tauri-based Gattai UI**

#### Step 1: Rust Config Module (`src-tauri/src/config.rs`)

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default = "default_version")]
    pub version: String,
    // Add your app-specific settings
    pub your_setting: String,
}

fn default_version() -> String {
    "1.0.0".to_string()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: "1.0.0".to_string(),
            your_setting: "default".to_string(),
        }
    }
}

pub struct ConfigManager {
    config_dir: PathBuf,
}

impl ConfigManager {
    pub fn new(app_name: &str) -> Result<Self, String> {
        let config_dir = Self::get_config_dir(app_name)?;
        fs::create_dir_all(&config_dir).map_err(|e| format!("Failed to create config dir: {}", e))?;
        Ok(Self { config_dir })
    }

    fn get_config_dir(app_name: &str) -> Result<PathBuf, String> {
        if let Ok(xdg_config) = std::env::var("XDG_CONFIG_HOME") {
            return Ok(PathBuf::from(xdg_config).join(app_name));
        }
        let home = std::env::var("HOME").map_err(|_| "HOME not set")?;
        Ok(PathBuf::from(home).join(".config").join(app_name))
    }

    pub fn load_settings(&self) -> Result<Settings, String> {
        let path = self.config_dir.join("settings.json");
        if !path.exists() {
            return Ok(Settings::default());
        }
        let contents = fs::read_to_string(&path).map_err(|e| format!("Read error: {}", e))?;
        serde_json::from_str(&contents).map_err(|e| format!("Parse error: {}", e))
    }

    pub fn save_settings(&self, settings: &Settings) -> Result<(), String> {
        let path = self.config_dir.join("settings.json");
        let json = serde_json::to_string_pretty(settings).map_err(|e| format!("{}", e))?;

        // Atomic write
        let temp_path = path.with_extension("tmp");
        fs::write(&temp_path, json).map_err(|e| format!("{}", e))?;
        fs::rename(&temp_path, &path).map_err(|e| format!("{}", e))?;
        Ok(())
    }
}

// Tauri commands
#[tauri::command]
pub async fn get_settings_cmd() -> Result<Settings, String> {
    let manager = ConfigManager::new("your-app-name")?;
    manager.load_settings()
}

#[tauri::command]
pub async fn save_settings_cmd(settings: Settings) -> Result<(), String> {
    let manager = ConfigManager::new("your-app-name")?;
    manager.save_settings(&settings)
}
```

#### Step 2: TypeScript Hooks (`src/lib/settings.tsx`)

```typescript
import { createContext, useContext, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface Settings {
  version: string;
  your_setting: string;
}

interface SettingsContextValue {
  settings: Settings | null;
  updateSettings: (updater: (prev: Settings) => Settings) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    invoke<Settings>('get_settings_cmd').then(setSettings);
  }, []);

  const updateSettings = async (updater: (prev: Settings) => Settings) => {
    if (!settings) return;
    const updated = updater(settings);
    await invoke('save_settings_cmd', { settings: updated });
    setSettings(updated);
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be within SettingsProvider');
  return context;
}
```

---

### For Node.js Apps (TypeScript/JavaScript)

**Example: Gattai, Agent-Tracker**

#### Step 1: Config Module (`src/lib/config.ts`)

```typescript
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface Settings {
  version: string;
  // Your app-specific settings
  polling_interval_ms: number;
  project_root: string | null;
}

const DEFAULT_SETTINGS: Settings = {
  version: '1.0.0',
  polling_interval_ms: 5000,
  project_root: null,
};

export class ConfigManager {
  private configDir: string;

  constructor(appName: string) {
    this.configDir = this.getConfigDir(appName);
  }

  private getConfigDir(appName: string): string {
    const xdgConfig = process.env.XDG_CONFIG_HOME;
    if (xdgConfig) {
      return path.join(xdgConfig, appName);
    }
    return path.join(os.homedir(), '.config', appName);
  }

  async ensureConfigDir(): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
  }

  async loadSettings(): Promise<Settings> {
    const settingsPath = path.join(this.configDir, 'settings.json');

    try {
      const contents = await fs.readFile(settingsPath, 'utf-8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(contents) };
    } catch (error) {
      // File doesn't exist, return defaults
      return DEFAULT_SETTINGS;
    }
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.ensureConfigDir();

    const settingsPath = path.join(this.configDir, 'settings.json');
    const tempPath = settingsPath + '.tmp';

    // Atomic write
    await fs.writeFile(tempPath, JSON.stringify(settings, null, 2));
    await fs.rename(tempPath, settingsPath);
  }
}

// Usage
const config = new ConfigManager('gattai');
const settings = await config.loadSettings();
await config.saveSettings({ ...settings, polling_interval_ms: 10000 });
```

---

### For Python Apps

**Example: Future Python-based tooling**

#### Config Module (`config.py`)

```python
import json
import os
from pathlib import Path
from typing import Optional, TypedDict

class Settings(TypedDict):
    version: str
    # Your app-specific settings
    polling_interval_ms: int

DEFAULT_SETTINGS: Settings = {
    'version': '1.0.0',
    'polling_interval_ms': 5000,
}

class ConfigManager:
    def __init__(self, app_name: str):
        self.config_dir = self._get_config_dir(app_name)

    def _get_config_dir(self, app_name: str) -> Path:
        xdg_config = os.environ.get('XDG_CONFIG_HOME')
        if xdg_config:
            return Path(xdg_config) / app_name
        return Path.home() / '.config' / app_name

    def ensure_config_dir(self):
        self.config_dir.mkdir(parents=True, exist_ok=True)

    def load_settings(self) -> Settings:
        settings_path = self.config_dir / 'settings.json'

        try:
            with open(settings_path, 'r') as f:
                loaded = json.load(f)
                return {**DEFAULT_SETTINGS, **loaded}
        except FileNotFoundError:
            return DEFAULT_SETTINGS

    def save_settings(self, settings: Settings):
        self.ensure_config_dir()
        settings_path = self.config_dir / 'settings.json'
        temp_path = settings_path.with_suffix('.tmp')

        # Atomic write
        with open(temp_path, 'w') as f:
            json.dump(settings, f, indent=2)
        temp_path.rename(settings_path)

# Usage
config = ConfigManager('my-app')
settings = config.load_settings()
settings['polling_interval_ms'] = 10000
config.save_settings(settings)
```

---

## Application Examples

### Example: Gattai Config

```
~/.config/gattai/
├── settings.json          # Daemon settings
├── credentials.json       # Claude API key (if needed)
└── state.json             # Last run state
```

**settings.json:**
```json
{
  "version": "1.0.0",
  "daemon": {
    "polling_interval_ms": 5000,
    "max_concurrent_jobs": 3,
    "job_timeout_ms": 300000
  },
  "execution": {
    "sandbox_mode": "docker",
    "default_docker_image": "ubuntu:22.04"
  },
  "project_root": "/home/user/Code/agent-tracker"
}
```

### Example: Agent-Tracker Config

```
~/.config/agent-tracker/
├── settings.json
└── state.json
```

**settings.json:**
```json
{
  "version": "1.0.0",
  "ui": {
    "default_view": "kanban",
    "theme": "dark"
  },
  "sync": {
    "enabled": true,
    "sync_interval_s": 30
  },
  "gattai": {
    "auto_execute": false,
    "execution_mode": "docker"
  }
}
```

---

## Best Practices

### 1. Always Use Atomic Writes

```typescript
// ❌ BAD - Can corrupt on crash
await fs.writeFile(settingsPath, json);

// ✅ GOOD - Atomic rename
await fs.writeFile(tempPath, json);
await fs.rename(tempPath, settingsPath);
```

### 2. Separate Sensitive Data

```
settings.json       → Sync via Syncthing ✓
credentials.json    → Add to .stignore ✗
state.json          → Optional sync
```

### 3. Schema Versioning

```typescript
interface Settings {
  version: string;  // Always include version
  // ... settings
}

// Migration logic
if (settings.version === '1.0.0') {
  // Migrate to 2.0.0
  settings = migrateV1toV2(settings);
}
```

### 4. Provide Defaults

```typescript
// All settings should have sensible defaults
const DEFAULT_SETTINGS = {
  version: '1.0.0',
  // ... all fields with defaults
};

// Merge with loaded data
const settings = { ...DEFAULT_SETTINGS, ...loaded };
```

### 5. Type Safety

```typescript
// Define types/interfaces
interface Settings {
  polling_interval_ms: number;  // Not: any
}

// Use Zod for runtime validation (optional)
const SettingsSchema = z.object({
  version: z.string(),
  polling_interval_ms: z.number().positive(),
});
```

---

## Cross-Project Consistency Checklist

When implementing in a new project:

- [ ] Config directory: `~/.config/{app-name}/`
- [ ] Three files: `settings.json`, `credentials.json`, `state.json`
- [ ] Atomic writes (temp file + rename)
- [ ] Default values for all settings
- [ ] Version field in all configs
- [ ] Type-safe interfaces/structs
- [ ] Migration logic (if updating existing app)
- [ ] Documentation of all settings
- [ ] Syncthing ignore for `credentials.json`

---

## Summary

**Universal Pattern:**
1. Config dir: `~/.config/{app-name}/`
2. Three files: settings, credentials, state
3. Atomic writes, defaults, versioning
4. Type-safe access

**Tech-Specific:**
- **Tauri**: Rust structs + serde + TypeScript hooks
- **Node.js**: TypeScript classes + fs/promises
- **Python**: TypedDict + json + pathlib

This pattern gives you:
- Consistency across all your tools
- Easy debugging (JSON files)
- Syncability (Syncthing)
- Security (credentials separation)
- Type safety (language-specific types)

Apply this to Gattai and Agent-Tracker next for a unified config experience!
