use anyhow::Result;
use std::path::PathBuf;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// Model manager for downloading and loading ML models
pub struct ModelManager {
    models_dir: PathBuf,
}

impl ModelManager {
    pub fn new(models_dir: PathBuf) -> Self {
        std::fs::create_dir_all(&models_dir).ok();
        Self { models_dir }
    }

    pub fn get_model_path(&self, model_name: &str) -> PathBuf {
        self.models_dir.join(model_name)
    }

    /// Check if a GGML Whisper model is downloaded
    pub fn is_ggml_model_downloaded(&self, model_name: &str) -> bool {
        self.models_dir.join(format!("{}.bin", model_name)).exists()
    }

    /// Check if a model is downloaded (alias for is_ggml_model_downloaded)
    pub fn is_model_downloaded(&self, model_name: &str) -> bool {
        self.is_ggml_model_downloaded(model_name)
    }

    pub async fn download_model(
        &self,
        model_name: &str,
        url: &str,
        progress_callback: Option<Box<dyn Fn(u64, u64) + Send>>,
    ) -> Result<PathBuf> {
        use futures_util::StreamExt;

        let path = self.get_model_path(model_name);

        if path.exists() {
            log::info!("Model {} already exists", model_name);
            return Ok(path);
        }

        log::info!("Downloading {} from {}", model_name, url);

        let response = reqwest::get(url).await?;
        let total_size = response.content_length().unwrap_or(0);

        let mut file = std::fs::File::create(&path)?;
        let mut downloaded: u64 = 0;
        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            std::io::Write::write_all(&mut file, &chunk)?;
            downloaded += chunk.len() as u64;

            if let Some(ref callback) = progress_callback {
                callback(downloaded, total_size);
            }

            let progress = (downloaded as f64 / total_size as f64 * 100.0) as u32;
            if progress % 10 == 0 {
                log::info!("Download progress: {}%", progress);
            }
        }

        log::info!("Download complete: {:?}", path);
        Ok(path)
    }

    /// Download GGML Whisper model from HuggingFace
    pub async fn download_ggml_model(
        &self,
        model_name: &str,
        progress_callback: Option<Box<dyn Fn(u64, u64) + Send>>,
    ) -> Result<PathBuf> {
        let model_path = self.models_dir.join(format!("{}.bin", model_name));

        if model_path.exists() {
            log::info!("GGML model {} already exists at {:?}", model_name, model_path);
            return Ok(model_path);
        }

        // HuggingFace GGML model URLs from ggerganov/whisper.cpp
        let url = match model_name {
            "ggml-tiny.en" => "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
            "ggml-base.en" => "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
            "ggml-small.en" => "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
            "ggml-medium.en" => "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin",
            "ggml-large-v3" => "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin",
            "ggml-tiny" => "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
            "ggml-base" => "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
            "ggml-small" => "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
            "ggml-medium" => "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin",
            _ => return Err(anyhow::anyhow!("Unknown GGML model: {}", model_name)),
        };

        log::info!("Downloading GGML model {} from {}", model_name, url);

        use futures_util::StreamExt;

        let response = reqwest::get(url).await?;
        let total_size = response.content_length().unwrap_or(0);

        let mut file = std::fs::File::create(&model_path)?;
        let mut downloaded: u64 = 0;
        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            std::io::Write::write_all(&mut file, &chunk)?;
            downloaded += chunk.len() as u64;

            if let Some(ref callback) = progress_callback {
                callback(downloaded, total_size);
            }

            // Log progress every 10%
            if total_size > 0 {
                let progress = (downloaded as f64 / total_size as f64 * 100.0) as u32;
                if progress % 10 == 0 && downloaded > 0 {
                    log::info!("Download progress: {}%", progress);
                }
            }
        }

        log::info!("GGML model download complete: {:?}", model_path);
        Ok(model_path)
    }

}

/// Whisper transcription engine using whisper-rs (whisper.cpp bindings)
///
/// This implementation leverages whisper.cpp's native handling of:
/// - Long-form audio (no manual chunking needed)
/// - Timestamp tokens for segment boundaries
/// - GPU acceleration via CUDA
pub struct WhisperEngine {
    context: Option<WhisperContext>,
    model_path: Option<PathBuf>,
}

impl WhisperEngine {
    pub fn new() -> Self {
        log::info!("Creating new WhisperEngine (whisper-rs/whisper.cpp)");
        Self {
            context: None,
            model_path: None,
        }
    }

    /// Load a GGML Whisper model from the specified path
    pub fn load_model(&mut self, model_path: &PathBuf) -> Result<()> {
        log::info!("Loading Whisper model from {:?}", model_path);

        if !model_path.exists() {
            return Err(anyhow::anyhow!("Model file not found: {:?}", model_path));
        }

        let path_str = model_path
            .to_str()
            .ok_or_else(|| anyhow::anyhow!("Invalid model path (non-UTF8)"))?;

        // Create context parameters
        // GPU support is automatically enabled when whisper-rs is compiled with the "cuda" feature
        let params = WhisperContextParameters::default();

        // Note: CUDA acceleration is enabled via whisper-rs feature flag in Cargo.toml
        // If GPU is available, whisper.cpp will use it automatically
        log::info!("Creating Whisper context (GPU acceleration enabled if CUDA available)");

        let ctx = WhisperContext::new_with_params(path_str, params)
            .map_err(|e| anyhow::anyhow!("Failed to create Whisper context: {}", e))?;

        self.context = Some(ctx);
        self.model_path = Some(model_path.clone());

        log::info!("Whisper model loaded successfully from {:?}", model_path);
        Ok(())
    }

