# Retrospective: unify-workflow-form-datasource

**Date**: 2026-08-24
**Schema**: superpowers-bridge-opencode
**Base**: a2e957f
**Final HEAD**: bc4abdb

## Execution Summary

| Metric | Value |
|---|---|
| Total commits | 18 (feature branch, BASE→HEAD) |
| Backend tests | 614 / 0 failures |
| Frontend tests | 388 / 0 failures |
| Frontend build | ✅ production build |
| Migration scripts | V23 (renamed from V22 due to conflict with main) |
| OpenSpec tasks | 13/15 implemented, 3 pending E2E environment |

## What Went Well

### 1. TDD Discipline Maintained Across All 11 Tasks
Every backend task followed RED→GREEN→REFACTOR. Documented in ledger with test counts at each stage. No task skipped the RED phase.

### 2. Fast Failure Recovery
- V22 migration conflict with main branch identified and resolved via rename to V23 in a single iteration
- `target/classes` residual V22 file diagnosed by checking classpath vs source — resolved with `mvn clean compile`
- Missing V22 file on feature branch (from main's datasource-auto-creation) — resolved via merge main with single conflict resolution

### 3. Scope Adapted to User Feedback Without Rework
User's incremental instructions after initial implementation were absorbed without breaking changes:
- "WORKFLOW auto-creation" → added formType to events, expanded listener branching
- "API-only management" → preserved existing UI patterns, only showed buttons conditionally
- "Type fixed as API" → replaced radio-group with static tag, minimal change
- "Show SPI endpoints for WORKFLOW" → added WORKFLOW branch to generateEndpoints()

### 4. Merge Main Was Clean
Despite 9 commits from datasource-auto-creation landing on main, the merge only had 1 file conflict (DataSourceDefinitionRepository.java) — resolved trivially by keeping both sides' additions.

## What Didn't Go Well

### 1. PowerShell Encoding Catastrophe (134 lines corrupted)
**Incident**: `Set-Content` with `-Encoding UTF8` rewrote Vue file, corrupting all Chinese characters across 134 lines.
**Impact**: Immediate; had to `git checkout` to recover.
**Root Cause**: PowerShell's `Set-Content` does not preserve BOM/encoding of existing files.
**Fix**: All file edits switched to `edit` tool exclusively.
**Lesson**: Never use PowerShell file-writing cmdlets on UTF-8 content files in this environment.

### 2. Flyway Migration Version Collision
**Incident**: V22__add_page_data_source_id.sql collided with main's V22__add_form_id_to_data_source.sql — same version number, different content.
**Impact**: Application failed to start with checksum mismatch, then "applied migration not resolved locally".
**Root Cause**: Parallel work on two changes (datasource-auto-creation + unify-workflow-form-datasource) both chose V22.
**Fix**: Three-step recovery:
1. Rename V22→V23 (commit 96ecdcd)
2. Clean target/classes residual (mvn clean)
3. Merge main to bring V22 back into classpath (commit f8ef012)
**Lesson**: Migration file numbers must be checked against ALL branches via `git ls-tree main` before writing. `writing-plans` phase should not hardcode V{n}__ numbers.

### 3. tasks.md Not Updated During Implementation
All 13 completed tasks had unchecked boxes. This created a CRITICAL finding during verify.
**Root Cause**: SDD ledger (progress.md) was the tracking mechanism used during implementation; tasks.md was treated as input-only.
**Fix**: Retroactive update (commit bc4abdb) with偏差 annotations.
**Lesson**: Either maintain tasks.md checkboxes during implementation, or establish a clear convention that ledger is the source of truth and tasks.md is updated at verify time.

### 4. `datasource-auto-creation` Overlapped with This Change
The main branch's datasource-auto-creation (readonly UI spec) conflicted with Task 9's WORKFLOW UI additions. The readonly UI was the "authoritative" state, so Task 9's additions had to be reworked after merge.
**Impact**: Extra iteration on DataSourceListPage.vue (rewriting tests, adjusting button visibility).
**Lesson**: When two changes touch the same files, early coordination prevents merge-time rework.

## Key Technical Decisions

| Decision | Rationale |
|---|---|
| WORKFLOW type = read-only via SPI direct | No internal HTTP routing; adapter layer rejects CUD; simpler than extending InternalDataSourceRouter allowlist |
| formKey preserved as legacy compat | PageValidator three-branch (both-empty→reject, formKey-only→legacy, dataSourceId→SPI) avoids breaking existing pages |
| Migration creates FORM (not WORKFLOW) | Authoritative spec confirms: legacy views read business form data, not cross-instance aggregations |
| Events carry formType with backward-compatible constructors | 5-param constructors default to "BUSINESS"; new 6-param constructors add formType; no existing caller breaks |
| Per-page transaction isolation in migrator | TransactionTemplate.execute + try/catch per page; single failure doesn't block others |
| API-only data source management | FormCreatedEvent auto-creates FORM/WORKFLOW; only API type needs manual CRUD |

## Test Strategy Observations

| Aspect | What Worked | What Could Improve |
|---|---|---|
| Unit tests | Fast, isolated, comprehensive (130+ new tests) | WorkflowFormDataQueryService assemble() calls businessColumns() twice — minor perf |
| Integration tests | DataSourceDefinitionServiceTest covers all enable scenarios | Full end-to-end (1.7/4.1/4.2) requires running app + DB — deferred |
| Frontend tests | 388 vitest tests, all passing, including rewritten DataSourceListPage (13 tests) | PageRenderer dual-track not explicitly unit-tested (depends on runtime DOM) |
| Migration tests | ViewDataSourceMigrator: 5/5 tests cover idempotent/skip/isolation | Cannot test Flyway migration checksum correctness without real DB |

## Quantitative Summary

| Metric | Before | After | Delta |
|---|---|---|---|
| Backend test count | ~570 | 614 | +44 (new service + adapter + listener + validator tests) |
| Frontend test count | ~370 | 388 | +18 (rewritten DataSourceListPage + ViewDesigner tests) |
| Migration scripts | V22 (main's form_id) | V23 (page_data_source_id) | +1 file |
| Java source files changed/added | — | 22 | — |
| Vue/TS files changed/added | — | 5 | — |
| Total lines changed | — | ~3,000+ | — |
