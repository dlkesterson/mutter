use std::{fs, path::{Path, PathBuf}};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

fn is_safe_id(value: &str) -> bool {
    if value.is_empty() || value.len() > 200 {
        return false;
    }
    value.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn require_vault_root(vault_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(vault_path);
    if !root.is_dir() {
        return Err("Vault path must be an existing directory.".to_string());
    }
    root.canonicalize().map_err(|e| e.to_string())
}

fn mutter_dir(vault_root: &Path) -> PathBuf {
    vault_root.join(".mutter")
}

fn state_path(vault_root: &Path) -> PathBuf {
    mutter_dir(vault_root).join("state.json")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultState {
    pub vault_id: String,
    pub created_at: String,
    #[serde(default)]
    pub vault_metadata_doc_url: Option<String>,
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn load_state(path: &Path) -> Result<VaultState, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut state: VaultState = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    if !is_safe_id(&state.vault_id) {
        return Err("Invalid vault_id in state".to_string());
    }
    if state.created_at.trim().is_empty() {
        state.created_at = now_iso();
    }
    Ok(state)
}

fn save_state(path: &Path, state: &VaultState) -> Result<(), String> {
    if !is_safe_id(&state.vault_id) {
        return Err("Invalid vault_id".to_string());
    }
    if let Some(url) = state.vault_metadata_doc_url.as_deref() {
        let u = url.trim();
        if u.is_empty() {
            return Err("vault_metadata_doc_url cannot be empty string".to_string());
        }
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(path, format!("{}\n", json)).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_or_create_vault_state_cmd(vault_path: String) -> Result<VaultState, String> {
    let root = require_vault_root(&vault_path)?;
    let path = state_path(&root);
    if path.exists() {
        return load_state(&path);
    }

    let state = VaultState {
        vault_id: Uuid::new_v4().to_string(),
        created_at: now_iso(),
        vault_metadata_doc_url: None,
    };
    save_state(&path, &state)?;
    Ok(state)
}

#[tauri::command]
pub fn set_vault_metadata_doc_url_cmd(vault_path: String, doc_url: Option<String>) -> Result<(), String> {
    let root = require_vault_root(&vault_path)?;
    let path = state_path(&root);
    let mut state = if path.exists() {
        load_state(&path)?
    } else {
        VaultState {
            vault_id: Uuid::new_v4().to_string(),
            created_at: now_iso(),
            vault_metadata_doc_url: None,
        }
    };
    state.vault_metadata_doc_url = doc_url.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    save_state(&path, &state)?;
    Ok(())
}

