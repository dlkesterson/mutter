/**
 * Confirmation Dialog
 *
 * A risk-based confirmation dialog for destructive voice commands.
 * Shows different UI based on the command's destructiveness level.
 */

import { useState } from 'react';
import { AlertBaseDialog } from '@/components/ui/base-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { VoiceCommand, Destructiveness } from '@/types/voiceCommand';

interface ConfirmationDialogProps {
  open: boolean;
  command: VoiceCommand | null;
  context?: {
    affectedItems?: string[];
    additionalInfo?: string;
  };
  onConfirm: (skipInFuture: boolean) => void;
  onCancel: () => void;
}

/**
 * Icons for each destructiveness level
 */
const DESTRUCTIVENESS_ICONS: Record<Destructiveness, string> = {
  none: '',
  low: 'ℹ️',
  medium: '⚠️',
  high: '🛑',
};

/**
 * Tailwind color classes for each destructiveness level
 */
const DESTRUCTIVENESS_COLORS: Record<Destructiveness, string> = {
  none: '',
  low: 'text-blue-500',
  medium: 'text-yellow-500',
  high: 'text-red-500',
};

/**
 * Risk-based confirmation dialog for voice commands
 */
export function ConfirmationDialog({
  open,
  command,
  context,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const [skipInFuture, setSkipInFuture] = useState(false);

  if (!command) {
    return null;
  }

  const icon = DESTRUCTIVENESS_ICONS[command.destructiveness];
  const colorClass = DESTRUCTIVENESS_COLORS[command.destructiveness];
  const isHighRisk = command.destructiveness === 'high';

  const handleConfirm = () => {
    onConfirm(skipInFuture);
    setSkipInFuture(false); // Reset for next time
  };

  const handleCancel = () => {
    setSkipInFuture(false);
    onCancel();
  };

  // Build title with icon and color
  const title = (
    <span className={`flex items-center gap-2 ${colorClass}`}>
      {icon && <span>{icon}</span>}
      Confirm: {command.name}
    </span>
  );

  // Build description
  const description = (
    <>
      Are you sure you want to execute this command?
      {isHighRisk && (
        <span className="block mt-2 font-medium text-destructive">
          This action may have significant consequences.
        </span>
      )}
    </>
  );

  return (
    <AlertBaseDialog
      open={open}
      onOpenChange={(o) => !o && handleCancel()}
      title={title}
      description={description}
      cancelLabel="Cancel"
      confirmLabel={isHighRisk ? 'Yes, I understand' : 'Confirm'}
      onCancel={handleCancel}
      onConfirm={handleConfirm}
      destructive={isHighRisk}
    >
      {/* Affected items list */}
      {context?.affectedItems && context.affectedItems.length > 0 && (
        <div className="mt-4 p-3 bg-muted rounded-lg text-sm">
          <p className="font-medium mb-2">This action will affect:</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            {context.affectedItems.slice(0, 5).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
            {context.affectedItems.length > 5 && (
              <li className="text-muted-foreground/70">
                ...and {context.affectedItems.length - 5} more
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Additional context info */}
      {context?.additionalInfo && (
        <p className="text-sm text-muted-foreground mt-2">
          {context.additionalInfo}
        </p>
      )}

      {/* Skip in future checkbox (only for reversible actions) */}
      {command.reversible && (
        <div className="flex items-center gap-2 mt-4">
          <Checkbox
            id="skip-future"
            checked={skipInFuture}
            onCheckedChange={(checked) => setSkipInFuture(checked === true)}
          />
          <Label htmlFor="skip-future" className="text-sm cursor-pointer">
            Don't ask again for this action (it's reversible)
          </Label>
        </div>
      )}
    </AlertBaseDialog>
  );
}

export default ConfirmationDialog;
