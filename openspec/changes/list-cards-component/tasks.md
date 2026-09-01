## 1. Shared contracts and card rendering

- [ ] 1.1 Extend `frontend/src/components/business/types.ts` with serializable ListCards query/result and card-column/action types - expect shared TypeScript contracts for fetchApi, dataSourceId, roles, value types, and responsive layout
- [ ] 1.2 Add `frontend/src/components/business/ListCards.vue` with fetch lifecycle, request race protection, structured card areas, and Element Plus states - expect standalone data-card renderer without SearchTable regressions
- [ ] 1.3 Add `frontend/src/components/business/__tests__/ListCards.test.ts` for initial query, pagination, loading, empty, error/retry, formatters, and event isolation - expect executable coverage of core rendering behavior

## 2. CRUD and business integration

- [ ] 2.1 Reuse existing SearchTable action/form conventions in ListCards for view/create/edit/delete/custom actions - expect permission, confirmation, and refresh behavior consistent with existing lists
- [ ] 2.2 Add ListCards export in `frontend/src/components/business/index.ts` and verify existing imports/build - expect public component availability without changing current callers
- [ ] 2.3 Add integration tests for CRUD action visibility, read-only metadata, and row-click versus action-click behavior - expect no action bubbling and correct writable handling

## 3. Data-source page wrapper

- [ ] 3.1 Add a page-level card list wrapper beside `frontend/src/views/page/components/PageDataTable.vue` - expect dataSourceId resolution through the existing unified data-source API and `{ rows, total }` adapter
- [ ] 3.2 Add page wrapper tests for valid, unresolved, and read-only data-source bindings - expect deterministic error handling and action filtering

## 4. form-create and designer support

- [ ] 4.1 Register `page-list-cards` in the form-create/runtime component registry and render mapping - expect saved rules to instantiate ListCards
- [ ] 4.2 Add structured card property configuration using existing table column/data-source configuration patterns - expect serializable columns, roles, value types, layout, pagination, and actions
- [ ] 4.3 Add form-create/page-renderer tests for rule serialization, metadata refresh, defaults, and unsupported role fallback - expect backward-compatible rendering and JSON-only configuration

## 5. Validation and documentation

- [ ] 5.1 Run frontend unit tests and TypeScript/Vite build, fixing only regressions introduced by this change - expect green automated validation
- [ ] 5.2 Run targeted page-designer smoke verification at the existing integration boundary - expect card query, pagination, CRUD, and responsive layout evidence
- [ ] 5.3 Update relevant component/configuration documentation with ListCards examples and explicit non-goals - expect maintainers can configure code and designer variants
