use anyhow::Result;
use candle_core::{Device, IndexOp, Tensor};
use candle_nn::{ops::softmax, VarBuilder};
use candle_transformers::models::bert::{BertModel, Config as BertConfig};
use candle_transformers::models::whisper::{self as m, audio, Config};
use rand::distributions::Distribution;
use rand::SeedableRng;
use std::path::PathBuf;
use tokenizers::Tokenizer;

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

    pub fn is_model_downloaded(&self, model_name: &str) -> bool {
        let model_dir = self.get_model_path(model_name);
        // Check if all required files exist
        model_dir.join("model.safetensors").exists()
            && model_dir.join("tokenizer.json").exists()
            && model_dir.join("config.json").exists()
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

    /// Download model files from HuggingFace Hub
    pub async fn download_from_hub(
        &self,
        model_id: &str,
        revision: &str,
    ) -> Result<(PathBuf, PathBuf, PathBuf)> {
        log::info!(
            "Downloading {} from HuggingFace Hub (revision: {})",
            model_id,
            revision
        );

        // Create cache directory
        let cache_dir = dirs::home_dir()
            .ok_or_else(|| anyhow::anyhow!("Could not find home directory"))?
            .join(".cache")
            .join("huggingface")
            .join("hub")
            .join(format!("models--{}", model_id.replace("/", "--")));

        std::fs::create_dir_all(&cache_dir)?;
        log::info!("Cache directory: {:?}", cache_dir);

        // Base URL for HuggingFace
        let base_url = format!("https://huggingface.co/{}/resolve/{}/", model_id, revision);

        log::info!("Base URL: {}", base_url);

        // Download each file
        let config = self
            .download_file(&base_url, "config.json", &cache_dir)
            .await?;
        let tokenizer = self
            .download_file(&base_url, "tokenizer.json", &cache_dir)
            .await?;
        let weights = self
            .download_file(&base_url, "model.safetensors", &cache_dir)
            .await?;

        log::info!("All model files downloaded successfully");
        Ok((config, tokenizer, weights))
    }

    async fn download_file(
        &self,
        base_url: &str,
        filename: &str,
        cache_dir: &PathBuf,
    ) -> Result<PathBuf> {
        let url = format!("{}{}", base_url, filename);
        let output_path = cache_dir.join(filename);

        // Check if already exists
        if output_path.exists() {
            log::info!("{} already exists in cache", filename);
            return Ok(output_path);
        }

        log::info!("Downloading {} from {}", filename, url);

        let response = reqwest::get(&url).await?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "Failed to download {}: HTTP {}",
                filename,
                response.status()
            ));
        }

        let bytes = response.bytes().await?;
        std::fs::write(&output_path, bytes)?;

        log::info!(
            "Downloaded {} ({} bytes)",
            filename,
            output_path.metadata()?.len()
        );
        Ok(output_path)
    }

    pub async fn download_mel_filters(&self) -> Result<PathBuf> {
        let cache_dir = dirs::home_dir()
            .ok_or_else(|| anyhow::anyhow!("Could not find home directory"))?
            .join(".cache")
            .join("huggingface")
            .join("hub")
            .join("models--candle--whisper");

        std::fs::create_dir_all(&cache_dir)?;
        let output_path = cache_dir.join("melfilters.bytes");

        if output_path.exists() {
            let metadata = std::fs::metadata(&output_path)?;
            if metadata.len() > 100 {
                return Ok(output_path);
            }
            log::warn!(
                "Existing melfilters.bytes is too small ({} bytes), deleting",
                metadata.len()
            );
            std::fs::remove_file(&output_path)?;
        }

        log::info!("Downloading melfilters.bytes");
        let url = "https://raw.githubusercontent.com/huggingface/candle/main/candle-examples/examples/whisper/melfilters.bytes";
        let response = reqwest::get(url).await?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "Failed to download melfilters.bytes: HTTP {}",
                response.status()
            ));
        }

        let bytes = response.bytes().await?;
        std::fs::write(&output_path, bytes)?;

        Ok(output_path)
    }
}

