use serde::{Deserialize, Serialize};
use tauri::{State, Manager, Emitter};
use std::sync::Mutex;
use crate::registry::{CommandRegistry, ClassificationResult, ClassificationAction};
use crate::ml::{EmbeddingEngine, WhisperEngine, ModelManager};
use crate::audio::AudioBuffer;

pub struct AppState {
    pub registry: Mutex<CommandRegistry>,
    pub embedding_engine: Mutex<EmbeddingEngine>,
    pub whisper_engine: Mutex<WhisperEngine>,
    pub audio_buffer: Mutex<AudioBuffer>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            registry: Mutex::new(CommandRegistry::new()),
            embedding_engine: Mutex::new(EmbeddingEngine::new()),
            whisper_engine: Mutex::new(WhisperEngine::new()),
            audio_buffer: Mutex::new(AudioBuffer::new()),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub enum CommandType {
    InsertText(String),
    Format(FormatType),
    Editor(EditorAction),
    System(SystemAction),
}

#[derive(Debug, Serialize, Deserialize)]
pub enum FormatType {
    Bold,
    Italic,
    Heading(u8),
    Quote,
    BulletList,
    NumberedList,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum EditorAction {
    Undo,
    Redo,
    NewLine,
    Delete,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum SystemAction {
    CreateNote(String),
    OpenNote(String),
    Search(String),
    SaveNote,
}

/// Process incoming audio chunk from frontend
#[tauri::command]
pub async fn process_audio_chunk(pcm_data: Vec<f32>, state: State<'_, AppState>) -> Result<(), String> {
    // Add to audio buffer for later transcription
    let buffer = state.audio_buffer.lock().unwrap();
    buffer.push(&pcm_data);
    
    Ok(())
}

/// Transcribe audio buffer to text
#[tauri::command]
pub async fn transcribe_audio(audio_buffer: Vec<f32>, state: State<'_, AppState>) -> Result<String, String> {
    log::info!("Transcribing audio buffer: {} samples", audio_buffer.len());
    
    let engine = state.whisper_engine.lock().unwrap();
    
    engine.transcribe(&audio_buffer)
        .map_err(|e| format!("Transcription failed: {}", e))
}

/// Classify text as command or regular text with confidence score
#[tauri::command]
pub async fn classify_text(
    text: String,
    has_selection: bool,
    state: State<'_, AppState>
) -> Result<ClassificationResult, String> {
    log::info!("Classifying text: {} (selection: {})", text, has_selection);
    
    // Get actual embedding from ML model
    let engine = state.embedding_engine.lock().unwrap();
    let input_embedding = engine.encode(&text)
        .map_err(|e| format!("Failed to encode input: {}", e))?;
    drop(engine); // Release lock
    
    let registry = state.registry.lock().unwrap();
    
    if let Some((command, similarity)) = registry.find_best_match(&input_embedding, has_selection) {
        log::info!("Best match: {:?} with similarity {:.2}", command.id, similarity);
        
        // High confidence - execute command
        if similarity > 0.85 {
            return Ok(ClassificationResult {
                action: ClassificationAction::ExecuteCommand(command.action),
                confidence: similarity,
                requires_disambiguation: false,
            });
        }
        
        // Medium confidence - require disambiguation
        if similarity > 0.65 {
            return Ok(ClassificationResult {
                action: ClassificationAction::Ambiguous {
                    text: text.clone(),
                    possible_command: command.action,
                },
                confidence: similarity,
                requires_disambiguation: true,
            });
        }
    }
    
    // Low confidence - insert as text
    Ok(ClassificationResult {
        action: ClassificationAction::InsertText(text),
        confidence: 0.0,
        requires_disambiguation: false,
    })
}

/// Get embedding vector for text
#[tauri::command]
pub async fn get_embedding(text: String, state: State<'_, AppState>) -> Result<Vec<f32>, String> {
    log::info!("Getting embedding for: {}", text);
    
    let engine = state.embedding_engine.lock().unwrap();
    
    engine.encode(&text)
        .map_err(|e| format!("Failed to encode text: {}", e))
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
    
    let models_dir = app.path()
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
    
    let path = manager.download_model(&model_name, &url, Some(callback))
        .await
        .map_err(|e| format!("Download failed: {}", e))?;
    
    Ok(path.to_string_lossy().to_string())
}
