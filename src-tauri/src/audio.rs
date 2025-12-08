use ringbuf::{HeapRb, Rb};
use std::sync::Mutex;

/// Audio ring buffer to hold last 30 seconds of audio at 16kHz
pub struct AudioBuffer {
    buffer: Mutex<HeapRb<f32>>,
}

impl AudioBuffer {
    pub fn new() -> Self {
        // 30 seconds at 16kHz = 480,000 samples
        let capacity = 16000 * 30;
        Self {
            buffer: Mutex::new(HeapRb::new(capacity)),
        }
    }

    pub fn push(&self, samples: &[f32]) {
        let mut buffer = self.buffer.lock().unwrap();
        for &sample in samples {
            buffer.push_overwrite(sample);
        }
    }

    pub fn get_last(&self, duration_secs: f32) -> Vec<f32> {
        let buffer = self.buffer.lock().unwrap();
        let sample_count = (16000.0 * duration_secs) as usize;
        let available = buffer.len().min(sample_count);

        let mut result = Vec::with_capacity(available);
        let slice = buffer.as_slices();

        // Copy from ring buffer slices
        for &sample in slice.0.iter().rev().take(available) {
            result.push(sample);
        }

        result.reverse();
        result
    }
}

/// Voice Activity Detection state
pub struct VadState {
    is_speaking: bool,
    silence_duration: f32,
    speech_duration: f32,
}

impl VadState {
    pub fn new() -> Self {
        Self {
            is_speaking: false,
            silence_duration: 0.0,
            speech_duration: 0.0,
        }
    }

    pub fn update(&mut self, has_voice: bool, chunk_duration: f32) {
        if has_voice {
            self.silence_duration = 0.0;
            self.speech_duration += chunk_duration;
            self.is_speaking = true;
        } else {
            self.silence_duration += chunk_duration;
            if self.silence_duration > 0.5 {
                self.is_speaking = false;
                self.speech_duration = 0.0;
            }
        }
    }

    pub fn should_transcribe(&self) -> bool {
        !self.is_speaking && self.speech_duration > 0.3
    }
}

/// Simple energy-based VAD (will be replaced with Silero VAD)
pub fn detect_voice_activity(samples: &[f32]) -> bool {
    let energy: f32 = samples.iter().map(|&s| s * s).sum();
    let avg_energy = energy / samples.len() as f32;

    // Simple threshold - tune this or replace with ML model
    avg_energy > 0.001
}
