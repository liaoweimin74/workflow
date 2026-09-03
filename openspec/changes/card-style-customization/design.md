## Context

页面/视图设计器中存在两种数据展示方式：**表格**（PageDataTable / PageRenderer）与**卡片**（ListCards / PageDataCards）。当前两者的字段样式配置体系各自为政，导致样式能力分裂且互相矛盾：

- **卡片**（`ListCards.vue`）：`CardColumn` 提供 `fontFamily/fontSize/fontWeight/fontColor` + `style`（CSS 字符串），经 `columnStyle()` / `fieldStyle()` 应用行内样式。支持结构化字体/颜色、布局，但**不支持条件样式、忽略 `className`**。
- **表格**（`ColumnViewConfig` + `tableColumnRenderer.ts`）：`className`（静态 CSS 类）+ `styleExpr`（条件表达式）经 `buildCellRender()` 应用到 `<span>`。**支持条件样式与类名，但无结构化字体/颜色**。

两者都来源于同一个 `ViewSchema.columns`，但数据模型分叉，且 `style`（卡片静态 CSS 字符串）与 `styleExpr`（表格条件表达式）命名语义重叠。用户在表格/卡片间切换显示方式时，样式会跳变或丢失。

此外，`ListCards` 的**卡片整体样式**（底色、圆角、间距、操作栏布局等）目前硬编码在 CSS 中，无法自定义；字段级栅格布局（整行/半行/三分之一）也不支持。

**约束**：
- 面向开发人员，通过类型安全的 props 配置，尽量少写 CSS/HTML。
- 内置主题模板 + 微调，主题放在独立文件便于修改和扩展。
- 需与现有 schema 兼容，旧数据平滑迁移。

## Goals / Non-Goals

**Goals:**
- 为 `ListCards` 提供**卡片整体样式**自定义能力：背景、边框、圆角、内边距、间距、字体、卡片区域（header/actions/tags）布局。
- 提供**内置主题模板**（default/compact/loose/dark/borderless）+ 微调（`theme` + `style` props）。
- 支持**字段栅格布局**（12 列，字段级 `span`）。
- **统一卡片与表格的字段渲染样式**：引入单一 `FieldStyle` 模型，收敛 `fontFamily/fontSize/fontWeight/fontColor/className/styleExpr/style` 等分散属性。
- 卡片整体与字段级均支持**条件样式**（`dynamic` 条件数组），替代旧的 `styleExpr` 黑盒。
- **保留并强化可视化配置**：可视化控件（字体/颜色/对齐选择器）为首选，`css` 文本为高级逃生舱；条件样式升级为可视化规则编辑器。
- 提供**兼容迁移**：旧属性读取兼容，保存时收敛到 `style`。

**Non-Goals:**
- 不做 HTML/CSS 完全自定义模板（用户自定义整个卡片结构）——用栅格 + 条件样式 + `css` 逃生舱覆盖 95% 场景，剩余用外部 CSS 类覆盖。
- 不改动后端数据存储格式的强约束（需与 `ViewCompiler` 编译产物协调，但 schema 结构可演进）。
- 不做运行时热切换主题的 UI（`theme` 是静态配置 prop）。
- 不涉及表单字段、流程设计器等非"页面/视图列"的样式。

## Decisions

### D1: 采用 Style Object 方案（非 CSS Variables）

用 TypeScript 类型安全的 `CardStyle` / `FieldStyle` 对象配置，`theme` + `style` props。理由：类型完整提示、使用直观、可序列化存储、易扩展内置模板。CSS Variables 方案类型提示弱、无法承载结构化字段样式与条件样式。

### D2: 统一字段数据模型 `FieldStyle`

```typescript
/** 条件样式规则 */
interface ConditionalStyle {
  when: string                        // 条件表达式，如 $row.status === 'DONE'
  style?: Record<string, string>      // 命中时应用的样式（CSS 属性 → 值）
  className?: string                  // 命中时附加的类名
}

/** 字段渲染样式（卡片 + 表格统一） */
interface FieldStyle {
  // 结构化视觉（静态）
  color?: string
  backgroundColor?: string
  fontFamily?: string
  fontSize?: number | string
  fontWeight?: number | string
  align?: 'left' | 'center' | 'right'

  // 逃生舱
  className?: string                  // 静态 CSS 类名
  css?: string                        // 原生 CSS 字符串（替代旧 style）

  // 条件样式
  dynamic?: ConditionalStyle[]
}
```

收敛映射：`fontFamily → style.fontFamily`、`fontSize → style.fontSize`、`fontWeight → style.fontWeight`、`fontColor → style.color`、`className → style.className`、旧 `style`（CSS 字符串）→ `style.css`、`styleExpr → style.dynamic`。

### D3: 卡片整体样式 `CardStyle`

