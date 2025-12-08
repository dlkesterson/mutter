import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { StateField, Range } from '@codemirror/state';

// Track cursor position
export const cursorPosField = StateField.define<number>({
    create(state) {
        return state.selection.main.head;
    },
    update(value, tr) {
        if (tr.selection) {
            return tr.selection.main.head;
        }
        return value;
    },
});

// Live preview plugin - hides markdown syntax when cursor is not inside
export const livePreviewPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.selectionSet || update.viewportChanged) {
                this.decorations = this.buildDecorations(update.view);
            }
        }

        buildDecorations(view: EditorView): DecorationSet {
            const decorations: Range<Decoration>[] = [];
            const cursorPos = view.state.field(cursorPosField);
            const doc = view.state.doc;

            for (let { from, to } of view.visibleRanges) {
                const text = doc.sliceString(from, to);
                let pos = from;

                // Bold: **text**
                const boldRegex = /\*\*([^*]+)\*\*/g;
                let match;
                while ((match = boldRegex.exec(text)) !== null) {
                    const start = pos + match.index;
                    const end = start + match[0].length;

                    // Only hide syntax if cursor is not in this range
                    if (cursorPos < start || cursorPos > end) {
                        // Hide opening **
                        decorations.push(
                            Decoration.replace({}).range(start, start + 2)
                        );
                        // Style the content
                        decorations.push(
                            Decoration.mark({ class: 'cm-bold' }).range(start + 2, end - 2)
                        );
                        // Hide closing **
                        decorations.push(
                            Decoration.replace({}).range(end - 2, end)
                        );
                    }
                }

                // Italic: *text*
                const italicRegex = /(?<!\*)\*([^*]+)\*(?!\*)/g;
                while ((match = italicRegex.exec(text)) !== null) {
                    const start = pos + match.index;
                    const end = start + match[0].length;

                    if (cursorPos < start || cursorPos > end) {
                        decorations.push(
                            Decoration.replace({}).range(start, start + 1)
                        );
                        decorations.push(
                            Decoration.mark({ class: 'cm-italic' }).range(start + 1, end - 1)
                        );
                        decorations.push(
                            Decoration.replace({}).range(end - 1, end)
                        );
                    }
                }

                // Headers: # text
                const lines = text.split('\n');
                let linePos = pos;
                for (const line of lines) {
                    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
                    if (headerMatch) {
                        const start = linePos;
                        const hashEnd = start + headerMatch[1].length + 1;
                        const lineEnd = start + line.length;

                        if (cursorPos < start || cursorPos > lineEnd) {
                            // Hide the # symbols and space
                            decorations.push(
                                Decoration.replace({}).range(start, hashEnd)
                            );
                            // Style the header text
                            const level = headerMatch[1].length;
                            decorations.push(
                                Decoration.mark({
                                    class: `cm-heading cm-heading-${level}`
                                }).range(hashEnd, lineEnd)
                            );
                        }
                    }
                    linePos += line.length + 1; // +1 for newline
                }

                // Links: [text](url)
                const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
                while ((match = linkRegex.exec(text)) !== null) {
                    const start = pos + match.index;
                    const end = start + match[0].length;
                    const linkText = match[1];
                    const linkTextStart = start + 1;
                    const linkTextEnd = linkTextStart + linkText.length;

                    if (cursorPos < start || cursorPos > end) {
                        // Hide opening [
                        decorations.push(
                            Decoration.replace({}).range(start, linkTextStart)
                        );
                        // Style the link text
                        decorations.push(
                            Decoration.mark({
                                class: 'cm-link',
                                attributes: { 'data-url': match[2] }
                            }).range(linkTextStart, linkTextEnd)
                        );
                        // Hide ](url)
                        decorations.push(
                            Decoration.replace({}).range(linkTextEnd, end)
                        );
                    }
                }

                // Bullet lists: - item or * item
                pos = from;
                for (const line of text.split('\n')) {
                    const listMatch = line.match(/^(\s*)([-*])\s+(.+)$/);
                    if (listMatch) {
                        const start = pos + listMatch[1].length;
                        const bulletEnd = start + 2; // bullet + space
                        const lineEnd = pos + line.length;

                        if (cursorPos < start || cursorPos > lineEnd) {
                            // Style bullet with marker
                            decorations.push(
                                Decoration.mark({
                                    class: 'cm-list-marker'
                                }).range(start, bulletEnd)
                            );
                            // Style list item
                            decorations.push(
                                Decoration.mark({
                                    class: 'cm-list-item'
                                }).range(bulletEnd, lineEnd)
                            );
                        }
                    }
                    pos += line.length + 1;
                }
            }

            return Decoration.set(decorations, true);
        }
    },
    {
        decorations: (v) => v.decorations,
    }
).extension;

// Ensure cursor tracking field is included
export const livePreviewExtension = [cursorPosField, livePreviewPlugin];
