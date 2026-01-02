//! Sync Server Sidecar Manager
//!
//! Manages the Automerge sync server sidecar process for CRDT synchronization.
//! The sync server provides a WebSocket relay for real-time document sync
//! across multiple Mutter instances.

use serde::{Deserialize, Serialize};
use std::net::TcpListener;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

/// Find an available port for the sync server
fn find_available_port() -> Result<u16, String> {
    TcpListener::bind("127.0.0.1:0")
        .map(|listener| listener.local_addr().unwrap().port())
        .map_err(|e| format!("Failed to find available port: {}", e))
}

/// Status of the sync server
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SyncServerStatus {
    Stopped,
    Starting,
    Running { port: u16 },
    Failed { error: String },
}

/// Sync server state managed by Tauri
pub struct SyncServerState {
    process: Mutex<Option<Child>>,
    port: Mutex<Option<u16>>,
    status: Mutex<SyncServerStatus>,
}

impl Default for SyncServerState {
    fn default() -> Self {
        Self {
            process: Mutex::new(None),
            port: Mutex::new(None),
            status: Mutex::new(SyncServerStatus::Stopped),
        }
    }
}

impl SyncServerState {
    pub fn get_status(&self) -> SyncServerStatus {
        self.status.lock().unwrap().clone()
    }

    pub fn get_port(&self) -> Option<u16> {
        *self.port.lock().unwrap()
    }

    fn set_status(&self, new_status: SyncServerStatus) {
        let mut status = self.status.lock().unwrap();
        *status = new_status;
    }

    fn set_port(&self, new_port: Option<u16>) {
        let mut port = self.port.lock().unwrap();
        *port = new_port;
    }

    fn set_process(&self, new_process: Option<Child>) {
        let mut process = self.process.lock().unwrap();
        *process = new_process;
    }

    fn take_process(&self) -> Option<Child> {
        let mut process = self.process.lock().unwrap();
        process.take()
    }
}

/// Get the path to the bundled sync server executable
fn get_sync_server_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    // For sidecars, Tauri expects them in the binaries directory
    // The naming convention is: binary-name-{target-triple}
    let target_triple = if cfg!(target_os = "windows") {
        "x86_64-pc-windows-msvc"
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "aarch64-apple-darwin"
        } else {
            "x86_64-apple-darwin"
        }
    } else {
        "x86_64-unknown-linux-gnu"
    };

    let sidecar_name = format!("sync-server-{}", target_triple);

    // In development, check the binaries folder directly
    let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(&sidecar_name);

    if dev_path.exists() {
        return Ok(dev_path);
    }

    // In production, use Tauri's resource resolver
    app.path()
        .resource_dir()
        .map(|dir| dir.join(&sidecar_name))
        .map_err(|e| format!("Failed to get resource dir: {}", e))
}

/// Start the sync server sidecar
#[tauri::command]
pub async fn start_sync_server(app: AppHandle) -> Result<u16, String> {
    let state = app.state::<SyncServerState>();

    // Check if already running
    {
        let status = state.get_status();
        if let SyncServerStatus::Running { port } = status {
            log::info!("[SyncServer] Already running on port {}", port);
            return Ok(port);
        }
    }

    // Update status to starting
    state.set_status(SyncServerStatus::Starting);
    log::info!("[SyncServer] Starting sync server...");

    // Find available port
    let port = find_available_port()?;
    log::info!("[SyncServer] Allocated port {}", port);

    // Get sidecar path
    let server_path = get_sync_server_path(&app)?;

    if !server_path.exists() {
        let error = format!("Sync server not found at {:?}", server_path);
        log::error!("[SyncServer] {}", error);
        state.set_status(SyncServerStatus::Failed {
            error: error.clone(),
        });
        return Err(error);
    }

    log::info!("[SyncServer] Found sidecar at {:?}", server_path);

    // Spawn the sync server process
    let child = Command::new(&server_path)
        .arg("--port")
        .arg(port.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            let error = format!("Failed to start sync server: {}", e);
            log::error!("[SyncServer] {}", error);
            state.set_status(SyncServerStatus::Failed {
                error: error.clone(),
            });
            error
        })?;

    log::info!("[SyncServer] Process spawned with PID {:?}", child.id());

    // Store state
    state.set_process(Some(child));
    state.set_port(Some(port));
    state.set_status(SyncServerStatus::Running { port });

    // Emit event to frontend
    if let Err(e) = app.emit("sync-server-started", port) {
        log::warn!("[SyncServer] Failed to emit start event: {}", e);
    }

    log::info!("[SyncServer] Started successfully on port {}", port);
    Ok(port)
}

/// Stop the sync server sidecar
#[tauri::command]
pub async fn stop_sync_server(app: AppHandle) -> Result<(), String> {
    let state = app.state::<SyncServerState>();

    log::info!("[SyncServer] Stopping sync server...");

    // Kill the process if running
    if let Some(mut child) = state.take_process() {
        if let Err(e) = child.kill() {
            log::warn!("[SyncServer] Error killing process: {}", e);
        }
        // Wait for process to exit
        let _ = child.wait();
        log::info!("[SyncServer] Process terminated");
    }

    // Update state
    state.set_port(None);
    state.set_status(SyncServerStatus::Stopped);

    // Emit event to frontend
    if let Err(e) = app.emit("sync-server-stopped", ()) {
        log::warn!("[SyncServer] Failed to emit stop event: {}", e);
    }

    log::info!("[SyncServer] Stopped");
    Ok(())
}

/// Get the current status of the sync server
#[tauri::command]
pub async fn get_sync_server_status(app: AppHandle) -> Result<SyncServerStatus, String> {
    let state = app.state::<SyncServerState>();
    Ok(state.get_status())
}

/// Get the WebSocket URL of the running sync server
#[tauri::command]
pub async fn get_sync_server_url(app: AppHandle) -> Result<Option<String>, String> {
    let state = app.state::<SyncServerState>();
    let port = state.get_port();
    Ok(port.map(|p| format!("ws://127.0.0.1:{}", p)))
}

/// Check if the sync server is healthy (process still running)
#[tauri::command]
pub async fn check_sync_server_health(app: AppHandle) -> Result<bool, String> {
    let state = app.state::<SyncServerState>();

    let mut process = state.process.lock().unwrap();
    if let Some(ref mut child) = *process {
        // Try to check if process is still running
        match child.try_wait() {
            Ok(Some(status)) => {
                // Process has exited
                log::warn!("[SyncServer] Process exited with status: {:?}", status);
                drop(process); // Release lock before updating state
                state.set_status(SyncServerStatus::Failed {
                    error: format!("Process exited with status: {:?}", status),
                });
                state.set_port(None);
                Ok(false)
            }
            Ok(None) => {
                // Process is still running
                Ok(true)
            }
            Err(e) => {
                log::error!("[SyncServer] Error checking process status: {}", e);
                Err(format!("Error checking process status: {}", e))
            }
        }
    } else {
        Ok(false)
    }
}
