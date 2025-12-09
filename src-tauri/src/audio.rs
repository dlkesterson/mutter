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
}

/// Voice Activity Detection state
pub struct VadState {
    is_speaking: bool,
    silence_duration: f32,
    speech_duration: f32,
    energy_threshold: f32,
}

impl VadState {
    pub fn new() -> Self {
        Self {
            is_speaking: false,
            silence_duration: 0.0,
            speech_duration: 0.0,
            energy_threshold: 0.002, // Increased from 0.0005 to reduce false positives
        }
    }

    pub fn process(&mut self, samples: &[f32], sample_rate: f32) -> bool {
        let chunk_duration = samples.len() as f32 / sample_rate;
        let energy: f32 = samples.iter().map(|&s| s * s).sum::<f32>() / samples.len() as f32;

        let has_voice = energy > self.energy_threshold;

        if has_voice {
            self.silence_duration = 0.0;
            self.speech_duration += chunk_duration;
            self.is_speaking = true;
        } else {
            if self.is_speaking {
                self.silence_duration += chunk_duration;
                // Require 800ms of silence to stop
                if self.silence_duration > 0.8 {
                    self.is_speaking = false;
                    // Only return true (stop) if we had enough speech
                    if self.speech_duration > 0.5 {
                        self.speech_duration = 0.0;
                        return true; // End of speech detected
                    }
                    self.speech_duration = 0.0;
                }
            }
        }
        false
    }
}