/// Enum to handle both normal and quantized Whisper models
pub enum WhisperModel {
    Normal(m::model::Whisper),
    Quantized(m::quantized_model::Whisper),
}

impl WhisperModel {
    pub fn config(&self) -> &Config {
        match self {
            Self::Normal(m) => &m.config,
            Self::Quantized(m) => &m.config,
        }
    }

    pub fn encoder_forward(&mut self, x: &Tensor, flush: bool) -> candle_core::Result<Tensor> {
        match self {
            Self::Normal(m) => m.encoder.forward(x, flush),
            Self::Quantized(m) => m.encoder.forward(x, flush),
        }
    }

    pub fn decoder_forward(
        &mut self,
        x: &Tensor,
        xa: &Tensor,
        flush: bool,
    ) -> candle_core::Result<Tensor> {
        match self {
            Self::Normal(m) => m.decoder.forward(x, xa, flush),
            Self::Quantized(m) => m.decoder.forward(x, xa, flush),
        }
    }

    pub fn decoder_final_linear(&self, x: &Tensor) -> candle_core::Result<Tensor> {
        match self {
            Self::Normal(m) => m.decoder.final_linear(x),
            Self::Quantized(m) => m.decoder.final_linear(x),
        }
    }
}

#[derive(Debug, Clone)]
struct DecodingResult {
    tokens: Vec<u32>,
    text: String,
    avg_logprob: f64,
    no_speech_prob: f64,
}

#[derive(Debug, Clone)]
struct Segment {
    text: String,
}

/// Whisper transcription engine using Candle
pub struct WhisperEngine {
    device: Device,
    model: Option<WhisperModel>,
    tokenizer: Option<Tokenizer>,
    config: Option<Config>,
    mel_filters: Vec<f32>,
    // Special tokens
    sot_token: u32,
    transcribe_token: u32,
    eot_token: u32,
    no_timestamps_token: u32,
    no_speech_token: u32,
}

impl WhisperEngine {
    pub fn new() -> Self {
        // Try to use CUDA GPU if available, fall back to CPU
        let device = Device::cuda_if_available(0).unwrap_or(Device::Cpu);

        log::info!("Whisper using device: {:?}", device);

        Self {
            device,
            model: None,
            tokenizer: None,
            config: None,
            mel_filters: vec![],
            sot_token: 50258,
            transcribe_token: 50359,
            eot_token: 50257,
            no_timestamps_token: 50363,
            no_speech_token: 50362,
        }
    }

    /// Load a Whisper model from local files
    pub fn load_model(
        &mut self,
        config_path: &PathBuf,
        tokenizer_path: &PathBuf,
        weights_path: &PathBuf,
        mel_filters_path: &PathBuf,
        quantized: bool,
    ) -> Result<()> {
        log::info!("Loading Whisper model from {:?}", weights_path);

        // Load mel filters
        let mel_bytes = std::fs::read(mel_filters_path)?;
        if mel_bytes.len() % 4 != 0 {
            return Err(anyhow::anyhow!(
                "Invalid melfilters.bytes file size: {} (must be multiple of 4)",
                mel_bytes.len()
            ));
        }
        let mut mel_filters = vec![0f32; mel_bytes.len() / 4];
        <byteorder::LittleEndian as byteorder::ByteOrder>::read_f32_into(
            &mel_bytes,
            &mut mel_filters,
        );
        self.mel_filters = mel_filters;

        // Load config
        let config_str = std::fs::read_to_string(config_path)?;
        let config: Config = serde_json::from_str(&config_str)?;

        // Load tokenizer
        let tokenizer = Tokenizer::from_file(tokenizer_path)
            .map_err(|e| anyhow::anyhow!("Failed to load tokenizer: {}", e))?;

        // Find special tokens
        self.sot_token = Self::token_id(&tokenizer, "<|startoftranscript|>")?;
        self.transcribe_token = Self::token_id(&tokenizer, "<|transcribe|>")?;
        self.eot_token = Self::token_id(&tokenizer, "<|endoftext|>")?;
        self.no_timestamps_token = Self::token_id(&tokenizer, "<|notimestamps|>")?;

        // Try to find no_speech_token
        self.no_speech_token = Self::token_id(&tokenizer, "<|nospeech|>").unwrap_or(50362); // fallback value

        // Load model
        let model = if quantized {
            let vb = candle_transformers::quantized_var_builder::VarBuilder::from_gguf(
                weights_path,
                &self.device,
            )?;
            WhisperModel::Quantized(m::quantized_model::Whisper::load(&vb, config.clone())?)
        } else {
            let vb = unsafe {
                VarBuilder::from_mmaped_safetensors(
                    &[weights_path.clone()],
                    m::DTYPE,
                    &self.device,
                )?
            };
            WhisperModel::Normal(m::model::Whisper::load(&vb, config.clone())?)
        };

        self.model = Some(model);
        self.tokenizer = Some(tokenizer);
        self.config = Some(config);

        log::info!("Whisper model loaded successfully");
        Ok(())
    }

