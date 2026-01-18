/**
 * Status Bar Component
 *
 * Displays document statistics and status indicators at the bottom of the editor.
 * Similar to Obsidian's status bar showing word count, character count, etc.
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { FileText, Type, Clock, Mic, MicOff, Cloud, CloudOff, AlertCircle } from 'lucide-react';
import { SyncStatusIndicator } from './sync/SyncStatusIndicator';

interface StatusBarProps {
    content: string;
    filePath: string | null;
    isRecording?: boolean;
    syncStatus?: 'synced' | 'syncing' | 'offline' | 'error';
    isDirty?: boolean;
    className?: string;
}

/**
 * Calculate document statistics
 */
function getDocumentStats(content: string) {
    // Word count - split on whitespace and filter empty strings
    const words = content.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;

    // Character count (excluding whitespace)
    const charCountNoSpaces = content.replace(/\s/g, '').length;

    // Character count (including whitespace)
    const charCount = content.length;

    // Line count
    const lineCount = content.split('\n').length;

    // Estimated reading time (average 200 words per minute)
    const readingTimeMinutes = Math.ceil(wordCount / 200);

    return {
        wordCount,
        charCount,
        charCountNoSpaces,
        lineCount,
        readingTimeMinutes,
    };
}

export function StatusBar({
    content,
    filePath,
    isRecording = false,
    syncStatus = 'synced',
    isDirty = false,
    className,
}: StatusBarProps) {
    const stats = useMemo(() => getDocumentStats(content), [content]);

    const fileName = filePath ? filePath.split('/').pop() : null;

    const getSyncIcon = () => {
        switch (syncStatus) {
            case 'synced':
                return <Cloud size={12} className="text-green-500" />;
            case 'syncing':
                return <Cloud size={12} className="text-blue-500 animate-pulse" />;
            case 'offline':
                return <CloudOff size={12} className="text-muted-foreground" />;
            case 'error':
                return <AlertCircle size={12} className="text-red-500" />;
        }
    };

    const getSyncLabel = () => {
        switch (syncStatus) {
            case 'synced':
                return 'Synced';
            case 'syncing':
                return 'Syncing...';
            case 'offline':
                return 'Offline';
            case 'error':
                return 'Sync error';
        }
    };

    return (
        <div
            className={cn(
                "flex items-center justify-between px-3 py-1.5 text-xs",
                "bg-surface border-t border-border/40 text-muted-foreground",
                "select-none",
                className
            )}
        >
            {/* Left side - Document info */}
            <div className="flex items-center gap-4">
                {fileName && (
                    <div className="flex items-center gap-1.5">
                        <FileText size={12} />
                        <span className={cn(isDirty && "text-foreground")}>
                            {fileName}
                            {isDirty && <span className="text-primary ml-1">*</span>}
                        </span>
                    </div>
                )}
            </div>

            {/* Center - Statistics */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5" title="Word count">
                    <Type size={12} />
                    <span>{stats.wordCount.toLocaleString()} words</span>
                </div>
                <div className="flex items-center gap-1.5" title="Character count">
                    <span>{stats.charCount.toLocaleString()} chars</span>
                </div>
                <div className="flex items-center gap-1.5" title="Line count">
                    <span>{stats.lineCount.toLocaleString()} lines</span>
                </div>
                <div className="flex items-center gap-1.5" title="Estimated reading time">
                    <Clock size={12} />
                    <span>{stats.readingTimeMinutes} min read</span>
                </div>
            </div>

            {/* Right side - Status indicators */}
            <div className="flex items-center gap-3">
                {/* Recording indicator */}
                <div
                    className={cn(
                        "flex items-center gap-1.5",
                        isRecording ? "text-red-500" : "text-muted-foreground"
                    )}
                    title={isRecording ? "Recording" : "Not recording"}
                >
                    {isRecording ? (
                        <>
                            <Mic size={12} className="animate-pulse" />
                            <span>Recording</span>
                        </>
                    ) : (
                        <MicOff size={12} />
                    )}
                </div>

                {/* CRDT Sync status */}
                <SyncStatusIndicator showLabel />

                {/* File sync status */}
                <div
                    className="flex items-center gap-1.5"
                    title={getSyncLabel()}
                >
                    {getSyncIcon()}
                    <span>{getSyncLabel()}</span>
                </div>
            </div>
        </div>
    );
}
