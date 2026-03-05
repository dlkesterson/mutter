/**
 * Dialog Manager Hook
 *
 * Manages dialog/panel open state extracted from App.tsx.
 */

import { useState, useCallback } from 'react';
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

	const openTextCleanup = useCallback((data: { text: string; selectionRange: { from: number; to: number } | null }) => {
		setTextCleanupData(data);
		setOpenDialog('text-cleanup');
	}, []);

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
		openTextCleanup,
	};
}
