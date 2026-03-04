mod app;
mod models;
mod notes;
mod transcription;

use crate::audio::{AudioBuffer, VadState};
use crate::ml::WhisperEngine;
use std::sync::Mutex;

pub struct AppState {
    pub whisper_engine: Mutex<WhisperEngine>,
    pub audio_buffer: Mutex<AudioBuffer>,
    pub vad_state: Mutex<VadState>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            whisper_engine: Mutex::new(WhisperEngine::new()),
            audio_buffer: Mutex::new(AudioBuffer::new()),
            vad_state: Mutex::new(VadState::new()),
        }
    }
}

pub use app::*;
pub use models::*;
pub use notes::*;
pub use transcription::*;
