## Context

Datasource selection and component-level filtering are shared by option controls and list/picker configuration dialogs. The existing `DataSourceBindingTab.vue` already implements the shared UI, so it is renamed to `UniDataSourceBinding.vue` and reused rather than introducing a second abstraction.

## Goals / Non-Goals

**Goals:**
- Use one binding/filter component in option controls, tables, cards, data pickers, and lookup pickers.
- Preserve each consumer's field mapping, list, action, event, and legacy datasource behavior.
- Keep existing persisted filter shapes readable and avoid backend or database migration.

**Non-Goals:**
- Do not replace `DataSourceConfigPanel.vue`, which manages page-level datasource declarations.
- Do not change runtime query APIs or page-tree in this change.

## Decisions

- Rename the existing component to `UniDataSourceBinding.vue` and preserve its `modelValue`, `formDataSources`, `currentFields`, `update:modelValue`, and `columns` contracts.
- Use explicit bridge state in consumers where legacy local form state must remain available for existing confirmation and compatibility logic.
- Keep `value` as the unified component's fixed-condition output and accept `fixedValue` while restoring old configurations.
- Keep consumer-specific column mapping and legacy FORM/API parsing outside the shared component.

## Risks / Trade-offs

- [Duplicate metadata requests] Consumers may load metadata for both shared filter controls and their own field mapping; retain existing behavior first and optimize only with measured evidence.
- [Legacy configuration drift] Old lookup/data-picker shapes remain in consumer adapters; cover reopen/save behavior with existing tests.
- [Scoped dialog CSS] Teleported option configuration dialogs need explicit dialog-level styling to avoid designer-panel inheritance.
