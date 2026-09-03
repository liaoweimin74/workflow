## Design Summary

为 `ListCards`（卡片列表）组件添加完整的样式自定义能力，并将其与表格（PageDataTable）的字段渲染样式统一到同一套数据模型，从根本上消除当前"卡片/表格两套各自为政的字段样式体系"的矛盾。

### 核心能力

1. **卡片整体样式可自定义**：背景色、边框、圆角、内边距、间距、字体等，通过结构化 `CardStyle` 对象配置。
2. **内置主题模板 + 微调**：预置 `default/compact/loose/dark/borderless` 模板，用户选择模板后可按需覆盖个别属性；主题放在独立文件便于扩展。
3. **字段栅格布局**：12 列栅格系统，字段级 `span` 支持整行/半行/三分之一等排列。
4. **字段渲染样式统一**：新增 `FieldStyle` 模型，卡片与表格共用；收敛目前分散的 `fontFamily/fontSize/fontWeight/fontColor/className/styleExpr/style` 等属性。
5. **条件样式（动态）**：卡片整体与字段级均支持 `dynamic` 条件数组（`when` 条件表达式 + 命中样式），替代旧的 `styleExpr` 黑盒字符串。
6. **可视化配置保留并强化**：保留字体/颜色/对齐等可视化控件作为首选，`css` 文本作为高级逃生舱；条件样式升级为可视化规则编辑器。

## Alternatives Considered

### 方案 A：CSS Variables 方案
- **做法**：通过 `--card-bg`、`--card-radius` 等 CSS 变量控制样式。
- **优点**：与 CSS 生态天然兼容，运行时可动态切换。
- **缺点**：变量名需记忆、类型提示弱；无法表达字段级结构化样式与条件判断。
- **为何未采纳**：开发体验差，且无法承载字段级结构化样式与条件样式能力。

### 方案 B：Style Object 方案（Agreed）
- **做法**：用 TypeScript 类型安全的 `CardStyle`/`FieldStyle` 对象配置，通过 `theme` + `style` props 使用。
- **优点**：类型完整提示、使用直观、可序列化存储、易扩展内置模板。
- **缺点**：需要定义完整类型接口。
- **为何采纳**：IDE 智能提示最佳、与现有 schema 可序列化兼容、能统一承载条件样式。

### 方案 C：Hybrid 方案
- **做法**：CSS 变量 + 结构化布局对象两套体系并存。
- **优点**：兼顾灵活性与结构化。
- **缺点**：两套配置体系，学习成本高。
- **为何未采纳**：复杂度高，收益不明显。

## Agreed Approach

采用**方案 B（Style Object）**，并扩展为覆盖卡片整体 + 字段渲染 + 条件样式的统一模型：

- `CardStyle`：卡片整体样式（含 `dynamic` 条件）
- `FieldStyle`：字段渲染样式（含 `dynamic` 条件，表格/卡片共用）
- `ConditionalStyle`：条件样式规则（`when` + `style` + `className`）
- 渲染时统一解析，**优先级**：条件命中 > 字段级 `FieldStyle` > 卡片级 `CardStyle.fields` > 内置主题 > 默认值

## Key Decisions

1. **范围**：同步统一卡片（ListCards）与表格（PageDataTable）的字段渲染样式，不拆成两次。
2. **使用对象**：开发人员，通过类型安全的 props 配置。
3. **内置模板 + 微调**：`theme` prop 选模板，`style` prop 覆盖个别属性。
4. **字段栅格**：12 列栅格系统，字段级 `span`。
5. **条件样式统一**：`dynamic` 条件数组应用于卡片整体与字段级，替代 `styleExpr` 黑盒。
6. **可视化配置保留**：可视化控件为首选，`css` 文本为逃生舱；条件样式升级为规则编辑器。
7. **文件结构**：`ListCards.types.ts` / `ListCards.themes.ts` / `ListCards.styles.ts` 拆分，主题独立便于扩展。
8. **兼容迁移**：旧属性（fontFamily/className/styleExpr/style 等）读取兼容，保存时收敛到 `style`，提供迁移函数。

## Open Questions

- 条件样式编辑器的具体可视化形态（字段下拉 + 运算符 + 值 + 命中效果）需在 design/proposal 阶段细化。
- 后端 `ViewCompiler.java` 编译产物如何处理新 `style`/`dynamic` 结构（透传 vs 预编译）需确认。
