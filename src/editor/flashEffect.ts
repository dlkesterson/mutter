import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

// Define the types of flash effects
export type FlashType = 'insert' | 'delete' | 'format';

// StateEffect for adding a flash
export const addFlash = StateEffect.define<{ from: number; to: number; type: FlashType }>();

// StateField to track active flashes with timestamps
interface Flash {
    from: number;
    to: number;
    type: FlashType;
    timestamp: number;
}

const flashField = StateField.define<Flash[]>({
    create() {
        return [];
    },
    update(flashes, tr) {
        // Add new flashes from effects
        for (const effect of tr.effects) {
            if (effect.is(addFlash)) {
                flashes = [...flashes, { ...effect.value, timestamp: Date.now() }];
            }
        }

        // Map existing flashes to new document positions
        if (tr.docChanged) {
            flashes = flashes.map((flash) => ({
                ...flash,
                from: tr.changes.mapPos(flash.from),
                to: tr.changes.mapPos(flash.to),
            }));
        }

        // Remove flashes older than 800ms OR empty ranges (collapsed by edits)
        const now = Date.now();
        flashes = flashes.filter((flash) => {
            const isRecent = now - flash.timestamp < 800;
            const isNonEmpty = flash.to > flash.from;
            return isRecent && isNonEmpty;
        });

        return flashes;
    },
});

// ViewPlugin to render flash decorations
const flashPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.state.field(flashField) !== update.startState.field(flashField)) {
                this.decorations = this.buildDecorations(update.view);
            }
        }

        buildDecorations(view: EditorView): DecorationSet {
            const flashes = view.state.field(flashField);
            const now = Date.now();

            const decorations = flashes.map((flash) => {
                const age = now - flash.timestamp;
                const opacity = Math.max(0, 1 - age / 800);

                let className: string;
                switch (flash.type) {
                    case 'insert':
                        className = 'cm-flash-insert';
                        break;
                    case 'delete':
                        className = 'cm-flash-delete';
                        break;
                    case 'format':
                        className = 'cm-flash-format';
                        break;
                }

                return Decoration.mark({
                    class: className,
                    attributes: { style: `opacity: ${opacity}` },
                }).range(flash.from, flash.to);
            });

            return Decoration.set(decorations, true);
        }
    },
    {
        decorations: (v) => v.decorations,
    }
);

// Timer to trigger updates for fade-out animation
const flashAnimator = ViewPlugin.fromClass(
    class {
        timer: number | null = null;

        constructor(readonly view: EditorView) {
            this.scheduleUpdate();
        }

        scheduleUpdate() {
            if (this.timer) clearTimeout(this.timer);

            const flashes = this.view.state.field(flashField);
            if (flashes.length > 0) {
                // Update every 50ms for smooth fade
                this.timer = window.setTimeout(() => {
                    this.view.requestMeasure();
                    this.scheduleUpdate();
                }, 50);
            }
        }

        update(update: ViewUpdate) {
            if (update.state.field(flashField) !== update.startState.field(flashField)) {
                this.scheduleUpdate();
            }
        }

        destroy() {
            if (this.timer) clearTimeout(this.timer);
        }
    }
);

// Export the complete extension
export const flashEffect = [flashField, flashPlugin, flashAnimator];
