import React, { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';

export interface Tab {
    id: string;
    path: string;
    title: string;
    isDirty?: boolean;
    isPreview?: boolean;
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
}: TabBarProps) {
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    if (tabs.length === 0) return null;

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
        <div className="flex items-center w-full bg-surface border-b border-border/20 overflow-x-auto no-scrollbar h-10">
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
    );
}
