import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorState } from '@codemirror/state';
import type { DocHandle } from '@automerge/react';
import { isValidAutomergeUrl } from '@automerge/react';
import { getCrdtRepo } from '../crdt/repo';
import { editorThemeExtension } from '../editor/theme';

type CrdtNoteDoc = {
	content?: string[];
};

function parseDocUrlFromHash(hash: string): string | null {
	if (!hash.startsWith('#/crdt')) return null;

	const queryIndex = hash.indexOf('?');
	if (queryIndex === -1) return null;

	const params = new URLSearchParams(hash.slice(queryIndex + 1));
	return params.get('doc');
}

function setHashDocUrl(docUrl: string | null) {
	if (!docUrl) {
		window.location.hash = '#/crdt';
		return;
	}
	window.location.hash = `#/crdt?doc=${encodeURIComponent(docUrl)}`;
}

function docToString(doc: CrdtNoteDoc | undefined): string {
	if (!doc?.content) return '';
	return doc.content.join('');
}

export function CrdtSpike() {
	const editorRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const handleRef = useRef<DocHandle<CrdtNoteDoc> | null>(null);
	const detachRef = useRef<null | (() => void)>(null);

	const [docUrlFromHash, setDocUrlFromHash] = useState<string | null>(() =>
		parseDocUrlFromHash(window.location.hash)
	);
	const [status, setStatus] = useState<
		| { state: 'idle' }
		| { state: 'loading'; url?: string }
		| { state: 'ready'; url: string }
		| { state: 'error'; message: string }
	>({ state: 'idle' });
	const [urlInput, setUrlInput] = useState('');

	useEffect(() => {
		const onHashChange = () => {
			setDocUrlFromHash(parseDocUrlFromHash(window.location.hash));
		};
		window.addEventListener('hashchange', onHashChange);
		return () => window.removeEventListener('hashchange', onHashChange);
	}, []);

	const repo = useMemo(() => getCrdtRepo(), []);

	useEffect(() => {
		if (!editorRef.current) return;
		if (viewRef.current) return;

		const state = EditorState.create({
			doc: '',
			extensions: [
				basicSetup,
				keymap.of([indentWithTab]),
				EditorView.lineWrapping,
				markdown({ codeLanguages: languages }),
				editorThemeExtension,
				EditorView.updateListener.of((update) => {
					if (!update.docChanged) return;
					const handle = handleRef.current;
					if (!handle?.isReady?.()) return;

					const changes: Array<{
						from: number;
						to: number;
						insert: string;
					}> = [];

					update.changes.iterChanges(
						(fromA, toA, _fromB, _toB, inserted) => {
							changes.push({
								from: fromA,
								to: toA,
								insert: inserted.toString(),
							});
						}
					);

					if (changes.length === 0) return;

					handle.change((doc) => {
						if (!doc.content) doc.content = [];

						for (let i = changes.length - 1; i >= 0; i--) {
							const { from, to, insert } = changes[i];
							const deleteCount = to - from;
							const insertChars = insert.split('');
							doc.content.splice(from, deleteCount, ...insertChars);
						}
					});
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
	}, [repo]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;

		const detach = detachRef.current;
		detach?.();
		detachRef.current = null;
		handleRef.current = null;

		if (!docUrlFromHash) {
			setStatus({ state: 'idle' });
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: '' },
			});
			return;
		}

		if (!isValidAutomergeUrl(docUrlFromHash)) {
			setStatus({ state: 'error', message: 'Invalid Automerge document URL' });
			return;
		}

		let cancelled = false;
		const docUrl = docUrlFromHash;

		const attach = async () => {
			setStatus({ state: 'loading', url: docUrl });

			try {
				const handle = await repo.find<CrdtNoteDoc>(docUrl);
				await handle.whenReady();
				if (cancelled) return;

				handleRef.current = handle;
				setStatus({ state: 'ready', url: handle.url });

				const syncEditorFromDoc = (doc: CrdtNoteDoc) => {
					const view = viewRef.current;
					if (!view) return;

					const nextText = docToString(doc);
					const currentText = view.state.doc.toString();
					if (nextText === currentText) return;

					view.dispatch({
						changes: {
							from: 0,
							to: view.state.doc.length,
							insert: nextText,
						},
					});
				};

				// Ensure a canonical shape for the doc.
				handle.change((doc) => {
					if (!doc.content) doc.content = [];
				});

				syncEditorFromDoc(handle.doc());

				const onChange = ({ doc }: { doc: any }) => {
					syncEditorFromDoc(doc as CrdtNoteDoc);
				};
				handle.on('change', onChange);

				detachRef.current = () => {
					handle.off('change', onChange);
				};
			} catch (e) {
				if (cancelled) return;
				const message = e instanceof Error ? e.message : String(e);
				setStatus({ state: 'error', message });
			}
		};

		attach();

		return () => {
			cancelled = true;
		};
	}, [docUrlFromHash, repo]);

	const currentUrl =
		status.state === 'ready' ? status.url : docUrlFromHash ?? '';

	return (
		<div className='flex h-screen w-screen flex-col bg-background text-foreground'>
			<div className='flex items-center justify-between gap-3 border-b p-3'>
				<div className='flex items-center gap-2'>
					<button
						className='rounded-md border px-2 py-1 text-sm hover:bg-accent'
						onClick={() => {
							window.location.hash = '';
						}}
					>
						Back
					</button>
					<div className='text-sm font-medium'>CRDT note spike</div>
				</div>

				<div className='text-xs text-muted-foreground'>
					{status.state === 'loading' && 'Loading…'}
					{status.state === 'idle' && 'No document selected'}
					{status.state === 'ready' && 'Ready'}
					{status.state === 'error' && 'Error'}
				</div>
			</div>

			<div className='flex flex-col gap-2 border-b p-3'>
				<div className='flex flex-wrap items-center gap-2'>
					<input
						className='min-w-[320px] flex-1 rounded-md border bg-background px-3 py-2 text-sm'
						placeholder='Paste an Automerge document URL (automerge:...)'
						value={urlInput}
						onChange={(e) => setUrlInput(e.target.value)}
					/>
					<button
						className='rounded-md border px-3 py-2 text-sm hover:bg-accent'
						onClick={() => {
							const trimmed = urlInput.trim();
							if (!trimmed) return;
							setHashDocUrl(trimmed);
						}}
					>
						Open
					</button>
					<button
						className='rounded-md border px-3 py-2 text-sm hover:bg-accent'
						onClick={() => {
							const handle = repo.create<CrdtNoteDoc>({ content: [] });
							setHashDocUrl(handle.url);
							setUrlInput(handle.url);
						}}
					>
						New doc
					</button>
					<button
						className='rounded-md border px-3 py-2 text-sm hover:bg-accent'
						onClick={async () => {
							if (!currentUrl) return;
							try {
								await navigator.clipboard.writeText(currentUrl);
							} catch {
								// ignore
							}
						}}
						disabled={!currentUrl}
					>
						Copy URL
					</button>
				</div>

				{status.state === 'error' && (
					<div className='text-sm text-destructive'>{status.message}</div>
				)}

				{currentUrl && (
					<div className='truncate font-mono text-xs text-muted-foreground'>
						{currentUrl}
					</div>
				)}

				<div className='text-xs text-muted-foreground'>
					Open this same URL in another window to see merges via
					`BroadcastChannelNetworkAdapter`.
				</div>
			</div>

			<div ref={editorRef} className='min-h-0 flex-1 overflow-auto' />
		</div>
	);
}

