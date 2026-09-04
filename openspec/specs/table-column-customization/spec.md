# table-column-customization Specification

## Purpose
TBD - created by archiving change table-column-customization. Update Purpose after archive.
## Requirements
### Requirement: 列配置 SHALL 支持动态内容（template / expression）

列配置 `ColumnViewConfig` SHALL 支持 `template`（`${field}` 插值，支持多级字段）与 `expression`（沙箱求值的 JS 表达式，使用 `$row.xxx` 前缀，上下文注入 `value` 表示当前单元格值）。列内容渲染优先级 SHALL 为：`expression` > `template` > `formatter` > 原始值；原始值为 `null`/`undefined` 时 SHALL 显示 `—`。`expression`/`template` 的结果 SHALL 仅作文本渲染。

#### Scenario: 使用 template 插值多字段
- **WHEN** 列配置 `template` 为 `${name}(${status})`，行数据 `{ name: '张工', status: '在职' }`
- **THEN** 单元格 SHALL 显示 `张工(在职)`

#### Scenario: 使用 expression 求值
- **WHEN** 列配置 `expression` 为 `$row.amount > 1000 ? '高' : '低'`，行数据 `{ amount: 5000 }`
- **THEN** 单元格 SHALL 显示 `高`

#### Scenario: 渲染优先级 expression 高于 formatter
- **WHEN** 列同时配置 `expression` 与 `formatter`
- **THEN** 单元格 SHALL 按 `expression` 结果渲染，不使用 `formatter`

#### Scenario: 值为空显示占位符
- **WHEN** 列无 `template`/`expression`/`formatter`，原始值为 `null`
- **THEN** 单元格 SHALL 显示 `—`

### Requirement: 列配置 SHALL 支持自定义列

列 `key` 不必是真实数据字段，当配置 `template`/`expression` 时 SHALL 生成计算列；`key` 对应数据不存在的字段 SHALL 按空值处理。

#### Scenario: 基于表达式的自定义列
- **WHEN** 列配置 `key: 'total', expression: '$row.price * $row.qty'`，行数据 `{ price: 10, qty: 3 }`
- **THEN** 单元格 SHALL 显示 `30`

#### Scenario: 无字段 key 且无动态内容
- **WHEN** 列配置 `key: 'nonexist'`，无 `template`/`expression`，行数据无该字段
- **THEN** 单元格 SHALL 显示 `—`

### Requirement: 列配置 SHALL 支持列样式（className / styleExpr / cellClassName）

列配置 SHALL 支持列样式，样式配置收敛到统一 `FieldStyle` 模型（见 field-style-model）：`className`（静态 class）、`css`（原生 CSS 字符串）、`dynamic`（条件样式数组，替代 `styleExpr`，语义见 field-style-model）。旧字段读取兼容：`styleExpr` 迁移为 `dynamic`（`when: styleExpr`），`className` 迁移为 `style.className`，旧 `style`（CSS 字符串）迁移为 `style.css`。渲染时 SHALL 通过统一解析入口 `resolveFieldStyle` 应用（render 内承载包裹元素）。`TableColumn` SHALL 支持可选 `cellClassName`（静态，透传到 el-table 列的 class-name，作用于 td，与 `FieldStyle` 正交）。

#### Scenario: 静态 className 生效
- **WHEN** 列配置 `style: { className: 'col-highlight' }`
- **THEN** 该列单元格 SHALL 使用 `col-highlight` class（render 内承载）

#### Scenario: 条件 dynamic 按行生效
- **WHEN** 列配置 `style: { dynamic: [{ when: "$row.status === '异常'", style: { color: 'red' } }] }`，行状态为 `异常`
- **THEN** 该行该列单元格 SHALL 应用 `color: red` 样式

#### Scenario: styleExpr 旧配置兼容生效
- **WHEN** 列配置为旧格式 `styleExpr: "$row.status === '异常' ? 'color:red' : ''"`，行状态为 `异常`
- **THEN** 该行该列单元格 SHALL 应用 `color:red` 样式（旧字段读取兼容）

#### Scenario: 静态 cellClassName 作用于 td
- **WHEN** `TableColumn.cellClassName` 配置为 `cell-bg`
- **THEN** el-table 该列 td SHALL 应用 `cell-bg` class

### Requirement: 列配置 SHALL 支持列级单元格点击事件

列配置 SHALL 支持 `onCellClick`（`{ actions: any[] }`，动作可含 `type: 'script'`）。当列配置了 `onCellClick` 时，点击该列单元格 SHALL 仅执行列级动作链并**短路**整表级 `cell-click` 事件；未配置列级事件的列，点击 SHALL 走原整表级 `cell-click` → `viewEvents` 事件链。

#### Scenario: 列级 onCellClick 优先执行
- **WHEN** 某列配置了 `onCellClick`，点击该列单元格
- **THEN** 仅执行该列的动作链（含 script 动作）
- **AND** 不触发整表级 cell-click 事件链

#### Scenario: 未配置列级事件走整表级
- **WHEN** 某列未配置 `onCellClick`，点击该列单元格
- **THEN** 走原整表级 `cell-click` → `viewEvents` 事件链

### Requirement: 事件分发 SHALL 按列匹配

运行时单元格点击事件分发 SHALL 依据 el-table 对应列的 property（即列 `key`）匹配列配置，命中配置且存在 `onCellClick` 时执行列级动作；列级动作执行 SHALL 复用现有事件动作执行器（`dispatchButtonAction`/UE 事件，含 script 沙箱）。

