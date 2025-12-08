use notify::{RecursiveMode, Result as NotifyResult, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult};
use std::path::PathBuf;
use std::time::Duration;

/// File system watcher for vault changes
pub struct VaultWatcher {
    vault_path: PathBuf,
}

impl VaultWatcher {
    pub fn new(vault_path: PathBuf) -> Self {
        Self { vault_path }
    }

    pub fn start_watching(&self) -> NotifyResult<()> {
        let (_tx, _rx) = std::sync::mpsc::channel::<()>();

        let mut debouncer = new_debouncer(
            Duration::from_millis(250),
            None,
            move |result: DebounceEventResult| {
                match result {
                    Ok(events) => {
                        for event in events {
                            log::info!("File event: {:?}", event);
                            // TODO: Update file index
                        }
                    }
                    Err(errors) => {
                        for error in errors {
                            log::error!("Watch error: {:?}", error);
                        }
                    }
                }
            },
        )?;

        debouncer
            .watcher()
            .watch(&self.vault_path, RecursiveMode::Recursive)?;

        log::info!("Started watching vault at {:?}", self.vault_path);

        Ok(())
    }
}

/// Vault file index for quick search
pub struct VaultIndex {
    files: Vec<FileMetadata>,
}

#[derive(Debug, Clone)]
pub struct FileMetadata {
    pub path: PathBuf,
    pub name: String,
    pub tags: Vec<String>,
    pub headers: Vec<String>,
}

impl VaultIndex {
    pub fn new() -> Self {
        Self { files: Vec::new() }
    }

    pub fn add_file(&mut self, metadata: FileMetadata) {
        self.files.push(metadata);
    }

    pub fn search(&self, query: &str) -> Vec<&FileMetadata> {
        let query_lower = query.to_lowercase();

        self.files
            .iter()
            .filter(|file| {
                file.name.to_lowercase().contains(&query_lower)
                    || file
                        .tags
                        .iter()
                        .any(|t| t.to_lowercase().contains(&query_lower))
                    || file
                        .headers
                        .iter()
                        .any(|h| h.to_lowercase().contains(&query_lower))
            })
            .collect()
    }
}
