# form-create-list-cards Specification

## Purpose
TBD - created by archiving change list-cards-component. Update Purpose after archive.
## Requirements
### Requirement: The form-create integration SHALL register a serializable page-list-cards component

The form-create/page designer runtime MUST recognize `page-list-cards` and render it through the ListCards implementation. Its props MUST include dataSourceId, pagination/search settings, card layout settings, structured columns, and action configuration.

#### Scenario: Render a saved card-list rule
- **WHEN** a form-create rule has type `page-list-cards` and valid props
- **THEN** the runtime renders a ListCards instance with the saved configuration

#### Scenario: Unknown or incomplete card props
- **WHEN** a rule omits optional card props or contains an unsupported card role
- **THEN** documented defaults are applied and the runtime remains renderable without saving function values

### Requirement: The designer card configuration SHALL reuse table column semantics and add card roles

The configuration UI or schema MUST preserve key, label, formatter/value type, hidden, and display semantics from table columns and MUST expose structured card roles such as title, subtitle, field, tag, avatar, and metric. The designer MUST use existing shared configuration components (QueryColumnsConfig, ActionsConfig, EventsConfig) with card-mode extensions rather than create full duplicates (e.g., CardQueryColumnsConfig, CardActionsConfig, CardEventsConfig).

#### Scenario: Configure card fields
- **WHEN** a designer selects a metadata field and assigns a card role
- **THEN** the saved columns preserve the field key/label and role-specific display properties

#### Scenario: Metadata refresh
- **WHEN** the configured data source changes and metadata is available
- **THEN** the designer can refresh the available field columns without changing the existing data-source query contract

### Requirement: The form-create integration SHALL resolve dataSourceId through the existing data-source path

The page component MUST use the existing global data-source resolution and query/CRUD path for dataSourceId; it MUST NOT introduce a second endpoint format or silently treat an unresolved page binding as a global refId. ListCards is another renderer that reuses the same data-source path, not a new data-source system.

#### Scenario: Resolved data source
- **WHEN** dataSourceId resolves to an enabled data source
- **THEN** the component queries rows/total through the existing unified API

#### Scenario: Unresolved data source
- **WHEN** dataSourceId cannot be resolved
- **THEN** the designer reports the binding error and does not render a silent fallback

### Requirement: Designer actions SHALL support CRUD and event-bus integration

The form-create/page designer MUST configure core CRUD (view/create/edit/delete), permissions, confirmations, visibility, events, detail/form mode, and action-bus integration using the shared ActionsConfig. Only placement and action-column-width UI MUST differ between table and card display modes. Card still supports form-container linkage via the same event/action-chain model.

#### Scenario: Configure core CRUD actions
- **WHEN** a designer configures view/create/edit/delete on a card list
- **THEN** the actions are saved with permission, confirmation, and visibility rules shared with table lists

#### Scenario: Card-mode placement
- **WHEN** the display mode is card
- **THEN** placement options adapt to card toolbar / action-column layout, and other core action semantics remain identical to table

#### Scenario: Form-container linkage preserved
- **WHEN** an action is configured to open a form container (dialog/drawer) with a bound form
- **THEN** the card list triggers the same open-container / load-record / save-container / close-container linkage as a table list

### Requirement: DsBindingConfigDialog SHALL treat table and card as list display modes

The DsBindingConfigDialog MUST treat both `table` and `card` as list display mode variants (sharing field/actions/events configuration paths) while preserving the separate container binding mode for dialog/drawer-style form bindings.

#### Scenario: List display mode
- **WHEN** the binding target is a table or card list component
- **THEN** the dialog presents the shared data-source, field, action, and event configuration (with card-specific layout extras)

#### Scenario: Container binding mode
- **WHEN** the binding target is a form container (dialog/drawer)
- **THEN** the dialog presents the container-specific form binding configuration unchanged

### Requirement: Card configuration SHALL reuse shared configuration components

The designer MUST compose `QueryColumnsConfig`, `CardColumnAdvancedConfig`, `ActionsConfig`, and `EventsConfig` rather than create complete Card-specific duplicates. Card MUST retain the same data-source binding and form-container linkage used by table lists.

#### Scenario: Shared configuration composition
- **WHEN** a designer configures a Card list in ViewDesigner or PageDesigner
- **THEN** the host composes the shared field, action, and event configuration components and adds only Card-specific field/layout extensions

#### Scenario: Card to form-container linkage
- **WHEN** a Card row triggers an existing open-container/load-record/save-container/close-container action chain
- **THEN** the same bound form-container protocol and row context used by table lists is executed

