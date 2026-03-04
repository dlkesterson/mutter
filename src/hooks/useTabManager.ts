/**
 * Tab Manager Hook
 *
 * Encapsulates all tab state and operations extracted from App.tsx.
 * Handles open/close/switch/pin/reorder/rename/dirty tracking.
 */

import { useState, useCallback } from 'react';
import type { Tab } from '../components/TabBar';

function generateTabId(): string {
	return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function titleFromPath(path: string): string {
	return path.split('/').pop() || 'Untitled';
}

interface UseTabManagerOptions {
	onNavigate: (path: string) => void;
}

export function useTabManager({ onNavigate }: UseTabManagerOptions) {
	const [tabs, setTabs] = useState<Tab[]>([]);
	const [activeTabId, setActiveTabId] = useState<string | null>(null);

	const activeTab = tabs.find((t) => t.id === activeTabId);
	const currentFile = activeTab?.path || null;

	const handleFileSelect = useCallback(
		(path: string, permanent = false, fromHistory = false) => {
			if (!fromHistory) {
				onNavigate(path);
			}

			setTabs((prevTabs) => {
				const existingTab = prevTabs.find((t) => t.path === path);
				if (existingTab) {
					setActiveTabId(existingTab.id);
					if (permanent && existingTab.isPreview) {
						return prevTabs.map((t) =>
							t.id === existingTab.id
								? { ...t, isPreview: false }
								: t,
						);
					}
					return prevTabs;
				}

				const current = prevTabs.find((t) => t.id === activeTabId);

				// Don't reuse pinned tabs
				if (current?.isPinned) {
					const newTab: Tab = {
						id: generateTabId(),
						path,
						title: titleFromPath(path),
						isPreview: !permanent,
					};
					setActiveTabId(newTab.id);
					return [...prevTabs, newTab];
				}

				// Reuse preview tab if available and not dirty
				if (current && current.isPreview && !permanent && !current.isDirty) {
					return prevTabs.map((t) => {
						if (t.id === activeTabId) {
							return {
								...t,
								path,
								title: titleFromPath(path),
								isPreview: true,
							};
						}
						return t;
					});
				}

				const newTab: Tab = {
					id: generateTabId(),
					path,
					title: titleFromPath(path),
					isPreview: !permanent,
				};
				setActiveTabId(newTab.id);
				return [...prevTabs, newTab];
			});
		},
		[activeTabId, onNavigate],
	);

	const handleOpenInNewTab = useCallback(
		(path: string) => {
			onNavigate(path);

			const existingTab = tabs.find((t) => t.path === path);
			if (existingTab) {
				setActiveTabId(existingTab.id);
				return;
			}

			const newTab: Tab = {
				id: generateTabId(),
				path,
				title: titleFromPath(path),
				isPreview: false,
			};
			setTabs((prev) => [...prev, newTab]);
			setActiveTabId(newTab.id);
		},
		[tabs, onNavigate],
	);

	const handleTabClose = useCallback(
		(id: string, e: React.MouseEvent) => {
			e.stopPropagation();
			setTabs((prev) => {
				const newTabs = prev.filter((t) => t.id !== id);
				if (activeTabId === id) {
					setActiveTabId(
						newTabs.length > 0
							? newTabs[newTabs.length - 1].id
							: null,
					);
				}
				return newTabs;
			});
		},
		[activeTabId],
	);

	const handleTabReorder = useCallback(
		(fromIndex: number, toIndex: number) => {
			setTabs((prev) => {
				const newTabs = [...prev];
				const [movedTab] = newTabs.splice(fromIndex, 1);
				newTabs.splice(toIndex, 0, movedTab);
				return newTabs;
			});
		},
		[],
	);

	const handleCloseOthers = useCallback((id: string) => {
		setTabs((prev) => {
			const tab = prev.find((t) => t.id === id);
			return tab ? [tab] : prev;
		});
		setActiveTabId(id);
	}, []);

	const handleCloseToRight = useCallback(
		(id: string) => {
			setTabs((prev) => {
				const index = prev.findIndex((t) => t.id === id);
				if (index === -1) return prev;
				const newTabs = prev.slice(0, index + 1);
				if (activeTabId && !newTabs.find((t) => t.id === activeTabId)) {
					setActiveTabId(newTabs[newTabs.length - 1].id);
				}
				return newTabs;
			});
		},
		[activeTabId],
	);

	const handleCloseAll = useCallback(() => {
		setTabs([]);
		setActiveTabId(null);
	}, []);

	const handleTogglePin = useCallback((id: string) => {
		setTabs((prev) =>
			prev.map((tab) =>
				tab.id === id ? { ...tab, isPinned: !tab.isPinned } : tab,
			),
		);
	}, []);

	const handleTabDirtyChange = useCallback((path: string, isDirty: boolean) => {
		setTabs((prev) =>
			prev.map((tab) => {
				if (tab.path === path) {
					return {
						...tab,
						isDirty,
						isPreview: isDirty ? false : tab.isPreview,
					};
				}
				return tab;
			}),
		);
	}, []);

	const handleNoteRename = useCallback((oldPath: string, newPath: string) => {
		setTabs((prev) =>
			prev.map((tab) => {
				if (tab.path === oldPath) {
					return {
						...tab,
						path: newPath,
						title: titleFromPath(newPath),
					};
				}
				return tab;
			}),
		);
	}, []);

	const handleTabDoubleClick = useCallback((id: string) => {
		setTabs((prev) =>
			prev.map((tab) =>
				tab.id === id && tab.isPreview
					? { ...tab, isPreview: false }
					: tab,
			),
		);
	}, []);

	return {
		tabs,
		activeTabId,
		activeTab,
		currentFile,
		setActiveTabId,
		handleFileSelect,
		handleOpenInNewTab,
		handleTabClose,
		handleTabReorder,
		handleCloseOthers,
		handleCloseToRight,
		handleCloseAll,
		handleTogglePin,
		handleTabDirtyChange,
		handleNoteRename,
		handleTabDoubleClick,
	};
}
