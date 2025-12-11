import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// Define syntax highlighting using a One Dark-inspired palette
export const syntaxHighlightingTheme = HighlightStyle.define([
    { tag: t.heading, fontWeight: 'bold', color: 'hsl(var(--foreground))' },
    { tag: t.heading1, fontSize: '2em' },
    { tag: t.heading2, fontSize: '1.6em' },
    { tag: t.heading3, fontSize: '1.4em' },
    { tag: t.link, color: 'hsl(var(--primary))', textDecoration: 'underline' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.emphasis, fontStyle: 'italic' },
    
    // Code syntax highlighting
    { tag: t.keyword, color: '#c678dd' }, // Purple
    { tag: t.operator, color: '#56b6c2' }, // Cyan
    { tag: t.special(t.variableName), color: '#e06c75' }, // Red
    { tag: t.typeName, color: '#e5c07b' }, // Yellow
    { tag: t.atom, color: '#d19a66' }, // Orange
    { tag: t.bool, color: '#d19a66' }, // Orange
    { tag: t.url, color: '#56b6c2' }, // Cyan
    { tag: t.labelName, color: '#e06c75' }, // Red
    { tag: t.inserted, color: '#98c379' }, // Green
    { tag: t.deleted, color: '#e06c75' }, // Red
    { tag: t.literal, color: '#56b6c2' }, // Cyan
    { tag: t.string, color: '#98c379' }, // Green
    { tag: t.number, color: '#d19a66' }, // Orange
    { tag: t.variableName, color: '#e06c75' }, // Red
    { tag: t.function(t.variableName), color: '#61afef' }, // Blue
    { tag: t.function(t.propertyName), color: '#61afef' }, // Blue
    { tag: t.comment, color: '#7f848e', fontStyle: 'italic' }, // Grey
    { tag: t.meta, color: '#7f848e' },
    { tag: t.processingInstruction, color: '#7f848e' },
    { tag: t.punctuation, color: '#abb2bf' }, // Light Grey
    { tag: t.bracket, color: '#abb2bf' },
]);

export const editorTheme = EditorView.theme({
    '&': {
        backgroundColor: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
        height: '100%',
        fontSize: '1.125rem', // text-lg
    },
    '.cm-content': {
        caretColor: 'hsl(var(--primary))',
        fontFamily: 'var(--font-mono)',
        padding: '4rem 2rem', // More vertical padding, less horizontal
        maxWidth: '800px', // Slightly narrower for better readability
        margin: '0 auto',
        textDecoration: 'none !important',
        lineHeight: '1.75', // Improved line height
    },
    // Global reset for CodeMirror content to prevent unwanted underlines
    '.cm-content *': {
        textDecoration: 'none',
        borderBottom: 'none',
    },
    '.cm-cursor': {
        borderLeftColor: 'hsl(var(--primary))',
        borderLeftWidth: '2px',
    },
    '.cm-selectionBackground': {
        backgroundColor: 'hsl(var(--muted)) !important',
    },
    '&.cm-focused .cm-selectionBackground': {
        backgroundColor: 'hsl(var(--muted)) !important',
    },
    '.cm-activeLine': {
        backgroundColor: 'transparent',
    },
    '.cm-gutters': {
        backgroundColor: 'transparent',
        color: 'hsl(var(--muted-foreground))',
        border: 'none',
    },
    '.cm-activeLineGutter': {
        backgroundColor: 'transparent',
        color: 'hsl(var(--primary))',
        fontWeight: 'bold',
    },
    // Force no text decoration by default to prevent glitches
    '.cm-line': {
        textDecoration: 'none',
        borderBottom: 'none',
    },
    // Live Preview Styles
    '.cm-bold': {
        fontWeight: 'bold',
        color: 'hsl(var(--foreground))',
    },
    '.cm-italic': {
        fontStyle: 'italic',
        color: 'hsl(var(--foreground))',
    },
    '.cm-heading, .cm-header': {
        fontWeight: 'bold',
        lineHeight: '1.4',
        color: 'hsl(var(--foreground))',
        textDecoration: 'none !important',
        borderBottom: 'none !important',
        backgroundImage: 'none !important',
        boxShadow: 'none !important',
    },
    '.cm-heading-1': {
        fontSize: '2em',
    },
    '.cm-heading-2': {
        fontSize: '1.6em',
    },
    '.cm-heading-3': {
        fontSize: '1.4em',
    },
    '.cm-link': {
        color: 'hsl(var(--primary))',
        textDecoration: 'underline !important',
        cursor: 'pointer',
    },
    '.cm-heading .cm-link, .cm-heading.cm-link': {
        textDecoration: 'none !important',
    },
    '.cm-list-marker': {
        color: 'hsl(var(--muted-foreground))',
    },
    '.cm-list-item': {
        paddingLeft: '4px',
    },
    '.cm-inline-code': {
        fontFamily: 'var(--font-mono)',
        backgroundColor: 'hsl(var(--muted))',
        padding: '0.2em 0.4em',
        borderRadius: '4px',
        fontSize: '0.9em',
    },
    '.cm-image': {
        maxWidth: '100%',
        borderRadius: '8px',
        marginTop: '1em',
        marginBottom: '1em',
    },
    '.cm-checkbox': {
        marginRight: '0.5em',
        cursor: 'pointer',
        verticalAlign: 'middle',
        accentColor: 'hsl(var(--primary))',
    },
    '.cm-hr': {
        border: 'none',
        borderTop: '2px solid hsl(var(--muted))',
        margin: '2em 0',
    },
});

export const editorThemeExtension = [
    editorTheme,
    syntaxHighlighting(syntaxHighlightingTheme)
];
