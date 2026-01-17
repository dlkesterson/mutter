use ringbuf::{HeapRb, Rb};
use std::sync::Mutex;

/// Audio ring buffer to hold up to 10 minutes of audio at 16kHz.
/// Note: The frontend maintains its own unbounded buffer (audioBufferRef),
/// but this backend buffer provides consistency for any backend-side processing.
pub struct AudioBuffer {
    buffer: Mutex<HeapRb<f32>>,
}

impl AudioBuffer {
    pub fn new() -> Self {
        // 10 minutes at 16kHz = 9,600,000 samples
        // This supports the new long-form transcription feature
        let capacity = 16000 * 60 * 10;
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

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum VadEvent {
    Silence,
    SpeechStart,
    SpeechContinue,
    SpeechEnd,
}

/// Voice Activity Detection state
pub struct VadState {
    pub is_speaking: bool,
    silence_duration: f32,
    speech_duration: f32,

    // Adaptive thresholding
    energy_history: Vec<f32>,
    pub adaptive_threshold: f32,
    pub min_speech_duration: f32,
    pub silence_threshold: f32,
    pub sensitivity: f32, // Multiplier for threshold (0.5 = high sensitivity, 2.0 = low)
}

impl VadState {
    pub fn new() -> Self {
        Self {
            is_speaking: false,
            silence_duration: 0.0,
            speech_duration: 0.0,
            energy_history: Vec::with_capacity(10),
            adaptive_threshold: 0.002,
            min_speech_duration: 0.15, // 150ms (lowered from 300ms to be more sensitive)
            silence_threshold: 0.5,    // 500ms (lowered from 800ms for faster response)
            sensitivity: 0.8,          // Increased sensitivity (lower value = more sensitive)
        }
    }

    pub fn update_settings(&mut self, silence_ms: f32, min_speech_ms: f32, sensitivity: f32) {
        self.silence_threshold = silence_ms / 1000.0;
        self.min_speech_duration = min_speech_ms / 1000.0;
        self.sensitivity = sensitivity;
    }

    pub fn process(&mut self, samples: &[f32], sample_rate: f32) -> VadEvent {
        let chunk_duration = samples.len() as f32 / sample_rate;
        let energy: f32 = samples.iter().map(|&s| s * s).sum::<f32>() / samples.len() as f32;

        // Update energy history
        if self.energy_history.len() >= 10 {
            self.energy_history.remove(0);
        }
        self.energy_history.push(energy);

        // Calculate adaptive threshold based on recent background noise
        // Use the minimum energy in recent history as noise floor estimate
        let noise_floor = self
            .energy_history
            .iter()
            .fold(f32::INFINITY, |a, &b| a.min(b));

        // Threshold is noise floor + margin, scaled by sensitivity
        // Base margin is 0.001, adjusted by sensitivity
        let threshold = (noise_floor + 0.001) * self.sensitivity;
        self.adaptive_threshold = threshold;

        let has_voice = energy > threshold;

        if has_voice {
            self.silence_duration = 0.0;
            self.speech_duration += chunk_duration;

            if !self.is_speaking {
                self.is_speaking = true;
                return VadEvent::SpeechStart;
            }
            return VadEvent::SpeechContinue;
        } else {
            if self.is_speaking {
                self.silence_duration += chunk_duration;

                if self.silence_duration > self.silence_threshold {
                    self.is_speaking = false;
                    let was_real_speech = self.speech_duration > self.min_speech_duration;

                    // Log for debugging
                    log::debug!("[VAD] Speech->Silence transition: duration={:.2}s, threshold={:.2}s, real_speech={}",
                               self.speech_duration, self.min_speech_duration, was_real_speech);

                    self.speech_duration = 0.0;

                    // Always emit SpeechEnd to trigger auto-stop, even for short utterances
                    // This ensures the auto-stop mechanism works reliably
                    return VadEvent::SpeechEnd;
                }
                return VadEvent::SpeechContinue; // Still waiting for silence timeout
            }
        }

        VadEvent::Silence
    }
}
