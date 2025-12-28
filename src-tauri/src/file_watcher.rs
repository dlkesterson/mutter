use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, DebouncedEvent, FileIdMap};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// File watcher state that can be shared across the application
pub struct FileWatcherState {
    debouncer: Option<Debouncer<RecommendedWatcher, FileIdMap>>,
    watched_path: Option<PathBuf>,
}

impl FileWatcherState {
    pub fn new() -> Self {
        Self {
            debouncer: None,
            watched_path: None,
        }
    }
}

/// Start watching a directory for file system changes
pub fn start_watching(
    app: AppHandle,
    path: PathBuf,
    state: Arc<Mutex<FileWatcherState>>,
) -> Result<(), String> {
    // Stop existing watcher if any
    stop_watching(state.clone())?;

    // Create event handler
    let app_handle = app.clone();
    let event_handler = move |result: DebounceEventResult| {
        match result {
            Ok(events) => {
                // Filter out noise: metadata changes, hidden files, sync files, etc.
                // ONLY trigger on structural changes (create/delete/rename), NOT content modifications
                let relevant_events: Vec<&DebouncedEvent> = events
                    .iter()
                    .filter(|event| {
                        // Ignore metadata/access events
                        if event.event.kind.is_access() || event.event.kind.is_other() {
                            return false;
                        }

                        // IMPORTANT: Ignore content modification events - only care about structure changes
                        // This prevents constant reloads when files are being edited or synced
                        if event.event.kind.is_modify() {
                            // Only allow rename events through (they're under Modify category)
                            use notify::event::ModifyKind;
                            if let notify::EventKind::Modify(modify_kind) = &event.event.kind {
                                // Allow rename events
                                if matches!(modify_kind, ModifyKind::Name(_)) {
                                    // Continue to other checks below
                                } else {
                                    // Ignore content modifications, metadata changes, etc.
                                    return false;
                                }
                            } else {
                                return false;
                            }
                        }

                        // Check all paths in the event
                        for path in &event.event.paths {
                            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                                // Ignore hidden files and folders (starting with .)
                                if file_name.starts_with('.') {
                                    return false;
                                }

                                // Ignore common sync/temp files
                                if file_name.contains(".sync-conflict")
                                    || file_name.contains(".syncthing")
                                    || file_name.ends_with(".tmp")
                                    || file_name.ends_with(".swp")
                                    || file_name.ends_with("~") {
                                    return false;
                                }
                            }

                            // Ignore changes in hidden directories
                            if let Some(path_str) = path.to_str() {
                                if path_str.contains("/.git/")
                                    || path_str.contains("/.obsidian/")
                                    || path_str.contains("/.mutter/")
                                    || path_str.contains("/.sync/")
                                    || path_str.contains("/.stfolder/")
                                    || path_str.contains("/.stversions/") {
                                    return false;
                                }
                            }
                        }

                        true
                    })
                    .collect();

                if !relevant_events.is_empty() {
                    log::info!("File system structure changes detected: {} events", relevant_events.len());

                    // Debug: Log the actual paths that passed the filter
                    for event in &relevant_events {
                        for path in &event.event.paths {
                            log::info!("  Event kind: {:?}, Path: {}", event.event.kind, path.display());
                        }
                    }

                    // Emit event to frontend
                    if let Err(e) = app_handle.emit("vault-changed", ()) {
                        log::error!("Failed to emit vault-changed event: {}", e);
                    }
                }
            }
            Err(errors) => {
                for error in errors {
                    log::error!("File watcher error: {:?}", error);
                }
            }
        }
    };

    // Create debounced watcher (500ms debounce)
    let mut debouncer = new_debouncer(
        Duration::from_millis(500),
        None,
        event_handler,
    )
    .map_err(|e| format!("Failed to create file watcher: {}", e))?;

    // Start watching the directory recursively
    debouncer
        .watcher()
        .watch(&path, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch directory: {}", e))?;

    log::info!("Started watching vault: {}", path.display());

    // Store the watcher and path
    let mut watcher_state = state.lock().unwrap();
    watcher_state.debouncer = Some(debouncer);
    watcher_state.watched_path = Some(path);

    Ok(())
}

/// Stop watching the current directory
pub fn stop_watching(state: Arc<Mutex<FileWatcherState>>) -> Result<(), String> {
    let mut watcher_state = state.lock().unwrap();

    if let Some(mut debouncer) = watcher_state.debouncer.take() {
        if let Some(path) = &watcher_state.watched_path {
            log::info!("Stopping file watcher for: {}", path.display());

            // Unwatch the path
            if let Err(e) = debouncer.watcher().unwatch(path) {
                log::warn!("Failed to unwatch path: {}", e);
            }
        }

        // Drop the debouncer to stop watching
        drop(debouncer);
    }

    watcher_state.watched_path = None;

    Ok(())
}

#[tauri::command]
pub fn start_vault_watcher(
    app: AppHandle,
    vault_path: String,
    state: tauri::State<Arc<Mutex<FileWatcherState>>>,
) -> Result<(), String> {
    let path = PathBuf::from(vault_path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }

    start_watching(app, path, state.inner().clone())
}

#[tauri::command]
pub fn stop_vault_watcher(
    state: tauri::State<Arc<Mutex<FileWatcherState>>>,
) -> Result<(), String> {
    stop_watching(state.inner().clone())
}
