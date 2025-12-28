import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

// ============================================================================
// Type Definitions (matching Rust schemas)
// ============================================================================

export interface Settings {
	version: string;
	vault: VaultSettings;
	editor: EditorSettings;
	voice: VoiceSettings;
	stream_mode: StreamModeSettings;
	ai_providers: AiProviderSettings;
}

export interface VaultSettings {
	path: string | null;
	last_opened_file: string | null;
}

export interface EditorSettings {
	minimap_enabled: boolean;
	theme: string | null;
	font_size: number | null;
}

export interface VoiceSettings {
	auto_stop_enabled: boolean;
	auto_stop_timeout_ms: number;
	selected_whisper_model: string | null;
}

export interface StreamModeSettings {
	enabled: boolean;
	provider: 'claude' | 'openai' | 'ollama';
	timeout_ms: number;
	formatting: StreamModeFormatting;
}

export interface StreamModeFormatting {
	remove_fillers: boolean;
	add_structure: boolean;
	match_style: boolean;
}

export interface AiProviderSettings {
	claude: ClaudeSettings;
	openai: OpenAiSettings;
	ollama: OllamaSettings;
}

export interface ClaudeSettings {
	model: string;
}

export interface OpenAiSettings {
	model: string;
}

export interface OllamaSettings {
	url: string;
	model: string;
}

export interface Credentials {
	version: string;
	ai_providers: AiProviderCredentials;
}

export interface AiProviderCredentials {
	claude: ClaudeCredentials;
	openai: OpenAiCredentials;
}

export interface ClaudeCredentials {
	api_key: string | null;
}

export interface OpenAiCredentials {
	api_key: string | null;
}

export interface State {
	version: string;
	ui: UiState;
}

export interface UiState {
	voice_log_collapsed: boolean;
	sidebar_width: number | null;
	last_settings_tab: string | null;
}

// ============================================================================
// Context Definitions
// ============================================================================

interface SettingsContextValue {
	settings: Settings | null;
	updateSettings: (updater: (prev: Settings) => Settings) => Promise<void>;
	setSettings: (settings: Settings) => Promise<void>;
	refreshSettings: () => Promise<void>;
}

interface CredentialsContextValue {
	credentials: Credentials | null;
	updateCredentials: (updater: (prev: Credentials) => Credentials) => Promise<void>;
	setCredentials: (credentials: Credentials) => Promise<void>;
	refreshCredentials: () => Promise<void>;
}

interface StateContextValue {
	state: State | null;
	updateState: (updater: (prev: State) => State) => Promise<void>;
	setState: (state: State) => Promise<void>;
	refreshState: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);
const CredentialsContext = createContext<CredentialsContextValue | undefined>(undefined);
const StateContext = createContext<StateContextValue | undefined>(undefined);

// ============================================================================
// Provider Components
// ============================================================================

export function SettingsProvider({ children }: { children: ReactNode }) {
	const [settings, setSettingsState] = useState<Settings | null>(null);

	const loadSettings = async () => {
		try {
			const loaded = await invoke<Settings>('get_settings_cmd');
			setSettingsState(loaded);
		} catch (error) {
			console.error('Failed to load settings:', error);
		}
	};

	useEffect(() => {
		loadSettings();
	}, []);

	const updateSettings = async (updater: (prev: Settings) => Settings) => {
		if (!settings) return;
		const updated = updater(settings);
		try {
			await invoke('save_settings_cmd', { settings: updated });
			setSettingsState(updated);
		} catch (error) {
			console.error('Failed to save settings:', error);
			throw error;
		}
	};

	const setSettings = async (newSettings: Settings) => {
		try {
			await invoke('save_settings_cmd', { settings: newSettings });
			setSettingsState(newSettings);
		} catch (error) {
			console.error('Failed to save settings:', error);
			throw error;
		}
	};

	const refreshSettings = async () => {
		await loadSettings();
	};

	return (
		<SettingsContext.Provider
			value={{ settings, updateSettings, setSettings, refreshSettings }}
		>
			{children}
		</SettingsContext.Provider>
	);
}

export function CredentialsProvider({ children }: { children: ReactNode }) {
	const [credentials, setCredentialsState] = useState<Credentials | null>(null);

	const loadCredentials = async () => {
		try {
			const loaded = await invoke<Credentials>('get_credentials_cmd');
			setCredentialsState(loaded);
		} catch (error) {
			console.error('Failed to load credentials:', error);
		}
	};

	useEffect(() => {
		loadCredentials();
	}, []);

	const updateCredentials = async (updater: (prev: Credentials) => Credentials) => {
		if (!credentials) return;
		const updated = updater(credentials);
		try {
			await invoke('save_credentials_cmd', { credentials: updated });
			setCredentialsState(updated);
		} catch (error) {
			console.error('Failed to save credentials:', error);
			throw error;
		}
	};

	const setCredentials = async (newCredentials: Credentials) => {
		try {
			await invoke('save_credentials_cmd', { credentials: newCredentials });
			setCredentialsState(newCredentials);
		} catch (error) {
			console.error('Failed to save credentials:', error);
			throw error;
		}
	};

	const refreshCredentials = async () => {
		await loadCredentials();
	};

	return (
		<CredentialsContext.Provider
			value={{ credentials, updateCredentials, setCredentials, refreshCredentials }}
		>
			{children}
		</CredentialsContext.Provider>
	);
}

