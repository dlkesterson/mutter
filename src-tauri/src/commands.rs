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

    // Calculate audio energy for logging
    let energy: f32 = pcm_data.iter().map(|&x| x * x).sum::<f32>() / pcm_data.len() as f32;

    // Check VAD
    let mut vad = state.vad_state.lock().unwrap();
    let vad_event = vad.process(&pcm_data, 16000.0);
    let threshold = vad.adaptive_threshold;
    let is_speaking = vad.is_speaking;
    drop(vad); // Release lock before emitting events

    // Log VAD state occasionally for debugging
    if rand::random::<f32>() < 0.05 {
        let rms = energy.sqrt();
        log::info!("[VAD] RMS: {:.4}, Energy: {:.6}, Threshold: {:.6}, IsSpeaking: {}, Event: {:?}",
                   rms, energy, threshold, is_speaking, vad_event);
    }

    match vad_event {
        VadEvent::SpeechEnd => {
            // Silence detected after speech - trigger transcription
            log::info!("[VAD] ✓ Speech end detected - emitting silence event");
            let _ = app.emit("vad-silence-detected", ());
        }
        VadEvent::SpeechStart => {
            log::info!("[VAD] ✓ Speech start detected");
            let _ = app.emit("vad-speech-start", ());
        }
        VadEvent::Silence => {
            // Continuous silence (never started speaking)
            // Log occasionally to help debug threshold issues
            if rand::random::<f32>() < 0.01 {
                log::debug!("[VAD] Continuous silence (never detected speech)");
            }
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

    log::info!("Acquiring Whisper engine lock...");
    let engine = state
        .whisper_engine
        .lock()
        .map_err(|_| "Whisper engine lock poisoned".to_string())?;
    log::info!("Lock acquired. Model loaded: {}", engine.is_loaded());

    if !engine.is_loaded() {
        log::error!("❌ Whisper model is NOT loaded! User needs to select a model in Settings.");
        return Err("Whisper model not loaded. Please select a model in Settings → Whisper Model.".to_string());
    }

    // whisper-rs/whisper.cpp handles long audio natively via timestamp tokens!
    // No need for manual chunking or merging.
    log::info!("Starting Whisper transcription of {} samples ({:.1}s)...",
        audio_buffer.len(),
        audio_buffer.len() as f32 / 16000.0);

    let text = engine
        .transcribe(&audio_buffer)
        .map_err(|e| {
            log::error!("Transcription error: {}", e);
            format!("Transcription failed: {}", e)
        })?;

    let duration_ms = start.elapsed().as_millis() as u64;

    log::info!("✅ Transcription complete in {}ms: '{}'",
        duration_ms,
        if text.len() > 100 { format!("{}...", &text[..100]) } else { text.clone() });

    Ok(TranscriptionResult { text, duration_ms })
}

/// Stream partial transcription results while recording (non-blocking)
/// This runs transcription on a background thread to avoid blocking the UI
#[tauri::command]
pub async fn transcribe_streaming(
    audio_buffer: Vec<f32>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let sample_count = audio_buffer.len();
    let duration_secs = sample_count as f32 / 16000.0;

    log::info!(
        "[Streaming] Received {} samples ({:.1}s) for partial transcription",
        sample_count,
        duration_secs
    );

    // Only process if we have at least 2 seconds of audio
    if sample_count < 32000 {
        log::debug!("[Streaming] Skipping - need at least 2 seconds of audio");
        return Ok(());
    }

    // Emit a "processing" event immediately
    let _ = app.emit("transcription-processing", ());

    // Clone app handle for the spawned task
    let app_clone = app.clone();

    // Spawn blocking task for transcription to avoid blocking the async runtime
    tokio::task::spawn_blocking(move || {
        let state: tauri::State<AppState> = app_clone.state();

        // Try to acquire the lock (non-blocking check first)
        let engine = match state.whisper_engine.try_lock() {
            Ok(guard) => guard,
            Err(_) => {
                log::debug!("[Streaming] Whisper engine busy, skipping this chunk");
                return;
            }
        };

        if !engine.is_loaded() {
            log::warn!("[Streaming] Whisper model not loaded");
            return;
        }

        let start = std::time::Instant::now();
        match engine.transcribe(&audio_buffer) {
            Ok(text) => {
                let duration_ms = start.elapsed().as_millis();
                if !text.is_empty() {
                    log::info!(
                        "[Streaming] ✓ Partial transcription in {}ms: '{}'",
                        duration_ms,
                        if text.len() > 80 { format!("{}...", &text[..80]) } else { text.clone() }
                    );

                    // Emit partial result
                    let _ = app_clone.emit(
                        "transcription-partial",
                        PartialTranscription {
                            text,
                            is_final: false,
                            timestamp: std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap()
                                .as_millis() as u64,
                        },
                    );
                } else {
                    log::debug!("[Streaming] Empty transcription result (silence?)");
                }
            }
            Err(e) => {
                log::warn!("[Streaming] Transcription error: {}", e);
            }
        }
    });

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
    // Check for strong dictation signals FIRST, regardless of similarity
    // Natural speech patterns are more reliable than embedding similarity

    let word_count = text.split_whitespace().count();
    let text_lower = text.to_lowercase();

    // Strong dictation markers that override similarity
    let strong_markers = [
        "i think",
        "i was",
        "i am",
        "i'm",
        "we should",
        "let's",
        "yesterday",
        "today",
        "tomorrow",
        "meeting with",
        "testing",
        "trying",
        "checking if",
        "seeing if",
    ];

    // If contains strong dictation markers, it's dictation
    if strong_markers.iter().any(|m| text_lower.contains(m)) {
        return true;
    }

    // Long sentences (>8 words) are likely dictation
    if word_count > 8 {
        return true;
    }

    // Ends with punctuation = dictation
    if text.trim_end().ends_with(&['.', '!', '?', ','][..]) {
        return true;
    }

    // Only if similarity is very low AND no other signals
    if command_similarity < 0.5 {
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
    log::debug!("Getting embedding for: {}", text);

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
