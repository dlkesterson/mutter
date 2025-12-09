use crate::audio::{AudioBuffer, VadState};
use crate::ml::{EmbeddingEngine, ModelManager, WhisperEngine};
use crate::registry::{ClassificationAction, ClassificationResult, CommandRegistry};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};

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
    if vad.process(&pcm_data, 16000.0) {
        // Silence detected after speech - trigger transcription
        log::info!("VAD detected end of speech - triggering transcription");
        let _ = app.emit("vad-silence-detected", ());
    }

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
    state: State<'_, AppState>,
) -> Result<ClassificationResultWithTiming, String> {
    log::info!(
        "Classifying text: '{}' (selection: {})",
        text,
        has_selection
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

    // Heuristic: If text is longer than typical commands, it's likely dictation
    // Typical commands: "make this bold", "undo", "new paragraph" (2-4 words)
    // Dictation: "testing testing 1 2 3", "this is a longer sentence" (5+ words)
    let word_count = text.split_whitespace().count();

    // If it's a long phrase (5+ words) or contains numbers/punctuation typical of dictation
    let looks_like_dictation = word_count >= 5
        || text.contains(char::is_numeric)
        || text.ends_with('.')
        || text.ends_with('?')
        || text.ends_with('!');

    if looks_like_dictation {
        log::info!(
            "Text appears to be dictation (word_count: {}), treating as plain text",
            word_count
        );
        return Ok(ClassificationResultWithTiming {
            result: ClassificationResult {
                action: ClassificationAction::InsertText(text),
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

    let result = if let Some((command, similarity)) =
        registry.find_best_match(&input_embedding, has_selection)
    {
        log::info!(
            "Best match: {:?} with similarity {:.2}",
            command.id,
            similarity
        );

        // High confidence - execute command
        if similarity > 0.85 {
            ClassificationResult {
                action: ClassificationAction::ExecuteCommand(command.action),
                confidence: similarity,
                requires_disambiguation: false,
            }
        }
        // Medium confidence - require disambiguation
        else if similarity > 0.65 {
            ClassificationResult {
                action: ClassificationAction::Ambiguous {
                    text: text.clone(),
                    possible_command: command.action,
                },
                confidence: similarity,
                requires_disambiguation: true,
            }
        }
        // Low confidence - insert as text
        else {
            ClassificationResult {
                action: ClassificationAction::InsertText(text),
                confidence: 0.0,
                requires_disambiguation: false,
            }
        }
    } else {
        // No match - insert as text
        ClassificationResult {
            action: ClassificationAction::InsertText(text),
            confidence: 0.0,
            requires_disambiguation: false,
        }
    };

    let search_duration_ms = search_start.elapsed().as_millis() as u64;
    let total_duration_ms = total_start.elapsed().as_millis() as u64;

    Ok(ClassificationResultWithTiming {
        result,
        timings: PerformanceTimings {
            embed_ms: embed_duration_ms,
            search_ms: search_duration_ms,
            total_ms: total_duration_ms,
        },
    })
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
