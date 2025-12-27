mod audio;
mod commands;
mod device;
mod ml;
mod registry;
mod system;
mod vault_crdt_fs;
mod vault_state;

use commands::*;
use system::*;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::ShortcutState;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("quick-capture") {
                            if window.is_visible().unwrap_or(false) {
                                window.hide().ok();
                            } else {
                                window.show().ok();
                                window.set_focus().ok();
                            }
                        } else {
                            let _ = WebviewWindowBuilder::new(
                                app,
                                "quick-capture",
                                WebviewUrl::App("/#/quick-capture".into()),
                            )
                            .title("Quick Capture")
                            .inner_size(400.0, 300.0)
                            .always_on_top(true)
                            .decorations(false)
                            .resizable(false)
                            .center()
                            .build();
                        }
                    }
                })
                .build(),
        )
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

            // Start the embedding server sidecar
            log::info!("Starting embedding server sidecar...");
            let sidecar_command = app
                .shell()
                .sidecar("embedding-server")
                .expect("failed to create embedding-server sidecar command");

            let (_rx, _child) = sidecar_command
                .spawn()
                .expect("Failed to spawn embedding server sidecar");

            log::info!("Embedding server sidecar started successfully on port 8080");

            // Store the child process handle so it gets cleaned up on app exit
            // Tauri automatically kills sidecars when the app closes

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            device::get_mutter_device_id_cmd,
            vault_state::get_or_create_vault_state_cmd,
            vault_state::set_vault_metadata_doc_url_cmd,
            vault_crdt_fs::write_vault_crdt_snapshot_cmd,
            vault_crdt_fs::list_vault_crdt_snapshots_cmd,
            vault_crdt_fs::read_vault_crdt_snapshot_cmd,
            vault_crdt_fs::vault_crdt_snapshot_relative_path_cmd,
            vault_crdt_fs::prune_vault_crdt_snapshots_cmd,
            process_audio_chunk,
            update_vad_settings,
            register_global_hotkey,
            append_to_inbox,
            close_quick_capture,
            transcribe_audio,
            transcribe_streaming,
            classify_text,
            get_embedding,
            get_file_tree,
            create_note,
            rename_note,
            search_notes,
            get_current_context,
            download_model,
            download_model_from_hub,
            is_model_downloaded,
            load_whisper_model,
            has_loaded_model,
            load_embedding_model,
            initialize_embeddings,
            extract_tasks,
            create_agent_tracker_task,
            move_file,
            delete_file,
            duplicate_file,
            open_in_system,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
