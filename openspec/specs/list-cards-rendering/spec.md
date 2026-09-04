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

### Requirement: ListCards SHALL 支持卡片整体样式自定义 CardStyle

`ListCards` SHALL 支持通过 `CardStyle` 自定义卡片整体的外观：`backgroundColor`（背景色）、`borderColor`（边框色）、`borderRadius`、`padding`、`gap`（卡片间距）、`titleFontSize/titleFontWeight/titleColor`（标题字体）、`fieldFontSize/fieldLabelColor/fieldValueColor`（字段字体）。未配置项 SHALL 使用所选主题或默认值。

#### Scenario: 自定义卡片底色与圆角
- **WHEN** `style` 配置 `{ backgroundColor: '#1f2937', borderRadius: 12 }`
- **THEN** 每张卡片 SHALL 使用该背景色与圆角

#### Scenario: 未配置项回退主题
- **WHEN** `CardStyle` 仅配置 `backgroundColor`，未配置 `gap`
- **THEN** 背景色 SHALL 生效，`gap` SHALL 使用主题/默认值

### Requirement: ListCards SHALL 支持内置主题模板与微调

`ListCards` SHALL 通过 `theme` prop 指定内置主题模板（`default/compact/loose/dark/borderless`），主题 SHALL 定义在独立文件 `ListCards.themes.ts` 便于扩展；`style` prop 覆写主题中的个别属性。自定义主题 SHALL 可通过传入完整 `CardStyle` 覆盖。theme 与 style 之间 SHALL 以 style 优先。

#### Scenario: 选择 compact 主题
- **WHEN** `theme` 为 `compact`
- **THEN** 卡片 SHALL 采用 compact 主题的紧凑间距与较小内边距

#### Scenario: style 覆写主题属性
- **WHEN** `theme` 为 `dark` 且 `style` 覆写 `backgroundColor: '#fff'`
- **THEN** 卡片 SHALL 使用 `#fff` 背景（style 优先于主题）

### Requirement: ListCards SHALL 支持字段区域样式与区域布局

`ListCards` SHALL 支持配置字段区域样式（`style.fields`）：栅格布局 `layout`（`grid|list`）、`columns`（列数）、字段间距 `gap`、标签位置 `labelPosition`（`left|right|top`）、标签宽度 `labelWidth`、是否显示标签 `showLabel`、字段默认样式 `fieldStyle`。SHALL 支持区域布局 `regions`：头部 `header`（显示/图标/图标位置/高度）、操作栏 `actions`（位置/间距/对齐/按钮样式）、标签区 `tags`（间距/尺寸）。

#### Scenario: 配置字段栅格列数
- **WHEN** `style.fields` 配置 `{ layout: 'grid', columns: 2 }`
- **THEN** 字段 SHALL 按 2 列栅格排列

#### Scenario: 配置头部图标
- **WHEN** `regions.header` 配置 `{ icon: { name: 'User', color: '#3b82f6', size: 20 } }`
- **THEN** 卡片头部 SHALL 渲染该图标

### Requirement: ListCards SHALL 支持字段级栅格布局与样式

`ListCards` SHALL 支持字段级 `span`（12 列栅格，整行12/半行6/三分之一4）与字段级 `style: FieldStyle`（见 field-style-model）。字段 `role`（`title|subtitle|tag|metric|field`）决定渲染区域。

#### Scenario: 字段占半行
- **WHEN** 某字段列配置 `span: 6`
- **THEN** 该字段 SHALL 占 12 列栅格的半行宽度

#### Scenario: 字段样式与条件样式生效
- **WHEN** 字段列配置 `style` 含结构化属性与 `dynamic` 条件
- **THEN** 该字段 SHALL 应用统一字段样式解析结果（含条件命中）

### Requirement: ListCards SHALL 支持卡片级条件样式

`ListCards` SHALL 支持 `CardStyle.dynamic` 条件数组，根据行数据切换整卡外观（如状态色）。条件求值 SHALL 复用沙箱与 `ConditionalStyle` 语义（首个命中生效）。

#### Scenario: 按行状态切换卡片背景
- **WHEN** `dynamic` 为 `[{ when: "$row.status === '异常'", style: { backgroundColor: '#fee2e2' } }]`，行状态为 `异常`
- **THEN** 该卡片 SHALL 应用红色系背景

