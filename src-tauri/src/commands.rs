use crate::audio::{AudioBuffer, VadEvent, VadState};
use crate::ml::{EmbeddingEngine, ModelManager, WhisperEngine};
use crate::registry::{
    ClassificationAction, ClassificationResult, CommandAction, CommandRegistry, CursorContext,
    EditorAction, FormatType,
};
use crate::system::SystemContext;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

pub struct AppState {
    pub registry: Mutex<CommandRegistry>,
    pub embedding_engine: Mutex<EmbeddingEngine>,
    pub whisper_engine: Mutex<WhisperEngine>,
    pub audio_buffer: Mutex<AudioBuffer>,
    pub vad_state: Mutex<VadState>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            registry: Mutex::new(CommandRegistry::new()),
            embedding_engine: Mutex::new(EmbeddingEngine::new()),
            whisper_engine: Mutex::new(WhisperEngine::new()),
            audio_buffer: Mutex::new(AudioBuffer::new()),
            vad_state: Mutex::new(VadState::new()),
        }
    }
}

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
pub async fn search_notes(query: String, vault_path: String) -> Result<Vec<SearchResult>, String> {
    let mut results = vec![];
    let query_lower = query.to_lowercase();

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

        // Simple text search (can enhance with fuzzy matching later)
        if content.to_lowercase().contains(&query_lower) {
            let title = entry
                .path()
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Untitled")
                .to_string();

            // Extract excerpt
            let excerpt = extract_excerpt(&content, &query_lower);

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

#[tauri::command]
pub async fn register_global_hotkey(app: tauri::AppHandle, shortcut: String) -> Result<(), String> {
    log::info!("Registering global hotkey: {}", shortcut);

    // Plugin is already initialized in lib.rs with the handler
    app.global_shortcut()
        .register(shortcut.as_str())
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn append_to_inbox(
    text: String,
    timestamp: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Get documents directory as vault root for now, or app data dir
    let vault_path = app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?
        .join("MutterVault");

    if !vault_path.exists() {
        std::fs::create_dir_all(&vault_path).map_err(|e| e.to_string())?;
    }

    let inbox_path = vault_path.join("Inbox.md");

    // Create inbox file if doesn't exist
    if !inbox_path.exists() {
        std::fs::write(&inbox_path, "# Inbox\n\n").map_err(|e| e.to_string())?;
    }

    // Append entry
    let entry = format!("\n## {}\n\n{}\n", timestamp, text);

    let mut file = std::fs::OpenOptions::new()
        .append(true)
        .create(true)
        .open(&inbox_path)
        .map_err(|e| e.to_string())?;

    file.write_all(entry.as_bytes())
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn close_quick_capture(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("quick-capture") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Process incoming audio chunk from frontend
#[tauri::command]
pub async fn process_audio_chunk(
    pcm_data: Vec<f32>,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Add to audio buffer for later transcription
    let buffer = state.audio_buffer.lock().unwrap();
    buffer.push(&pcm_data);
    drop(buffer); // Release lock

    // Log audio level occasionally
    if rand::random::<f32>() < 0.05 {
        let rms = (pcm_data.iter().map(|x| x * x).sum::<f32>() / pcm_data.len() as f32).sqrt();
        log::info!("Received audio chunk RMS: {:.4}", rms);
    }

    // Check VAD
    let mut vad = state.vad_state.lock().unwrap();
    match vad.process(&pcm_data, 16000.0) {
        VadEvent::SpeechEnd => {
            // Silence detected after speech - trigger transcription
            log::info!("VAD detected end of speech - triggering transcription");
            let _ = app.emit("vad-silence-detected", ());
        }
        VadEvent::SpeechStart => {
            let _ = app.emit("vad-speech-start", ());
        }
        _ => {}
    }

    Ok(())
}

#[tauri::command]
pub async fn update_vad_settings(
    silence_ms: f32,
    min_speech_ms: f32,
    sensitivity: f32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut vad = state.vad_state.lock().unwrap();
    vad.update_settings(silence_ms, min_speech_ms, sensitivity);
    Ok(())
}

/// Transcribe audio buffer to text
#[tauri::command]
pub async fn transcribe_audio(
    audio_buffer: Vec<f32>,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<TranscriptionResult, String> {
    log::info!("Transcribing audio buffer: {} samples", audio_buffer.len());

    // --- START DEBUG BLOCK ---
    // Save to "debug_audio.wav" in the app data folder to verify quality
    if let Ok(app_dir) = app.path().app_data_dir() {
        let debug_path = app_dir.join("debug_recording.wav");
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 16000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        if let Ok(mut writer) = hound::WavWriter::create(&debug_path, spec) {
            for &sample in &audio_buffer {
                let amplitude = (sample * i16::MAX as f32) as i16;
                writer.write_sample(amplitude).ok();
            }
            writer.finalize().ok();
            log::info!("Saved debug audio to: {:?}", debug_path);
        }
    }
    // --- END DEBUG BLOCK ---

    let start = std::time::Instant::now();
    let mut engine = state
        .whisper_engine
        .lock()
        .map_err(|_| "Whisper engine lock poisoned".to_string())?;

    let text = engine
        .transcribe(&audio_buffer)
        .map_err(|e| format!("Transcription failed: {}", e))?;

    let duration_ms = start.elapsed().as_millis() as u64;

    Ok(TranscriptionResult { text, duration_ms })
}

/// Stream partial transcription results while recording
#[tauri::command]
pub async fn transcribe_streaming(
    audio_buffer: Vec<f32>,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    log::info!(
        "Starting streaming transcription: {} samples",
        audio_buffer.len()
    );

    // Only process if we have at least 1 second of audio
    if audio_buffer.len() < 16000 {
        return Ok(());
    }

    let mut engine = state
        .whisper_engine
        .lock()
        .map_err(|_| "Whisper engine lock poisoned".to_string())?;

    // Emit a "processing" event
    let _ = app.emit("transcription-processing", ());

    // Transcribe the current buffer
    match engine.transcribe(&audio_buffer) {
        Ok(text) => {
            // Emit partial result
            let _ = app.emit(
                "transcription-partial",
                PartialTranscription {
                    text: text.clone(),
                    is_final: false,
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64,
                },
            );
            log::info!("Partial transcription: {}", text);
        }
        Err(e) => {
            log::warn!("Streaming transcription error: {}", e);
        }
    }

    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PartialTranscription {
    pub text: String,
    pub is_final: bool,
    pub timestamp: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TranscriptionResult {
    pub text: String,
    pub duration_ms: u64,
}

/// Classify text as command or regular text with confidence score
#[tauri::command]
pub async fn classify_text(
    text: String,
    has_selection: bool,
    cursor_context: CursorContext,
    system_context: Option<SystemContext>,
    state: State<'_, AppState>,
) -> Result<ClassificationResultWithTiming, String> {
    log::info!(
        "Classifying text: '{}' (selection: {}, context: {:?})",
        text,
        has_selection,
        system_context
    );

    if text.trim().is_empty() {
        log::info!("Text is empty, skipping classification");
        return Ok(ClassificationResultWithTiming {
            result: ClassificationResult {
                action: ClassificationAction::InsertText(String::new()),
                confidence: 0.0,
                requires_disambiguation: false,
            },
            timings: PerformanceTimings {
                embed_ms: 0,
                search_ms: 0,
                total_ms: 0,
            },
        });
    }

    let total_start = std::time::Instant::now();

    // 1. Quick pattern matching for high-confidence commands
    if let Some(action) = match_command_patterns(&text) {
        return Ok(ClassificationResultWithTiming {
            result: ClassificationResult {
                action: ClassificationAction::ExecuteCommand(action),
                confidence: 1.0,
                requires_disambiguation: false,
            },
            timings: PerformanceTimings {
                embed_ms: 0,
                search_ms: 0,
                total_ms: total_start.elapsed().as_millis() as u64,
            },
        });
    }

    // Get actual embedding from ML model
    let embed_start = std::time::Instant::now();
    let engine = state.embedding_engine.lock().unwrap();
    let input_embedding = engine
        .encode(&text)
        .map_err(|e| format!("Failed to encode input: {}", e))?;
    drop(engine); // Release lock
    let embed_duration_ms = embed_start.elapsed().as_millis() as u64;

    // Search for best matching command
    let search_start = std::time::Instant::now();
    let registry = state.registry.lock().unwrap();

    let best_match = registry.find_best_match(
        &input_embedding,
        has_selection,
        &cursor_context,
        system_context.as_ref(),
    );
    let search_duration_ms = search_start.elapsed().as_millis() as u64;

    if let Some((command, similarity)) = best_match {
        log::info!(
            "Best match: {:?} with similarity {:.2}",
            command.id,
            similarity
        );

        // Check if it looks like dictation despite having a match
        if looks_like_dictation(&text, similarity) {
            log::info!(
                "Text appears to be dictation (similarity {:.2}), treating as plain text",
                similarity
            );
            return Ok(ClassificationResultWithTiming {
                result: ClassificationResult {
                    action: ClassificationAction::InsertText(text),
                    confidence: 0.0,
                    requires_disambiguation: false,
                },
                timings: PerformanceTimings {
                    embed_ms: embed_duration_ms,
                    search_ms: search_duration_ms,
                    total_ms: total_start.elapsed().as_millis() as u64,
                },
            });
        }

        // High confidence - execute command
        if similarity > 0.80 {
            let mut action = command.action.clone();

            // Extract parameters for System commands
            if let crate::registry::CommandAction::System(ref mut sys_action) = action {
                match sys_action {
                    crate::registry::SystemAction::OpenNote { name } => {
                        // Simple extraction: remove the trigger phrase if possible, or just use the whole text
                        // Ideally we'd know WHICH phrase matched, but for now we'll just try to strip common prefixes
                        let lower_text = text.to_lowercase();
                        let prefixes = [
                            "open note",
                            "open file",
                            "go to note",
                            "switch to note",
                            "open",
                        ];
                        let mut extracted = text.clone();
                        for prefix in prefixes {
                            if lower_text.starts_with(prefix) {
                                extracted = text[prefix.len()..].trim().to_string();
                                break;
                            }
                        }
                        *name = extracted;
                    }
                    crate::registry::SystemAction::Search { query } => {
                        let lower_text = text.to_lowercase();
                        let prefixes = ["search for", "find note", "search notes", "search"];
                        let mut extracted = text.clone();
                        for prefix in prefixes {
                            if lower_text.starts_with(prefix) {
                                extracted = text[prefix.len()..].trim().to_string();
                                break;
                            }
                        }
                        *query = extracted;
                    }
                    _ => {}
                }
            }

            return Ok(ClassificationResultWithTiming {
                result: ClassificationResult {
                    action: ClassificationAction::ExecuteCommand(action),
                    confidence: similarity,
                    requires_disambiguation: false,
                },
                timings: PerformanceTimings {
                    embed_ms: embed_duration_ms,
                    search_ms: search_duration_ms,
                    total_ms: total_start.elapsed().as_millis() as u64,
                },
            });
        }
        // Medium confidence - require disambiguation
        else if similarity > 0.65 {
            return Ok(ClassificationResultWithTiming {
                result: ClassificationResult {
                    action: ClassificationAction::Ambiguous {
                        text: text.clone(),
                        possible_command: command.action,
                    },
                    confidence: similarity,
                    requires_disambiguation: true,
                },
                timings: PerformanceTimings {
                    embed_ms: embed_duration_ms,
                    search_ms: search_duration_ms,
                    total_ms: total_start.elapsed().as_millis() as u64,
                },
            });
        }
    }

    // Default to inserting text
    Ok(ClassificationResultWithTiming {
        result: ClassificationResult {
            action: ClassificationAction::InsertText(text),
            confidence: 0.0,
            requires_disambiguation: false,
        },
        timings: PerformanceTimings {
            embed_ms: embed_duration_ms,
            search_ms: search_duration_ms,
            total_ms: total_start.elapsed().as_millis() as u64,
        },
    })
}

fn match_command_patterns(text: &str) -> Option<CommandAction> {
    let text_lower = text.to_lowercase();
    let text_lower = text_lower.trim_end_matches(|c| c == '.' || c == '!' || c == '?');

    // Exact matches (100% confidence)
    match text_lower {
        "undo" | "undo that" | "undo last command" => {
            return Some(CommandAction::Editor(EditorAction::UndoVoiceCommand))
        }
        "redo" => return Some(CommandAction::Editor(EditorAction::Redo)),
        "new line" | "next line" => return Some(CommandAction::Editor(EditorAction::NewLine)),
        "delete" | "delete that" => return Some(CommandAction::Editor(EditorAction::Delete)),
        "select all" => return Some(CommandAction::Editor(EditorAction::SelectAll)),
        _ => {}
    }

    // Pattern matches
    if text_lower.starts_with("heading") {
        if text_lower.contains("one") || text_lower.contains("1") {
            return Some(CommandAction::Format(FormatType::Heading { level: 1 }));
        }
        if text_lower.contains("two") || text_lower.contains("2") {
            return Some(CommandAction::Format(FormatType::Heading { level: 2 }));
        }
        if text_lower.contains("three") || text_lower.contains("3") {
            return Some(CommandAction::Format(FormatType::Heading { level: 3 }));
        }
    }

    // "make this [format]"
    if text_lower.starts_with("make this") || text_lower.starts_with("make it") {
        if text_lower.contains("bold") {
            return Some(CommandAction::Format(FormatType::Bold));
        }
        if text_lower.contains("italic") {
            return Some(CommandAction::Format(FormatType::Italic));
        }
        if text_lower.contains("heading") {
            if text_lower.contains("one") || text_lower.contains("1") {
                return Some(CommandAction::Format(FormatType::Heading { level: 1 }));
            }
            // Default to H1 if just "make this heading"
            return Some(CommandAction::Format(FormatType::Heading { level: 1 }));
        }
    }

    None
}

fn looks_like_dictation(text: &str, command_similarity: f32) -> bool {
    // Only treat as dictation if:
    // 1. Command similarity is very low (<0.5)
    // 2. AND it looks like natural speech

    if command_similarity > 0.5 {
        return false; // Probably a command
    }

    let word_count = text.split_whitespace().count();

    // Long sentences are likely dictation
    if word_count > 8 {
        return true;
    }

    // Ends with punctuation = dictation
    if text.trim_end().ends_with(&['.', '!', '?', ','][..]) {
        return true;
    }

    // Contains common dictation phrases
    let dictation_markers = [
        "i think",
        "i was",
        "i am",
        "we should",
        "let's",
        "yesterday",
        "today",
        "tomorrow",
        "meeting with",
    ];

    let text_lower = text.to_lowercase();
    if dictation_markers.iter().any(|m| text_lower.contains(m)) {
        return true;
    }

    false
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClassificationResultWithTiming {
    pub result: ClassificationResult,
    pub timings: PerformanceTimings,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PerformanceTimings {
    pub embed_ms: u64,
    pub search_ms: u64,
    pub total_ms: u64,
}

/// Get embedding vector for text
#[tauri::command]
pub async fn get_embedding(text: String, state: State<'_, AppState>) -> Result<Vec<f32>, String> {
    log::info!("Getting embedding for: {}", text);

    let engine = state.embedding_engine.lock().unwrap();

    engine
        .encode(&text)
        .map_err(|e| format!("Failed to encode text: {}", e))
}

/// Load the embedding model (BERT)
#[tauri::command]
pub async fn load_embedding_model(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Loading embedding model...");

    let (model_id, revision) = {
        let engine = state.embedding_engine.lock().unwrap();
        engine.get_model_config()
    };

    let models_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("models");

    let manager = ModelManager::new(models_dir);

    let (config_path, tokenizer_path, weights_path) = manager
        .download_from_hub(&model_id, &revision)
        .await
        .map_err(|e| format!("Failed to download embedding model: {}", e))?;

    let mut engine = state.embedding_engine.lock().unwrap();
    engine
        .load_from_files(config_path, tokenizer_path, weights_path)
        .map_err(|e| format!("Failed to load embedding model: {}", e))?;
    Ok(())
}

/// Initialize command registry embeddings
#[tauri::command]
pub async fn initialize_embeddings(state: State<'_, AppState>) -> Result<(), String> {
    log::info!("Initializing command embeddings");

    let mut registry = state.registry.lock().unwrap();
    let engine = state.embedding_engine.lock().unwrap();

    // Generate embeddings for all command phrases
    for command in registry.commands.iter_mut() {
        let mut embeddings = Vec::new();

        for phrase in &command.phrases {
            match engine.encode(phrase) {
                Ok(embedding) => embeddings.push(embedding),
                Err(e) => {
                    log::error!("Failed to encode phrase '{}': {}", phrase, e);
                }
            }
        }

        // Average the embeddings (centroid)
        if !embeddings.is_empty() {
            let dim = embeddings[0].len();
            let mut centroid = vec![0.0; dim];

            for emb in &embeddings {
                for (i, &val) in emb.iter().enumerate() {
                    centroid[i] += val;
                }
            }

            for val in centroid.iter_mut() {
                *val /= embeddings.len() as f32;
            }

            command.embedding = centroid;
            log::info!("Generated embedding for command: {}", command.id);
        }
    }

    log::info!("Command embeddings initialized successfully");
    Ok(())
}

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

/// Download model from HuggingFace Hub
#[tauri::command]
pub async fn download_model_from_hub(
    model_id: String,
    model_name: String,
    revision: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    log::info!("Downloading model {} from HuggingFace Hub", model_id);

    let models_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("models");

    let manager = ModelManager::new(models_dir.clone());

    let (config, tokenizer, weights) = manager
        .download_from_hub(&model_id, &revision)
        .await
        .map_err(|e| format!("Failed to download from hub: {}", e))?;

    // Copy files to our models directory
    let model_dir = models_dir.join(&model_name);
    std::fs::create_dir_all(&model_dir)
        .map_err(|e| format!("Failed to create model directory: {}", e))?;

    std::fs::copy(&config, model_dir.join("config.json"))
        .map_err(|e| format!("Failed to copy config: {}", e))?;
    std::fs::copy(&tokenizer, model_dir.join("tokenizer.json"))
        .map_err(|e| format!("Failed to copy tokenizer: {}", e))?;
    std::fs::copy(&weights, model_dir.join("model.safetensors"))
        .map_err(|e| format!("Failed to copy weights: {}", e))?;

    log::info!("Model downloaded successfully to {:?}", model_dir);
    Ok(model_dir.to_string_lossy().to_string())
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

/// Load a Whisper model
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
        .join("models")
        .join(&model_name);

    let config_path = models_dir.join("config.json");
    let tokenizer_path = models_dir.join("tokenizer.json");
    let weights_path = models_dir.join("model.safetensors");

    // Ensure mel filters are available
    let manager = ModelManager::new(models_dir.parent().unwrap().to_path_buf());
    let mel_filters_path = manager
        .download_mel_filters()
        .await
        .map_err(|e| format!("Failed to download mel filters: {}", e))?;

    let mut engine = state
        .whisper_engine
        .lock()
        .map_err(|_| "Whisper engine lock poisoned".to_string())?;

    engine
        .load_model(
            &config_path,
            &tokenizer_path,
            &weights_path,
            &mel_filters_path,
            false,
        )
        .map_err(|e| format!("Failed to load model: {}", e))?;

    log::info!("Model loaded successfully");
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

/// Create a task in Agent-Tracker
#[tauri::command]
pub async fn create_agent_tracker_task(
    description: String,
    source_file: Option<String>,
) -> Result<String, String> {
    log::info!("Creating Agent-Tracker task: {}", description);

    // Construct the tracker CLI command
    // Assumes the tracker binary is in PATH or at a known location
    let tracker_path = std::env::var("TRACKER_CLI_PATH")
        .unwrap_or_else(|_| "tracker".to_string());

    let mut cmd = std::process::Command::new(tracker_path);
    cmd.arg("task")
        .arg("create")
        .arg(&description);

    if let Some(file) = source_file {
        cmd.arg("--source").arg(file);
    }

    // Execute the command
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute tracker command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Tracker command failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.trim().to_string())
}
