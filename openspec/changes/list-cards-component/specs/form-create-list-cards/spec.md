## ADDED Requirements

### Requirement: The form-create integration SHALL register a serializable page-list-cards component

The form-create/page designer runtime MUST recognize `page-list-cards` and render it through the ListCards implementation. Its props MUST include dataSourceId, pagination/search settings, card layout settings, structured columns, and action configuration.

#### Scenario: Render a saved card-list rule
- **WHEN** a form-create rule has type `page-list-cards` and valid props
- **THEN** the runtime renders a ListCards instance with the saved configuration

#### Scenario: Unknown or incomplete card props
- **WHEN** a rule omits optional card props or contains an unsupported card role
- **THEN** documented defaults are applied and the runtime remains renderable without saving function values

### Requirement: The designer card configuration SHALL reuse table column semantics and add card roles

The configuration UI or schema MUST preserve key, label, formatter/value type, hidden, and display semantics from table columns and MUST expose structured card roles such as title, subtitle, field, tag, avatar, and metric.

#### Scenario: Configure card fields
- **WHEN** a designer selects a metadata field and assigns a card role
- **THEN** the saved columns preserve the field key/label and role-specific display properties

#### Scenario: Metadata refresh
- **WHEN** the configured data source changes and metadata is available
- **THEN** the designer can refresh the available field columns without changing the existing data-source query contract

### Requirement: The form-create integration SHALL resolve dataSourceId through the existing data-source path

The page component MUST use the existing global data-source resolution and query/CRUD path for dataSourceId; it MUST NOT introduce a second endpoint format or silently treat an unresolved page binding as a global refId.

#### Scenario: Valid data source binding
- **WHEN** dataSourceId resolves to an enabled data source
- **THEN** the component queries it using the shared pagination contract and applies its writable metadata to available actions

#### Scenario: Invalid or removed binding
- **WHEN** dataSourceId cannot be resolved
- **THEN** the component avoids constructing an invalid request, displays a deterministic error/empty state, and keeps the page renderable

### Requirement: Designer actions SHALL support CRUD and event-bus integration

The form-create/page designer integration MUST support view, create, edit, delete, and custom action configuration, with permission/confirmation behavior consistent with SearchTable and existing page action bus conventions.

#### Scenario: Writable data source
- **WHEN** a writable data source and corresponding action are configured
- **THEN** the action invokes the existing data-source write path and refreshes the card page after success

#### Scenario: Read-only data source
- **WHEN** metadata marks the data source read-only
- **THEN** create/edit/delete actions are hidden or disabled while view and custom read actions remain available
