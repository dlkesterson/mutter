use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use base64::Engine;

fn is_safe_id(value: &str) -> bool {
    if value.is_empty() || value.len() > 200 {
        return false;
    }
    value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn require_vault_root(vault_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(vault_path);
    if !root.is_dir() {
        return Err("Vault path must be an existing directory.".to_string());
    }
    root.canonicalize().map_err(|e| e.to_string())
}

fn crdt_root(vault_root: &Path) -> PathBuf {
    vault_root.join(".mutter").join("crdt")
}

fn snapshots_dir(vault_root: &Path, doc_id: &str) -> PathBuf {
    crdt_root(vault_root).join(doc_id).join("snapshots")
}

fn snapshot_path(vault_root: &Path, doc_id: &str, device_id: &str) -> PathBuf {
    snapshots_dir(vault_root, doc_id).join(format!("{}.am", device_id))
}

fn snapshot_device_id(path: &Path) -> Option<String> {
    if path.extension().and_then(|s| s.to_str()) != Some("am") {
        return None;
    }
    let stem = path.file_stem().and_then(|s| s.to_str())?;
    if !is_safe_id(stem) {
        return None;
    }
    Some(stem.to_string())
}

#[derive(serde::Serialize, Clone)]
pub struct CrdtSnapshotInfo {
    pub device_id: String,
    pub modified_ms: u64,
    pub bytes: u64,
}

#[tauri::command]
pub fn write_vault_crdt_snapshot_cmd(
    vault_path: String,
    doc_id: String,
    device_id: String,
    data_base64: String,
) -> Result<(), String> {
    if !is_safe_id(&doc_id) {
        return Err("Invalid doc_id".to_string());
    }
    if !is_safe_id(&device_id) {
        return Err("Invalid device_id".to_string());
    }

    let vault_root = require_vault_root(&vault_path)?;
    let dir = snapshots_dir(&vault_root, &doc_id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.trim())
        .map_err(|e| e.to_string())?;

    let final_path = snapshot_path(&vault_root, &doc_id, &device_id);
    let tmp_path = final_path.with_extension("am.tmp");
    fs::write(&tmp_path, bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, &final_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_vault_crdt_snapshots_cmd(
    vault_path: String,
    doc_id: String,
) -> Result<Vec<CrdtSnapshotInfo>, String> {
    if !is_safe_id(&doc_id) {
        return Err("Invalid doc_id".to_string());
    }

    let vault_root = require_vault_root(&vault_path)?;
    let dir = snapshots_dir(&vault_root, &doc_id);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        let Some(device_id) = snapshot_device_id(&path) else {
            continue;
        };
        let meta = match fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let modified_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let bytes = meta.len();
        out.push(CrdtSnapshotInfo {
            device_id,
            modified_ms,
            bytes,
        });
    }

    out.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(out)
}

#[tauri::command]
pub fn read_vault_crdt_snapshot_cmd(
    vault_path: String,
    doc_id: String,
    device_id: String,
) -> Result<String, String> {
    if !is_safe_id(&doc_id) {
        return Err("Invalid doc_id".to_string());
    }
    if !is_safe_id(&device_id) {
        return Err("Invalid device_id".to_string());
    }

    let vault_root = require_vault_root(&vault_path)?;
    let path = snapshot_path(&vault_root, &doc_id, &device_id);
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
pub fn vault_crdt_snapshot_relative_path_cmd(doc_id: String, device_id: String) -> Result<String, String> {
    if !is_safe_id(&doc_id) {
        return Err("Invalid doc_id".to_string());
    }
    if !is_safe_id(&device_id) {
        return Err("Invalid device_id".to_string());
    }

    Ok(format!(".mutter/crdt/{}/snapshots/{}.am", doc_id, device_id))
}

#[tauri::command]
pub fn prune_vault_crdt_snapshots_cmd(
    vault_path: String,
    doc_id: String,
    keep_last: u32,
    keep_device_id: Option<String>,
) -> Result<u32, String> {
    if !is_safe_id(&doc_id) {
        return Err("Invalid doc_id".to_string());
    }
    if let Some(ref keep) = keep_device_id {
        if !is_safe_id(keep) {
            return Err("Invalid keep_device_id".to_string());
        }
    }

    let keep_last = keep_last.clamp(1, 512) as usize;

    let vault_root = require_vault_root(&vault_path)?;
    let dir = snapshots_dir(&vault_root, &doc_id);
    if !dir.exists() {
        return Ok(0);
    }

    let mut snapshots: Vec<(String, u64, PathBuf)> = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        let Some(device_id) = snapshot_device_id(&path) else {
            continue;
        };
        let meta = match fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let modified_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        snapshots.push((device_id, modified_ms, path));
    }

    snapshots.sort_by(|a, b| b.1.cmp(&a.1));

    let mut keep_set: std::collections::HashSet<String> = std::collections::HashSet::new();
    if let Some(keep) = keep_device_id {
        keep_set.insert(keep);
    }
    for (device_id, _modified_ms, _path) in snapshots.iter().take(keep_last) {
        keep_set.insert(device_id.clone());
    }

    let mut deleted: u32 = 0;
    for (device_id, _modified_ms, path) in snapshots {
        if keep_set.contains(&device_id) {
            continue;
        }
        if fs::remove_file(&path).is_ok() {
            deleted = deleted.saturating_add(1);
        }
    }

    Ok(deleted)
}

