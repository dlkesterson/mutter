import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { StateField, Range } from '@codemirror/state';

class ImageWidget extends WidgetType {
    constructor(readonly url: string, readonly alt: string) { super() }

    toDOM() {
        const img = document.createElement("img");
        img.src = this.url;
        img.alt = this.alt;
        img.className = "cm-image";
        return img;
    }
}

class CheckboxWidget extends WidgetType {
    constructor(readonly checked: boolean) { super() }

    toDOM() {
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = this.checked;
        input.className = "cm-checkbox";
        return input;
    }
}

class HorizontalRuleWidget extends WidgetType {
    toDOM() {
        const hr = document.createElement("hr");
        hr.className = "cm-hr";
        return hr;
    }
}

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
        view: EditorView;
        private boundHandleClick: (e: MouseEvent) => void;
        private boundHandleMousedown: (e: MouseEvent) => void;

        constructor(view: EditorView) {
            this.view = view;
            this.decorations = this.buildDecorations(view);

            // Bind handlers
            this.boundHandleClick = this.handleClick.bind(this);
            this.boundHandleMousedown = this.handleMousedown.bind(this);

            // Add click handler for links and checkboxes
            view.dom.addEventListener('click', this.boundHandleClick);

            // Add pointerdown handler in capture phase for wiki links
            // CodeMirror 6 uses pointer events internally, so we need to intercept those
            view.dom.addEventListener('pointerdown', this.boundHandleMousedown, true);
        }

        destroy() {
            this.view.dom.removeEventListener('click', this.boundHandleClick);
            this.view.dom.removeEventListener('pointerdown', this.boundHandleMousedown, true);
        }

        /**
         * Handle pointerdown on wiki links - intercepts before CodeMirror places cursor
         * Ctrl/Cmd+click opens in new tab, regular click navigates current tab
         */
        handleMousedown(e: PointerEvent | MouseEvent) {
            const target = e.target as HTMLElement;

            // Find wiki link element (direct or via closest for nested elements)
            const wikiLinkElement = target.classList.contains('cm-wikilink')
                ? target
                : target.closest('.cm-wikilink') as HTMLElement | null;

            if (wikiLinkElement) {
                const linkTarget = wikiLinkElement.getAttribute('data-target');
                const blockId = wikiLinkElement.getAttribute('data-block-id') || null;

                if (linkTarget) {
                    // Prevent CodeMirror from placing cursor
                    e.preventDefault();
                    e.stopPropagation();

                    // Ctrl+click (or Cmd+click on Mac) opens in new tab
                    const newTab = e.ctrlKey || e.metaKey;

                    // Dispatch custom event for the Editor to handle navigation
                    window.dispatchEvent(new CustomEvent('mutter:navigate-wikilink', {
                        detail: { target: linkTarget, blockId, newTab }
                    }));
                }
            }
        }

        handleClick(e: MouseEvent) {
            const target = e.target as HTMLElement;

            // Check if we clicked on a checkbox
            if (target.classList.contains('cm-checkbox')) {
                const pos = this.view.posAtDOM(target);
                const line = this.view.state.doc.lineAt(pos);
                const match = line.text.match(/^(\s*)- \[(x| )\] /);
                if (match) {
                    const checked = match[2] === 'x';
                    const charPos = line.from + match[1].length + 3;

                    this.view.dispatch({
                        changes: { from: charPos, to: charPos + 1, insert: checked ? ' ' : 'x' }
                    });
                    return;
                }
            }

            // Check if we clicked on a link
            if (target.classList.contains('cm-link')) {
                const url = target.getAttribute('data-url');
                if (url) {
                    e.preventDefault();
                    // Open URL in default browser using window.open as fallback
                    if (url.startsWith('http://') || url.startsWith('https://')) {
                        window.open(url, '_blank', 'noopener,noreferrer');
                    } else {
                        console.warn('Only http/https URLs are supported:', url);
                    }
                }
            }
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
                let pos = from;
                while (pos <= to) {
                    const line = doc.lineAt(pos);
                    const text = line.text;
                    const lineStart = line.from;
                    const lineEnd = line.to;

                    // --- Block Level Elements ---

                    // Headers
                    const headerMatch = text.match(/^(#{1,6})\s+(.+)$/);
                    if (headerMatch) {
                        const start = lineStart;
                        const hashEnd = start + headerMatch[1].length + 1;
                        const level = headerMatch[1].length;

                        if (cursorPos < start || cursorPos > lineEnd) {
                            decorations.push(Decoration.replace({}).range(start, hashEnd));
                            decorations.push(Decoration.mark({ class: `cm-heading cm-heading-${level}` }).range(hashEnd, lineEnd));
                        } else {
                            // When editing, keep the hash visible but apply the heading style to the whole line
                            decorations.push(Decoration.mark({ class: `cm-heading cm-heading-${level}` }).range(start, lineEnd));
                        }
                    }

                    // Horizontal Rule
                    if (text === '---' || text === '***' || text === '___') {
                        if (cursorPos < lineStart || cursorPos > lineEnd) {
                            decorations.push(Decoration.replace({ widget: new HorizontalRuleWidget() }).range(lineStart, lineEnd));
                        }
                    }

                    // Task Lists
                    const taskMatch = text.match(/^(\s*)- \[(x| )\] /);
                    if (taskMatch) {
                        const start = lineStart + taskMatch[1].length;
                        const end = start + 6;
                        const checked = taskMatch[2] === 'x';
                        if (cursorPos < start || cursorPos > end) {
                            decorations.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(start, end));
                        }
                    }
                    // Bullet Lists (only if not a task list)
                    else {
                        const listMatch = text.match(/^(\s*)([-*])\s+(.+)$/);
                        if (listMatch) {
                            const start = lineStart + listMatch[1].length;
                            const bulletEnd = start + 2;
                            if (cursorPos < start || cursorPos > lineEnd) {
                                decorations.push(Decoration.mark({ class: 'cm-list-marker' }).range(start, bulletEnd));
                                decorations.push(Decoration.mark({ class: 'cm-list-item' }).range(bulletEnd, lineEnd));
                            }
                        }
                    }

                    // --- Inline Elements (Processed per line to avoid multi-line glitches) ---

                    // Bold
                    const boldRegex = /\*\*([^*\n]+)\*\*/g;
                    let match;
                    while ((match = boldRegex.exec(text)) !== null) {
                        const start = lineStart + match.index;
                        const end = start + match[0].length;
                        if (cursorPos < start || cursorPos > end) {
                            decorations.push(Decoration.replace({}).range(start, start + 2));
                            decorations.push(Decoration.mark({ class: 'cm-bold' }).range(start + 2, end - 2));
                            decorations.push(Decoration.replace({}).range(end - 2, end));
                        }
                    }

                    // Italic
                    const italicRegex = /(?<!\*)\*(?!\s)([^*\n]+)\*(?!\*)/g;
                    while ((match = italicRegex.exec(text)) !== null) {
                        const start = lineStart + match.index;
                        const end = start + match[0].length;
                        if (cursorPos < start || cursorPos > end) {
                            decorations.push(Decoration.replace({}).range(start, start + 1));
                            decorations.push(Decoration.mark({ class: 'cm-italic' }).range(start + 1, end - 1));
                            decorations.push(Decoration.replace({}).range(end - 1, end));
                        }
                    }

                    // Links
                    const linkRegex = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;
                    while ((match = linkRegex.exec(text)) !== null) {
                        const start = lineStart + match.index;
                        const end = start + match[0].length;
                        const linkText = match[1];
                        const linkTextStart = start + 1;
                        const linkTextEnd = linkTextStart + linkText.length;
                        if (cursorPos < start || cursorPos > end) {
                            decorations.push(Decoration.replace({}).range(start, linkTextStart));
                            decorations.push(Decoration.mark({ class: 'cm-link', attributes: { 'data-url': match[2] } }).range(linkTextStart, linkTextEnd));
                            decorations.push(Decoration.replace({}).range(linkTextEnd, end));
                        }
                    }

                    // Images
                    const imageRegex = /!\[([^\]\n]*)\]\(([^)\n]+)\)/g;
                    while ((match = imageRegex.exec(text)) !== null) {
                        const start = lineStart + match.index;
                        const end = start + match[0].length;
                        if (cursorPos < start || cursorPos > end) {
                            decorations.push(Decoration.replace({ widget: new ImageWidget(match[2], match[1]) }).range(start, end));
                        }
                    }

                    // Inline Code
                    const inlineCodeRegex = /`([^`\n]+)`/g;
                    while ((match = inlineCodeRegex.exec(text)) !== null) {
                        const start = lineStart + match.index;
                        const end = start + match[0].length;
                        if (cursorPos < start || cursorPos > end) {
                            decorations.push(Decoration.replace({}).range(start, start + 1));
                            decorations.push(Decoration.mark({ class: 'cm-inline-code' }).range(start + 1, end - 1));
                            decorations.push(Decoration.replace({}).range(end - 1, end));
                        }
                    }

                    // Wiki Links: [[Note Name]] or [[Note Name|Alias]]
                    // Skip embeds (handled by transclusion extension)
                    const wikiLinkRegex = /(?<!!)\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;
                    while ((match = wikiLinkRegex.exec(text)) !== null) {
                        const start = lineStart + match.index;
                        const end = start + match[0].length;
                        const target = match[1]; // Note name
                        const blockId = match[2] || ''; // Optional block ID
                        const alias = match[3]; // Optional alias

                        if (cursorPos < start || cursorPos > end) {
                            // Hide [[ at start
                            decorations.push(Decoration.replace({}).range(start, start + 2));

                            // The display text position depends on whether there's an alias
                            const displayStart = start + 2;
                            const displayEnd = alias
                                ? end - 2  // Before ]]
                                : start + 2 + target.length + (blockId ? 1 + blockId.length : 0); // target + optional #blockId

                            // Mark the visible text as a wiki link with target data
                            decorations.push(Decoration.mark({
                                class: 'cm-wikilink',
                                attributes: {
                                    'data-target': target,
                                    'data-block-id': blockId,
                                }
                            }).range(displayStart, displayEnd));

                            // Hide everything after display text (including | and ]])
                            if (displayEnd < end) {
                                decorations.push(Decoration.replace({}).range(displayEnd, end));
                            }
                        }
                    }

                    pos = line.to + 1;
                }
            }

            return Decoration.set(decorations.sort((a, b) => a.from - b.from), true);
        }
    },
    {
        decorations: (v) => v.decorations,
    }
).extension;

// Ensure cursor tracking field is included
export const livePreviewExtension = [cursorPosField, livePreviewPlugin];
