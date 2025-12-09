import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';

// StateEffect to set ghost text
export const setGhostText = StateEffect.define<string>();

// StateEffect to clear ghost text
export const clearGhostText = StateEffect.define<void>();

// StateField to track ghost text
const ghostTextField = StateField.define<{ text: string; pos: number } | null>({
    create() {
        return null;
    },
    update(ghost, tr) {
        // Handle effects
        for (const effect of tr.effects) {
            if (effect.is(setGhostText)) {
                return {
                    text: effect.value,
                    pos: tr.state.selection.main.head,
                };
            }
            if (effect.is(clearGhostText)) {
                return null;
            }
        }

        // Update position on document changes
        if (ghost && tr.docChanged) {
            return {
                text: ghost.text,
                pos: tr.changes.mapPos(ghost.pos),
            };
        }

        // Clear if selection changes (user moved cursor)
        if (ghost && tr.selection && tr.selection.main.head !== ghost.pos) {
            return null;
        }

        return ghost;
    },
    provide: (f) =>
        EditorView.decorations.from(f, (ghost) => {
            if (!ghost) return Decoration.none;

            const deco = Decoration.widget({
                widget: new GhostTextWidget(ghost.text),
                side: 1,
            });

            return Decoration.set([deco.range(ghost.pos)]);
        }),
});

// Widget to render ghost text
class GhostTextWidget extends WidgetType {
    constructor(readonly text: string) {
        super();
    }

    eq(other: GhostTextWidget) {
        return other.text === this.text;
    }

    toDOM() {
        const span = document.createElement('span');
        span.className = 'cm-ghost-text';
        span.textContent = this.text;
        return span;
    }

    ignoreEvent() {
        return false;
    }
}

// Export the complete extension
export const ghostTextExtension = [ghostTextField];
