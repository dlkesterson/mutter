/**
 * Navigation History Hook
 *
 * Manages back/forward navigation history for tabs,
 * similar to browser history or Obsidian's per-pane navigation.
 */

import { useState, useCallback, useEffect } from 'react';
import { emitMutterEvent } from '../events';

interface NavigationHistoryOptions {
    maxHistorySize?: number;
}

export function useNavigationHistory(options: NavigationHistoryOptions = {}) {
    const { maxHistorySize = 50 } = options;

    // History is an array of file paths
    const [history, setHistory] = useState<string[]>([]);
    // Current position in history (0-indexed)
    const [historyIndex, setHistoryIndex] = useState(-1);
    // Flag to prevent recording navigation when going back/forward
    const [isNavigating, setIsNavigating] = useState(false);

    /**
     * Record a new navigation to a file
     * This should be called when the user opens a file (not when using back/forward)
     */
    const recordNavigation = useCallback((path: string) => {
        if (isNavigating) {
            setIsNavigating(false);
            return;
        }

        setHistory(prev => {
            // If we're not at the end of history, truncate forward history
            const newHistory = historyIndex >= 0
                ? prev.slice(0, historyIndex + 1)
                : [];

            // Don't add duplicate if same as current
            if (newHistory.length > 0 && newHistory[newHistory.length - 1] === path) {
                return newHistory;
            }

            // Add new path
            const updated = [...newHistory, path];

            // Limit history size
            if (updated.length > maxHistorySize) {
                return updated.slice(updated.length - maxHistorySize);
            }

            return updated;
        });

        setHistoryIndex(_prev => {
            // Calculate new index based on truncated history + new item
            const currentHistoryLength = historyIndex >= 0 ? historyIndex + 1 : 0;
            return Math.min(currentHistoryLength, maxHistorySize - 1);
        });
    }, [historyIndex, isNavigating, maxHistorySize]);

    /**
     * Go back in history
     * Returns the path to navigate to, or null if can't go back
     */
    const goBack = useCallback((): string | null => {
        if (historyIndex <= 0) {
            return null;
        }

        setIsNavigating(true);
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        return history[newIndex];
    }, [history, historyIndex]);

    /**
     * Go forward in history
     * Returns the path to navigate to, or null if can't go forward
     */
    const goForward = useCallback((): string | null => {
        if (historyIndex >= history.length - 1) {
            return null;
        }

        setIsNavigating(true);
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        return history[newIndex];
    }, [history, historyIndex]);

    /**
     * Check if we can go back
     */
    const canGoBack = historyIndex > 0;

    /**
     * Check if we can go forward
     */
    const canGoForward = historyIndex < history.length - 1;

    /**
     * Clear all history
     */
    const clearHistory = useCallback(() => {
        setHistory([]);
        setHistoryIndex(-1);
    }, []);

    /**
     * Get current path (if any)
     */
    const currentPath = historyIndex >= 0 ? history[historyIndex] : null;

    // Handle keyboard shortcuts for back/forward
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Alt+Left for back
            if (e.altKey && e.key === 'ArrowLeft') {
                e.preventDefault();
                const path = goBack();
                if (path) {
                    emitMutterEvent('mutter:navigate-history', { path, direction: 'back' });
                }
            }
            // Alt+Right for forward
            if (e.altKey && e.key === 'ArrowRight') {
                e.preventDefault();
                const path = goForward();
                if (path) {
                    emitMutterEvent('mutter:navigate-history', { path, direction: 'forward' });
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [goBack, goForward]);

    return {
        history,
        historyIndex,
        currentPath,
        canGoBack,
        canGoForward,
        recordNavigation,
        goBack,
        goForward,
        clearHistory,
    };
}
