## MODIFIED Requirements

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

## ADDED Requirements

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
