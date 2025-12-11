use active_win_pos_rs::get_active_window;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemContext {
    pub app_name: String,
    pub window_title: String,
}

#[tauri::command]
pub async fn get_current_context() -> Result<SystemContext, String> {
    match get_active_window() {
        Ok(window) => Ok(SystemContext {
            app_name: window.app_name,
            window_title: window.title,
        }),
        Err(_) => Ok(SystemContext {
            app_name: "Unknown".to_string(),
            window_title: "Unknown".to_string(),
        }),
    }
}
