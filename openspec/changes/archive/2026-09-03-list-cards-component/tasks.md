## 1. Shared Configuration Integration (先做共享配置)

- [ ] 1.1 Extend QueryColumnsConfig.vue with a card extension entry while preserving shared metadata, display/search/filter/sort/custom/render semantics
- [ ] 1.2 Add CardColumnAdvancedConfig.vue for role, layout, valueType, prefix, suffix, color, and truncate
- [ ] 1.3 Extend DsBindingConfigDialog.vue for table/card list display modes while preserving container binding and list-to-container linkage
- [ ] 1.4 Update ViewDesigner.vue and PageDesigner.vue to compose the same shared configuration path for card lists

## 2. Shared contracts and card field model

- [ ] 2.1 Extend `frontend/src/components/business/types.ts` with serializable ListCards query/result and card-column/action types - expect shared TypeScript contracts for fetchApi, dataSourceId, roles, value types, and responsive layout
- [ ] 2.2 Add `frontend/src/components/business/ListCards.vue` with fetch lifecycle, request race protection, structured card areas, and Element Plus states - expect standalone data-card renderer without SearchTable regressions
- [ ] 2.3 Add `frontend/src/components/business/__tests__/ListCards.test.ts` for initial query, pagination, loading, empty, error/retry, formatters, and event isolation - expect executable coverage of core rendering behavior

## 3. Shared action and event integration

- [ ] 3.1 Extend ActionsConfig.vue to support card item placement while preserving CRUD, permissions, confirmations, events, detail/form mode, and form-container linkage
- [ ] 3.2 Extend EventsConfig.vue with card capability filtering while preserving row-click, refresh, CRUD success, and container action chains
- [ ] 3.3 Add ListCards export in `frontend/src/components/business/index.ts` and verify existing imports/build - expect public component availability without changing current callers
- [ ] 3.4 Add integration tests for action visibility, read-only metadata, card-to-container linkage, and row-click versus action-click behavior

## 4. Data-source host wrapper

- [ ] 4.1 Add a shared list/card host adapter beside PageDataTable that reuses the existing dataSourceId metadata/query/CRUD path - expect no new data-source protocol
- [ ] 4.2 Map View schema columns/search/actions/events to the same ListCards props - expect View and Page to select renderers over shared configuration
- [ ] 4.3 Add host tests for valid, unresolved, read-only, metadata, and form-container linkage cases

## 5. form-create and designer support

- [ ] 6.1 Register `page-list-cards` in the form-create/runtime component registry and render mapping - expect saved rules to instantiate ListCards
- [ ] 6.2 Add structured card property configuration using existing table column/data-source configuration patterns - expect serializable columns, roles, value types, layout, pagination, and actions
- [ ] 6.3 Add form-create/page-renderer tests for rule serialization, metadata refresh, defaults, and unsupported role fallback - expect backward-compatible rendering and JSON-only configuration

## 6. Validation and documentation

- [ ] 7.1 Run frontend unit tests and TypeScript/Vite build, fixing only regressions introduced by this change - expect green automated validation
- [ ] 7.2 Run targeted page-designer smoke verification at the existing integration boundary - expect card query, pagination, CRUD, and responsive layout evidence
- [ ] 7.3 Update relevant component/configuration documentation with ListCards examples and explicit non-goals - expect maintainers can configure code and designer variants
