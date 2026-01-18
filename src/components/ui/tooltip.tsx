/**
 * Tooltip Component
 *
 * A simple tooltip that appears on hover with a delay.
 * Used in the ActivityBar to show labels for icon buttons.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  content: string;
  side?: 'left' | 'right' | 'top' | 'bottom';
  children: React.ReactNode;
  className?: string;
}

export function Tooltip({ content, side = 'right', children, className }: TooltipProps) {
  const [isVisible, setIsVisible] = React.useState(false);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const showTooltip = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, 400); // 400ms delay before showing
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  const positionClasses = {
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
  };

  return (
    <div
      className={cn('relative inline-flex', className)}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      {children}
      {isVisible && (
        <div
          className={cn(
            'absolute z-50 px-2 py-1 text-xs font-medium whitespace-nowrap',
            'bg-popover text-popover-foreground border border-border rounded shadow-md',
            'animate-in fade-in-0 zoom-in-95 duration-100',
            positionClasses[side]
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
