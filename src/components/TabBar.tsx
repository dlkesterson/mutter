import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Tab {
    id: string;
    path: string;
    title: string;
}

interface TabBarProps {
    tabs: Tab[];
    activeTabId: string | null;
    onTabClick: (id: string) => void;
    onTabClose: (id: string, e: React.MouseEvent) => void;
}

export function TabBar({ tabs, activeTabId, onTabClick, onTabClose }: TabBarProps) {
    if (tabs.length === 0) return null;

    return (
        <div className="flex items-center w-full bg-muted/20 border-b border-border overflow-x-auto no-scrollbar">
            {tabs.map((tab) => {
                const isActive = tab.id === activeTabId;
                return (
                    <div
                        key={tab.id}
                        onClick={() => onTabClick(tab.id)}
                        className={cn(
                            "group flex items-center gap-2 px-3 py-2 text-sm border-r border-border/50 cursor-pointer select-none min-w-[120px] max-w-[200px] h-9 transition-colors",
                            isActive 
                                ? "bg-background text-foreground font-medium border-t-2 border-t-primary" 
                                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        )}
                        title={tab.path}
                    >
                        <span className="truncate flex-1">{tab.title}</span>
                        <button
                            onClick={(e) => onTabClose(tab.id, e)}
                            className={cn(
                                "p-0.5 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/20 transition-all",
                                isActive && "opacity-100"
                            )}
                        >
                            <X size={14} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
