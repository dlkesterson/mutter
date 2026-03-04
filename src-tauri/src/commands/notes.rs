use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct FileNode {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub title: String,
    pub excerpt: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractedTask {
    pub description: String,
    pub checked: bool,
    pub line_number: usize,
}

#[tauri::command]
pub async fn get_file_tree(vault_path: String) -> Result<Vec<FileNode>, String> {
    let root = std::path::Path::new(&vault_path);
    if !root.exists() {
        return Err("Vault path does not exist".to_string());
    }

    fn read_dir_recursive(path: &std::path::Path) -> Result<Vec<FileNode>, String> {
        let mut nodes = Vec::new();
        let entries = std::fs::read_dir(path).map_err(|e| e.to_string())?;

        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = path.is_dir();

            // Skip hidden files
            if name.starts_with('.') {
                continue;
            }

            let children = if is_dir {
                Some(read_dir_recursive(&path)?)
            } else {
                None
            };

            nodes.push(FileNode {
                path: path.to_string_lossy().to_string(),
                name,
                is_dir,
                children,
            });
        }

        // Sort: folders first, then files
        nodes.sort_by(|a, b| {
            if a.is_dir == b.is_dir {
                a.name.cmp(&b.name)
            } else {
                b.is_dir.cmp(&a.is_dir)
            }
        });

        Ok(nodes)
    }

    read_dir_recursive(root)
}

