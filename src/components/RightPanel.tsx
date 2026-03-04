/**
 * RightPanel Component
 *
 * VS Code-style right panel with activity bar navigation.
 * The activity bar is on the outer right edge, content panel is resizable.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
	List,
	Link,
	Search,
	GitBranch,
	HelpCircle,
	Sparkles,
} from 'lucide-react';
import { emitMutterEvent } from '@/events';
import { ActivityBar, ACTIVITY_BAR_WIDTH, type ActivityBarItem } from '@/components/ui/activity-bar';

export type RightPanelTab = 'outline' | 'backlinks' | 'search' | 'graph';

const TAB_LABELS: Record<RightPanelTab, string> = {
	outline: 'Outline',
	backlinks: 'Backlinks',
	search: 'Search',
	graph: 'Graph',
};

const ACTIVITY_BAR_ITEMS: ActivityBarItem[] = [
	{ id: 'outline', icon: <List size={20} />, label: 'Outline' },
	{ id: 'backlinks', icon: <Link size={20} />, label: 'Backlinks' },
	{ id: 'search', icon: <Search size={20} />, label: 'Search' },
	{ id: 'graph', icon: <GitBranch size={20} />, label: 'Graph' },
];

const FOOTER_ITEMS: ActivityBarItem[] = [
	{ id: 'clean-up-text', icon: <Sparkles size={20} />, label: 'Clean Up Text' },
	{ id: 'commands-help', icon: <HelpCircle size={20} />, label: 'Commands & Shortcuts' },
];

const PANEL_MIN_WIDTH = 180;
const PANEL_MAX_WIDTH = 500;
const PANEL_DEFAULT_WIDTH = 280;

export interface RightPanelProps {
	/** The currently active tab */
	activeTab: RightPanelTab | null;
	/** Callback when tab changes */
	onTabChange: (tab: RightPanelTab | null) => void;
	/** Content to render for each tab */
	children: ReactNode;
	/** Available tabs (some may be hidden based on context) */
	availableTabs?: RightPanelTab[];
}

export function RightPanel({
	activeTab,
	onTabChange,
	children,
	availableTabs = ['outline', 'backlinks', 'search', 'graph'],
}: RightPanelProps) {
	// Panel width state
	const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_WIDTH);
	const [isResizing, setIsResizing] = useState(false);

	// Track last used tab for toggle behavior
	const lastTabRef = useRef<RightPanelTab>('outline');

	useEffect(() => {
		if (activeTab) {
			lastTabRef.current = activeTab;
		}
	}, [activeTab]);

	// Filter activity bar items based on available tabs
	const filteredItems = ACTIVITY_BAR_ITEMS.filter((item) =>
		availableTabs.includes(item.id as RightPanelTab)
	);

	// Derived state
	const isCollapsed = activeTab === null;

	// Handle activity bar clicks
	const handleActivityBarClick = (id: string) => {
		// Handle footer items (actions, not panel tabs)
		if (id === 'clean-up-text') {
			emitMutterEvent('mutter:execute-command', { command: 'cleanup-text' });
			return;
		}
		if (id === 'commands-help') {
			emitMutterEvent('mutter:open-dialog', { dialog: 'commands' });
			return;
		}

		const tabId = id as RightPanelTab;
		// Toggle: if already active, collapse; otherwise activate
		if (activeTab === tabId) {
			onTabChange(null);
		} else {
			onTabChange(tabId);
		}
	};

	// Resize handlers
	const startResizing = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		setIsResizing(true);
	}, []);

	const stopResizing = useCallback(() => {
		setIsResizing(false);
	}, []);

	const resize = useCallback(
		(e: MouseEvent) => {
			if (!isResizing) return;
			// For right panel: width = window width - mouse X - activity bar width
			const newWidth = window.innerWidth - e.clientX - ACTIVITY_BAR_WIDTH;
			if (newWidth >= PANEL_MIN_WIDTH && newWidth <= PANEL_MAX_WIDTH) {
				setPanelWidth(newWidth);
			}
		},
		[isResizing]
	);

	useEffect(() => {
		if (isResizing) {
			window.addEventListener('mousemove', resize);
			window.addEventListener('mouseup', stopResizing);
			return () => {
				window.removeEventListener('mousemove', resize);
				window.removeEventListener('mouseup', stopResizing);
			};
		}
	}, [isResizing, resize, stopResizing]);

	// Total width of the panel region
	const totalWidth = isCollapsed ? ACTIVITY_BAR_WIDTH : ACTIVITY_BAR_WIDTH + panelWidth;

	return (
		<div
			className="flex h-full shrink-0 bg-background"
			style={{ width: totalWidth }}
		>
			{/* Panel Content - only visible when not collapsed */}
			{!isCollapsed && (
				<div
					className="flex flex-col h-full overflow-hidden border-l border-border bg-background relative group"
					style={{ width: panelWidth }}
				>
					{/* Resize handle - always visible subtle line, highlights on hover */}
					<div
						className="absolute top-0 bottom-0 left-0 w-1 cursor-col-resize bg-border/30 hover:bg-primary/50 transition-colors z-10"
						onMouseDown={startResizing}
					/>

					{/* Panel Header */}
					<div className="h-10 flex items-center px-3 border-b border-border shrink-0">
						<span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
							{activeTab ? TAB_LABELS[activeTab] : 'Panel'}
						</span>
					</div>

					{/* Tab Content */}
					<div className="flex-1 overflow-auto">
						{children}
					</div>
				</div>
			)}

			{/* Activity Bar - always visible on the right edge */}
			<ActivityBar
				side="right"
				items={filteredItems}
				activeId={activeTab}
				onItemClick={handleActivityBarClick}
				footerItems={FOOTER_ITEMS}
			/>
		</div>
	);
}
