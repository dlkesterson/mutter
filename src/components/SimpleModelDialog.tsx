import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './SimpleModelDialog.css';

interface WhisperModel {
	id: string;
	name: string;
	size: string;
	description: string;
	huggingface_id: string;
}

const WHISPER_MODELS: WhisperModel[] = [
	{
		id: 'distil-medium-en',
		name: 'Distil Whisper Medium (EN)',
		size: '~400MB',
		description: '⭐ Recommended - Balanced accuracy and speed for English',
		huggingface_id: 'distil-whisper/distil-medium.en',
	},
	{
		id: 'tiny-en',
		name: 'Whisper Tiny (EN)',
		size: '~75MB',
		description: 'Fastest, lower accuracy',
		huggingface_id: 'openai/whisper-tiny.en',
	},
	{
		id: 'base-en',
		name: 'Whisper Base (EN)',
		size: '~145MB',
		description: 'Fast with decent accuracy',
		huggingface_id: 'openai/whisper-base.en',
	},
];

interface SimpleModelDialogProps {
	open: boolean;
	onClose: () => void;
}

export function SimpleModelDialog({ open, onClose }: SimpleModelDialogProps) {
	const [downloading, setDownloading] = useState(false);
	const [downloadProgress, setDownloadProgress] = useState(0);
	const [selectedModel, setSelectedModel] = useState<string | null>(null);
	const [downloadedModels, setDownloadedModels] = useState<Set<string>>(
		new Set()
	);
	const [statusMessage, setStatusMessage] = useState('');

	useEffect(() => {
		if (open) {
			checkDownloadedModels();
		}
	}, [open]);

	useEffect(() => {
		const unlisten = listen<{
			downloaded: number;
			total: number;
			percentage: number;
		}>('download-progress', (event) => {
			setDownloadProgress(event.payload.percentage);
		});

		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	const checkDownloadedModels = async () => {
		const downloaded = new Set<string>();
		for (const model of WHISPER_MODELS) {
			try {
				const isDownloaded = await invoke<boolean>(
					'is_model_downloaded',
					{
						modelName: model.id,
					}
				);
				if (isDownloaded) {
					downloaded.add(model.id);
				}
			} catch (err) {
				console.error(`Failed to check model ${model.id}:`, err);
			}
		}
		setDownloadedModels(downloaded);
	};

	const handleDownloadAndLoad = async (model: WhisperModel) => {
		setDownloading(true);
		setDownloadProgress(0);
		setSelectedModel(model.id);
		setStatusMessage(`Downloading ${model.name}...`);

		try {
			await invoke('download_model_from_hub', {
				modelId: model.huggingface_id,
				modelName: model.id,
				revision: 'main',
			});

			setStatusMessage(`Loading ${model.name}...`);
			await invoke('load_whisper_model', {
				modelName: model.id,
			});

			setStatusMessage(`✓ ${model.name} is ready!`);
			setDownloadedModels((prev) => new Set(prev).add(model.id));

			setTimeout(() => {
				onClose();
			}, 1500);
		} catch (err) {
			console.error('Failed:', err);
			setStatusMessage(`✗ Failed: ${err}`);
		} finally {
			setDownloading(false);
			setSelectedModel(null);
		}
	};

	if (!open) return null;

	return (
		<div className='dialog-overlay' onClick={onClose}>
			<div
				className='dialog-content'
				onClick={(e) => e.stopPropagation()}
			>
				<div className='dialog-header'>
					<h2>Select Whisper Model</h2>
					<button className='close-btn' onClick={onClose}>
						×
					</button>
				</div>

				<p className='dialog-description'>
					Choose a speech-to-text model. Smaller models are faster but
					less accurate.
				</p>

				<div className='models-list'>
					{WHISPER_MODELS.map((model) => {
						const isDownloaded = downloadedModels.has(model.id);
						const isDownloading =
							downloading && selectedModel === model.id;

						return (
							<button
								key={model.id}
								className={`model-card ${
									isDownloaded ? 'downloaded' : ''
								}`}
								onClick={() => handleDownloadAndLoad(model)}
								disabled={downloading}
							>
								<div className='model-info'>
									<h3>{model.name}</h3>
									<p className='model-desc'>
										{model.description}
									</p>
									<span className='model-size'>
										{model.size}
									</span>
								</div>
								<div className='model-status'>
									{isDownloaded && (
										<span className='status-icon'>✓</span>
									)}
									{isDownloading && (
										<span className='status-icon loading'>
											⟳
										</span>
									)}
									{!isDownloaded && !isDownloading && (
										<span className='status-icon'>↓</span>
									)}
								</div>
							</button>
						);
					})}
				</div>

				{downloading && (
					<div className='download-status'>
						<div className='progress-bar'>
							<div
								className='progress-fill'
								style={{ width: `${downloadProgress}%` }}
							/>
						</div>
						<p className='status-text'>{statusMessage}</p>
					</div>
				)}

				{statusMessage && !downloading && (
					<p className='status-text'>{statusMessage}</p>
				)}
			</div>
		</div>
	);
}
