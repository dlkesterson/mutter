use super::{AppState, StreamingResult};
use crate::audio::VadEvent;
use serde::{Deserialize, Serialize};
use std::sync::atomic::Ordering;
use tauri::{Emitter, Manager, State};

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
    _app: tauri::AppHandle,
) -> Result<TranscriptionResult, String> {
    let sample_count = audio_buffer.len();
    log::info!("Transcribing audio buffer: {} samples ({:.1}s)",
        sample_count, sample_count as f32 / 16000.0);

    // Signal streaming transcription to not start new work
    state.final_pending.store(true, Ordering::SeqCst);

    let wait_start = std::time::Instant::now();

    log::info!("Acquiring Whisper engine lock...");
    let mut engine = state
        .whisper_engine
        .lock()
        .map_err(|_| "Whisper engine lock poisoned".to_string())?;

    let lock_wait_ms = wait_start.elapsed().as_millis();
    if lock_wait_ms > 100 {
        log::info!("Lock acquired after {}ms wait (streaming was running)", lock_wait_ms);
    }

    if !engine.is_loaded() {
        state.final_pending.store(false, Ordering::SeqCst);
        log::error!("❌ Whisper model is NOT loaded!");
        return Err("Whisper model not loaded. Please select a model in Settings → Whisper Model.".to_string());
    }

    // Check if streaming already produced a usable result for similar audio.
    // If the lock wait was significant, streaming just finished transcribing
    // essentially the same audio — no need to re-run inference.
    if lock_wait_ms > 1000 {
        if let Ok(cached) = state.last_streaming_result.lock() {
            if let Some(ref result) = *cached {
                let age_ms = result.timestamp.elapsed().as_millis();
                // Accept if result is recent (< 60s) and covers most of our audio
                // (streaming sends all accumulated audio, so sample counts should be close)
                let coverage = result.sample_count as f64 / sample_count.max(1) as f64;
                if age_ms < 60_000 && coverage > 0.5 && !result.text.is_empty() {
                    log::info!(
                        "✅ Reusing streaming result (age: {}ms, coverage: {:.0}%, waited {}ms): '{}'",
                        age_ms, coverage * 100.0, lock_wait_ms,
                        if result.text.len() > 100 { format!("{}...", &result.text[..100]) } else { result.text.clone() }
                    );
                    let text = result.text.clone();
                    drop(cached);
                    drop(engine);
                    state.final_pending.store(false, Ordering::SeqCst);
                    return Ok(TranscriptionResult { text, duration_ms: lock_wait_ms as u64 });
                }
            }
        }
    }

    // Run full transcription
    let start = std::time::Instant::now();
    log::info!("Starting Whisper transcription of {} samples ({:.1}s)...",
        sample_count, sample_count as f32 / 16000.0);

    let text = engine
        .transcribe(&audio_buffer)
        .map_err(|e| {
            state.final_pending.store(false, Ordering::SeqCst);
            log::error!("Transcription error: {}", e);
            format!("Transcription failed: {}", e)
        })?;

    let duration_ms = start.elapsed().as_millis() as u64;
    drop(engine);
    state.final_pending.store(false, Ordering::SeqCst);

    log::info!("✅ Transcription complete in {}ms (waited {}ms for lock): '{}'",
        duration_ms, lock_wait_ms,
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

    // Skip if final transcription is waiting — don't compete for the lock
    {
        let state: tauri::State<'_, AppState> = app.state();
        if state.final_pending.load(Ordering::SeqCst) {
            log::info!("[Streaming] Skipping - final transcription is pending");
            return Ok(());
        }
    }

    // Emit a "processing" event immediately
    let _ = app.emit("transcription-processing", ());

    // Clone app handle for the spawned task
    let app_clone = app.clone();

    // Spawn blocking task for transcription to avoid blocking the async runtime
    tokio::task::spawn_blocking(move || {
        let state: tauri::State<'_, AppState> = app_clone.state();

        // Bail if final transcription started while we were queued
        if state.final_pending.load(Ordering::SeqCst) {
            log::info!("[Streaming] Aborting - final transcription is pending");
            return;
        }

        // Try to acquire the lock (non-blocking check first)
        let mut engine: std::sync::MutexGuard<'_, crate::ml::WhisperEngine> = match state.whisper_engine.try_lock() {
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
                let text: String = text;
                let duration_ms = start.elapsed().as_millis();

                // Store result for potential reuse by final transcription
                if let Ok(mut cached) = state.last_streaming_result.lock() {
                    *cached = Some(StreamingResult {
                        text: text.clone(),
                        sample_count,
                        timestamp: std::time::Instant::now(),
                    });
                }

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
