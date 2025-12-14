# Vault Metadata CRDT (Mutter)

Mutter maintains a mergeable Automerge document for vault metadata: note IDs, titles, tags, links, and “last opened”.

## Files (inside the vault)

- Vault state pointer: `.mutter/state.json`
- CRDT snapshots: `.mutter/crdt/<docId>/snapshots/<deviceId>.am`

To sync across devices, sync the vault folder **including** `.mutter/` (e.g. via Syncthing).

## What’s in the metadata doc

- `notes[id]` records:
  - `rel_path` (path relative to the vault root)
  - `title`
  - `tags[]`
  - `links[]` (extracted from `[[wiki links]]` on save)
  - `last_opened_at`

## UI

- Sidebar shows `vault_id` and `note_id` for the active note.
- Command palette:
  - `Open note by ID`
  - `Set note tags`

