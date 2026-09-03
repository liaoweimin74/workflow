## ADDED Requirements

### Requirement: Unified datasource binding SHALL provide reusable component-level binding UI

The designer SHALL provide one reusable binding component for selecting a page datasource, editing component-level filters, and loading datasource column metadata. The component SHALL be reusable by option controls and list configuration dialogs without owning page-level datasource declarations.

#### Scenario: Select a page datasource
- **WHEN** a user selects a page datasource in a supported component configuration
- **THEN** the binding component SHALL emit the selected page-local datasource id and load its visible column metadata

#### Scenario: Edit component-level filter
- **WHEN** a user adds or changes a filter condition
- **THEN** the binding component SHALL emit the updated filter logic and conditions using the existing `value`/`field` output contract

### Requirement: Existing datasource configuration consumers SHALL reuse the unified component

The option datasource configuration and list/picker datasource configuration dialogs SHALL reuse `UniDataSourceBinding.vue` for datasource selection and component-level filtering, while retaining their own field mapping, pagination, action, event, and legacy compatibility settings.

#### Scenario: Configure an option control
- **WHEN** a user opens datasource configuration for a selector, cascader, checkbox, tree-select, or equivalent option control
- **THEN** the datasource tab SHALL render the unified binding component and preserve the control-specific field mapping configuration

#### Scenario: Configure a list or picker
- **WHEN** a user opens datasource configuration for a data table, card list, data picker, or lookup picker
- **THEN** the datasource section SHALL render the unified binding component and preserve the component-specific configuration and stored filter semantics

### Requirement: Existing persisted datasource configurations SHALL remain compatible

The unified component integration SHALL read existing `value` and `fixedValue` condition values, preserve `sourceFormKey` and legacy FORM/API configurations where applicable, and SHALL NOT require a backend data migration.

#### Scenario: Reopen an existing configuration
- **WHEN** a user opens a component containing an existing datasource filter
- **THEN** the filter rows SHALL be restored with the same column, operator, source, and value semantics

#### Scenario: Save a legacy lookup configuration
- **WHEN** a user saves a lookup picker using legacy FORM/API datasource fields
- **THEN** the legacy fields SHALL remain in the saved configuration while the unified binding handles only the page datasource/filter portion
