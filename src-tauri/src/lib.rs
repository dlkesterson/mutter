mod audio;
mod commands;
mod ml;
mod registry;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::AppState::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Configure WebView for media access on Linux
            #[cfg(target_os = "linux")]
            {
                use tauri::Manager;
                let window = app.get_webview_window("main").unwrap();

                // Enable media stream permissions for WebKitGTK
                window
                    .with_webview(|webview| {
                        #[cfg(target_os = "linux")]
                        {
                            use webkit2gtk::{PermissionRequestExt, SettingsExt, WebViewExt};
                            let webview = webview.inner();

                            // Get the WebKit settings
                            if let Some(settings) = webview.settings() {
                                // Enable media stream
                                settings.set_enable_media_stream(true);
                                // Enable mediaDevices API
                                settings.set_enable_mediasource(true);
                            }

                            // Handle permission requests (microphone, camera, etc.)
                            // Automatically allow all media permission requests
                            webview.connect_permission_request(|_webview, request| {
                                log::info!("Permission request received - automatically allowing");
                                // Allow all permission requests (microphone, camera, etc.)
                                request.allow();
                                true // Event handled - permission granted
                            });
                        }
                    })
                    .ok();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            process_audio_chunk,
            transcribe_audio,
            transcribe_streaming,
            classify_text,
            get_embedding,
            download_model,
            download_model_from_hub,
            is_model_downloaded,
            load_whisper_model,
            has_loaded_model,
            load_embedding_model,
            initialize_embeddings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
