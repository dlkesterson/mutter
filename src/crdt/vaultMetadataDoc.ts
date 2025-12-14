import type { DocHandle } from '@automerge/react';

export const VAULT_METADATA_SCHEMA_VERSION = 1 as const;

export type VaultNote = {
  id: string;
  rel_path: string;
  title: string;
  tags: string[];
  links: string[];
  created_at: number;
  updated_at: number;
  last_opened_at: number | null;
};

export type VaultMetadataDoc = {
  schema_version: typeof VAULT_METADATA_SCHEMA_VERSION;
  meta: {
    created_at: number;
    vault_id: string;
  };
  notes: Record<string, VaultNote>;
  note_id_by_path: Record<string, string>;
};

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function normalizePath(p: string): string {
  return p.replaceAll('\\', '/').replace(/\/+$/g, '');
}

export function toVaultRelativePath(vaultPath: string, fullPath: string): string | null {
  const vp = normalizePath(vaultPath);
  const fp = normalizePath(fullPath);
  if (fp === vp) return '';
  if (!fp.startsWith(vp + '/')) return null;
  return fp.slice(vp.length + 1);
}

function titleFromRelPath(relPath: string): string {
  const base = relPath.split('/').pop() ?? relPath;
  return base.replace(/\.md$/i, '') || 'Untitled';
}

function sanitizeTags(tags: string[]): string[] {
  const set = new Set(
    tags
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => t.toLowerCase())
  );
  return Array.from(set).sort();
}

function extractLinksFromText(text: string): string[] {
  const links = new Set<string>();
  const wiki = /\[\[([^[\]]+)\]\]/g;
  for (const m of text.matchAll(wiki)) {
    const raw = (m[1] ?? '').trim();
    if (!raw) continue;
    links.add(raw);
  }
  return Array.from(links).sort();
}

export function ensureVaultMetadataDocShape(doc: any, vaultId: string): void {
  if (doc.schema_version !== VAULT_METADATA_SCHEMA_VERSION) doc.schema_version = VAULT_METADATA_SCHEMA_VERSION;
  if (!doc.meta) doc.meta = { created_at: Date.now(), vault_id: vaultId };
  if (!doc.meta.created_at) doc.meta.created_at = Date.now();
  if (!doc.meta.vault_id) doc.meta.vault_id = vaultId;
  if (!doc.notes) doc.notes = {};
  if (!doc.note_id_by_path) doc.note_id_by_path = {};
}

export async function ensureNoteForRelPath(
  handle: DocHandle<VaultMetadataDoc>,
  relPath: string
): Promise<string> {
  const rel = relPath.trim();
  if (!rel) throw new Error('relPath cannot be empty');

  let createdId: string | null = null;
  const now = Date.now();

  handle.change((doc: any) => {
    ensureVaultMetadataDocShape(doc, doc?.meta?.vault_id ?? 'unknown');

    const existing = doc.note_id_by_path[rel];
    if (typeof existing === 'string' && existing) return;

    const id = createdId ?? (createdId = newId());
    doc.note_id_by_path[rel] = id;
    if (!doc.notes[id]) {
      doc.notes[id] = {
        id,
        rel_path: rel,
        title: titleFromRelPath(rel),
        tags: [],
        links: [],
        created_at: now,
        updated_at: now,
        last_opened_at: null,
      };
    } else {
      doc.notes[id].rel_path = rel;
      doc.notes[id].updated_at = now;
    }
  });

  // If we didn't create (because it existed), read it back.
  const doc = handle.doc();
  const id = doc.note_id_by_path[rel];
  if (!id) throw new Error('Failed to ensure note id');
  return id;
}

export function recordNoteOpened(params: {
  handle: DocHandle<VaultMetadataDoc>;
  relPath: string;
}): void {
  const rel = params.relPath.trim();
  if (!rel) return;
  const now = Date.now();

  params.handle.change((doc: any) => {
    ensureVaultMetadataDocShape(doc, doc?.meta?.vault_id ?? 'unknown');
    const id = doc.note_id_by_path[rel];
    if (!id || typeof id !== 'string') return;
    const note = doc.notes[id];
    if (!note) return;
    note.last_opened_at = now;
    note.updated_at = now;
    if (!note.title) note.title = titleFromRelPath(rel);
    note.rel_path = rel;
  });
}

export function recordNoteRenamed(params: {
  handle: DocHandle<VaultMetadataDoc>;
  oldRelPath: string;
  newRelPath: string;
}): void {
  const oldRel = params.oldRelPath.trim();
  const newRel = params.newRelPath.trim();
  if (!oldRel || !newRel || oldRel === newRel) return;
  const now = Date.now();

  params.handle.change((doc: any) => {
    ensureVaultMetadataDocShape(doc, doc?.meta?.vault_id ?? 'unknown');
    const id = doc.note_id_by_path[oldRel];
    if (!id || typeof id !== 'string') return;
    delete doc.note_id_by_path[oldRel];
    doc.note_id_by_path[newRel] = id;
    const note = doc.notes[id];
    if (!note) return;
    note.rel_path = newRel;
    note.title = note.title || titleFromRelPath(newRel);
    note.updated_at = now;
  });
}

export function setNoteTags(params: { handle: DocHandle<VaultMetadataDoc>; noteId: string; tags: string[] }): void {
  const id = params.noteId.trim();
  if (!id) return;
  const next = sanitizeTags(params.tags);
  const now = Date.now();

  params.handle.change((doc: any) => {
    ensureVaultMetadataDocShape(doc, doc?.meta?.vault_id ?? 'unknown');
    const note = doc.notes[id];
    if (!note) return;
    note.tags = next;
    note.updated_at = now;
  });
}

export function setNoteLinksFromContent(params: { handle: DocHandle<VaultMetadataDoc>; noteId: string; content: string }): void {
  const id = params.noteId.trim();
  if (!id) return;
  const next = extractLinksFromText(params.content);
  const now = Date.now();

  params.handle.change((doc: any) => {
    ensureVaultMetadataDocShape(doc, doc?.meta?.vault_id ?? 'unknown');
    const note = doc.notes[id];
    if (!note) return;
    note.links = next;
    note.updated_at = now;
  });
}

export function findNoteIdByRelPath(doc: VaultMetadataDoc, relPath: string): string | null {
  const rel = relPath.trim();
  if (!rel) return null;
  const id = doc.note_id_by_path[rel];
  return typeof id === 'string' && id ? id : null;
}

export function findRelPathByNoteId(doc: VaultMetadataDoc, noteId: string): string | null {
  const id = noteId.trim();
  if (!id) return null;
  const note = doc.notes[id];
  if (!note) return null;
  return note.rel_path || null;
}
