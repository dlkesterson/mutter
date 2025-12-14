# CRDT Conventions (Mutter)

## Dependency pinning

Mutter uses `pnpm` and pins Automerge via `package.json` `pnpm.overrides`:
- `@automerge/automerge`: `3.2.1`

## Document identity (current + intended)

### Current (spike)

- CRDT docs are opened by pasting an Automerge URL into the UI / hash route (e.g. `#/crdt?doc=...`).

### Intended (vault metadata)

For multi-device vault state, prefer **stable IDs** with a pointer file in the vault root:

- Pointer file: `.mutter/state.json`
- Example keys:
  - `vault_id` (stable UUID)
  - `vault_metadata_doc_url` (Automerge URL)

Keep the mapping resilient to vault moves/renames by storing both:
- a stable `vault_id` (UUID), and
- a content-derived identifier (e.g. hash of normalized vault path) if needed for discovery.

### Filesystem snapshot sync (inside the vault)

- Snapshot root: `.mutter/crdt/<docId>/snapshots/`
- Per-device snapshot: `.mutter/crdt/<docId>/snapshots/<deviceId>.am`

The per-vault pointer file stores the metadata doc URL; snapshots make that doc mergeable across devices when the vault is synced.

## Optional WebSocket relay (non-Syncthing environments)

Mutter can optionally connect its Automerge Repo to a WebSocket relay (LAN/WAN sync without filesystem replication).

- **Config key**: `localStorage['mutter:crdt_ws_url']`
- **UI**: open the Omnibox (`Ctrl/Cmd+K`) → **Configure CRDT WebSocket** (or **Clear CRDT WebSocket**)
- **Reload**: required (the CRDT repo singleton is created once at startup)
