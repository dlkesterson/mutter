/**
 * BaseDialog Component
 *
 * A shared dialog wrapper that ensures consistent styling across all dialogs.
 * Provides size variants, alert dialog support, and standardized layout patterns.
 */

import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Size variants for dialogs */
export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'fullscreen';

const SIZE_CLASSES: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[1200px] w-[80vw]',
  fullscreen: 'max-w-[95vw] w-[95vw] h-[95vh] max-h-[95vh]',
};

export interface BaseDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Dialog title */
  title: string;
  /** Optional description below the title */
  description?: string;
  /** Size variant */
  size?: DialogSize;
  /** Dialog content */
  children: ReactNode;
  /** Optional footer content (buttons, etc.) */
  footer?: ReactNode;
  /** Whether to show the close button */
  showCloseButton?: boolean;
  /** Additional className for DialogContent */
  className?: string;
  /** Maximum height constraint (e.g., '80vh') */
  maxHeight?: string;
  /** Fixed height (e.g., '80vh') for flex layouts */
  height?: string;
  /** Custom header content (replaces default header when provided) */
  customHeader?: ReactNode;
  /** Whether dialog content should use flex column layout */
  flexContent?: boolean;
  /** Remove default padding from content area */
  noPadding?: boolean;
}

/**
 * BaseDialog - Consistent dialog wrapper for all application dialogs
 *
 * @example
 * ```tsx
 * <BaseDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   title="Create Template"
 *   size="md"
 *   footer={
 *     <DialogActions onCancel={() => setIsOpen(false)} onConfirm={handleSave} />
 *   }
 * >
 *   <form>...</form>
 * </BaseDialog>
 * ```
 */
export function BaseDialog({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  children,
  footer,
  showCloseButton = true,
  className,
  maxHeight,
  height,
  customHeader,
  flexContent = false,
  noPadding = false,
}: BaseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={showCloseButton}
        className={cn(
          // Base styles - ensure proper text/background colors
          'bg-background text-foreground border-border',
          // Size variant
          SIZE_CLASSES[size],
          // Flex layout if requested
          flexContent && 'flex flex-col',
          // Optional max height with scroll
          maxHeight && 'overflow-y-auto',
          className
        )}
        style={{
          ...(maxHeight ? { maxHeight } : {}),
          ...(height ? { height } : {}),
        }}
      >
        {customHeader ?? (
          <DialogHeader className={flexContent ? 'flex-shrink-0' : undefined}>
            <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
            {description && (
              <DialogDescription>{description}</DialogDescription>
            )}
          </DialogHeader>
        )}

        <div
          className={cn(
            !noPadding && 'py-4',
            flexContent && 'flex-1 min-h-0 overflow-hidden'
          )}
        >
          {children}
        </div>

        {footer && (
          <DialogFooter className={flexContent ? 'flex-shrink-0' : undefined}>
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * AlertDialog variant for confirmation dialogs with blocking semantics
 */
export interface AlertBaseDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Dialog title */
  title: ReactNode;
  /** Dialog description/message */
  description?: ReactNode;
  /** Additional content between description and buttons */
  children?: ReactNode;
  /** Cancel button label */
  cancelLabel?: string;
  /** Confirm button label */
  confirmLabel?: string;
  /** Called when cancel is clicked */
  onCancel: () => void;
  /** Called when confirm is clicked */
  onConfirm: () => void;
  /** Use destructive styling for confirm button */
  destructive?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * AlertBaseDialog - For confirmation dialogs requiring user acknowledgment
 *
 * @example
 * ```tsx
 * <AlertBaseDialog
 *   open={showConfirm}
 *   onOpenChange={setShowConfirm}
 *   title="Delete note?"
 *   description="This action cannot be undone."
 *   cancelLabel="Cancel"
 *   confirmLabel="Delete"
 *   onCancel={() => setShowConfirm(false)}
 *   onConfirm={handleDelete}
 *   destructive
 * />
 * ```
 */
export function AlertBaseDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  cancelLabel = 'Cancel',
  confirmLabel = 'Confirm',
  onCancel,
  onConfirm,
  destructive = false,
  className,
}: AlertBaseDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={cn('bg-background text-foreground border-border', className)}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>

        {children}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={destructive ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' : ''}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * DialogSection - A styled section within a dialog for grouping related content
 */
export interface DialogSectionProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function DialogSection({ title, children, className }: DialogSectionProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {title && (
        <h3 className="text-sm font-medium text-muted-foreground border-b border-border pb-2">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

/**
 * DialogActions - Standard dialog footer with Cancel and primary action buttons
 */
export interface DialogActionsProps {
  onCancel: () => void;
  onConfirm: () => void;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  confirmVariant?: 'default' | 'destructive';
}

export function DialogActions({
  onCancel,
  onConfirm,
  cancelLabel = 'Cancel',
  confirmLabel = 'Save',
  confirmDisabled = false,
  confirmVariant = 'default',
}: DialogActionsProps) {
  return (
    <>
      <Button variant="outline" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button
        onClick={onConfirm}
        disabled={confirmDisabled}
        variant={confirmVariant}
      >
        {confirmLabel}
      </Button>
    </>
  );
}

/**
 * FormField - A styled form field container with label
 */
export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function FormField({ label, htmlFor, description, children, className }: FormFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

/**
 * SelectField - A styled native select element for dialogs
 */
export interface SelectFieldProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}

export function SelectField({ value, onChange, options, className }: SelectFieldProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full px-3 py-2 border border-border rounded text-sm',
        'bg-background text-foreground',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        className
      )}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
