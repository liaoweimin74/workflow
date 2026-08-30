# page-data-table Specification

## Purpose
TBD - created by archiving change table-form-container-linkage. Update Purpose after archive.
## Requirements
### Requirement: PageDataTable SHALL 支持事件流集成

PageDataTable 组件 SHALL 与 DsActionBus 集成，支持事件流驱动的表格-容器联动，可在页面设计器中配置表格操作按钮与行点击的事件流。

#### Scenario: 配置表格操作按钮事件流

- **WHEN** 页面设计器为表格操作按钮配置了事件流
- **THEN** 系统 SHALL 按照事件流配置执行相应的动作

#### Scenario: 执行配置的事件流

- **WHEN** 用户触发表格操作（点击操作按钮或表格行）
- **THEN** 系统 SHALL 执行对应操作配置的事件流

### Requirement: PageDataTable SHALL 支持行点击事件

PageDataTable SHALL 支持配置行点击事件，用户点击表格行时触发事件流，事件中包含当前行数据。

#### Scenario: 配置行点击事件

- **WHEN** 用户在 PageDataTable 配置中启用行点击事件
- **THEN** 系统 SHALL 在用户点击表格行时触发事件流

#### Scenario: 行点击事件包含行数据

- **WHEN** 用户点击表格行
- **THEN** 系统 SHALL 在事件中包含当前行数据

### Requirement: PageDataTable SHALL 触发表格-容器联动事件

PageDataTable SHALL 在特定操作（编辑、查看、新增）时触发表格-容器联动事件，携带对应行数据。

#### Scenario: 点击编辑按钮触发 row-edit 事件

- **WHEN** 用户点击表格操作按钮中的"编辑"按钮
- **THEN** 系统 SHALL 触发 `row-edit` 事件，包含当前行数据

#### Scenario: 点击查看按钮触发 row-view 事件

- **WHEN** 用户点击表格操作按钮中的"查看"按钮
- **THEN** 系统 SHALL 触发 `row-view` 事件，包含当前行数据

#### Scenario: 点击新增按钮触发 row-create 事件

- **WHEN** 用户点击表格操作按钮中的"新增"按钮
- **THEN** 系统 SHALL 触发 `row-create` 事件

### Requirement: PageDataTable SHALL 支持列级单元格点击事件

PageDataTable SHALL 支持基于列配置 `onCellClick` 的列级单元格点击事件。当某列配置了 `onCellClick` 时，点击该列单元格 SHALL 仅执行该列动作链（含 `type: 'script'` 动作）并短路整表级 `cell-click` 事件链；未配置列级事件的列，点击 SHALL 走原整表级 `cell-click` → `viewEvents` 事件链。事件分发 SHALL 依据 el-table 列 property（列 `key`）匹配列配置。

#### Scenario: 点击已配置列级事件的列执行列级动作
- **WHEN** 某列配置了 `onCellClick`，用户点击该列单元格
- **THEN** PageDataTable SHALL 仅执行该列动作链
- **AND** 不触发整表级 cell-click 事件链

#### Scenario: 点击未配置列级事件的列走整表级
- **WHEN** 某列未配置 `onCellClick`，用户点击该列单元格
- **THEN** PageDataTable SHALL 走原整表级 `cell-click` → `viewEvents` 事件链

### Requirement: PageDataTable SHALL 复用公共列渲染模块

PageDataTable SHALL 使用公共列渲染模块 `tableColumnRenderer`（`getCellValue`/`interpolateTemplate`/`renderCellContent`/`buildCellRender`）生成列渲染与取值，支持列配置的 `template`/`expression`/`className`/`styleExpr` 字段，保证与 PageRenderer 行为一致。

#### Scenario: 使用 template/expression 渲染列
- **WHEN** 列配置包含 `template` 或 `expression`
- **THEN** PageDataTable SHALL 按公共模块的渲染优先级（expression > template > formatter > 原始值）渲染单元格

#### Scenario: 使用 getCellValue 兼容两种行结构
- **WHEN** 行数据为 `{ data: {...} }` 内层结构或扁平结构
- **THEN** PageDataTable SHALL 通过 `getCellValue` 正确取到列值

