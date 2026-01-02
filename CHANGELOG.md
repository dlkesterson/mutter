# Changelog

All notable changes to Mutter will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-01-02

### Added

- **Query Engine**: Search notes with DSL syntax (`type:project status:active`)
  - Filters: `type:`, `tag:`, `linked:`, `from:`, `created:`, `updated:`, `has:`
  - Supertag field queries with numeric comparisons
  - Text search with exact phrase matching
  - Performance optimized for 1k+ notes (<100ms target)

- **Supertags**: Create typed metadata templates with custom fields
  - Field types: text, number, date, select, checkbox, relation
  - Apply multiple supertags to notes
  - Query by supertag type and field values

- **AI Voice Queries**: Natural language queries over your vault
  - "Summarize notes about X" command
  - "What do my notes say about X" command
  - Context-aware AI responses

- **Transclusion**: Embed content with `![[Note#block]]` syntax
  - Block-level transclusion
  - Real-time content resolution

- **Backlinks Panel**: View incoming links to current note
  - Preview backlink context
  - Quick navigation to source notes

- **Block IDs**: Stable identifiers for granular linking
  - Auto-generated block references
  - Persistent across edits

- **Confirmation UI**: Risk-based confirmations with progressive disclosure
  - Low/Medium/High risk categorization
  - Contextual action descriptions

- **Sync Server**: Local Automerge sync via Tauri sidecar
  - WebSocket-based CRDT sync
  - Multi-device support

- **Performance Monitoring**: Development panel for query profiling
  - Timing breakdown (index lookup, filtering, sorting)
  - Memory usage tracking

- **In-App Help Panel**: Tabbed help reference for voice, queries, shortcuts, supertags

- **Comprehensive User Guide**: Full documentation in `docs/USER-GUIDE.md`

- **CI/CD Improvements**:
  - Test job runs before builds in release workflow
  - Husky pre-commit hooks (type check, lint, tests)

### Changed

- Editor context signals for smarter voice commands
- Command ranking based on context and history
- Settings moved to file-based config (XDG standards)
- Query executor now emits performance events for monitoring

### Fixed

- Voice command recognition improvements
- CRDT sync stability improvements
- Parser handling of edge cases (empty queries, special characters, unicode)
- LocalStorage corruption handling with graceful fallback

### Performance

- Query execution optimized with supertag index lookups
- Pagination support reduces memory for large result sets
- 159 integration tests ensure reliability

## [0.2.0] - 2024-12-XX

### Added

- Initial voice command support
- Live preview markdown editor
- Multi-tab interface
- File tree navigation
- Voice Activity Detection (VAD)
- Whisper model selection (Distil-Whisper variants)
- Streaming transcription display
- Command palette (Cmd+K)
- Auto-save on blur

### Technical

- Tauri v2 + React 19 architecture
- CodeMirror 6 with custom live preview decorations
- Candle ML framework with CUDA GPU support
- BERT-based semantic command matching

## [0.1.0] - 2024-11-XX

### Added

- Initial project setup
- Basic markdown editing
- File system operations
