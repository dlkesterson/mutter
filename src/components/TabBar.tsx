import React, { useState } from 'react';
import { X, Pin, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { WindowControls } from './WindowControls';

export interface Tab {
    id: string;
    path: string;
    title: string;
    isDirty?: boolean;
    isPreview?: boolean;
    isPinned?: boolean;
}

interface TabBarProps {
    tabs: Tab[];
    activeTabId: string | null;
    onTabClick: (id: string) => void;
    onTabClose: (id: string, e: React.MouseEvent) => void;
    onTabReorder?: (fromIndex: number, toIndex: number) => void;
    onCloseOthers?: (id: string) => void;
    onCloseToRight?: (id: string) => void;
    onCloseAll?: () => void;
    onTogglePin?: (id: string) => void;
    onRevealInExplorer?: (path: string) => void;
    canGoBack?: boolean;
    canGoForward?: boolean;
    onGoBack?: () => void;
    onGoForward?: () => void;
}

export function TabBar({
    tabs,
    activeTabId,
    onTabClick,
    onTabClose,
    onTabReorder,
    onCloseOthers,
    onCloseToRight,
    onCloseAll,
    onTogglePin,
    onRevealInExplorer,
    canGoBack = false,
    canGoForward = false,
    onGoBack,
    onGoForward,
}: TabBarProps) {
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    if (tabs.length === 0) {
        // Still show titlebar with navigation and window controls even with no tabs
        return (
            <div className="flex items-center w-full bg-surface border-b border-border/20 h-10">
                {(onGoBack || onGoForward) && (
                    <div className="flex items-center gap-1 px-2">
                        <button
                            onClick={onGoBack}
                            disabled={!canGoBack}
                            className={cn(
                                "p-1.5 rounded-sm transition-colors",
                                canGoBack
                                    ? "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                                    : "text-muted-foreground/30 cursor-not-allowed"
                            )}
                            title="Go back (Alt+←)"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button
                            onClick={onGoForward}
                            disabled={!canGoForward}
                            className={cn(
                                "p-1.5 rounded-sm transition-colors",
                                canGoForward
                                    ? "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                                    : "text-muted-foreground/30 cursor-not-allowed"
                            )}
                            title="Go forward (Alt+→)"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                )}
                {/* Draggable region - allows window to be moved by dragging empty space */}
                <div data-tauri-drag-region className="flex-1 h-full" />
                {/* Window controls */}
                <WindowControls />
            </div>
        );
    }

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        // Set drag image
        if (e.currentTarget instanceof HTMLElement) {
            e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
        }
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedIndex !== null && draggedIndex !== index) {
            setDragOverIndex(index);
        }
    };

    const handleDragLeave = () => {
        setDragOverIndex(null);
    };

    const handleDrop = (e: React.DragEvent, dropIndex: number) => {
        e.preventDefault();
        if (draggedIndex !== null && draggedIndex !== dropIndex && onTabReorder) {
            onTabReorder(draggedIndex, dropIndex);
        }
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    return (
        <div className="flex items-center w-full bg-surface border-b border-border/20 h-10">
            {/* Navigation buttons */}
            {(onGoBack || onGoForward) && (
                <div className="flex items-center gap-0.5 px-1 border-r border-border/20 h-full flex-shrink-0">
                    <button
                        onClick={onGoBack}
                        disabled={!canGoBack}
                        className={cn(
                            "p-1.5 rounded-sm transition-colors",
                            canGoBack
                                ? "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                                : "text-muted-foreground/30 cursor-not-allowed"
                        )}
                        title="Go back (Alt+←)"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <button
                        onClick={onGoForward}
                        disabled={!canGoForward}
                        className={cn(
                            "p-1.5 rounded-sm transition-colors",
                            canGoForward
                                ? "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                                : "text-muted-foreground/30 cursor-not-allowed"
                        )}
                        title="Go forward (Alt+→)"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            )}

            {/* Tabs container - scrollable */}
            <div className="flex overflow-x-auto no-scrollbar h-full">
            {tabs.map((tab, index) => {
                const isActive = tab.id === activeTabId;
                const isDragging = draggedIndex === index;
                const isDragOver = dragOverIndex === index;
                const tabIndex = tabs.findIndex((t) => t.id === tab.id);
                const canCloseToRight = tabIndex < tabs.length - 1;

                return (
                    <ContextMenu key={tab.id}>
                        <ContextMenuTrigger asChild>
                            <div
                                draggable
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, index)}
                                onDragEnd={handleDragEnd}
                                onClick={() => onTabClick(tab.id)}
                                className={cn(
                                    "group flex items-center gap-2 px-4 py-2 text-sm border-r border-border/20 cursor-pointer select-none min-w-[120px] max-w-[200px] h-full transition-all relative",
                                    isActive
                                        ? "bg-background text-foreground font-medium border-b-2 border-b-primary"
                                        : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                                    isDragging && "opacity-50",
                                    isDragOver && "border-l-2 border-l-primary"
                                )}
                                title={tab.path}
                            >
                                {/* Pin indicator */}
                                {tab.isPinned && (
                                    <span title="Pinned tab">
                                        <Pin
                                            size={12}
                                            className="flex-shrink-0 text-primary"
                                        />
                                    </span>
                                )}
                                <span className="truncate flex-1 flex items-center gap-1.5">
                                    {tab.isDirty && (
                                        <span
                                            className="inline-block w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0"
                                            title="Unsaved changes"
                                        />
                                    )}
                                    <span className={cn("truncate", tab.isPreview && "italic font-normal")}>{tab.title}</span>
                                </span>
                                <button
                                    onClick={(e) => onTabClose(tab.id, e)}
                                    className={cn(
                                        "p-0.5 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/20 transition-all flex-shrink-0",
                                        isActive && "opacity-100"
                                    )}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-48">
                            <ContextMenuItem onClick={() => onTabClick(tab.id)}>
                                Go to Tab
                            </ContextMenuItem>
                            {onTogglePin && (
                                <ContextMenuItem onClick={() => onTogglePin(tab.id)}>
                                    {tab.isPinned ? 'Unpin Tab' : 'Pin Tab'}
                                </ContextMenuItem>
                            )}
                            {onRevealInExplorer && (
                                <ContextMenuItem onClick={() => onRevealInExplorer(tab.path)}>
                                    Reveal in File Explorer
                                </ContextMenuItem>
                            )}
                            <ContextMenuSeparator />
                            <ContextMenuItem
                                onClick={() => onCloseOthers?.(tab.id)}
                                disabled={tabs.length <= 1}
                            >
                                Close Others
                            </ContextMenuItem>
                            <ContextMenuItem
                                onClick={() => onCloseToRight?.(tab.id)}
                                disabled={!canCloseToRight}
                            >
                                Close to the Right
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => onCloseAll?.()}>
                                Close All
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={(e) => {
                                e.preventDefault();
                                onTabClose(tab.id, e as any);
                            }}>
                                Close
                            </ContextMenuItem>
                        </ContextMenuContent>
                    </ContextMenu>
                );
            })}
            </div>

            {/* Draggable region - allows window to be moved by dragging empty space */}
            <div data-tauri-drag-region className="flex-1 h-full min-w-[48px]" />

            {/* Window controls */}
            <WindowControls className="flex-shrink-0" />
        </div>
    );
}