    pub fn is_loaded(&self) -> bool {
        self.context.is_some()
    }

    /// Transcribe audio samples to text
    ///
    /// whisper.cpp handles long audio natively via timestamp tokens,
    /// so there's no need for manual chunking or merging.
    pub fn transcribe(&self, audio: &[f32]) -> Result<String> {
        let start_time = std::time::Instant::now();

        let ctx = self
            .context
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Whisper model not loaded"))?;

        // Calculate audio stats for logging
        let max_amp = audio.iter().map(|x| x.abs()).fold(0.0f32, |a, b| a.max(b));
        let rms = (audio.iter().map(|x| x * x).sum::<f32>() / audio.len() as f32).sqrt();
        let duration_secs = audio.len() as f32 / 16000.0;

        log::info!(
            "Transcribing {} samples ({:.1}s) - Max: {:.4}, RMS: {:.4}",
            audio.len(),
            duration_secs,
            max_amp,
            rms
        );

        // Quick energy check to skip silence
        let energy: f32 = audio.iter().map(|&x| x.abs()).sum::<f32>() / audio.len() as f32;
        if energy < 0.001 {
            log::info!("Audio energy extremely low ({:.6}), likely silence", energy);
            return Ok(String::new());
        }

        // Create a new state for this transcription
        let mut state = ctx
            .create_state()
            .map_err(|e| anyhow::anyhow!("Failed to create Whisper state: {}", e))?;

        // Configure transcription parameters
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

        // Set language to English (can be made configurable later)
        params.set_language(Some("en"));

        // Disable various output modes (we just want the text)
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);

        // Enable single segment mode for short audio, or let whisper.cpp handle segmentation
        if duration_secs < 30.0 {
            params.set_single_segment(true);
        }

        // Set temperature for sampling (0.0 = greedy/deterministic)
        params.set_temperature(0.0);

        // Run full transcription
        // whisper.cpp handles long audio natively using timestamp tokens!
        state
            .full(params, audio)
            .map_err(|e| anyhow::anyhow!("Transcription failed: {}", e))?;

        // Collect all segments
        let num_segments = state
            .full_n_segments()
            .map_err(|e| anyhow::anyhow!("Failed to get segment count: {}", e))?;

        let mut result = String::new();
        for i in 0..num_segments {
            let segment_text = state
                .full_get_segment_text(i)
                .map_err(|e| anyhow::anyhow!("Failed to get segment {}: {}", i, e))?;

            // Log segment timing for debugging long audio
            if num_segments > 1 {
                let t0 = state.full_get_segment_t0(i).unwrap_or(0);
                let t1 = state.full_get_segment_t1(i).unwrap_or(0);
                log::debug!(
                    "Segment {}/{}: [{:.2}s - {:.2}s] {}",
                    i + 1,
                    num_segments,
                    t0 as f32 / 100.0,
                    t1 as f32 / 100.0,
                    segment_text.trim()
                );
            }

            result.push_str(&segment_text);
            if i < num_segments - 1 {
                result.push(' ');
            }
        }

        let trimmed = result.trim().to_string();

        // Filter common hallucinations
        if self.is_hallucination(&trimmed) {
            log::info!("Filtered hallucination: '{}'", trimmed);
            return Ok(String::new());
        }

        let duration = start_time.elapsed();
        log::info!(
            "✓ Transcription complete in {:.0}ms: '{}' ({} segments)",
            duration.as_millis(),
            if trimmed.len() > 100 {
                format!("{}...", &trimmed[..100])
            } else {
                trimmed.clone()
            },
            num_segments
        );

        Ok(trimmed)
    }

    /// Check if the transcription is a common hallucination
    fn is_hallucination(&self, text: &str) -> bool {
        let hallucinations = [
            "Oh",
            "You",
            "Thank you",
            "Thanks for watching",
            "Bye",
            "Subtitle by",
            "Subtitles by",
            "Amara.org",
            "MBC",
            "Copyright",
            "Thank you for watching",
            "Please subscribe",
            "Like and subscribe",
            "[Music]",
            "(Music)",
            "...",
        ];

        let text_lower = text.to_lowercase();

        for h in &hallucinations {
            if text.eq_ignore_ascii_case(h)
                || text_lower.starts_with(&h.to_lowercase())
                || text_lower.ends_with(&h.to_lowercase())
            {
                return true;
            }
        }

        // Also filter very short outputs that are just punctuation or whitespace
        let stripped: String = text.chars().filter(|c| c.is_alphanumeric()).collect();
        if stripped.len() < 2 {
            return true;
        }

        false
    }
}

