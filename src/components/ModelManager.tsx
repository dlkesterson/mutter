import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import './ModelManager.css';

export default function ModelManager({ onClose }: { onClose: () => void }) {
	const [modelName, setModelName] = useState('distil-whisper-medium.en');
	const [url, setUrl] = useState('');
	const [progress, setProgress] = useState<number | null>(null);
	const [status, setStatus] = useState<string>('idle');

	useEffect(() => {
		// Listen for download progress events emitted by backend
		let unlisten: () => void;
		listen('download-progress', (event: any) => {
			try {
				const payload = event.payload as {
					downloaded: number;
					total: number;
					percentage: number;
				};
				setProgress(payload.percentage);
				setStatus(`Downloading: ${Math.round(payload.percentage)}%`);
			} catch (e) {
				// ignore
			}
		}).then((l) => {
			// adapter: `listen` returns an unlisten function (or event handler). Keep reference
			// in case we need to cleanup; but tauri's listen returns a Promise<UnlistenFn>
			(unlisten as any) = l;
		});

		return () => {
			if (unlisten) unlisten();
		};
	}, []);

	const startDownload = async () => {
		try {
			setStatus('starting');
			setProgress(0);
			// If URL is empty, try a sensible default location (user will replace)
			const finalUrl =
				url || `https://example.com/models/${modelName}.zip`;
			const path = await invoke('download_model', {
				model_name: modelName,
				url: finalUrl,
			});
			setStatus(`Downloaded to ${path}`);
			setProgress(100);
		} catch (err) {
			console.error('Download failed', err);
			setStatus('failed');
			setProgress(null);
		}
	};

	return (
		<div className='model-manager-backdrop'>
			<div className='model-manager'>
				<h3>Model Manager</h3>
				<label>
					Model name
					<input
						value={modelName}
						onChange={(e) => setModelName(e.target.value)}
					/>
				</label>
				<label>
					URL (optional)
					<input
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder='Model download URL'
					/>
				</label>
				<div className='controls'>
					<button onClick={startDownload}>Download</button>
					<button onClick={onClose}>Close</button>
				</div>
				<div className='status'>
					<div>Status: {status}</div>
					<div>
						Progress:{' '}
						{progress !== null ? `${Math.round(progress)}%` : '—'}
					</div>
				</div>
			</div>
		</div>
	);
}
