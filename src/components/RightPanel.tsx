/**
 * RightPanel Component
 *
 * The collapsible right panel containing Outline, Backlinks, Query, AI Query, Graph, and Tags tabs.
 * Uses the shared CollapsiblePanel for consistent behavior with the left sidebar.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { PanelRightOpen, PanelRightClose } from 'lucide-react';
import {
  CollapsiblePanel,
  CollapsedPanelButton,
} from '@/components/ui/collapsible-panel';
import { cn } from '@/lib/utils';

export type RightPanelTab = 'outline' | 'backlinks' | 'query' | 'ai-query' | 'graph' | 'tags';

const TAB_LABELS: Record<RightPanelTab, string> = {
  outline: 'Outline',
  backlinks: 'Backlinks',
  query: 'Query',
  'ai-query': 'AI Query',
  graph: 'Graph',
  tags: 'Tags',
};

export interface RightPanelProps {
  /** The currently active tab */
  activeTab: RightPanelTab | null;
  /** Callback when tab changes */
  onTabChange: (tab: RightPanelTab) => void;
  /** Whether the panel is collapsed */
  isCollapsed: boolean;
  /** Callback when collapsed state changes */
  onCollapsedChange: (collapsed: boolean) => void;
  /** Current width */
  width: number;
  /** Callback when width changes */
  onWidthChange: (width: number) => void;
  /** Content to render for each tab */
  children: ReactNode;
  /** Available tabs (some may be hidden based on context) */
  availableTabs?: RightPanelTab[];
}

export function RightPanel({
  activeTab,
  onTabChange,
  isCollapsed,
  onCollapsedChange,
  width,
  onWidthChange,
  children,
  availableTabs = ['outline', 'backlinks', 'query', 'ai-query', 'graph', 'tags'],
}: RightPanelProps) {
  // Track last used tab for toggle behavior
  const lastTabRef = useRef<RightPanelTab>('outline');

  useEffect(() => {
    if (activeTab) {
      lastTabRef.current = activeTab;
    }
  }, [activeTab]);

  const handleToggle = () => {
    const newCollapsed = !isCollapsed;
    onCollapsedChange(newCollapsed);
    // When expanding, set a tab if none selected
    if (!newCollapsed && !activeTab) {
      onTabChange(lastTabRef.current);
    }
  };

  return (
    <CollapsiblePanel
      side="right"
      isCollapsed={isCollapsed}
      onCollapsedChange={onCollapsedChange}
      width={width}
      onWidthChange={onWidthChange}
      minWidth={200}
      maxWidth={600}
      collapsedContent={
        <CollapsedPanelButton
          onClick={handleToggle}
          icon={<PanelRightOpen size={20} />}
          title="Expand Panel"
        />
      }
    >
      {/* Tab Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex gap-1 flex-wrap">
          {availableTabs.map((tab) => (
            <button
              key={tab}
              className={cn(
                'text-xs px-2 py-1 rounded transition-colors',
                activeTab === tab
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              )}
              onClick={() => onTabChange(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
        <button
          onClick={handleToggle}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Collapse Panel"
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </CollapsiblePanel>
  );
}
