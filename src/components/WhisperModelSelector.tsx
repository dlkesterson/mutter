import React, { useState } from 'react';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { listen } from '@tauri-apps/api/event';
import { useToast } from '@/hooks/use-toast';
import { isModelDownloaded, loadWhisperModel, downloadWhisperModel } from '@/services/whisper';
import { getStorageItem, setStorageItem } from '@/utils/storage';

interface WhisperModel {
	id: string;
	name: string;
	size: string;
	description: string;
	recommended?: boolean;
	languages?: string;
}

// GGML format models from ggerganov/whisper.cpp on HuggingFace
const WHISPER_MODELS: WhisperModel[] = [
	{
		id: 'ggml-tiny.en',
		name: 'Tiny (English)',
		size: '75 MB',
		description: 'Fastest, lowest accuracy. Good for quick tests.',
		languages: 'English only',
	},
	{
		id: 'ggml-base.en',
		name: 'Base (English)',
		size: '142 MB',
		description: 'Fast with decent accuracy. Good balance.',
		recommended: true,
		languages: 'English only',
	},
	{
		id: 'ggml-small.en',
		name: 'Small (English)',
		size: '466 MB',
		description: 'Better accuracy, moderate speed.',
		languages: 'English only',
	},
	{
		id: 'ggml-medium.en',
		name: 'Medium (English)',
		size: '1.5 GB',
		description: 'High accuracy, slower inference.',
		languages: 'English only',
	},
	{
		id: 'ggml-large-v3',
		name: 'Large v3 (Multilingual)',
		size: '3.1 GB',
		description: 'Highest accuracy, supports all languages. Slowest.',
		languages: '99+ languages',
	},
];

interface WhisperModelSelectorProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function WhisperModelSelector({
	open,
	onOpenChange,
}: WhisperModelSelectorProps) {
	const [selectedModel, setSelectedModel] = useState<string | null>(null);
	const [downloading, setDownloading] = useState(false);
	const [downloadProgress, setDownloadProgress] = useState(0);
	const [downloadedModels, setDownloadedModels] = useState<Set<string>>(
		new Set(),
	);
	const { toast } = useToast();

	React.useEffect(() => {
		// Check which models are already downloaded
		const checkDownloadedModels = async () => {
			const downloaded = new Set<string>();

			// Check saved model preference
			const savedModelId = await getStorageItem<string>(
				'selected_whisper_model',
			);
			if (savedModelId) {
				setSelectedModel(savedModelId);
			}

			for (const model of WHISPER_MODELS) {
				try {
					const isDownloaded = await isModelDownloaded(model.id);
					if (isDownloaded) {
						downloaded.add(model.id);

						// If we have a saved model and it's this one, try to load it automatically
						// But only if the dialog is NOT open (meaning app startup)
						if (savedModelId === model.id && !open) {
							try {
								await loadWhisperModel(model.id);
								console.log(
									`Auto-loaded saved model: ${model.id}`,
								);
							} catch (e) {
								console.error('Failed to auto-load model', e);
							}
						}
					}
				} catch (err) {
					console.error(`Failed to check model ${model.id}:`, err);
				}
			}
			setDownloadedModels(downloaded);
		};

		checkDownloadedModels();
	}, [open]);

	React.useEffect(() => {
		// Listen for download progress
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

	const handleDownload = async (model: WhisperModel) => {
		setDownloading(true);
		setDownloadProgress(0);

		try {
			toast({
				title: 'Downloading Model',
				description: `Downloading ${model.name} (${model.size})...`,
			});

			// Use the new GGML download command
			await downloadWhisperModel(model.id);

			setDownloadedModels((prev) => new Set(prev).add(model.id));

			toast({
				title: 'Download Complete',
				description: `${model.name} is ready to use!`,
			});
		} catch (err) {
			console.error('Download failed:', err);
			toast({
				title: 'Download Failed',
				description: `Failed to download ${model.name}. ${err}`,
				variant: 'destructive',
			});
		} finally {
			setDownloading(false);
			setDownloadProgress(0);
		}
	};

	const handleSelectModel = async (model: WhisperModel) => {
		// First check if downloaded, if not download it
		if (!downloadedModels.has(model.id)) {
			await handleDownload(model);
		}

		// Then load the model
		try {
			toast({
				title: 'Loading Model',
				description: `Loading ${model.name}...`,
			});

			await loadWhisperModel(model.id);

			toast({
				title: 'Model Loaded',
				description: `${model.name} is now active.`,
			});

			setSelectedModel(model.id);
			await setStorageItem('selected_whisper_model', model.id);
			onOpenChange(false);
		} catch (err) {
			console.error('Failed to load model:', err);
			toast({
				title: 'Load Failed',
				description: `Failed to load ${model.name}. ${err}`,
				variant: 'destructive',
			});
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-150 max-h-[85vh] flex flex-col'>
				<DialogHeader>
					<DialogTitle>Select Whisper Model</DialogTitle>
					<DialogDescription>
						Choose a speech-to-text model. Smaller models are faster
						but less accurate. Models use the GGML format from
						whisper.cpp.
					</DialogDescription>
				</DialogHeader>

				<div className='grid gap-3 py-4 overflow-y-auto px-1'>
					{WHISPER_MODELS.map((model) => {
						const isDownloaded = downloadedModels.has(model.id);
						const isDownloading =
							downloading && selectedModel === model.id;

						return (
							<button
								key={model.id}
								onClick={() => {
									setSelectedModel(model.id);
									handleSelectModel(model);
								}}
								disabled={downloading}
								className={cn(
									'flex items-start gap-3 rounded-lg border p-4 text-left transition-colors',
									'hover:bg-accent hover:text-accent-foreground',
									'disabled:opacity-50 disabled:cursor-not-allowed',
									isDownloaded
										? 'border-green-500/50 bg-green-500/10'
										: 'border-input bg-transparent',
								)}
							>
								<div className='flex-1'>
									<div className='flex items-center gap-2'>
										<h4 className='font-semibold text-foreground'>
											{model.name}
										</h4>
										{model.recommended && (
											<span className='rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground'>
												Recommended
											</span>
										)}
									</div>
									<p className='mt-1 text-sm text-muted-foreground'>
										{model.description}
									</p>
									<div className='mt-2 flex gap-3 text-xs text-muted-foreground'>
										<span>Size: {model.size}</span>
										{model.languages && (
											<span>• {model.languages}</span>
										)}
									</div>
									{isDownloading && (
										<div className='mt-2'>
											<div className='h-2 w-full rounded-full bg-secondary'>
												<div
													className='h-full rounded-full bg-primary transition-all'
													style={{
														width: `${downloadProgress}%`,
													}}
												/>
											</div>
											<p className='mt-1 text-xs text-muted-foreground'>
												{Math.round(downloadProgress)}%
											</p>
										</div>
									)}
								</div>

								<div className='flex flex-col items-center gap-2 pt-1'>
									{isDownloaded ? (
										selectedModel === model.id ? (
											<div className='flex flex-col items-center text-green-500'>
												<Check className='h-5 w-5' />
												<span className='text-xs font-medium'>
													Active
												</span>
											</div>
										) : (
											<Button
												size='sm'
												variant='secondary'
											>
												Select
											</Button>
										)
									) : isDownloading ? (
										<Loader2 className='h-5 w-5 animate-spin text-primary' />
									) : (
										<Download className='h-5 w-5 text-muted-foreground' />
									)}
								</div>
							</button>
						);
					})}
				</div>

				<DialogFooter>
					<Button
						variant='outline'
						onClick={() => onOpenChange(false)}
						disabled={downloading}
					>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
