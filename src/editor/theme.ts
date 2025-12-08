import { EditorView } from '@codemirror/view';

export const editorTheme = EditorView.theme({
    '&': {
        backgroundColor: '#1e1e1e',
        color: '#d4d4d4',
    },
    '.cm-content': {
        caretColor: '#ffffff',
        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
    },
    '.cm-cursor': {
        borderLeftColor: '#ffffff',
        borderLeftWidth: '2px',
    },
    '.cm-selectionBackground': {
        backgroundColor: '#264f78 !important',
    },
    '&.cm-focused .cm-selectionBackground': {
        backgroundColor: '#264f78 !important',
    },
    '.cm-activeLine': {
        backgroundColor: '#2a2a2a',
    },
    '.cm-gutters': {
        backgroundColor: '#1e1e1e',
        color: '#858585',
        border: 'none',
    },
    '.cm-activeLineGutter': {
        backgroundColor: '#2a2a2a',
    },
    // Live Preview Styles
    '.cm-bold': {
        fontWeight: 'bold',
    },
    '.cm-italic': {
        fontStyle: 'italic',
    },
    '.cm-heading': {
        fontWeight: 'bold',
        lineHeight: '1.4',
    },
    '.cm-heading-1': {
        fontSize: '2em',
        color: '#4ec9b0',
    },
    '.cm-heading-2': {
        fontSize: '1.6em',
        color: '#4ec9b0',
    },
    '.cm-heading-3': {
        fontSize: '1.4em',
        color: '#4ec9b0',
    },
    '.cm-link': {
        color: '#3794ff',
        textDecoration: 'underline',
        cursor: 'pointer',
    },
    '.cm-list-marker': {
        color: '#808080',
    },
    '.cm-list-item': {
        paddingLeft: '4px',
    },
});
