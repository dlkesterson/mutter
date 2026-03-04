use std::io::Write;
use tauri::Manager;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

#[tauri::command]
pub async fn register_global_hotkey(app: tauri::AppHandle, shortcut: String) -> Result<(), String> {
    log::info!("Registering global hotkey: {}", shortcut);

    // Plugin is already initialized in lib.rs with the handler
    app.global_shortcut()
        .register(shortcut.as_str())
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn append_to_inbox(
    text: String,
    timestamp: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Get documents directory as vault root for now, or app data dir
    let vault_path = app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?
        .join("MutterVault");

    if !vault_path.exists() {
        std::fs::create_dir_all(&vault_path).map_err(|e| e.to_string())?;
    }

    let inbox_path = vault_path.join("Inbox.md");

    // Create inbox file if doesn't exist
    if !inbox_path.exists() {
        std::fs::write(&inbox_path, "# Inbox\n\n").map_err(|e| e.to_string())?;
    }

    // Append entry
    let entry = format!("\n## {}\n\n{}\n", timestamp, text);

    let mut file = std::fs::OpenOptions::new()
        .append(true)
        .create(true)
        .open(&inbox_path)
        .map_err(|e| e.to_string())?;

    file.write_all(entry.as_bytes())
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn close_quick_capture(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("quick-capture") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}
