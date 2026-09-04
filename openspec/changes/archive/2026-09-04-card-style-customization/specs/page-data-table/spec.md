## MODIFIED Requirements

### Requirement: PageDataTable SHALL 复用公共列渲染模块

PageDataTable SHALL 使用公共列渲染模块 `tableColumnRenderer`（`getCellValue`/`interpolateTemplate`/`renderCellContent`/`buildCellRender`）生成列渲染与取值，支持列配置的 `template`/`expression`/`style`（统一字段样式模型 `FieldStyle`，含 `className/css/dynamic`，见 field-style-model）字段，旧 `className/styleExpr` 字段读取兼容并迁移入 `style`，保证与 PageRenderer、ListCards 行为一致。单元格样式 SHALL 经统一解析入口 `resolveFieldStyle` 应用，条件样式按行求值、首个命中生效。

#### Scenario: 使用 template/expression 渲染列
- **WHEN** 列配置包含 `template` 或 `expression`
- **THEN** PageDataTable SHALL 按公共模块的渲染优先级（expression > template > formatter > 原始值）渲染单元格

#### Scenario: 使用 getCellValue 兼容两种行结构
- **WHEN** 行数据为 `{ data: {...} }` 内层结构或扁平结构
- **THEN** PageDataTable SHALL 通过 `getCellValue` 正确取到列值

#### Scenario: 统一字段样式与条件样式生效
- **WHEN** 列配置含 `style: { dynamic: [{ when: "$row.status === '异常'", style: { color: 'red' } }] }`，行状态为 `异常`
- **THEN** 该行该列单元格 SHALL 应用 `color: red`

#### Scenario: 旧 styleExpr 兼容生效
- **WHEN** 列配置为旧格式 `styleExpr: "$row.amount > 1000 ? 'color:blue' : ''"`，行金额大于 1000
- **THEN** 该行该列单元格 SHALL 应用 `color:blue`（旧字段读取兼容）

### Requirement: PageDataTable 列配置 SHALL 在加载与保存时保留列高级配置字段

PAGE 页面数据表格的列配置弹窗（DsBindingConfigDialog 表格模式，其"显示列"页签复用 QueryColumnsConfig）SHALL 在加载（回填）与保存（确认）列配置时保留列高级配置字段：`contentType`、`contentValue`、`style`（统一字段样式，含 `className/css/dynamic`）、`onCellClick`、`custom`、`hidden`；旧字段 `className`/`styleExpr`/`style`（CSS 字符串）读取兼容并入 `style`。保存到页面 schema 的列对象 SHALL 包含 `style` 字段，使 PageDataTable 渲染时能通过公共列渲染模块（buildCellRender）正确渲染模板/表达式/统一样式，并通过列级 `onCellClick` 分发点击事件，与 VIEW 链路行为一致。

#### Scenario: 回填已有列时保留高级配置
- **WHEN** 打开数据表格配置弹窗，绑定列配置含 `contentType: 'template'`、`contentValue: '${name}(${status})'`、`style: { color: '#f00', dynamic: [...] }`、`onCellClick`、`custom`、`hidden` 字段
- **THEN** 弹窗"显示列"页签中的列配置 SHALL 保留这些高级字段，可继续编辑

#### Scenario: 保存列配置时透传高级字段
- **WHEN** 用户在数据表格配置弹窗中为列配置了 `contentType/contentValue/style/onCellClick/custom/hidden` 后点击确定
- **THEN** 保存到页面 schema 的列对象 SHALL 包含全部高级字段，含 `style`

#### Scenario: 渲染时高级配置端到端生效
- **WHEN** 页面 schema 的列配置含 `contentType: 'template'`、`contentValue: '${name}'`，页面运行时渲染 PageDataTable
- **THEN** 单元格 SHALL 按模板插值渲染，而非显示原始值

#### Scenario: 隐藏列定义保留但不渲染
- **WHEN** 列配置 `hidden: true`（自定义列取消展示）
- **THEN** 保存后 schema 保留该列定义（含高级字段）
- **AND** PageDataTable 渲染时 SHALL 跳过该列（filter !hidden）
