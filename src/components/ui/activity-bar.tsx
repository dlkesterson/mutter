/**
 * ActivityBar Component
 *
 * A VS Code-style vertical icon strip for panel navigation.
 * Always visible at a fixed width (40-48px), icons show tooltips on hover.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Tooltip } from './tooltip';

export const ACTIVITY_BAR_WIDTH = 44;

export interface ActivityBarItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  badge?: number | string;
}

export interface ActivityBarProps {
  /** Which side the bar is on - affects tooltip direction */
  side: 'left' | 'right';
  /** Items to display in the bar */
  items: ActivityBarItem[];
  /** Currently active item id */
  activeId: string | null;
  /** Callback when an item is clicked */
  onItemClick: (id: string) => void;
  /** Optional footer items (e.g., settings) */
  footerItems?: ActivityBarItem[];
  /** Additional className */
  className?: string;
}

export function ActivityBar({
  side,
  items,
  activeId,
  onItemClick,
  footerItems,
  className,
}: ActivityBarProps) {
  const tooltipSide = side === 'left' ? 'right' : 'left';

  return (
    <div
      className={cn(
        'flex flex-col h-full shrink-0 bg-background',
        side === 'left' ? 'border-r border-border/30' : 'border-l border-border/30',
        className
      )}
      style={{ width: ACTIVITY_BAR_WIDTH }}
    >
      {/* Main items */}
      <div className="flex flex-col items-center py-2 gap-1 flex-1">
        {items.map((item) => (
          <ActivityBarButton
            key={item.id}
            item={item}
            isActive={activeId === item.id}
            onClick={() => onItemClick(item.id)}
            tooltipSide={tooltipSide}
            activeSide={side}
          />
        ))}
      </div>

      {/* Footer items */}
      {footerItems && footerItems.length > 0 && (
        <div className="flex flex-col items-center py-2 gap-1 border-t border-border/20">
          {footerItems.map((item) => (
            <ActivityBarButton
              key={item.id}
              item={item}
              isActive={activeId === item.id}
              onClick={() => onItemClick(item.id)}
              tooltipSide={tooltipSide}
              activeSide={side}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ActivityBarButtonProps {
  item: ActivityBarItem;
  isActive: boolean;
  onClick: () => void;
  tooltipSide: 'left' | 'right';
  activeSide: 'left' | 'right';
}

function ActivityBarButton({
  item,
  isActive,
  onClick,
  tooltipSide,
  activeSide,
}: ActivityBarButtonProps) {
  return (
    <Tooltip content={item.label} side={tooltipSide}>
      <button
        onClick={onClick}
        className={cn(
          'relative w-10 h-10 flex items-center justify-center rounded-md transition-colors',
          isActive
            ? 'text-foreground bg-accent'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
        )}
      >
        {/* Active indicator bar */}
        {isActive && (
          <div
            className={cn(
              'absolute top-1/2 -translate-y-1/2 w-0.5 h-6 bg-primary rounded-full',
              activeSide === 'left' ? 'left-0' : 'right-0'
            )}
          />
        )}
        {item.icon}
        {/* Badge */}
        {item.badge !== undefined && (
          <span className="absolute top-1 right-1 min-w-4 h-4 px-1 flex items-center justify-center text-[10px] font-medium bg-primary text-primary-foreground rounded-full">
            {item.badge}
          </span>
        )}
      </button>
    </Tooltip>
  );
}
