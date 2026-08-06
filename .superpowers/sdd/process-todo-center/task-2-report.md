# Task 2 Report: 后端 — 流程定义列表筛选扩展

## Status: DONE

## Summary

Extended `GET /api/v1/deployed-processes` to support optional `categoryId`, `name`, and `status` query parameters for filtering. The `ProcessService.listProcessDefinitions` method now accepts these parameters and applies corresponding Flowable `ProcessDefinitionQuery` chain filters.

## Changes

### Files Modified
1. **`backend/src/main/java/com/workflow/engine/process/ProcessService.java`** — Changed `listProcessDefinitions` signature from `(Pageable)` to `(Pageable, String categoryId, String name, String status)`. Added conditional Flowable query filters:
   - `categoryId` → `.processDefinitionCategoryLike(categoryId)`
   - `name` → `.processDefinitionNameLike(name)`
   - `status="active"` → `.active()`
   - `status="suspended"` → `.suspended()`

2. **`backend/src/main/java/com/workflow/api/controller/ProcessDefinitionController.java`** — Extended `list()` method with 3 new `@RequestParam(required = false)` parameters, forwarding them to the service.

### Files Created
3. **`backend/src/test/java/com/workflow/api/controller/ProcessDefinitionControllerTest.java`** — 13 test cases covering:
   - Controller layer: parameter passing for categoryId, name, status (individual + combined + none)
   - Controller layer: response structure correctness
   - Service layer: Flowable query method invocation verification for each filter
   - Service layer: negative verification (filters NOT applied when params null/blank)

## TDD Evidence

### RED
**Command:** `cd backend && mvn test -Dtest=ProcessDefinitionControllerTest`

**Result:** COMPILATION FAILURE — test references `listProcessDefinitions(PageRequest, String, String, String)` and `controller.list(int, int, String, String, String)` which don't exist yet. Error: "实际参数列表和形式参数列表长度不同" (argument count mismatch).

**Why expected:** The test was written to call the new 4-arg service method and 5-arg controller method before they existed. Compilation failure is the correct RED state.

### GREEN
**Command:** `cd backend && mvn test -Dtest=ProcessDefinitionControllerTest`

**Result:**
```
Tests run: 13, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

**Cross-check:** `ProcessInstanceControllerTest` also passes (4 tests, 0 failures) — no regressions from the signature change.

## Commit
```
4d60e19 feat(process-definition): support categoryId/name/status filter in list API
```

## Design Decisions

- **Null/blank safe**: `categoryId` and `name` filters only applied when non-null and non-blank, using `isBlank()` check.
- **Case-insensitive status**: `"active"` and `"suspended"` matched case-insensitively via `equalsIgnoreCase()`.
- **Invalid status silently ignored**: If status is neither "active" nor "suspended", no status filter is applied (returns all). This is intentional — the API is permissive rather than rejecting unknown values.
- **Category uses `Like` not exact match**: Flowable's `processDefinitionCategoryLike()` is used per the brief, supporting wildcard patterns. The test passes `"cat-1"` as a literal value.
- **No backward-compat overload**: The old `listProcessDefinitions(Pageable)` signature was replaced, not overloaded. The only caller (the controller) was updated simultaneously. No other callers exist in the codebase.

## Concerns

None. The implementation is straightforward and well-tested.
