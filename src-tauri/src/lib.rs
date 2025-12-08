mod audio;
mod commands;
mod ml;
mod registry;
mod vault;

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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            process_audio_chunk,
            transcribe_audio,
            classify_text,
            get_embedding,
            download_model,
            initialize_embeddings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
