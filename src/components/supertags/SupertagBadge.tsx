/**
 * SupertagBadge Component
 *
 * Displays a supertag as a clickable badge with optional remove button.
 */

import type { SupertagDefinition, SupertagInstance } from '@/types/supertag';

interface SupertagBadgeProps {
  definition: SupertagDefinition;
  instance: SupertagInstance;
  onClick?: () => void;
  onRemove?: () => void;
}

export function SupertagBadge({
  definition,
  instance: _instance,
  onClick,
  onRemove,
}: SupertagBadgeProps) {
  return (
    <button
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                 bg-accent/10 text-accent text-xs font-medium
                 hover:bg-accent/20 transition-colors group"
      onClick={onClick}
    >
      {definition.icon && <span>{definition.icon}</span>}
      <span>{definition.name}</span>
      {onRemove && (
        <span
          role="button"
          className="ml-1 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </span>
      )}
    </button>
  );
}
