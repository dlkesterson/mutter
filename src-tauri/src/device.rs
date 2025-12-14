use std::{fs, path::PathBuf};

use tauri::Manager;
use uuid::Uuid;

fn device_id_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("device_id.txt"))
}

fn is_safe_id(value: &str) -> bool {
    if value.is_empty() || value.len() > 200 {
        return false;
    }
    value.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

#[tauri::command]
pub fn get_mutter_device_id_cmd(app: tauri::AppHandle) -> Result<String, String> {
    let path = device_id_path(&app)?;
    if let Ok(existing) = fs::read_to_string(&path) {
        let id = existing.trim();
        if is_safe_id(id) {
            return Ok(id.to_string());
        }
    }

    let dir = path.parent().ok_or("Invalid app data dir")?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    fs::write(&path, format!("{}\n", id)).map_err(|e| e.to_string())?;
    Ok(id)
}

