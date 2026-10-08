# Implementation Tasks

## Task 1: 新增统一字段样式模型与解析工具

**Goal**: 在 `frontend/src/utils/tableColumnRenderer.ts`（或新 `frontend/src/utils/fieldStyle.ts`）新增 `FieldStyle`/`ConditionalStyle` 类型与 `resolveFieldStyle(base, columnStyle, row)`、`normalizeColumnStyle(column)` 工具，卡片与表格共用。

**Actions**:
1. 定义 `ConditionalStyle`（`when`/`style?`/`className?`）与 `FieldStyle`（`color/backgroundColor/fontFamily/fontSize/fontWeight/align/className/css/dynamic`）类型。
2. 实现 `resolveFieldStyle`：合并 base 与 columnStyle，遍历 `dynamic` 首个命中（经 `scriptSandbox` 求值 `when`，上下文 `$row`/`value`）覆盖样式与附加 className。
3. 实现 `normalizeColumnStyle`：旧 `fontFamily/fontSize/fontWeight/fontColor/className/style(字符串)/styleExpr` 收敛到 `style`，幂等。
4. 新增单元测试：合并优先级、首个命中、无命中、迁移幂等、旧值让位结构化值。

**Acceptance**:
- `resolveFieldStyle({color:'black'}, {color:'red'}, row)` 返回 `{color:'red'}`（字段级优先）。
- 条件命中覆盖字段级；多条规则首个命中 break。
- `normalizeColumnStyle` 对旧字段收敛且幂等；已有 `style.color` 不被 `fontColor` 覆盖。
- 测试通过（vitest）。

## Task 2: 新增卡片类型/主题/样式工具文件

**Goal**: 新建 `frontend/src/components/business/ListCards.types.ts`、`ListCards.themes.ts`、`ListCards.styles.ts`。

**Actions**:
1. `ListCards.types.ts`：定义 `CardTheme`（`default|compact|loose|dark|borderless`）、`CardStyle`（背景/边框/圆角/内边距/间距/字体/`fields`/`regions`/`dynamic`）、扩展 `CardColumn`（`role/span/order/style/icon/prefixIcon/suffixIcon/render`）。
2. `ListCards.themes.ts`：导出 `CARD_THEMES`，定义 5 个内置主题（紧凑/宽松/暗色/无边框/默认）。
3. `ListCards.styles.ts`：卡片样式组合工具（theme 与 style 合并、CSS 变量注入、区域布局解析），复用 `resolveFieldStyle`。
4. 新增单元测试：theme+style 合并（style 优先）、主题字段完整、卡片级 dynamic 解析。

**Acceptance**:
- `CARD_THEMES` 含 5 个主题，字段完整（背景/圆角/间距/字体）。
- theme+style 合并结果 style 优先。
- 测试通过。

## Task 3: ListCards.vue 消费 CardStyle/FieldStyle

**Goal**: 改造 `frontend/src/components/business/ListCards.vue`：接入 `theme`/`style` props、字段栅格、区域布局、条件样式，替换硬编码 CSS。

**Actions**:
1. props 新增 `theme?: CardTheme`、`style?: CardStyle`，计算合并样式注入 CSS 变量。
2. 字段渲染改经 `resolveFieldStyle`，支持 `span` 栅格（12 列）与 `role` 区域归类。
3. `regions.header/actions/tags` 布局生效；图标（`icon/prefixIcon/suffixIcon`）渲染。
4. 卡片级 `dynamic` 应用整卡样式；保留 slot/render 逃生舱。
5. 更新组件测试：主题、style 覆写、栅格 span、条件样式、图标。

**Acceptance**:
- 卡片按 theme+style 渲染；`span:6` 半行、`span:12` 整行。
- 字段级与卡片级 `dynamic` 按行生效。
- 既有测试通过、`vue-tsc` 无类型错误。

## Task 4: 统一表格渲染入口

**Goal**: `tableColumnRenderer.ts` 的 `buildCellRender` 改为消费 `resolveFieldStyle`，PageRenderer 与 PageDataTable 复用。

**Actions**:
1. `buildCellRender` 内部将列配置经 `normalizeColumnStyle` 归一化，再经 `resolveFieldStyle` 应用样式与条件。
2. 保留 `TableColumn.cellClassName`（td 级）正交行为。
3. 更新表格渲染测试：统一样式、旧 styleExpr 兼容、cellClassName。

**Acceptance**:
- 表格单元格按统一 `FieldStyle` 渲染；旧 `styleExpr` 兼容。
- 既有表格测试全部通过。

## Task 5: 配置面板统一样式结构

**Goal**: 改造 `ColumnAdvancedConfig.vue`（基础设置页签）与 `QueryColumnsConfig.vue`：卡片/表格共用一致 `FieldStyle` 结构。

**Actions**:
1. "基础设置"页签：可视化控件（字体/颜色/背景/对齐）映射 `style.*`；`className`/`css` 逃生舱。
2. 保存时经 `normalizeColumnStyle` 收敛到 `style`。
3. 组件测试：可视化控件回填/保存映射正确。

**Acceptance**:
- 保存后列配置含 `style` 结构化字段；旧字段读取兼容回填。
- 测试通过。

## Task 6: 条件样式规则编辑器

**Goal**: 新增条件样式规则编辑器（替换 `styleExpr` 文本框），支持字段+运算符+值条件、命中效果可视化、增删排序。

**Actions**:
1. 新建规则编辑器组件（规则列表：条件构造器 + 命中效果控件 + 排序/删除）。
2. 生成 `dynamic` 数组写入 `style.dynamic`；读取回填。
3. 测试：新增规则生成正确 `when` 表达式、排序决定优先级、回填。

**Acceptance**:
- 保存生成 `style.dynamic`；渲染时按首个命中生效。
- 测试通过。

## Task 7: ViewDesigner 类型扩展与后端透传

**Goal**: `ViewDesigner.vue` 的 `ColumnViewConfig` 扩展 `style?: FieldStyle`；后端 `ViewCompiler.java` 编译产物透传 `style`/`dynamic`（不预编译，运行时求值）。

**Actions**:
1. `ColumnViewConfig` 增 `style` 字段（可选）。
2. 后端编译器保留列对象中 `style`/`dynamic` 字段（透传）。
3. 类型检查 + 编译验证。

**Acceptance**:
- 类型检查通过；后端编译通过；schema 保存/加载保留 `style`。

## Task 8: PageDataCards/PageDataTable 集成与回归

**Goal**: `PageDataCards.vue` 透传 theme/style 相关配置；全量回归。

**Actions**:
1. `PageDataCards.vue` props 透传；`PageDataTable.vue` 确认经统一渲染入口。
2. 运行前端全部测试 + `vue-tsc` + 后端编译。
3. 手工验证：表格↔卡片切换样式一致、条件样式、主题切换。

**Acceptance**:
- 全量测试通过；`vue-tsc` 无错误；后端编译通过。
- 表格与卡片字段样式行为一致。
