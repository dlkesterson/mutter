/**
 * Dialog Manager Hook
 *
 * Manages dialog/panel open state extracted from App.tsx.
 * Listens for mutter:open-dialog and mutter:open-settings events.
 */

import { useState } from 'react';
import { useMutterEvent } from '../events';
import type { RightPanelTab } from '../components/RightPanel';

export type DialogType =
	| 'files'
	| 'voice-log'
	| 'settings'
	| 'text-cleanup'
	| null;

export function useDialogManager() {
	const [openDialog, setOpenDialog] = useState<DialogType>(null);
	const [fileDialogQuery, setFileDialogQuery] = useState('');
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [graphDialogOpen, setGraphDialogOpen] = useState(false);
	const [textCleanupData, setTextCleanupData] = useState<{
		text: string;
		selectionRange: { from: number; to: number } | null;
	} | null>(null);
	const [rightPanel, setRightPanel] = useState<RightPanelTab | null>(null);

	// Listen for dialog/panel open events from voice commands and Editor
	useMutterEvent('mutter:open-dialog', (detail) => {
		const { dialog } = detail;
		console.log('[App] Received mutter:open-dialog:', dialog, detail);

		switch (dialog) {
			case 'ai-query':
			case 'query':
			case 'search':
				// Search panel removed from right panel; no-op
				break;
			case 'backlinks':
				setRightPanel('backlinks');
				break;
			case 'insert-embed':
				console.log(`[App] Dialog ${dialog} not yet implemented`);
				break;
			case 'text-cleanup':
				setTextCleanupData({
					text: (detail as any).text || '',
					selectionRange: (detail as any).selectionRange || null,
				});
				setOpenDialog('text-cleanup');
				break;
			default:
				console.warn('[App] Unknown dialog:', dialog);
		}
	});

	// Listen for settings open events
	useMutterEvent('mutter:open-settings', () => {
		setOpenDialog('settings');
	});

	return {
		openDialog,
		setOpenDialog,
		fileDialogQuery,
		setFileDialogQuery,
		modelSelectorOpen,
		setModelSelectorOpen,
		graphDialogOpen,
		setGraphDialogOpen,
		textCleanupData,
		setTextCleanupData,
		rightPanel,
		setRightPanel,
	};
}
