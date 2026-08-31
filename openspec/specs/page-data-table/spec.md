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

### Requirement: PageDataTable 列配置 SHALL 在加载与保存时保留列高级配置字段

PAGE 页面数据表格的列配置弹窗（DsBindingConfigDialog 表格模式，其"显示列"页签复用 QueryColumnsConfig）SHALL 在加载（回填）与保存（确认）列配置时保留列高级配置字段：`contentType`、`contentValue`、`className`、`styleExpr`、`onCellClick`、`custom`、`hidden`。保存到页面 schema 的列对象 SHALL 包含这些字段，使 PageDataTable 渲染时能通过公共列渲染模块（buildCellRender）正确渲染模板/表达式/样式，并通过列级 `onCellClick` 分发点击事件，与 VIEW 链路行为一致。

#### Scenario: 回填已有列时保留高级配置

- **WHEN** 打开数据表格配置弹窗，绑定列配置含 `contentType: 'template'`、`contentValue: '${name}(${status})'`、`className`、`styleExpr`、`onCellClick`、`custom`、`hidden` 字段
- **THEN** 弹窗"显示列"页签中的列配置 SHALL 保留这些高级字段，可继续编辑

#### Scenario: 保存列配置时透传高级字段

- **WHEN** 用户在数据表格配置弹窗中为列配置了 `contentType/contentValue/className/styleExpr/onCellClick/custom/hidden` 后点击确定
- **THEN** 保存到页面 schema 的列对象 SHALL 包含全部高级字段

#### Scenario: 渲染时高级配置端到端生效

- **WHEN** 页面 schema 的列配置含 `contentType: 'template'`、`contentValue: '${name}'`，页面运行时渲染 PageDataTable
- **THEN** 单元格 SHALL 按模板插值渲染，而非显示原始值

#### Scenario: 隐藏列定义保留但不渲染

- **WHEN** 列配置 `hidden: true`（自定义列取消展示）
- **THEN** 保存后 schema 保留该列定义（含高级字段）
- **AND** PageDataTable 渲染时 SHALL 跳过该列（filter !hidden）

### Requirement: PageDataTable 首次数据请求 SHALL 单次触发

PageDataTable SHALL 保证页面首次数据请求最多发起一次：挂载时数据源绑定（refId）已就绪，SHALL 由内部 SearchTable 的挂载请求承担首次加载，不再补发；挂载时绑定未就绪（SearchTable 挂载期 refId 为空因而未发请求），SHALL 在绑定就绪后补发且仅补发一次。任何挂载路径下，同参数首次数据请求 SHALL 不超过一次。

#### Scenario: 绑定就绪时挂载仅发一次

- **WHEN** PageDataTable 挂载时数据源绑定已就绪（refId 有值）
- **THEN** 系统 SHALL 仅发起 1 次首次数据请求（由 SearchTable 挂载请求承担）
- **AND** 不因绑定就绪触发补发

#### Scenario: 绑定延迟就绪时补发一次

- **WHEN** PageDataTable 挂载时绑定未就绪（refId 为空，SearchTable 未发请求）
- **AND** 随后数据源绑定就绪
- **THEN** 系统 SHALL 补发 1 次数据请求
- **AND** 后续绑定变化 SHALL 不再自动补发

#### Scenario: 绑定未就绪不发起请求

- **WHEN** refId 为空（数据源绑定未就绪）
- **THEN** SearchTable SHALL 不发起数据请求（保持现有 fetchApi 空返回语义）

