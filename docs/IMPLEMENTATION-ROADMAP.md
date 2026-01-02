# Mutter Implementation Roadmap (5-Week Sprint)

**Created:** 2024-12-28
**Updated:** 2025-01-02
**Goal:** Implement all major features from research docs + release preparation

## Feature Inventory

### From `hybrid-data-model-automerge-sync.md`:
- Block-level node IDs in documents
- Supertags (typed metadata templates)
- Transclusion (`![[note#blockID]]` embeds)
- Query engine (DSL for searches)
- CRDT graph indexing on vault load
- Automerge sync server as Tauri sidecar
- E2EE via Beelay (deferred)
- Recurring export jobs (deferred)

### From `voice-interface.md`:
- Contextual voice commands ("Link this to X", "Show backlinks")
- Ambient listening mode (deferred - privacy complexity)
- AI voice queries ("Summarize notes on X")
- Proactive suggestions after voice input
- Multi-modal input (voice + visual switching)
- Voice-driven task management

### From `voice-mode-editor-context.md`:
- Context signal system (cursor state, voice phase, intent history, view mode)
- Command ranking/scoring model
- Intent buckets (Edit, Format, Navigate, Link, Query, Meta)
- Tiered suggestion UI (primary/secondary/escape)
- Risk-based confirmation UI
- Progressive disclosure

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                     FOUNDATION LAYER                            │
│  (Everything else depends on these)                             │
├─────────────────────────────────────────────────────────────────┤
│  Block IDs ──► Transclusion, Granular linking, Context signals  │
│  CRDT Schema ──► Supertags, Graph indexing, Sync server         │
│  Context Signals ──► Command ranking, Tiered UI, Smart voice    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CORE SYSTEMS                                 │
├─────────────────────────────────────────────────────────────────┤
│  Command Ranking ──► Smart suggestions, AI queries              │
│  Graph Indexing ──► Backlinks, Semantic search, AI queries      │
│  Supertags ──► Task management, Typed queries                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FEATURE LAYER                                │
├─────────────────────────────────────────────────────────────────┤
│  Transclusion, AI Voice Queries, Query Engine, Sync Server      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Week-by-Week Plan

### Week 1: Foundation (Critical Path)

| Day | Focus | Deliverable |
|-----|-------|-------------|
| 1-2 | **Block IDs** | Add stable IDs to paragraphs/blocks in markdown parser. Store in CRDT. |
| 3-4 | **Context Signal System** | Build `EditorContext` type with cursor state, selection, view mode, voice phase. Wire into Editor.tsx |
| 5 | **Enhanced CRDT Schema** | Extend `VaultMetadataDoc` with block nodes, link graph, supertag definitions |

### Week 2: Voice Intelligence + Graph Core

| Day | Focus | Deliverable |
|-----|-------|-------------|
| 1-2 | **Command Ranking System** | Implement scoring formula. Intent buckets. Recent history tracking. |
| 3 | **Tiered Suggestion UI** | Primary/secondary/escape tiers. Visual hierarchy near cursor. |
| 4-5 | **Graph Indexing** | Parse markdown for links/tags on vault load. Build in-memory graph from CRDT. Backlinks query. |

### Week 3: Supertags + Transclusion + AI Voice

| Day | Focus | Deliverable |
|-----|-------|-------------|
| 1-2 | **Supertags** | Tag templates with typed fields. UI for creating/applying. Query by supertag fields. |
| 3-4 | **Transclusion** | `![[note#blockID]]` syntax. Live embed rendering in CodeMirror. Edit-in-place. |
| 5 | **AI Voice Queries** | "Summarize notes on X" → embeddings search → LLM summary → spoken/displayed |

### Week 4: Sync Server + Polish ✅

| Day | Focus | Deliverable | Status |
|-----|-------|-------------|--------|
| 1-2 | **Automerge Sync Server Sidecar** | Bundle `automerge-repo-sync-server` as Tauri sidecar. WebSocket connection. | ✅ |
| 3 | **Sync UI** | Settings panel for server URL, status indicators, conflict visualization | ✅ |
| 4 | **Confirmation UI + Progressive Disclosure** | Risk-based confirmations. User experience level tracking. | ✅ |
| 5 | **Query Engine** | Simple DSL parser (`type:project status:open`). Execute against CRDT graph. | ✅ |

### Week 5: Release Preparation

| Day | Focus | Deliverable |
|-----|-------|-------------|
| 1 | **Integration Testing** | End-to-end workflow tests, cross-feature validation |
| 2 | **Performance Profiling** | Query optimization, sync latency, large vault handling |
| 3 | **Documentation** | User guide, query DSL reference, voice command help |
| 4 | **CI/CD Pipeline** | Forgejo runner setup, cross-platform build validation |
| 5 | **Polish + Release** | Bug fixes, version bump, changelog, release tag |

See `docs/WEEK5-TECHNICAL-SPEC.md` for detailed implementation plan.

---

## Parallel Tracks

```
Track A (Data/Backend):     Track B (UI/Voice):
─────────────────────────   ─────────────────────────
Block IDs                   Context Signal System
CRDT Schema                 Command Ranking
Graph Indexing              Tiered Suggestion UI
Supertags                   Confirmation UI
Sync Server                 AI Voice Queries
```

---

## Risk Assessment

| Feature | Risk | Mitigation |
|---------|------|------------|
| Block IDs | 🟡 Medium | Start simple (paragraph-level). Don't over-engineer. |
| Sync Server Sidecar | 🔴 High | Node.js bundling complexity. Prototype early (Day 2-3 spike). |
| Transclusion | 🟡 Medium | CodeMirror decoration complexity. Reference Obsidian's approach. |
| AI Voice Queries | 🟢 Low | Already have LLM formatter + embeddings. Extension work. |
| Command Ranking | 🟢 Low | Deterministic scoring. No ML needed. |

---

## Deferred to v2.0

- E2EE via Beelay (add after sync works)
- Ambient listening mode (privacy complexity, needs user testing)
- Recurring export jobs (nice-to-have)
- Multi-user collaboration (significant scope)

---

## Success Criteria

### Weeks 1-4 (Feature Implementation) ✅

- [x] Every block in a document has a stable ID
- [x] Voice commands are context-aware and ranked by relevance
- [x] Backlinks work via graph indexing
- [x] Supertags can be defined and applied to notes
- [x] Transclusion renders embedded blocks inline
- [x] "Summarize notes on X" voice command works
- [x] Sync server runs as sidecar (at least locally)
- [x] Query DSL can filter notes by type/tag/field

### Week 5 (Release Preparation)

- [ ] All Week 1-4 features work together correctly
- [ ] Query execution <100ms for 1k notes
- [ ] User documentation complete (guide, query DSL, shortcuts)
- [ ] CI/CD pipeline builds all platforms (Linux, Windows, macOS)
- [ ] Version 0.3.0 released with changelog
- [ ] No P0/P1 bugs remaining