#### Scenario: 按列 key 匹配列级事件
- **WHEN** 表格有 A、B 两列，仅 A 配置 `onCellClick`
- **THEN** 点击 A 列单元格执行 A 列动作
- **AND** 点击 B 列单元格不执行列级动作（走整表级）

### Requirement: 公共列渲染模块 SHALL 统一取值与渲染

系统 SHALL 提供公共列渲染模块 `tableColumnRenderer`，提供 `getCellValue`（优先 `row.data?.[key]`、回退 `row[key]`）、`interpolateTemplate`、`renderCellContent`、`buildCellRender`。PageRenderer 与 PageDataTable SHALL 复用该模块，保证行为一致。

#### Scenario: getCellValue 兼容内层 data 结构
- **WHEN** 行数据为 `{ data: { name: '张工' } }`
- **AND** 调用 `getCellValue(row, 'name')`
- **THEN** SHALL 返回 `张工`

#### Scenario: getCellValue 兼容扁平结构
- **WHEN** 行数据为 `{ name: '张工' }`
- **AND** 调用 `getCellValue(row, 'name')`
- **THEN** SHALL 返回 `张工`

### Requirement: 设计器面板 SHALL 提供列高级配置入口

列配置面板（QueryColumnsConfig/ColumnsConfig）SHALL 为每列提供"高级配置"子面板，支持编辑 `template`、`expression`、`className`、`styleExpr`、`onCellClick`。

#### Scenario: 打开列高级配置子面板
- **WHEN** 用户在列配置面板点击某列的"高级配置"
- **THEN** 弹出子面板，可编辑动态内容/样式/点击事件
- **AND** 保存后列配置 SHALL 包含对应字段

### Requirement: 设计器列高级配置 SHALL 提供统一样式结构

列高级配置面板（QueryColumnsConfig/ColumnsConfig）SHALL 以统一 `FieldStyle` 结构编辑列样式：字体、颜色、背景色、对齐为首选可视化控件（映射 `style.color/backgroundColor/fontFamily/fontSize/fontWeight/align`）；`className` 文本框与 `css` 原生字符串为逃生舱；保存后列配置 SHALL 收敛到 `style` 字段。

#### Scenario: 可视化控件保存为结构化 style
- **WHEN** 用户在高级配置面板选择字体颜色 `#f00`、字号 14、居中
- **THEN** 保存后列配置 SHALL 含 `style: { color: '#f00', fontSize: 14, align: 'center' }`

#### Scenario: 逃生舱 className 与 css 保留
- **WHEN** 用户填写 `className: 'col-highlight'` 与 `css: 'text-decoration: underline'`
- **THEN** 保存后列配置 SHALL 含 `style: { className: 'col-highlight', css: 'text-decoration: underline' }`

### Requirement: 设计器列高级配置 SHALL 提供条件样式规则编辑器

列高级配置面板 SHALL 提供条件样式规则编辑器（替代 `styleExpr` 文本框）：每条规则 SHALL 结构化编辑 `when` 条件（字段 + 运算符 + 值，或直接表达式）与命中效果（颜色/字体等可视化控件 + 可选 className），支持新增/删除/排序。多条规则 SHALL 按顺序求值、首个命中生效。

#### Scenario: 编辑条件样式规则
- **WHEN** 用户新增规则：条件 `status 等于 "异常"`，命中效果 `color: red`
- **THEN** 保存后列配置 SHALL 含 `style.dynamic: [{ when: "$row.status === '异常'", style: { color: 'red' } }]`

#### Scenario: 规则排序决定命中优先级
- **WHEN** 用户将规则 A 排在规则 B 之前，两者条件均命中
- **THEN** 渲染时 SHALL 应用规则 A 的效果（首个命中生效）

### Requirement: PageDataTable 与 PAGE 表格列配置 SHALL 保留 style 高级字段

PAGE 页面数据表格的列配置弹窗（DsBindingConfigDialog 表格模式，"显示列"页签复用 QueryColumnsConfig）SHALL 在加载与保存时保留列高级配置字段：`contentType`、`contentValue`、`style`（统一字段样式，含 `className/css/dynamic`）、`onCellClick`、`custom`、`hidden`；旧字段 `className/styleExpr/style(字符串)` 读取兼容并入 `style`。保存到页面 schema 的列对象 SHALL 包含 `style` 字段，使渲染时通过公共列渲染模块正确应用。

#### Scenario: 回填已有列保留 style
- **WHEN** 打开数据表格配置弹窗，绑定列配置含 `style: { color: '#f00', dynamic: [...] }` 与 `contentType`/`onCellClick`/`hidden` 等字段
- **THEN** 弹窗"显示列"页签中的列配置 SHALL 保留 `style` 及全部高级字段，可继续编辑

#### Scenario: 保存列配置透传 style
- **WHEN** 用户在数据表格配置弹窗中为列配置了 `style`（含动态）后点击确定
- **THEN** 保存到页面 schema 的列对象 SHALL 包含 `style` 字段

#### Scenario: 渲染时 style 端到端生效
- **WHEN** 页面 schema 的列配置含 `style: { dynamic: [...] }`，页面运行时渲染 PageDataTable
- **THEN** 单元格 SHALL 按统一字段样式解析结果渲染（含条件命中）