```typescript
type CardTheme = 'default' | 'compact' | 'loose' | 'dark' | 'borderless'

interface CardStyle {
  // 颜色
  backgroundColor?: string
  borderColor?: string
  hoverShadowColor?: string
  // 尺寸
  borderRadius?: number | string
  padding?: number | string
  gap?: number | string
  // 字体
  titleFontSize?: number | string
  titleFontWeight?: number | string
  titleColor?: string
  fieldFontSize?: number | string
  fieldLabelColor?: string
  fieldValueColor?: string
  // 字段布局
  fields?: {
    layout?: 'grid' | 'list'
    columns?: number
    gap?: number | string
    labelPosition?: 'left' | 'right' | 'top'
    labelWidth?: number | string
    showLabel?: boolean
    fieldStyle?: FieldStyle           // 卡片级字段默认样式
  }
  // 区域布局
  regions?: {
    header?: { show?: boolean; icon?: string | { name; color?; size? }; iconPosition?: 'left'|'right'; height? }
    actions?: { position?: 'top'|'bottom'|'right'; gap?; justify?: 'start'|'center'|'end'; buttonStyle?: {...} }
    tags?: { gap?; size?: 'small'|'default' }
  }
  // 条件样式（卡片整体，根据行数据切换外观）
  dynamic?: ConditionalStyle[]
}
```

### D4: 字段列配置扩展

```typescript
interface CardColumn {
  prop: string
  label: string
  // 角色与布局
  role?: 'title' | 'subtitle' | 'tag' | 'metric' | 'field'
  span?: number
  order?: number
  labelPosition?: 'left' | 'right' | 'top'
  showLabel?: boolean
  // 样式（统一入口）
  style?: FieldStyle
  // 动态内容
  contentType?: 'expression' | 'template'
  contentValue?: string
  // 图标
  icon?: string | { name: string; color?: string; size?: number }
  prefixIcon?: string
  suffixIcon?: string
  // 自定义渲染（覆盖率极低场景）
  render?: (row, column) => VNode
}
```

### D5: 统一渲染解析入口

在 `tableColumnRenderer.ts`（或新 `ListCards.styles.ts`）新增通用函数，表格与卡片共用：

```typescript
function resolveConditional(base: Record<string,string>, dynamic: ConditionalStyle[]|undefined, row)
  // 遍历 dynamic，首个 when 命中 → 合并 style + className

function resolveFieldStyle(base: FieldStyle|undefined, colStyle: FieldStyle|undefined, row)
  // 合并 base 与 colStyle，再叠加条件命中
```

**优先级**：条件命中 > 字段级 `Column.style` > 卡片级 `CardStyle.fields.fieldStyle` > 内置主题 > 默认值。

### D6: 可视化配置保留并强化

- 「卡片配置」页签的字体/颜色/对齐等可视化控件**保留为首选**，映射到 `style.*`。
- 新增**条件样式规则编辑器**（结构化：字段 + 运算符 + 值 + 命中效果），替代 `styleExpr` 文本框。
- `css` 原生字符串保留为高级逃生舱。
- 表格与卡片在同一个 `ColumnAdvancedConfig` 弹窗中看到**一致的样式结构**。

### D7: 主题独立文件

```
frontend/src/components/business/
├── ListCards.vue            # 主组件
├── ListCards.types.ts       # 类型定义（CardStyle/FieldStyle/ConditionalStyle）
├── ListCards.themes.ts      # CARD_THEMES 内置主题
└── ListCards.styles.ts      # 样式解析/合并/迁移工具
```

`CARD_THEMES` 独立导出，用户可 import 扩展。

## Risks / Trade-offs

- [迁移风险] 旧数据（`fontFamily/className/styleExpr/style` 等分散属性）需迁移到 `style`，若迁移不全会导致样式丢失 → **提供 `normalizeColumnStyle()` 幂等迁移，读取兼容旧字段，保存时收敛；提供迁移测试。**
- [后端协调] `ViewCompiler.java` 编译产物处理 `className/styleExpr`；新 `style/dynamic` 结构需确认透传或预编译 → **优先透传，后端零改动；前端解析 dynamic。**
- [条件表达式安全] `when` 表达式经沙箱求值（复用 `evalCellExpression`） → **复用现有 `scriptSandbox` 白名单代理。**
- [范围扩大] 同步改表格会增加改动面与回归风险 → **分任务 TDD，表格与卡片各占比测试；样式解析共用函数保证一致。**
- [条件样式编排] 多条规则命中顺序易困惑 → **首个命中生效（break），文档明确；必要时扩展 all 模式。**

## Migration Plan

1. 新增类型与工具（`ListCards.types.ts` / `ListCards.themes.ts` / `ListCards.styles.ts`）。
2. `ListCards.vue` 消费 `CardStyle` + `FieldStyle`，替换硬编码 CSS 为 CSS 变量注入。
3. `tableColumnRenderer.ts` 新增 `resolveFieldStyle` 统一入口，`buildCellRender` 改用它。
4. `PageDataTable` / `PageRenderer` / `ListCards` 三处渲染链路统一到 `resolveFieldStyle`。
5. `ColumnAdvancedConfig` / `QueryColumnsConfig` 配置面板映射到 `style.*`，新增条件样式编辑器。
6. 迁移函数 `normalizeColumnStyle` 兼容旧数据读写。
7. 后端 `ViewCompiler` 透传 `style` / 无需改动（动态在编译产物保留原始字段）。
8. 全量测试回归 + `vue-tsc` 类型检查。

**回滚策略**：新 `style` 字段与旧字段读取兼容，回滚仅需恢复旧渲染逻辑，数据格式不破坏。

## Open Questions

- 条件样式规则编辑器的具体可视化形态（字段下拉 + 运算符 + 值 + 命中效果控件）在实现细节中确定。
- 卡片整体条件样式是否也需要在 `PageDataCards` 增加的 props 透传——需确认 `PageRenderer` 的卡片 schema 是否新增 `style` 配置（本期聚焦开发人员 props 用法，设计器 schema 集成可后续）。
