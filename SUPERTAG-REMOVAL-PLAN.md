# Supertag Full Removal Plan

**Goal:** Completely remove all supertag-related code from the codebase (not just UI, but CRDT schema, query logic, and tests).

**Context:** This app has a single user - no backward compatibility concerns.

**Created:** 2026-01-26

---

## Phase 1: CRDT Schema Cleanup ✅ COMPLETE

### 1.1 Types (`src/types/`)
- [x] `src/types/supertag.ts` - Already deleted

### 1.2 Note Document (`src/crdt/noteDoc.ts`)
- [x] Remove `SupertagInstance` import/type
- [x] Remove `supertags: SupertagInstance[]` from `NoteDoc` type
- [x] Remove `supertags: []` from `createEmptyNoteDoc()`
- [x] Remove `if (!doc.supertags) doc.supertags = []` from `ensureNoteDocShape()`
- [x] Remove `applySupertagToNote()` function
- [x] Remove `removeSupertagFromNote()` function
- [x] Remove `getNoteSupertagInstances()` function
- [x] Remove `noteHasSupertag()` function
- [x] Remove `getSupertagFieldValue()` function

### 1.3 Manifest Document (`src/crdt/manifestDoc.ts`)
- [x] Remove `SupertagDefinition` import/type
- [x] Remove `supertag_definitions: Record<string, SupertagDefinition>` from `ManifestDoc` type
- [x] Remove `supertag_definitions: {}` from `createEmptyManifestDoc()`
- [x] Remove `if (!doc.supertag_definitions) doc.supertag_definitions = {}` from `ensureManifestDocShape()`
- [x] Remove `getAllSupertagDefinitions()` function
- [x] Remove `getSupertagDefinition()` function
- [x] Remove `getSupertagDefinitionByName()` function

### 1.4 Vault Metadata Document (`src/crdt/vaultMetadataDoc.ts`)
- [x] Remove supertag types (SupertagFieldType, SupertagField, SupertagDefinition, SupertagInstance)
- [x] Remove `supertags: SupertagInstance[]` from `VaultNote` type
- [x] Remove `supertag_definitions` from `VaultMetadataDoc` type
- [x] Remove supertag-related v2→v3 migration code
- [x] Remove `supertag_definitions` from `ensureVaultMetadataDocShape()`
- [x] Remove `supertags: []` from note creation
- [x] Remove all supertag management functions
- [x] Remove `findNotesBySupertag()` and `findNotesBySupertagField()` query helpers

### 1.5 Migration (`src/crdt/migration.ts`)
- [x] Remove `supertag_definitions` from manifest migration
- [x] Remove `supertags` from note migration

### 1.6 Vault Indexer (`src/crdt/vaultIndexer.ts`)
- [x] Remove `supertags: []` from note initialization

---

## Phase 2: Query System Cleanup ✅ COMPLETE

### 2.1 Query Executor (`src/query/executor.ts`)
- [x] Remove `case 'type':` filter handling
- [x] Remove `case 'supertag':` and `case 'supertags':` from `has:` filter
- [x] Remove supertag field filter logic in `default:` case
- [x] Remove `getNotesBySupertag()` function
- [x] Remove `matchFieldValue()` function (only used by supertag matching)
- [x] Update comments

### 2.2 Split Executor (`src/query/splitExecutor.ts`)
- [x] Remove `case 'type':` filter handling
- [x] Remove `case 'supertag':` and `case 'supertags':` from `has:` filter
- [x] Remove `matchesSupertagField()` function
- [x] Remove `matchFieldValue()` function
- [x] Remove `supertagDefinitions` parameter from `matchesNoteDocFilter()`
- [x] Remove `type:` autocomplete suggestions
- [x] Remove `manifest.supertag_definitions` reference
- [x] Update file header and comments

### 2.3 Query Parser (`src/query/parser.ts`)
- [x] Remove supertag field query comment
- [x] Remove `case 'type':` from `describeQuery()`

---

## Phase 3: Test Cleanup ✅ COMPLETE

### 3.1 Unit Tests
- [x] `src/__tests__/unit/query-parser.test.ts` - Updated all `type:` to `tag:`, removed "describes type filter" test, updated has: test
- [x] `src/__tests__/unit/query-executor.test.ts` - Removed `type: filter` describe block, removed `supertag field filters` describe block, removed `has:supertags` test, updated combined filters test, cleaned mock factories

### 3.2 Integration Tests
- [x] `src/__tests__/integration/query-integration.test.ts` - Removed supertag_definitions from mock, updated suggestions tests, updated description test
- [x] `src/__tests__/integration/error-handling.test.ts` - Removed SupertagDefinition imports, removed supertag test cases, updated stress tests

---

## Phase 4: Final Cleanup

### 4.1 Documentation
- [ ] Update `CLAUDE.md` - Remove supertag references
- [ ] Update `docs/USER-GUIDE.md` - Remove supertag query examples
- [ ] Delete this plan file when fully done

### 4.2 Remaining References
- [x] `grep -ri "supertag" src/` returns no results
- [x] All tests pass (193 passed, 1 skipped)

---

## Progress Log

### 2026-01-26
- Created removal plan
- **Phase 1 complete:** All CRDT schema supertag code removed
- **Phase 2 complete:** All query system supertag code removed
- **Phase 3 complete:** All test supertag references removed and tests pass
- Remaining: Phase 4 (documentation cleanup)

---

## Verification Checklist

After completion:
- [x] `pnpm test:run` passes (193 passed, 1 skipped)
- [ ] `pnpm lint` passes
- [x] `grep -ri "supertag" src/` returns no results
- [ ] App starts and basic functionality works
- [x] Query DSL works without supertag filters