    fn token_id(tokenizer: &Tokenizer, token: &str) -> Result<u32> {
        tokenizer
            .token_to_id(token)
            .ok_or_else(|| anyhow::anyhow!("token {} not found", token))
    }

    pub fn is_loaded(&self) -> bool {
        self.model.is_some() && self.tokenizer.is_some()
    }

    pub fn transcribe(&mut self, audio: &[f32]) -> Result<String> {
        let start_time = std::time::Instant::now();

        if !self.is_loaded() {
            return Err(anyhow::anyhow!(
                "Whisper model not loaded. Please load the model first."
            ));
        }

        // Calculate audio stats
        let max_amp = audio.iter().map(|x| x.abs()).fold(0.0f32, |a, b| a.max(b));
        let rms = (audio.iter().map(|x| x * x).sum::<f32>() / audio.len() as f32).sqrt();

        log::info!(
            "Audio stats - Max: {:.4}, RMS: {:.4}, Samples: {}",
            max_amp,
            rms,
            audio.len()
        );

        // Quick energy check to skip silence
        let energy: f32 = audio.iter().map(|&x| x.abs()).sum::<f32>() / audio.len() as f32;
        if energy < 0.001 {
            log::info!("Audio energy extremely low ({:.4}), likely silence", energy);
            return Ok(String::new());
        }

        log::info!("Transcribing {} samples at 16kHz", audio.len());

        let config = self.config.as_ref().unwrap().clone();
        let tokenizer = self.tokenizer.as_ref().unwrap().clone();

        // Convert audio to mel spectrogram
        let mel = self.audio_to_mel(audio, &config)?;
        log::info!("Generated mel spectrogram: {:?}", mel.dims());

        let ctx = DecodingContext {
            sot_token: self.sot_token,
            transcribe_token: self.transcribe_token,
            eot_token: self.eot_token,
            no_timestamps_token: self.no_timestamps_token,
            no_speech_token: self.no_speech_token,
        };

        let model = self.model.as_mut().unwrap();

        // Run inference - inline the decode logic
        let segments = {
            let (_, _, content_frames) = mel.dims3()?;
            let mut seek = 0;
            let mut segments = vec![];

            while seek < content_frames {
                let time_offset = (seek * m::HOP_LENGTH) as f64 / m::SAMPLE_RATE as f64;
                let segment_size = usize::min(content_frames - seek, m::N_FRAMES);
                let mel_segment = mel.narrow(2, seek, segment_size)?;
                let segment_duration =
                    (segment_size * m::HOP_LENGTH) as f64 / m::SAMPLE_RATE as f64;

                let dr = Self::decode_segment(model, &tokenizer, &mel_segment, &ctx)?;

                seek += segment_size;

                // Skip segments with no speech
                if dr.no_speech_prob > m::NO_SPEECH_THRESHOLD
                    && dr.avg_logprob < m::LOGPROB_THRESHOLD
                {
                    log::debug!("No speech detected, skipping segment");
                    continue;
                }

                log::info!(
                    "Segment: {:.1}s-{:.1}s: {}",
                    time_offset,
                    time_offset + segment_duration,
                    dr.text
                );

                segments.push(Segment {
                    text: dr.text.clone(),
                });

                // Break if we hit end-of-transcript
                if dr.tokens.last() == Some(&ctx.eot_token) {
                    break;
                }
            }
            segments
        };

        // Combine segments into final text
        let text: String = segments
            .iter()
            .map(|s| s.text.trim())
            .collect::<Vec<_>>()
            .join(" ");

        // Filter out common hallucinations
        let trimmed = text.trim();
        let hallucinations = [
            "Oh",
            "You",
            "Thank you",
            "Bye",
            "Subtitle by",
            "Amara.org",
            "MBC",
            "Copyright",
        ];

        for h in &hallucinations {
            if trimmed.eq_ignore_ascii_case(h) || trimmed.starts_with("Subtitle by") {
                log::info!("Filtered hallucination: '{}'", text);
                return Ok(String::new());
            }
        }

        let duration = start_time.elapsed();
        log::info!(
            "✓ Transcription complete in {:.2}ms: '{}'",
            duration.as_secs_f64() * 1000.0,
            text
        );
        Ok(text)
    }

