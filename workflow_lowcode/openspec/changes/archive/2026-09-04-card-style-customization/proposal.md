## Why

页面/视图设计器中，卡片（ListCards）与表格（PageDataTable）的字段样式配置体系各自为政且互相矛盾：卡片走 `fontFamily/fontSize/fontColor` + `style`（CSS 字符串），支持结构化字体与布局但无条件样式、忽略 `className`；表格走 `className` + `styleExpr`（条件表达式），支持条件样式但与卡片不互通。用户在卡片/表格间切换显示方式时样式会跳变或丢失，维护两套体系成本高。同时卡片整体样式（底色、圆角、间距、操作栏布局）与字段栅格布局完全硬编码，无法自定义。本变更统一字段渲染样式模型、补齐卡片整体样式自定义，使开发人员能通过类型安全的配置覆盖 95% 场景。

## What Changes

**字段渲染样式统一（卡片 + 表格）**
- From: 卡片用 `fontFamily/fontSize/fontWeight/fontColor/style`，表格用 `className/styleExpr`，两套不互通。
- To: 引入统一 `FieldStyle` 模型（`color/backgroundColor/fontFamily/fontSize/fontWeight/align/className/css/dynamic`），卡片与表格共用解析入口 `resolveFieldStyle()`。
- Reason: 消除样式体系分叉，切换显示方式不跳变。
- Impact: 非破坏，旧字段读取兼容并入 `style`，保存时收敛。

**条件样式统一（dynamic 数组替代 styleExpr）**
- From: `styleExpr` 是黑盒时间字符串，仅表格可用。
- To: 卡片整体与字段级均支持 `dynamic` 条件数组（`{ when, style?, className? }`），复用沙箱求值。
- Impact: 非破坏，`styleExpr` 读取兼容并迁移为 `dynamic`。

**卡片整体样式自定义 + 内置主题**
- From: `ListCards` 卡片样式硬编码在 CSS。
- To: `CardStyle` 对象 + 内置主题模板（`default/compact/loose/dark/borderless`），`theme` + `style` props。
- Impact: 新增能力，非破坏。

**字段栅格布局**
- From: 卡片字段固定排列。
- To: 12 列栅格，字段级 `span`（整行/半行/三分之一）。
- Impact: 新增能力，非破坏。

**可视化配置保留并强化**
- From: 表格用 `styleExpr` 文本框，卡片用字体/颜色控件，分属两处。
- To: 卡片与表格在 `ColumnAdvancedConfig` 弹窗看到一致样式结构；可视化控件为首选，`css` 为逃生舱；条件样式升级为可视化规则编辑器。
- Impact: 非破坏，配置面板重构。

## Capabilities

### Modified Capabilities
- `list-cards-rendering`: 卡片支持 `CardStyle` 整体样式自定义（内置主题、区域布局）与字段栅格布局，字段级样式统一到 `FieldStyle`，支持字段级与卡片级条件样式（`dynamic`）。
- `table-column-customization`: 列样式从 `className/styleExpr/cellClassName` 收敛到统一 `FieldStyle`（`className/css/dynamic` 对齐），条件样式可视化编辑，读取兼容旧字段。
- `page-data-table`: 复用统一 `resolveFieldStyle` 渲染字段样式与条件样式，保证与卡片行为一致。

### New Capabilities
<!-- 样式统一涉及跨卡片/表格的公共渲染，以独立 capability 承载统一模型契约 -->
- `field-style-model`: 定义统一字段渲染样式模型 `FieldStyle`/`ConditionalStyle` 与解析规则 `resolveFieldStyle`，作为卡片与表格共用的样式契约。

## Impact

- **前端组件**：`ListCards.vue`（卡片整体样式 + 字段渲染）、`PageDataTable.vue` / `PageRenderer`（复用统一解析）、`PageDataCards.vue`（props 透传）。
- **公共模块**：`tableColumnRenderer.ts`（`resolveFieldStyle` 入口）、新建 `ListCards.types.ts` / `ListCards.themes.ts` / `ListCards.styles.ts`。
- **配置面板**：`ColumnAdvancedConfig.vue` / `QueryColumnsConfig.vue`（样式结构统一 + 条件样式规则编辑器）。
- **类型层**：`ViewDesigner.vue` 的 `ColumnViewConfig` 扩展 `style` 字段。
- **后端**：`ViewCompiler.java` 编译产物透传 `style`/`dynamic`（动态表达式在运行时求值），无需改动存储格式。
- **测试**：新增字段样式解析、条件样式、主题应用、配置迁移的单元测试。
