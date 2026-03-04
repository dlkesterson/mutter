/**
 * Typed Event Bus for Mutter
 *
 * Provides compile-time safety for CustomEvent dispatch and listeners.
 * All mutter: events should be defined in MutterEventMap.
 */

import { useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Event Map – every mutter:* event name → its payload type
// ---------------------------------------------------------------------------

export interface MutterEventMap {
	'mutter:create-note': undefined;
	'mutter:execute-command': { command: string; args?: unknown; [key: string]: unknown };
	'mutter:open-dialog': { dialog: string; [key: string]: unknown };
	'mutter:open-settings': undefined;
	'mutter:scroll-to-line': { line: number; from?: number };
	'mutter:apply-text-cleanup': {
		cleanedText: string;
		range: { from: number; to: number } | null;
	};
	'mutter:reveal-in-explorer': { path: string };
	'mutter:navigate-wikilink': {
		target: string;
		blockId: string | null;
		newTab?: boolean;
	};
	'mutter:navigate-history': { path: string; direction: string };
	'mutter:voice-settings-changed': undefined;
	'mutter:transcription-result': { text: string };
	'mutter:toggle-minimap': { enabled: boolean };
	'mutter:update-editor-font-size': { size: string };
}

// ---------------------------------------------------------------------------
// Typed dispatch helper
// ---------------------------------------------------------------------------

/**
 * Dispatch a typed mutter event on `window`.
 *
 * Usage:
 * ```ts
 * emitMutterEvent('mutter:scroll-to-line', { line: 42 });
 * emitMutterEvent('mutter:create-note');
 * ```
 */
export function emitMutterEvent<K extends keyof MutterEventMap>(
	...args: MutterEventMap[K] extends undefined
		? [name: K]
		: [name: K, detail: MutterEventMap[K]]
): void {
	const [name, detail] = args as [K, MutterEventMap[K]?];
	window.dispatchEvent(
		new CustomEvent(name, detail !== undefined ? { detail } : undefined),
	);
}

// ---------------------------------------------------------------------------
// Typed listener hook
// ---------------------------------------------------------------------------

type Handler<K extends keyof MutterEventMap> = MutterEventMap[K] extends undefined
	? () => void
	: (detail: MutterEventMap[K]) => void;

/**
 * Subscribe to a typed mutter event for the lifetime of the component.
 *
 * Usage:
 * ```ts
 * useMutterEvent('mutter:scroll-to-line', ({ line }) => {
 *   scrollTo(line);
 * });
 * ```
 */
export function useMutterEvent<K extends keyof MutterEventMap>(
	name: K,
	handler: Handler<K>,
	deps: React.DependencyList = [],
): void {
	const handlerRef = useRef(handler);
	handlerRef.current = handler;

	useEffect(() => {
		const listener = (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (detail !== undefined) {
				(handlerRef.current as (d: MutterEventMap[K]) => void)(detail);
			} else {
				(handlerRef.current as () => void)();
			}
		};

		window.addEventListener(name, listener);
		return () => window.removeEventListener(name, listener);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [name, ...deps]);
}
