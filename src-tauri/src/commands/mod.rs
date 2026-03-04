mod app;
mod models;
mod notes;
mod transcription;

use crate::audio::{AudioBuffer, VadState};
use crate::ml::WhisperEngine;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

/// Cached result from streaming transcription, reusable by final transcription
/// to avoid duplicate inference when both target the same audio.
pub struct StreamingResult {
    pub text: String,
    pub sample_count: usize,
    pub timestamp: std::time::Instant,
}

pub struct AppState {
    pub whisper_engine: Mutex<WhisperEngine>,
    pub audio_buffer: Mutex<AudioBuffer>,
    pub vad_state: Mutex<VadState>,
    /// Set by final transcription to prevent new streaming transcriptions from starting
    pub final_pending: AtomicBool,
    /// Last successful streaming transcription result
    pub last_streaming_result: Mutex<Option<StreamingResult>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            whisper_engine: Mutex::new(WhisperEngine::new()),
            audio_buffer: Mutex::new(AudioBuffer::new()),
            vad_state: Mutex::new(VadState::new()),
            final_pending: AtomicBool::new(false),
            last_streaming_result: Mutex::new(None),
        }
    }
}

pub use app::*;
pub use models::*;
pub use notes::*;
pub use transcription::*;
