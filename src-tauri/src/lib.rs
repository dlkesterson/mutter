mod audio;
mod commands;
mod config;
mod device;
mod file_watcher;
mod ml;
mod vault_crdt_fs;
mod vault_state;

use commands::*;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::ShortcutState;
use std::sync::{Arc, Mutex};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
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
        .manage(Arc::new(Mutex::new(file_watcher::FileWatcherState::new())))
        .setup(|app| {
            // Configure logging for both debug and release builds
            // Logs to stdout (dev) and ~/.local/share/mutter/logs/mutter.log (user debugging)
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .level_for("webkit2gtk", log::LevelFilter::Warn)
                    .level_for("tao", log::LevelFilter::Warn)
                    .level_for("wry", log::LevelFilter::Warn)
                    .targets([
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                            file_name: Some("mutter.log".into()),
                        }),
                    ])
                    .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                    .max_file_size(5_000_000) // 5MB per file
                    .build(),
            )?;

            // Configure WebView for media access on Linux
            #[cfg(target_os = "linux")]
            {
                use tauri::Manager;
                let window = app.get_webview_window("main").unwrap();

                // Remove window decorations (titlebar) programmatically
                // This is more reliable than config on GTK-based Linux desktops
                window.set_decorations(false).ok();

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
            device::get_mutter_device_id_cmd,
            vault_state::get_or_create_vault_state_cmd,
            vault_state::set_vault_metadata_doc_url_cmd,
            vault_state::set_manifest_doc_url_cmd,
            vault_crdt_fs::write_vault_crdt_snapshot_cmd,
            vault_crdt_fs::list_vault_crdt_snapshots_cmd,
            vault_crdt_fs::read_vault_crdt_snapshot_cmd,
            vault_crdt_fs::vault_crdt_snapshot_relative_path_cmd,
            vault_crdt_fs::prune_vault_crdt_snapshots_cmd,
            config::get_settings_cmd,
            config::save_settings_cmd,
            config::get_credentials_cmd,
            config::save_credentials_cmd,
            config::get_state_cmd,
            config::save_state_cmd,
            config::get_config_dir_cmd,
            process_audio_chunk,
            update_vad_settings,
            register_global_hotkey,
            append_to_inbox,
            close_quick_capture,
            transcribe_audio,
            transcribe_streaming,
            get_file_tree,
            create_note,
            rename_note,
            search_notes,
            download_model,
            download_whisper_model,
            is_model_downloaded,
            load_whisper_model,
            has_loaded_model,
            extract_tasks,
            move_file,
            delete_file,
            duplicate_file,
            open_in_system,
            open_daily_note,
            file_watcher::start_vault_watcher,
            file_watcher::stop_vault_watcher,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
