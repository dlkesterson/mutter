import { EditorView } from '@codemirror/view';

export interface CommandAction {
    Format?: FormatType;
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
    Image?: boolean;
    Table?: boolean;
    CodeBlock?: boolean;
    HorizontalRule?: boolean;
}

export function executeCommand(view: EditorView, action: CommandAction): boolean {
    if (action.Format) {
        return executeFormatCommand(view, action.Format);
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

    if (format.Checkbox !== undefined) {
        const lineStart = state.doc.lineAt(from).from;
        const lineEnd = state.doc.lineAt(from).to;
        const lineText = state.doc.sliceString(lineStart, lineEnd);

        view.dispatch({
            changes: { from: lineStart, to: lineEnd, insert: `- [ ] ${lineText}` }
        });
        return true;
    }

    if (format.Link !== undefined) {
        const selectedText = state.doc.sliceString(from, to);
        view.dispatch({
            changes: { from, to, insert: `[${selectedText}](url)` },
            selection: { anchor: from + selectedText.length + 3, head: from + selectedText.length + 6 }
        });
        return true;
    }

    if (format.Image !== undefined) {
        view.dispatch({
            changes: { from, to, insert: `![alt text](url)` },
            selection: { anchor: from + 12, head: from + 15 }
        });
        return true;
    }

    if (format.Table !== undefined) {
        const tableTemplate = `
| Header 1 | Header 2 |
| -------- | -------- |
| Cell 1   | Cell 2   |
`;
        view.dispatch({
            changes: { from, to, insert: tableTemplate }
        });
        return true;
    }

    if (format.CodeBlock !== undefined) {
        const selectedText = state.doc.sliceString(from, to);
        const codeBlockTemplate = `\`\`\`
${selectedText}
\`\`\``;
        view.dispatch({
            changes: { from, to, insert: codeBlockTemplate },
            selection: { anchor: from + 3 }
        });
        return true;
    }

    if (format.Code !== undefined) {
        const selectedText = state.doc.sliceString(from, to);
        view.dispatch({
            changes: { from, to, insert: `\`${selectedText}\`` },
            selection: { anchor: from + 1, head: to + 1 }
        });
        return true;
    }

    if (format.HorizontalRule !== undefined) {
        view.dispatch({
            changes: { from, to, insert: `\n---\n` }
        });
        return true;
    }

    return false;
}