    fn decode_segment(
        model: &mut WhisperModel,
        tokenizer: &Tokenizer,
        mel: &Tensor,
        ctx: &DecodingContext,
    ) -> Result<DecodingResult> {
        let audio_features = model.encoder_forward(mel, true)?;
        log::debug!("Audio features: {:?}", audio_features.dims());

        let sample_len = model.config().max_target_positions / 2;
        let mut sum_logprob = 0f64;
        let mut no_speech_prob = f64::NAN;

        // Initialize tokens with special tokens
        let mut tokens = vec![ctx.sot_token, ctx.transcribe_token, ctx.no_timestamps_token];

        let mut rng = rand::rngs::StdRng::seed_from_u64(0);

        for i in 0..sample_len {
            let tokens_t = Tensor::new(tokens.as_slice(), mel.device())?;
            let tokens_t = tokens_t.unsqueeze(0)?;

            let ys = model.decoder_forward(&tokens_t, &audio_features, i == 0)?;

            // Extract the last hidden state to predict the next token
            let seq_len = ys.dim(1)?;
            // Use narrow to keep the rank (3D) -> [batch, 1, hidden]
            let last_hidden = ys.narrow(1, seq_len - 1, 1)?;

            let logits = model.decoder_final_linear(&last_hidden)?;
            let logits = logits.squeeze(1)?; // [batch, vocab]
            let logits = logits.i(0)?; // [vocab]

            // Extract no speech probability on first iteration
            if i == 0 {
                let probs = softmax(&logits, 0)?;
                let no_speech_val: f32 = probs.i(ctx.no_speech_token as usize)?.to_scalar()?;
                no_speech_prob = no_speech_val as f64;
            }

            // Apply temperature and sample
            let logits = (logits / 0.6)?; // temperature = 0.6
            let probs = softmax(&logits, 0)?;
            let probs_vec = probs.to_vec1::<f32>()?;

            let distr = rand::distributions::WeightedIndex::new(&probs_vec)?;
            let next_token = distr.sample(&mut rng) as u32;

            tokens.push(next_token);
            let prob = probs_vec[next_token as usize];
            sum_logprob += (prob as f64).ln();

            if next_token == ctx.eot_token || tokens.len() > model.config().max_target_positions {
                break;
            }
        }

        let text = tokenizer
            .decode(&tokens, true)
            .map_err(|e| anyhow::anyhow!("Decoding error: {}", e))?;
        let avg_logprob = sum_logprob / tokens.len() as f64;

        Ok(DecodingResult {
            tokens,
            text,
            avg_logprob,
            no_speech_prob,
        })
    }

