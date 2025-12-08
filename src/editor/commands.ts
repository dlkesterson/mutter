import { EditorView } from '@codemirror/view';
import { undo, redo } from '@codemirror/commands';

export interface CommandAction {
    Format?: FormatType;
    Editor?: EditorAction;
    System?: SystemAction;
}

export interface FormatType {
    Bold?: boolean;
    Italic?: boolean;
    Strikethrough?: boolean;
    Code?: boolean;
    Heading?: { level: number };
    Quote?: boolean;
    BulletList?: boolean;
    NumberedList?: boolean;
    Checkbox?: boolean;
    Link?: boolean;
}

export interface EditorAction {
    Undo?: boolean;
    Redo?: boolean;
    NewLine?: boolean;
    Delete?: boolean;
    SelectAll?: boolean;
}

export interface SystemAction {
    CreateNote?: { name: string };
    OpenNote?: { name: string };
    Search?: { query: string };
    SaveNote?: boolean;
}

export function executeCommand(view: EditorView, action: CommandAction): boolean {
    if (action.Format) {
        return executeFormatCommand(view, action.Format);
    } else if (action.Editor) {
        return executeEditorCommand(view, action.Editor);
    } else if (action.System) {
        // System commands need to be handled by the parent component
        return false;
    }
    return false;
}

function executeFormatCommand(view: EditorView, format: FormatType): boolean {
    const { state } = view;
    const { from, to } = state.selection.main;

    if (format.Bold !== undefined) {
        const selectedText = state.doc.sliceString(from, to);
        view.dispatch({
            changes: { from, to, insert: `**${selectedText}**` },
            selection: { anchor: from + 2, head: to + 2 }
        });
        return true;
    }

    if (format.Italic !== undefined) {
        const selectedText = state.doc.sliceString(from, to);
        view.dispatch({
            changes: { from, to, insert: `*${selectedText}*` },
            selection: { anchor: from + 1, head: to + 1 }
        });
        return true;
    }

    if (format.Heading) {
        const level = format.Heading.level;
        const lineStart = state.doc.lineAt(from).from;
        const lineEnd = state.doc.lineAt(from).to;
        const lineText = state.doc.sliceString(lineStart, lineEnd);

        // Remove existing heading markers if any
        const cleanText = lineText.replace(/^#{1,6}\s+/, '');
        const headingPrefix = '#'.repeat(level) + ' ';

        view.dispatch({
            changes: { from: lineStart, to: lineEnd, insert: headingPrefix + cleanText },
            selection: { anchor: from }
        });
        return true;
    }

    if (format.Quote !== undefined) {
        const lineStart = state.doc.lineAt(from).from;
        const lineEnd = state.doc.lineAt(from).to;
        const lineText = state.doc.sliceString(lineStart, lineEnd);

        view.dispatch({
            changes: { from: lineStart, to: lineEnd, insert: `> ${lineText}` }
        });
        return true;
    }

    if (format.BulletList !== undefined) {
        const lineStart = state.doc.lineAt(from).from;
        const lineEnd = state.doc.lineAt(from).to;
        const lineText = state.doc.sliceString(lineStart, lineEnd);

        view.dispatch({
            changes: { from: lineStart, to: lineEnd, insert: `- ${lineText}` }
        });
        return true;
    }

    if (format.NumberedList !== undefined) {
        const lineStart = state.doc.lineAt(from).from;
        const lineEnd = state.doc.lineAt(from).to;
        const lineText = state.doc.sliceString(lineStart, lineEnd);

        view.dispatch({
            changes: { from: lineStart, to: lineEnd, insert: `1. ${lineText}` }
        });
        return true;
    }

    return false;
}

function executeEditorCommand(view: EditorView, action: EditorAction): boolean {
    if (action.Undo !== undefined) {
        return undo(view);
    }

    if (action.Redo !== undefined) {
        return redo(view);
    }

    if (action.NewLine !== undefined) {
        const { from } = view.state.selection.main;
        view.dispatch({
            changes: { from, insert: '\n' },
            selection: { anchor: from + 1 }
        });
        return true;
    }

    if (action.Delete !== undefined) {
        const { from, to } = view.state.selection.main;
        if (from !== to) {
            view.dispatch({
                changes: { from, to }
            });
        }
        return true;
    }

    if (action.SelectAll !== undefined) {
        view.dispatch({
            selection: { anchor: 0, head: view.state.doc.length }
        });
        return true;
    }

    return false;
}
