import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface DownloadProgress {
    downloaded: number;
    total: number;
    percentage: number;
}

export function useModelDownload() {
    const [progress, setProgress] = useState<DownloadProgress | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const unlisten = listen<DownloadProgress>('download-progress', (event) => {
            setProgress(event.payload);
        });

        return () => {
            unlisten.then((fn) => fn());
        };
    }, []);

    const downloadModel = async (modelName: string, url: string) => {
        setIsDownloading(true);
        setError(null);
        setProgress(null);

        try {
            const path = await invoke<string>('download_model', {
                modelName,
                url,
            });
            return path;
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            setError(errorMsg);
            throw err;
        } finally {
            setIsDownloading(false);
            setProgress(null);
        }
    };

    return {
        progress,
        isDownloading,
        error,
        downloadModel,
    };
}
