# list-cards-rendering Specification

## Purpose
TBD - created by archiving change list-cards-component. Update Purpose after archive.
## Requirements
### Requirement: ListCards SHALL expose the shared paged data contract

`ListCards` MUST accept a code-side `fetchApi` and use the shared query shape containing `page`, `size`, optional `filter`, and optional `sort`; a successful response MUST contain `rows` and `total`.

#### Scenario: Initial remote query
- **WHEN** the component is mounted with a valid `fetchApi`
- **THEN** it requests the configured default page and size and renders the returned rows and total

#### Scenario: Page or query condition changes
- **WHEN** the user changes page, page size, search condition, or sort state
- **THEN** the component requests the corresponding shared query parameters and replaces the visible rows

### Requirement: ListCards SHALL render a responsive structured card

Each row MUST render as an accessible card with title area, field area, and action area; the grid MUST support `cardMinWidth` or responsive column configuration without requiring fixed breakpoint markup.

#### Scenario: Structured fields
- **WHEN** columns contain title, subtitle, tag, metric, and field roles
- **THEN** each role is rendered in its designated card area and hidden columns are not rendered

#### Scenario: Narrow container
- **WHEN** the container becomes narrower than the desktop width
- **THEN** the grid reduces the number of cards per row without horizontal overflow

### Requirement: ListCards SHALL expose loading, empty, error, and retry states

The component MUST distinguish loading, successful empty, and failed query states; it MUST prevent stale loading results from replacing a newer request and MUST provide a retry action for errors.

#### Scenario: Loading state
- **WHEN** a query is pending
- **THEN** loading feedback is displayed and the previous request cannot overwrite the latest request result

#### Scenario: Empty state
- **WHEN** a successful query returns zero rows
- **THEN** an empty state is displayed instead of an empty grid

#### Scenario: Failed query
- **WHEN** the query rejects
- **THEN** an error state with retry is displayed while current query conditions remain available

### Requirement: ListCards SHALL support card click and isolated row actions

The component MUST emit `row-click` when `cardClickable` is enabled and MUST isolate action-button events from the card click. CRUD and custom actions MUST honor existing visibility, permission, confirmation, and loading conventions.

#### Scenario: Card click
- **WHEN** a user clicks a non-action area of a clickable card
- **THEN** `row-click` is emitted with the row and click context

#### Scenario: Action click
- **WHEN** a user clicks edit, delete, view, or custom action
- **THEN** only the action handler runs, the card click is not emitted, and configured confirmation/permission rules apply

### Requirement: ListCards SHALL provide bottom pagination

When pagination is enabled, the component MUST render a bottom pagination control using `total`, configured page sizes, and the shared page/size state; changing page MUST trigger a remote reload.

#### Scenario: Pagination enabled
- **WHEN** total records exceed the current page size
- **THEN** the bottom pager displays the total and changing page loads the selected page

#### Scenario: Data refresh invalidates page
- **WHEN** a query condition or data source changes
- **THEN** the page resets to the first page before loading new data

### Requirement: ListCards SHALL retain code-side rendering escape hatches

The code component MUST support optional slot or render-function customization for card areas and formatted values, while JSON designer configuration MUST remain serializable and MUST NOT require function values.

#### Scenario: Custom code renderer
- **WHEN** a caller supplies a supported slot or renderer for a field/action area
- **THEN** the custom output is rendered with row and field context

#### Scenario: Serializable configuration
- **WHEN** the component is serialized by the page designer
- **THEN** its configuration contains only JSON-compatible values

