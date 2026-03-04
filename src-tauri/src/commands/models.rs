use super::AppState;
use crate::ml::ModelManager;
use serde::Serialize;
use tauri::{Emitter, Manager, State};

/// Download ML model from URL with progress events
#[derive(Clone, Serialize)]
struct DownloadProgress {
    downloaded: u64,
    total: u64,
    percentage: f32,
}

#[tauri::command]
pub async fn download_model(
    model_name: String,
    url: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    log::info!("Downloading model: {} from {}", model_name, url);

    let models_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("models");

    let manager = ModelManager::new(models_dir);

    // Create progress callback that emits events
    let app_clone = app.clone();
    let callback = Box::new(move |downloaded: u64, total: u64| {
        let percentage = if total > 0 {
            (downloaded as f64 / total as f64 * 100.0) as f32
        } else {
            0.0
        };

        let progress = DownloadProgress {
            downloaded,
            total,
            percentage,
        };

        // Emit progress event (ignore errors)
        let _ = app_clone.emit("download-progress", progress);
    });

    let path = manager
        .download_model(&model_name, &url, Some(callback))
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    Ok(path.to_string_lossy().to_string())
}

/// Check if a model is downloaded
#[tauri::command]
pub async fn is_model_downloaded(
    model_name: String,
    app: tauri::AppHandle,
) -> Result<bool, String> {
    let models_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("models");

    let manager = ModelManager::new(models_dir);
    Ok(manager.is_model_downloaded(&model_name))
}

/// Download a GGML Whisper model from HuggingFace
#[tauri::command]
pub async fn download_whisper_model(
    model_name: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    log::info!("Downloading GGML Whisper model: {}", model_name);

    let models_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("models");

    let manager = ModelManager::new(models_dir);

    // Create progress callback that emits events
    let app_clone = app.clone();
    let callback = Box::new(move |downloaded: u64, total: u64| {
        let percentage = if total > 0 {
            (downloaded as f64 / total as f64 * 100.0) as f32
        } else {
            0.0
        };

        let progress = DownloadProgress {
            downloaded,
            total,
            percentage,
        };

        // Emit progress event (ignore errors)
        let _ = app_clone.emit("download-progress", progress);
    });

    let path = manager
        .download_ggml_model(&model_name, Some(callback))
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    log::info!("GGML model downloaded to: {:?}", path);
    Ok(path.to_string_lossy().to_string())
}

/// Load a Whisper model (GGML format)
#[tauri::command]
pub async fn load_whisper_model(
    model_name: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    log::info!("Loading Whisper model: {}", model_name);

    let models_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("models");

    // GGML models are single .bin files
    let model_path = models_dir.join(format!("{}.bin", model_name));

    if !model_path.exists() {
        return Err(format!(
            "Model {} not downloaded. Path: {:?}",
            model_name, model_path
        ));
    }

    let mut engine = state
        .whisper_engine
        .lock()
        .map_err(|_| "Whisper engine lock poisoned".to_string())?;

    engine
        .load_model(&model_path)
        .map_err(|e| format!("Failed to load model: {}", e))?;

    log::info!("Model {} loaded successfully", model_name);
    Ok(())
}

/// Check if a Whisper model is loaded
#[tauri::command]
pub async fn has_loaded_model(state: State<'_, AppState>) -> Result<bool, String> {
    let engine = state
        .whisper_engine
        .lock()
        .map_err(|_| "Whisper engine lock poisoned".to_string())?;
    Ok(engine.is_loaded())
}