    /// Convert PCM audio to mel spectrogram (Whisper expects 80 mel bins)
    fn audio_to_mel(&self, pcm: &[f32], config: &Config) -> Result<Tensor> {
        // Whisper expects 30 second chunks max
        let max_samples = m::SAMPLE_RATE * 30;

        let mut audio = pcm.to_vec();
        if audio.len() > max_samples {
            audio.truncate(max_samples);
        } else {
            audio.resize(max_samples, 0.0);
        }

        // Use loaded mel filters
        let filters = self.mel_filters.clone();
        if filters.is_empty() {
            return Err(anyhow::anyhow!("Mel filters not loaded"));
        }

        // Use Candle's built-in audio processing
        let mel = audio::pcm_to_mel(config, &audio, &filters);
        let mel_len = mel.len();
        let tensor = Tensor::from_vec(
            mel,
            (1, config.num_mel_bins, mel_len / config.num_mel_bins),
            &self.device,
        )?;

        Ok(tensor)
    }
}

struct DecodingContext {
    sot_token: u32,
    transcribe_token: u32,
    eot_token: u32,
    no_timestamps_token: u32,
    no_speech_token: u32,
}

/// Embedding engine for semantic similarity using sentence transformers
pub struct EmbeddingEngine {
    device: Device,
    model: Option<BertModel>,
    tokenizer: Option<Tokenizer>,
    model_id: String,
    revision: String,
}

impl EmbeddingEngine {
    pub fn new() -> Self {
        // Try to use CUDA GPU if available, fall back to CPU
        let device = Device::cuda_if_available(0).unwrap_or(Device::Cpu);

        log::info!("Embedding engine using device: {:?}", device);

        Self {
            device,
            model: None,
            tokenizer: None,
            // A small, fast model excellent for semantic similarity
            model_id: "sentence-transformers/all-MiniLM-L6-v2".to_string(),
            revision: "main".to_string(), // Use main branch
        }
    }

    pub fn get_model_config(&self) -> (String, String) {
        (self.model_id.clone(), self.revision.clone())
    }

    pub fn load_from_files(
        &mut self,
        config_path: PathBuf,
        tokenizer_path: PathBuf,
        weights_path: PathBuf,
    ) -> Result<()> {
        let config: BertConfig = serde_json::from_str(&std::fs::read_to_string(config_path)?)?;
        let tokenizer = Tokenizer::from_file(tokenizer_path).map_err(|e| anyhow::anyhow!(e))?;

        let vb = unsafe {
            VarBuilder::from_mmaped_safetensors(
                &[weights_path],
                candle_core::DType::F32,
                &self.device,
            )?
        };

        let model = BertModel::load(vb, &config)?;

        self.model = Some(model);
        self.tokenizer = Some(tokenizer);

        log::info!("Embedding model loaded");
        Ok(())
    }

    pub fn encode(&self, text: &str) -> Result<Vec<f32>> {
        if self.model.is_none() || self.tokenizer.is_none() {
            return Err(anyhow::anyhow!("Embedding model not loaded"));
        }

        let model = self.model.as_ref().unwrap();
        let tokenizer = self.tokenizer.as_ref().unwrap();

        // Tokenize
        let tokens = tokenizer
            .encode(text, true)
            .map_err(|e| anyhow::anyhow!(e))?;

        let token_ids = Tensor::new(tokens.get_ids(), &self.device)?.unsqueeze(0)?;
        let token_type_ids = Tensor::new(tokens.get_type_ids(), &self.device)?.unsqueeze(0)?;

        // Run inference
        let embeddings = model.forward(&token_ids, &token_type_ids, None)?;

        // Mean Pooling (average of all token vectors) to get sentence embedding
        let (_n_sentence, n_tokens, _hidden_size) = embeddings.dims3()?;
        let embeddings = (embeddings.sum(1)? / (n_tokens as f64))?;
        let embeddings = embeddings.get(0)?; // Get first (and only) sentence

        // Normalize for Cosine Similarity
        let embeddings_vec = embeddings.to_vec1::<f32>()?;
        let norm: f32 = embeddings_vec.iter().map(|x| x * x).sum::<f32>().sqrt();

        let normalized = embeddings_vec.iter().map(|x| x / norm).collect();
        Ok(normalized)
    }
}

/// Calculate cosine similarity between two vectors
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }

    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    dot / (norm_a * norm_b)
}
