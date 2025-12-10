import { EditorView } from '@codemirror/view';

export const editorTheme = EditorView.theme({
    '&': {
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
        height: '100%',
        fontSize: '1.125rem', // text-lg
    },
    '.cm-content': {
        caretColor: 'var(--primary)',
        fontFamily: 'var(--font-mono)',
        padding: '4rem', // p-16
        maxWidth: '900px',
        margin: '0 auto',
        textDecoration: 'none !important',
    },
    // Global reset for CodeMirror content to prevent unwanted underlines
    '.cm-content *': {
        textDecoration: 'none',
        borderBottom: 'none',
    },
    '.cm-cursor': {
        borderLeftColor: 'var(--primary)',
        borderLeftWidth: '2px',
    },
    '.cm-selectionBackground': {
        backgroundColor: 'var(--muted) !important',
    },
    '&.cm-focused .cm-selectionBackground': {
        backgroundColor: 'var(--muted) !important',
    },
    '.cm-activeLine': {
        backgroundColor: 'transparent',
    },
    '.cm-gutters': {
        backgroundColor: 'transparent',
        color: 'var(--muted-foreground)',
        border: 'none',
    },
    '.cm-activeLineGutter': {
        backgroundColor: 'transparent',
        color: 'var(--primary)',
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
        color: 'var(--foreground)',
    },
    '.cm-italic': {
        fontStyle: 'italic',
        color: 'var(--foreground)',
    },
    '.cm-heading, .cm-header': {
        fontWeight: 'bold',
        lineHeight: '1.4',
        color: 'var(--foreground)',
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
        color: 'var(--primary)',
        textDecoration: 'underline !important',
        cursor: 'pointer',
    },
    '.cm-heading .cm-link, .cm-heading.cm-link': {
        textDecoration: 'none !important',
    },
    '.cm-list-marker': {
        color: 'var(--muted-foreground)',
    },
    '.cm-list-item': {
        paddingLeft: '4px',
    },
    '.cm-inline-code': {
        fontFamily: 'var(--font-mono)',
        backgroundColor: 'var(--muted)',
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
        accentColor: 'var(--primary)',
    },
    '.cm-hr': {
        border: 'none',
        borderTop: '2px solid var(--muted)',
        margin: '2em 0',
    },
});