#[tauri::command]
pub async fn open_daily_note(vault_path: String) -> Result<String, String> {
    let root = std::path::Path::new(&vault_path);
    if !root.exists() {
        return Err("Vault path does not exist".to_string());
    }

    let now = chrono::Local::now();
    let year = now.format("%Y").to_string();
    let month_folder = now.format("%Y_%m").to_string();
    let filename = now.format("%Y-%m-%d.md").to_string();

    // Path: vault/YYYY/YYYY_MM/YYYY-MM-DD.md
    let year_path = root.join(&year);
    let month_path = year_path.join(&month_folder);
    let file_path = month_path.join(&filename);

    // Create directories if they don't exist
    if !year_path.exists() {
        std::fs::create_dir(&year_path).map_err(|e| e.to_string())?;
    }
    if !month_path.exists() {
        std::fs::create_dir(&month_path).map_err(|e| e.to_string())?;
    }

    // Create file if it doesn't exist
    if !file_path.exists() {
        let title = now.format("%Y-%m-%d").to_string();
        let content = format!("# {}\n\n", title);
        std::fs::write(&file_path, content).map_err(|e| e.to_string())?;
    }

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn search_notes(query: String, vault_path: String) -> Result<Vec<SearchResult>, String> {
    let mut results = vec![];
    let query_lower = query.to_lowercase();
    let terms: Vec<&str> = query_lower.split_whitespace().collect();

    // Walk all .md files
    for entry in walkdir::WalkDir::new(&vault_path)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.path().extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }

        let content = match std::fs::read_to_string(entry.path()) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let content_lower = content.to_lowercase();

        // Check if ALL terms are present (implicit AND)
        if terms.iter().all(|&term| content_lower.contains(term)) {
            let title = entry
                .path()
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Untitled")
                .to_string();

            // Extract excerpt based on the first term
            let first_term = terms.first().unwrap_or(&"");
            let excerpt = extract_excerpt(&content, first_term);

            results.push(SearchResult {
                path: entry.path().to_string_lossy().to_string(),
                title,
                excerpt,
            });
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn create_note(vault_path: String, filename: Option<String>) -> Result<String, String> {
    let root = std::path::Path::new(&vault_path);
    if !root.exists() {
        return Err("Vault path does not exist".to_string());
    }

    let mut name = filename.unwrap_or_else(|| "Untitled.md".to_string());
    if !name.ends_with(".md") {
        name.push_str(".md");
    }

    let base_name = name.trim_end_matches(".md").to_string();
    let mut final_name = name.clone();
    let mut final_path = root.join(&final_name);
    let mut i = 1;

    while final_path.exists() {
        final_name = format!("{} {}.md", base_name, i);
        final_path = root.join(&final_name);
        i += 1;
    }

    std::fs::write(&final_path, "").map_err(|e| e.to_string())?;

    Ok(final_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn rename_note(old_path: String, new_name: String) -> Result<String, String> {
    let old_path_buf = std::path::Path::new(&old_path);
    if !old_path_buf.exists() {
        return Err("File does not exist".to_string());
    }

    let parent = old_path_buf.parent().ok_or("Invalid path")?;
    let mut new_path_buf = parent.join(&new_name);

    // If original was .md and new name doesn't have it, append it
    if old_path_buf.extension().and_then(|s| s.to_str()) == Some("md") {
        if !new_name.ends_with(".md") {
            new_path_buf = parent.join(format!("{}.md", new_name));
        }
    }

    if new_path_buf.exists() {
        return Err("A file with that name already exists".to_string());
    }

    std::fs::rename(old_path_buf, &new_path_buf).map_err(|e| e.to_string())?;

    Ok(new_path_buf.to_string_lossy().to_string())
}

/// Extract tasks from markdown content
#[tauri::command]
pub async fn extract_tasks(content: String) -> Result<Vec<ExtractedTask>, String> {
    let mut tasks = Vec::new();

    for (line_num, line) in content.lines().enumerate() {
        let trimmed = line.trim_start();

        // Match unchecked tasks: - [ ]
        if let Some(rest) = trimmed.strip_prefix("- [ ] ") {
            tasks.push(ExtractedTask {
                description: rest.trim().to_string(),
                checked: false,
                line_number: line_num + 1, // 1-indexed for user display
            });
        }
        // Match checked tasks: - [x] or - [X]
        else if let Some(rest) = trimmed.strip_prefix("- [x] ")
            .or_else(|| trimmed.strip_prefix("- [X] "))
        {
            tasks.push(ExtractedTask {
                description: rest.trim().to_string(),
                checked: true,
                line_number: line_num + 1,
            });
        }
    }

    Ok(tasks)
}

/// Move a file or folder to a new location
#[tauri::command]
pub async fn move_file(old_path: String, new_parent_path: String) -> Result<String, String> {
    let old_path_buf = std::path::Path::new(&old_path);
    if !old_path_buf.exists() {
        return Err("Source path does not exist".to_string());
    }

    let new_parent = std::path::Path::new(&new_parent_path);
    if !new_parent.exists() || !new_parent.is_dir() {
        return Err("Destination path does not exist or is not a directory".to_string());
    }

    let file_name = old_path_buf
        .file_name()
        .ok_or("Invalid source path")?;
    let mut new_path_buf = new_parent.join(file_name);

    // Handle duplicate names
    let mut counter = 1;
    let base_name = new_path_buf.file_stem().and_then(|s| s.to_str()).unwrap_or("file").to_string();
    let extension = new_path_buf.extension().and_then(|s| s.to_str()).map(|s| s.to_string());

    while new_path_buf.exists() {
        let new_name = if let Some(ext) = &extension {
            format!("{} {}.{}", base_name, counter, ext)
        } else {
            format!("{} {}", base_name, counter)
        };
        new_path_buf = new_parent.join(new_name);
        counter += 1;
    }

    std::fs::rename(old_path_buf, &new_path_buf).map_err(|e| e.to_string())?;

    Ok(new_path_buf.to_string_lossy().to_string())
}

/// Delete a file or folder
#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), String> {
    let path_buf = std::path::Path::new(&path);
    if !path_buf.exists() {
        return Err("Path does not exist".to_string());
    }

    if path_buf.is_dir() {
        std::fs::remove_dir_all(path_buf).map_err(|e| e.to_string())?;
    } else {
        std::fs::remove_file(path_buf).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Duplicate a file or folder
#[tauri::command]
pub async fn duplicate_file(path: String) -> Result<String, String> {
    let path_buf = std::path::Path::new(&path);
    if !path_buf.exists() {
        return Err("Path does not exist".to_string());
    }

    let parent = path_buf.parent().ok_or("Invalid path")?;
    let file_stem = path_buf.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let extension = path_buf.extension().and_then(|s| s.to_str());

    // Find available name
    let mut counter = 1;
    let mut new_path_buf;
    loop {
        let new_name = if let Some(ext) = extension {
            format!("{} copy {}.{}", file_stem, counter, ext)
        } else {
            format!("{} copy {}", file_stem, counter)
        };
        new_path_buf = parent.join(new_name);

        if !new_path_buf.exists() {
            break;
        }
        counter += 1;
    }

    // Copy file or directory
    if path_buf.is_dir() {
        copy_dir_recursive(path_buf, &new_path_buf)?;
    } else {
        std::fs::copy(path_buf, &new_path_buf).map_err(|e| e.to_string())?;
    }

    Ok(new_path_buf.to_string_lossy().to_string())
}

/// Open file or folder in system file explorer
#[tauri::command]
pub async fn open_in_system(path: String) -> Result<(), String> {
    let path_buf = std::path::Path::new(&path);
    if !path_buf.exists() {
        return Err("Path does not exist".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path_buf)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path_buf)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(path_buf)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn extract_excerpt(content: &str, query_lower: &str) -> String {
    let content_lower = content.to_lowercase();
    if let Some(idx) = content_lower.find(query_lower) {
        let start = idx.saturating_sub(20);
        let end = (idx + query_lower.len() + 40).min(content.len());
        let text = &content[start..end];
        format!("...{}...", text.replace('\n', " "))
    } else {
        content.chars().take(60).collect::<String>()
    }
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;

    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}
