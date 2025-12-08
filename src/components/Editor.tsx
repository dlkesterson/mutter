import { useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { livePreviewPlugin, cursorPosField } from '../editor/livePreview';
import { editorTheme } from '../editor/theme';
import { executeCommand, CommandAction } from '../editor/commands';
import './Editor.css';

interface EditorProps {
	filePath: string | null;
	audioState: 'idle' | 'listening' | 'processing' | 'executing';
}

interface ClassificationResult {
	action: {
		InsertText?: string;
		ExecuteCommand?: CommandAction;
		Ambiguous?: {
			text: string;
			possible_command: CommandAction;
		};
	};
	confidence: number;
	requires_disambiguation: boolean;
}

export default function Editor({ filePath, audioState }: EditorProps) {
	const editorRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const [content, setContent] = useState('');

	// Handle transcription results
	useEffect(() => {
		const handleTranscription = async (text: string) => {
			if (!viewRef.current) return;

			try {
				const hasSelection =
					viewRef.current.state.selection.main.from !==
					viewRef.current.state.selection.main.to;

				const result: ClassificationResult = await invoke(
					'classify_text',
					{
						text,
						hasSelection,
					}
				);

				if (result.action.ExecuteCommand) {
					executeCommand(
						viewRef.current,
						result.action.ExecuteCommand
					);
				} else if (result.action.InsertText) {
					const { from } = viewRef.current.state.selection.main;
					viewRef.current.dispatch({
						changes: { from, insert: result.action.InsertText },
					});
				} else if (result.action.Ambiguous) {
					// TODO: Show disambiguation UI
					console.log('Ambiguous command:', result.action.Ambiguous);
					// For now, insert as text
					const { from } = viewRef.current.state.selection.main;
					viewRef.current.dispatch({
						changes: { from, insert: result.action.Ambiguous.text },
					});
				}
			} catch (error) {
				console.error('Error handling transcription:', error);
			}
		};

		// Expose function globally for AudioControl to call
		(window as any).handleTranscription = handleTranscription;

		return () => {
			delete (window as any).handleTranscription;
		};
	}, []);

	useEffect(() => {
		if (!editorRef.current) return;

		const state = EditorState.create({
			doc: content,
			extensions: [
				basicSetup,
				markdown(),
				editorTheme,
				cursorPosField,
				livePreviewPlugin,
				EditorView.updateListener.of((update) => {
					if (update.docChanged) {
						const newContent = update.state.doc.toString();
						setContent(newContent);
					}
				}),
			],
		});

		viewRef.current = new EditorView({
			state,
			parent: editorRef.current,
		});

		return () => {
			viewRef.current?.destroy();
			viewRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (!filePath) return;

		readTextFile(filePath)
			.then((text) => {
				setContent(text);
				if (viewRef.current) {
					viewRef.current.dispatch({
						changes: {
							from: 0,
							to: viewRef.current.state.doc.length,
							insert: text,
						},
					});
				}
			})
			.catch(console.error);
	}, [filePath]);

	useEffect(() => {
		if (!filePath || !content) return;

		const timer = setTimeout(() => {
			writeTextFile(filePath, content).catch(console.error);
		}, 500);

		return () => clearTimeout(timer);
	}, [content, filePath]);

	return (
		<div className='editor-container'>
			<div className={`editor-wrapper audio-${audioState}`}>
				<div ref={editorRef} className='editor' />
			</div>
			{audioState !== 'idle' && (
				<div className='audio-status'>
					{audioState === 'listening' && (
						<span className='status-pulse'>● Listening...</span>
					)}
					{audioState === 'processing' && (
						<span className='status-spinner'>⟳ Processing...</span>
					)}
					{audioState === 'executing' && (
						<span className='status-success'>✓ Executing</span>
					)}
				</div>
			)}
		</div>
	);
}
