/**
 * CollapsiblePanel Component
 *
 * A shared component for collapsible side panels (left sidebar, right panel).
 * Provides consistent styling, animations, and resize behavior.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const PANEL_COLLAPSED_WIDTH = 48;
export const PANEL_MIN_WIDTH = 150;
export const PANEL_MAX_WIDTH = 600;

export interface CollapsiblePanelProps {
  /** Which side the panel is on - affects border and resize handle position */
  side: 'left' | 'right';
  /** Whether the panel is collapsed */
  isCollapsed: boolean;
  /** Callback when collapsed state changes */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Current width when expanded (controlled) */
  width?: number;
  /** Callback when width changes during resize */
  onWidthChange?: (width: number) => void;
  /** Default width when uncontrolled */
  defaultWidth?: number;
  /** Minimum width when expanded */
  minWidth?: number;
  /** Maximum width when expanded */
  maxWidth?: number;
  /** Content to render when collapsed */
  collapsedContent: ReactNode;
  /** Content to render when expanded */
  children: ReactNode;
  /** Additional className for the container */
  className?: string;
}

export function CollapsiblePanel({
  side,
  isCollapsed,
  onCollapsedChange: _onCollapsedChange,
  width: controlledWidth,
  onWidthChange,
  defaultWidth = 256,
  minWidth = PANEL_MIN_WIDTH,
  maxWidth = PANEL_MAX_WIDTH,
  collapsedContent,
  children,
  className,
}: CollapsiblePanelProps) {
  // Note: onCollapsedChange is available for future use when the panel
  // needs to notify parent of internal collapse requests
  // Internal width state for uncontrolled mode
  const [internalWidth, setInternalWidth] = useState(defaultWidth);
  const width = controlledWidth ?? internalWidth;
  const setWidth = onWidthChange ?? setInternalWidth;

  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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

      let newWidth: number;
      if (side === 'left') {
        newWidth = e.clientX;
      } else {
        newWidth = window.innerWidth - e.clientX;
      }

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setWidth(newWidth);
      }
    },
    [isResizing, side, minWidth, maxWidth, setWidth]
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

  const currentWidth = isCollapsed ? PANEL_COLLAPSED_WIDTH : width;

  return (
    <div
      ref={panelRef}
      className={cn(
        'h-full flex shrink-0 relative group transition-all duration-200 ease-out',
        side === 'left' ? 'border-r border-border/20' : 'border-l border-border',
        'bg-background',
        className
      )}
      style={{ width: currentWidth }}
    >
      {/* Resize Handle */}
      {!isCollapsed && (
        <div
          className={cn(
            'absolute top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 transition-colors z-10 opacity-0 group-hover:opacity-100',
            side === 'left' ? 'right-0' : 'left-0'
          )}
          onMouseDown={startResizing}
        />
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {isCollapsed ? (
          <div className="flex flex-col items-center py-4 gap-4 w-full animate-in fade-in duration-200">
            {collapsedContent}
          </div>
        ) : (
          <div className="flex-1 flex flex-col h-full overflow-hidden animate-in fade-in duration-200">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * PanelHeader - consistent header for expanded panels
 */
export interface PanelHeaderProps {
  children: ReactNode;
  className?: string;
}

export function PanelHeader({ children, className }: PanelHeaderProps) {
  return (
    <div
      className={cn(
        'h-12 flex items-center justify-between px-4 border-b border-border/20 shrink-0',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * PanelContent - scrollable content area
 */
export interface PanelContentProps {
  children: ReactNode;
  className?: string;
}

export function PanelContent({ children, className }: PanelContentProps) {
  return (
    <div className={cn('flex-1 overflow-y-auto min-h-0', className)}>
      {children}
    </div>
  );
}

/**
 * PanelFooter - consistent footer for expanded panels
 */
export interface PanelFooterProps {
  children: ReactNode;
  className?: string;
}

export function PanelFooter({ children, className }: PanelFooterProps) {
  return (
    <div
      className={cn(
        'p-2 border-t border-border/20 shrink-0',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * CollapsedPanelButton - consistent button style for collapsed panels
 */
export interface CollapsedPanelButtonProps {
  onClick: () => void;
  icon: ReactNode;
  title?: string;
}

export function CollapsedPanelButton({ onClick, icon, title }: CollapsedPanelButtonProps) {
  return (
    <button
      onClick={onClick}
      className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
      title={title}
    >
      {icon}
    </button>
  );
}