export function StateProvider({ children }: { children: ReactNode }) {
	const [state, setStateState] = useState<State | null>(null);

	const loadState = async () => {
		try {
			const loaded = await invoke<State>('get_state_cmd');
			setStateState(loaded);
		} catch (error) {
			console.error('Failed to load state:', error);
		}
	};

	useEffect(() => {
		loadState();
	}, []);

	const updateState = async (updater: (prev: State) => State) => {
		if (!state) return;
		const updated = updater(state);
		try {
			await invoke('save_state_cmd', { state: updated });
			setStateState(updated);
		} catch (error) {
			console.error('Failed to save state:', error);
			throw error;
		}
	};

	const setState = async (newState: State) => {
		try {
			await invoke('save_state_cmd', { state: newState });
			setStateState(newState);
		} catch (error) {
			console.error('Failed to save state:', error);
			throw error;
		}
	};

	const refreshState = async () => {
		await loadState();
	};

	return (
		<StateContext.Provider value={{ state, updateState, setState, refreshState }}>
			{children}
		</StateContext.Provider>
	);
}

// Combined provider for convenience
export function ConfigProvider({ children }: { children: ReactNode }) {
	return (
		<SettingsProvider>
			<CredentialsProvider>
				<StateProvider>{children}</StateProvider>
			</CredentialsProvider>
		</SettingsProvider>
	);
}

// ============================================================================
// Hooks
// ============================================================================

export function useSettings() {
	const context = useContext(SettingsContext);
	if (!context) {
		throw new Error('useSettings must be used within SettingsProvider');
	}
	return context;
}

export function useCredentials() {
	const context = useContext(CredentialsContext);
	if (!context) {
		throw new Error('useCredentials must be used within CredentialsProvider');
	}
	return context;
}

export function useState_() {
	const context = useContext(StateContext);
	if (!context) {
		throw new Error('useState_ must be used within StateProvider');
	}
	return context;
}

// ============================================================================
// Utility Functions
// ============================================================================

export async function getConfigDir(): Promise<string> {
	return invoke<string>('get_config_dir_cmd');
}

// ============================================================================
// Migration Helper
// ============================================================================

export async function migrateFromIndexedDB(): Promise<{
	settings: Settings;
	credentials: Credentials;
	state: State;
}> {
	// Import the old storage utilities
	const { getStorageItem } = await import('@/utils/storage');

	// Migrate settings
	const settings: Settings = {
		version: '1.0.0',
		vault: {
			path: (await getStorageItem<string>('vault_path')) || null,
			last_opened_file: (await getStorageItem<string>('last_opened_file')) || null,
		},
		editor: {
			minimap_enabled: (await getStorageItem<boolean>('minimap_enabled')) ?? true,
			theme: null,
			font_size: null,
		},
		voice: {
			auto_stop_enabled: (await getStorageItem<boolean>('auto_stop_enabled')) ?? true,
			auto_stop_timeout_ms: (await getStorageItem<number>('auto_stop_timeout_ms')) ?? 3000,
			selected_whisper_model:
				(await getStorageItem<string>('selected_whisper_model')) || null,
		},
		stream_mode: {
			enabled: (await getStorageItem<boolean>('stream_mode_enabled')) ?? false,
			provider:
				(await getStorageItem<'claude' | 'openai' | 'ollama'>('stream_mode_provider')) ||
				'ollama',
			timeout_ms: (await getStorageItem<number>('stream_mode_timeout_ms')) ?? 15000,
			formatting: {
				remove_fillers:
					(await getStorageItem<boolean>('stream_mode_remove_fillers')) ?? true,
				add_structure: (await getStorageItem<boolean>('stream_mode_add_structure')) ?? true,
				match_style: (await getStorageItem<boolean>('stream_mode_match_style')) ?? true,
			},
		},
		ai_providers: {
			claude: {
				model:
					(await getStorageItem<string>('claude_model')) ||
					'claude-sonnet-4-5-20251029',
			},
			openai: {
				model: (await getStorageItem<string>('openai_model')) || 'gpt-4-turbo-preview',
			},
			ollama: {
				url: (await getStorageItem<string>('ollama_url')) || 'http://localhost:11434',
				model: (await getStorageItem<string>('ollama_model')) || 'qwen2.5:3b',
			},
		},
	};

	// Migrate credentials
	const credentials: Credentials = {
		version: '1.0.0',
		ai_providers: {
			claude: {
				api_key: (await getStorageItem<string>('claude_api_key')) || null,
			},
			openai: {
				api_key: (await getStorageItem<string>('openai_api_key')) || null,
			},
		},
	};

	// Migrate state
	const state: State = {
		version: '1.0.0',
		ui: {
			voice_log_collapsed:
				(await getStorageItem<boolean>('voice_log_collapsed')) ?? false,
			sidebar_width: null,
			last_settings_tab: null,
		},
	};

	// Save migrated data
	await invoke('save_settings_cmd', { settings });
	await invoke('save_credentials_cmd', { credentials });
	await invoke('save_state_cmd', { state });

	console.log('Migration completed successfully');

	return { settings, credentials, state };
}
