import { useState, useEffect } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';

interface ImageViewerProps {
	filePath: string;
}

/**
 * ImageViewer component for displaying image files
 *
 * Uses Tauri's asset protocol to load local images securely.
 */
export function ImageViewer({ filePath }: ImageViewerProps) {
	const [imageSrc, setImageSrc] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

	useEffect(() => {
		if (!filePath) {
			setError('No file path provided');
			setLoading(false);
			return;
		}

		try {
			// Convert file path to asset:// URL using Tauri's helper
			const assetUrl = convertFileSrc(filePath);
			setImageSrc(assetUrl);
			setError(null);
		} catch (err) {
			console.error('Failed to convert file path:', err);
			setError('Failed to load image');
			setLoading(false);
		}
	}, [filePath]);

	const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
		const img = e.currentTarget;
		setDimensions({
			width: img.naturalWidth,
			height: img.naturalHeight,
		});
		setLoading(false);
	};

	const handleError = () => {
		setError('Failed to load image');
		setLoading(false);
	};

	// Extract filename for display
	const fileName = filePath.split('/').pop() || filePath;

	return (
		<div className="flex-1 flex flex-col overflow-hidden bg-background">
			{/* Image info bar */}
			<div className="flex items-center justify-between px-4 py-2 border-b border-border text-sm text-muted-foreground">
				<span className="truncate">{fileName}</span>
				{dimensions && (
					<span className="ml-4 whitespace-nowrap">
						{dimensions.width} × {dimensions.height}
					</span>
				)}
			</div>

			{/* Image container */}
			<div className="flex-1 flex items-center justify-center overflow-auto p-8 bg-[#0a0a0a]">
				{loading && !error && (
					<div className="text-muted-foreground">Loading...</div>
				)}

				{error && (
					<div className="text-destructive text-center">
						<p className="text-lg font-medium">Failed to load image</p>
						<p className="text-sm text-muted-foreground mt-2">{filePath}</p>
					</div>
				)}

				{imageSrc && !error && (
					<img
						src={imageSrc}
						alt={fileName}
						className={`max-w-full max-h-full object-contain transition-opacity duration-200 ${
							loading ? 'opacity-0' : 'opacity-100'
						}`}
						onLoad={handleLoad}
						onError={handleError}
						style={{
							// Checkerboard pattern for transparency
							backgroundImage: `
								linear-gradient(45deg, #1a1a1a 25%, transparent 25%),
								linear-gradient(-45deg, #1a1a1a 25%, transparent 25%),
								linear-gradient(45deg, transparent 75%, #1a1a1a 75%),
								linear-gradient(-45deg, transparent 75%, #1a1a1a 75%)
							`,
							backgroundSize: '20px 20px',
							backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
						}}
					/>
				)}
			</div>
		</div>
	);
}
