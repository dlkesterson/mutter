import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';

// Auto-close pairs for markdown
const autoClosePairs: Record<string, string> = {
    '*': '*', // For bold/italic
    '[': ']', // For links
    '(': ')', // For link URLs
    '{': '}', // For code blocks
    '"': '"', // For quotes
    "'": "'", // For quotes
    '`': '`', // For inline code
};

// Characters that should close automatically when typed after
const shouldAutoClose = (state: EditorState, pos: number, char: string): boolean => {
    // Don't auto-close if the next character is the same (already closed)
    const nextChar = state.doc.sliceString(pos, pos + 1);
    if (nextChar === char) return false;

    // Don't auto-close if we're inside a word
    const beforeChar = state.doc.sliceString(pos - 1, pos);
    const afterChar = state.doc.sliceString(pos, pos + 1);
    if (/\w/.test(beforeChar) || /\w/.test(afterChar)) return false;

    return true;
};

export const markdownAutoClose = EditorView.inputHandler.of((view, from, to, text) => {
    // Only handle single character inputs
    if (text.length !== 1) return false;

    const char = text;
    const closeChar = autoClosePairs[char];

    // If this character has an auto-close pair
    if (closeChar && shouldAutoClose(view.state, to, char)) {
        // Check if we're typing the closing character of an existing pair
        const nextChar = view.state.doc.sliceString(to, to + 1);

        if (nextChar === char && char === closeChar) {
            // Skip over the existing closing character
            view.dispatch({
                selection: { anchor: to + 1 },
            });
            return true;
        }

        // Insert both opening and closing characters
        view.dispatch({
            changes: { from, to, insert: char + closeChar },
            selection: { anchor: from + 1 },
        });
        return true;
    }

    // Handle special markdown cases
    if (char === '*') {
        // Check if we're starting a bold sequence
        const beforeText = view.state.doc.sliceString(Math.max(0, from - 1), from);
        if (beforeText === '*') {
            // User typed ** - auto-complete to ****
            const nextChar = view.state.doc.sliceString(to, to + 1);
            if (nextChar !== '*') {
                view.dispatch({
                    changes: { from, to, insert: '**' },
                    selection: { anchor: from + 1 },
                });
                return true;
            }
        }
    }

    if (char === ']') {
        // After closing bracket, auto-add () for links
        const beforeText = view.state.doc.sliceString(Math.max(0, from - 20), from);
        if (/\[.+$/.test(beforeText)) {
            view.dispatch({
                changes: { from, to, insert: ']()' },
                selection: { anchor: from + 2 },
            });
            return true;
        }
    }

    return false;
});

// Handle backspace to delete pairs
export const markdownDeletePair = EditorView.inputHandler.of((view, from, to, text) => {
    if (text !== '' || from !== to - 1) return false;

    const beforeChar = view.state.doc.sliceString(from - 1, from);
    const afterChar = view.state.doc.sliceString(from, from + 1);

    // If we're deleting an opening character and the next is its closing pair
    if (autoClosePairs[beforeChar] === afterChar) {
        view.dispatch({
            changes: [
                { from: from - 1, to: from },
                { from, to: from + 1 },
            ],
        });
        return true;
    }

    return false;
});

export const markdownAutoPairExtension = [markdownAutoClose, markdownDeletePair];
