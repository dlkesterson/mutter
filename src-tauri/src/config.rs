use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// ============================================================================
// Schema Definitions
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncSettings {
    /// Sync mode: "disabled", "local", or "remote"
    #[serde(default = "default_sync_mode")]
    pub mode: String,
    /// Remote server URL (when mode is "remote")
    pub remote_url: Option<String>,
    /// Whether to auto-start local server on app launch
    #[serde(default = "default_false")]
    pub auto_start_local: bool,
}

fn default_sync_mode() -> String {
    "disabled".to_string()
}

impl Default for SyncSettings {
    fn default() -> Self {
        Self {
            mode: "disabled".to_string(),
            remote_url: None,
            auto_start_local: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(default)]
    pub vault: VaultSettings,
    #[serde(default)]
    pub editor: EditorSettings,
    #[serde(default)]
    pub voice: VoiceSettings,
    #[serde(default)]
    pub stream_mode: StreamModeSettings,
    #[serde(default)]
    pub ai_providers: AiProviderSettings,
    #[serde(default)]
    pub sync: SyncSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultSettings {
    pub path: Option<String>,
    pub last_opened_file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorSettings {
    #[serde(default = "default_true")]
    pub minimap_enabled: bool,
    pub theme: Option<String>,
    pub font_size: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceSettings {
    /// Whether voice UI is enabled (shows mic button)
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub auto_stop_enabled: bool,
    #[serde(default = "default_auto_stop_timeout")]
    pub auto_stop_timeout_ms: u32,
    pub selected_whisper_model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamModeSettings {
    #[serde(default = "default_false")]
    pub enabled: bool,
    #[serde(default = "default_stream_provider")]
    pub provider: String,
    #[serde(default = "default_stream_timeout")]
    pub timeout_ms: u32,
    #[serde(default)]
    pub formatting: StreamModeFormatting,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamModeFormatting {
    #[serde(default = "default_true")]
    pub remove_fillers: bool,
    #[serde(default = "default_true")]
    pub add_structure: bool,
    #[serde(default = "default_true")]
    pub match_style: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiProviderSettings {
    #[serde(default)]
    pub claude: ClaudeSettings,
    #[serde(default)]
    pub openai: OpenAiSettings,
    #[serde(default)]
    pub ollama: OllamaSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeSettings {
    #[serde(default = "default_claude_model")]
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAiSettings {
    #[serde(default = "default_openai_model")]
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaSettings {
    #[serde(default = "default_ollama_url")]
    pub url: String,
    #[serde(default = "default_ollama_model")]
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credentials {
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(default)]
    pub ai_providers: AiProviderCredentials,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiProviderCredentials {
    #[serde(default)]
    pub claude: ClaudeCredentials,
    #[serde(default)]
    pub openai: OpenAiCredentials,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeCredentials {
    pub api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAiCredentials {
    pub api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct State {
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(default)]
    pub ui: UiState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiState {
    #[serde(default = "default_false")]
    pub voice_log_collapsed: bool,
    pub sidebar_width: Option<u32>,
    pub last_settings_tab: Option<String>,
}

// ============================================================================
// Default Value Functions
// ============================================================================

fn default_version() -> String {
    "1.0.0".to_string()
}

fn default_true() -> bool {
    true
}

fn default_false() -> bool {
    false
}

fn default_auto_stop_timeout() -> u32 {
    3000
}

fn default_stream_provider() -> String {
    "ollama".to_string()
}

fn default_stream_timeout() -> u32 {
    15000
}

fn default_claude_model() -> String {
    "claude-sonnet-4-5-20251029".to_string()
}

fn default_openai_model() -> String {
    "gpt-4-turbo-preview".to_string()
}

fn default_ollama_url() -> String {
    "http://localhost:11434".to_string()
}

fn default_ollama_model() -> String {
    "qwen2.5:3b".to_string()
}

// ============================================================================
// Default Implementations
// ============================================================================

impl Default for VaultSettings {
    fn default() -> Self {
        Self {
            path: None,
            last_opened_file: None,
        }
    }
}

impl Default for EditorSettings {
    fn default() -> Self {
        Self {
            minimap_enabled: true,
            theme: None,
            font_size: None,
        }
    }
}

impl Default for VoiceSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            auto_stop_enabled: true,
            auto_stop_timeout_ms: 3000,
            selected_whisper_model: None,
        }
    }
}

impl Default for StreamModeFormatting {
    fn default() -> Self {
        Self {
            remove_fillers: true,
            add_structure: true,
            match_style: true,
        }
    }
}

impl Default for StreamModeSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            provider: "ollama".to_string(),
            timeout_ms: 15000,
            formatting: StreamModeFormatting::default(),
        }
    }
}

impl Default for ClaudeSettings {
    fn default() -> Self {
        Self {
            model: "claude-sonnet-4-5-20251029".to_string(),
        }
    }
}

impl Default for OpenAiSettings {
    fn default() -> Self {
        Self {
            model: "gpt-4-turbo-preview".to_string(),
        }
    }
}

impl Default for OllamaSettings {
    fn default() -> Self {
        Self {
            url: "http://localhost:11434".to_string(),
            model: "qwen2.5:3b".to_string(),
        }
    }
}

impl Default for AiProviderSettings {
    fn default() -> Self {
        Self {
            claude: ClaudeSettings::default(),
            openai: OpenAiSettings::default(),
            ollama: OllamaSettings::default(),
        }
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: "1.0.0".to_string(),
            vault: VaultSettings::default(),
            editor: EditorSettings::default(),
            voice: VoiceSettings::default(),
            stream_mode: StreamModeSettings::default(),
            ai_providers: AiProviderSettings::default(),
            sync: SyncSettings::default(),
        }
    }
}

impl Default for ClaudeCredentials {
    fn default() -> Self {
        Self { api_key: None }
    }
}

impl Default for OpenAiCredentials {
    fn default() -> Self {
        Self { api_key: None }
    }
}

impl Default for AiProviderCredentials {
    fn default() -> Self {
        Self {
            claude: ClaudeCredentials::default(),
            openai: OpenAiCredentials::default(),
        }
    }
}

impl Default for Credentials {
    fn default() -> Self {
        Self {
            version: "1.0.0".to_string(),
            ai_providers: AiProviderCredentials::default(),
        }
    }
}

impl Default for UiState {
    fn default() -> Self {
        Self {
            voice_log_collapsed: false,
            sidebar_width: None,
            last_settings_tab: None,
        }
    }
}

impl Default for State {
    fn default() -> Self {
        Self {
            version: "1.0.0".to_string(),
            ui: UiState::default(),
        }
    }
}

// ============================================================================
// Config Manager
// ============================================================================

pub struct ConfigManager {
    config_dir: PathBuf,
}

impl ConfigManager {
    pub fn new() -> Result<Self, String> {
        let config_dir = Self::get_config_dir()?;

        // Ensure config directory exists
        fs::create_dir_all(&config_dir).map_err(|e| {
            format!("Failed to create config directory: {}", e)
        })?;

        Ok(Self { config_dir })
    }

    fn get_config_dir() -> Result<PathBuf, String> {
        // Follow XDG Base Directory specification
        if let Ok(xdg_config) = std::env::var("XDG_CONFIG_HOME") {
            return Ok(PathBuf::from(xdg_config).join("mutter"));
        }

        // Fallback to ~/.config/mutter
        let home = std::env::var("HOME").map_err(|_| "HOME environment variable not set")?;
        Ok(PathBuf::from(home).join(".config").join("mutter"))
    }

    fn settings_path(&self) -> PathBuf {
        self.config_dir.join("settings.json")
    }

    fn credentials_path(&self) -> PathBuf {
        self.config_dir.join("credentials.json")
    }

    fn state_path(&self) -> PathBuf {
        self.config_dir.join("state.json")
    }

    // Load settings with defaults
    pub fn load_settings(&self) -> Result<Settings, String> {
        let path = self.settings_path();

        if !path.exists() {
            return Ok(Settings::default());
        }

        let contents = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read settings file: {}", e))?;

        serde_json::from_str(&contents)
            .map_err(|e| format!("Failed to parse settings JSON: {}", e))
    }

    // Save settings atomically
    pub fn save_settings(&self, settings: &Settings) -> Result<(), String> {
        let path = self.settings_path();
        let json = serde_json::to_string_pretty(settings)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;

        // Atomic write: write to temp file, then rename
        let temp_path = path.with_extension("tmp");
        fs::write(&temp_path, json)
            .map_err(|e| format!("Failed to write settings file: {}", e))?;

        fs::rename(&temp_path, &path)
            .map_err(|e| format!("Failed to rename settings file: {}", e))?;

        Ok(())
    }

    // Load credentials
    pub fn load_credentials(&self) -> Result<Credentials, String> {
        let path = self.credentials_path();

        if !path.exists() {
            return Ok(Credentials::default());
        }

        let contents = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read credentials file: {}", e))?;

        serde_json::from_str(&contents)
            .map_err(|e| format!("Failed to parse credentials JSON: {}", e))
    }

    // Save credentials atomically
    pub fn save_credentials(&self, credentials: &Credentials) -> Result<(), String> {
        let path = self.credentials_path();
        let json = serde_json::to_string_pretty(credentials)
            .map_err(|e| format!("Failed to serialize credentials: {}", e))?;

        // Atomic write
        let temp_path = path.with_extension("tmp");
        fs::write(&temp_path, json)
            .map_err(|e| format!("Failed to write credentials file: {}", e))?;

        fs::rename(&temp_path, &path)
            .map_err(|e| format!("Failed to rename credentials file: {}", e))?;

        Ok(())
    }

    // Load state
    pub fn load_state(&self) -> Result<State, String> {
        let path = self.state_path();

        if !path.exists() {
            return Ok(State::default());
        }

        let contents = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read state file: {}", e))?;

        serde_json::from_str(&contents)
            .map_err(|e| format!("Failed to parse state JSON: {}", e))
    }

    // Save state atomically
    pub fn save_state(&self, state: &State) -> Result<(), String> {
        let path = self.state_path();
        let json = serde_json::to_string_pretty(state)
            .map_err(|e| format!("Failed to serialize state: {}", e))?;

        // Atomic write
        let temp_path = path.with_extension("tmp");
        fs::write(&temp_path, json)
            .map_err(|e| format!("Failed to write state file: {}", e))?;

        fs::rename(&temp_path, &path)
            .map_err(|e| format!("Failed to rename state file: {}", e))?;

        Ok(())
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
pub async fn get_settings_cmd() -> Result<Settings, String> {
    let manager = ConfigManager::new()?;
    manager.load_settings()
}

#[tauri::command]
pub async fn save_settings_cmd(settings: Settings) -> Result<(), String> {
    let manager = ConfigManager::new()?;
    manager.save_settings(&settings)
}

#[tauri::command]
pub async fn get_credentials_cmd() -> Result<Credentials, String> {
    let manager = ConfigManager::new()?;
    manager.load_credentials()
}

#[tauri::command]
pub async fn save_credentials_cmd(credentials: Credentials) -> Result<(), String> {
    let manager = ConfigManager::new()?;
    manager.save_credentials(&credentials)
}

#[tauri::command]
pub async fn get_state_cmd() -> Result<State, String> {
    let manager = ConfigManager::new()?;
    manager.load_state()
}

#[tauri::command]
pub async fn save_state_cmd(state: State) -> Result<(), String> {
    let manager = ConfigManager::new()?;
    manager.save_state(&state)
}

#[tauri::command]
pub async fn get_config_dir_cmd() -> Result<String, String> {
    let dir = ConfigManager::get_config_dir()?;
    Ok(dir.to_string_lossy().to_string())
}
