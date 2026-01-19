/**
 * Text Cleanup Dialog
 *
 * A dialog for cleaning up transcribed speech-to-text using local LLM (Ollama).
 * Shows side-by-side comparison of original and cleaned text.
 */

import { useState, useEffect, useCallback } from 'react';
import { BaseDialog } from '@/components/ui/base-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { useSettings, useCredentials } from '@/lib/settings';
import {
	cleanupText,
	buildLLMSettings,
	type CleanupResult,
} from '@/services/text-cleanup-service';

interface TextCleanupDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	text: string;
	selectionRange: { from: number; to: number } | null;
	onApply: (cleanedText: string, range: { from: number; to: number } | null) => void;
}

export function TextCleanupDialog({
	open,
	onOpenChange,
	text,
	selectionRange,
	onApply,
}: TextCleanupDialogProps) {
	const { settings } = useSettings();
	const { credentials } = useCredentials();

	// Cleanup options
	const [removeFillers, setRemoveFillers] = useState(true);
	const [addStructure, setAddStructure] = useState(false);

	// Processing state
	const [isProcessing, setIsProcessing] = useState(false);
	const [result, setResult] = useState<CleanupResult | null>(null);
	const [hasProcessed, setHasProcessed] = useState(false);

	// Reset state when dialog opens with new text
	useEffect(() => {
		if (open) {
			setResult(null);
			setHasProcessed(false);
			setRemoveFillers(true);
			setAddStructure(false);
		}
	}, [open, text]);

	const handleProcess = useCallback(async () => {
		if (!settings || !credentials) {
			setResult({
				original: text,
				cleaned: text,
				processingTimeMs: 0,
				error: 'Settings not loaded',
			});
			return;
		}

		setIsProcessing(true);

		const provider = settings.ai_default_provider;
		// Use at least 120 seconds for cleanup - large documents need time
		const timeoutMs = Math.max(settings.ai_timeout_ms, 120000);
		const llmSettings = buildLLMSettings(
			provider,
			settings.ai_providers,
			credentials.ai_providers,
			timeoutMs
		);

		console.log('[TextCleanup] Starting cleanup with timeout:', timeoutMs, 'ms, provider:', provider);
		const cleanupResult = await cleanupText(
			text,
			{ removeFillers, addStructure },
			llmSettings
		);
		console.log('[TextCleanup] Cleanup complete:', cleanupResult.error || 'success');

		setResult(cleanupResult);
		setHasProcessed(true);
		setIsProcessing(false);
	}, [text, removeFillers, addStructure, settings, credentials]);

	const handleApply = () => {
		if (result && !result.error) {
			onApply(result.cleaned, selectionRange);
			onOpenChange(false);
		}
	};

	const handleCancel = () => {
		onOpenChange(false);
	};

	const wordCount = text.split(/\s+/).filter(Boolean).length;
	const cleanedWordCount = result?.cleaned
		? result.cleaned.split(/\s+/).filter(Boolean).length
		: 0;
	const wordsRemoved = result && !result.error ? wordCount - cleanedWordCount : 0;

	return (
		<BaseDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Clean Up Text"
			size="xl"
			height="80vh"
			flexContent
			footer={
				<div className="flex items-center justify-between w-full">
					<div className="text-sm text-muted-foreground">
						{result && !result.error && (
							<>
								Processed in {(result.processingTimeMs / 1000).toFixed(1)}s
								{wordsRemoved > 0 && ` · ${wordsRemoved} words removed`}
							</>
						)}
					</div>
					<div className="flex gap-2">
						<Button variant="outline" onClick={handleCancel}>
							Cancel
						</Button>
						<Button
							onClick={handleApply}
							disabled={!result || !!result.error || isProcessing}
						>
							Apply
						</Button>
					</div>
				</div>
			}
		>
			{/* Full-height flex container for all content */}
			<div className="flex flex-col h-full">
				{/* Options bar */}
				<div className="flex items-center gap-6 pb-4 border-b border-border flex-shrink-0">
					<div className="flex items-center gap-2">
						<Checkbox
							id="remove-fillers"
							checked={removeFillers}
							onCheckedChange={(checked) => setRemoveFillers(checked === true)}
							disabled={isProcessing}
						/>
						<Label htmlFor="remove-fillers" className="text-sm cursor-pointer">
							Remove fillers
						</Label>
					</div>
					<div className="flex items-center gap-2">
						<Checkbox
							id="add-structure"
							checked={addStructure}
							onCheckedChange={(checked) => setAddStructure(checked === true)}
							disabled={isProcessing}
						/>
						<Label htmlFor="add-structure" className="text-sm cursor-pointer">
							Add structure
						</Label>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={handleProcess}
						disabled={isProcessing || (!removeFillers && !addStructure)}
						className="ml-auto"
					>
						{isProcessing ? (
							<Loader2 className="w-4 h-4 mr-2 animate-spin" />
						) : (
							<RefreshCw className="w-4 h-4 mr-2" />
						)}
						{isProcessing ? 'Processing...' : hasProcessed ? 'Reprocess' : 'Process'}
					</Button>
				</div>

				{/* Error display */}
				{result?.error && (
					<div className="flex items-start gap-3 p-4 mt-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive flex-shrink-0">
						<AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
						<div>
							<p className="font-medium">Processing failed</p>
							<p className="text-sm opacity-90">{result.error}</p>
							<p className="text-sm mt-2 opacity-75">
								Make sure Ollama is running at{' '}
								{settings?.ai_providers.ollama.url || 'localhost:11434'}
							</p>
						</div>
					</div>
				)}

				{/* Side-by-side content - takes remaining space */}
				<div className="flex-1 flex gap-4 pt-4 min-h-0">
					{/* Original text */}
					<div className="flex-1 flex flex-col min-h-0">
						<div className="text-sm font-medium text-muted-foreground mb-2 flex-shrink-0">
							Original ({wordCount} words)
						</div>
						<div className="flex-1 overflow-y-auto p-4 bg-muted/50 rounded-lg font-mono text-sm whitespace-pre-wrap min-h-0">
							{text}
						</div>
					</div>

					{/* Cleaned text */}
					<div className="flex-1 flex flex-col min-h-0">
						<div className="text-sm font-medium text-muted-foreground mb-2 flex-shrink-0">
							Cleaned {result && !result.error && `(${cleanedWordCount} words)`}
						</div>
						<div className="flex-1 overflow-y-auto p-4 bg-muted/50 rounded-lg font-mono text-sm whitespace-pre-wrap min-h-0">
							{isProcessing ? (
								<div className="flex items-center justify-center h-full text-muted-foreground">
									<Loader2 className="w-6 h-6 animate-spin mr-3" />
									Processing with {settings?.ai_providers.ollama.model || 'Ollama'}...
								</div>
							) : result?.error ? (
								<div className="text-muted-foreground italic">
									Cleanup failed. Original text will be preserved.
								</div>
							) : result ? (
								result.cleaned
							) : (
								<div className="text-muted-foreground italic">
									Select cleanup options above, then click Process
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</BaseDialog>
	);
}

export default TextCleanupDialog;
