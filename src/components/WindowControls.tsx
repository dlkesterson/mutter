import { Minus, Square, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { cn } from '@/lib/utils';

interface WindowControlsProps {
  className?: string;
}

export function WindowControls({ className }: WindowControlsProps) {
  const handleMinimize = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.minimize();
    } catch (err) {
      console.error('Failed to minimize:', err);
    }
  };

  const handleMaximize = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.toggleMaximize();
    } catch (err) {
      console.error('Failed to toggle maximize:', err);
    }
  };

  const handleClose = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.close();
    } catch (err) {
      console.error('Failed to close:', err);
    }
  };

  return (
    <div className={cn("flex items-center h-full", className)}>
      <button
        onClick={handleMinimize}
        className="h-full w-10 flex items-center justify-center hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Minimize"
      >
        <Minus size={16} />
      </button>
      <button
        onClick={handleMaximize}
        className="h-full w-10 flex items-center justify-center hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Maximize"
      >
        <Square size={12} />
      </button>
      <button
        onClick={handleClose}
        className="h-full w-10 flex items-center justify-center hover:bg-red-600 text-muted-foreground hover:text-white transition-colors"
        aria-label="Close"
      >
        <X size={16} />
      </button>
    </div>
  );
}
