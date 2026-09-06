# Workflow Admin Design System

## 0. Research Log

- Existing UI inspection: reused Element Plus form/dialog/table primitives and the existing card-settings grid; no external brand reference was supplied.

## 1. Atmosphere & Identity

An operational admin console: compact, calm, and information-dense without feeling cramped. The signature is consistent form rhythm—top-aligned labels, restrained borders, and clear full-width editing surfaces for CSS and rule tables.

## 2. Color

### 2.1 Brand Colors (靛蓝主色 & 青色点缀)

| Role | Token | Value | Usage |
|---|---|---|---|
| Industrial 500 (Primary) | `--ds-industrial-500` | `#5755ee` | 主色靛蓝 - 品牌主色 |
| Industrial 600 | `--ds-industrial-600` | `#5452d3` | 主色靛蓝深调 - hover/focus |
| Accent 100 | `--ds-accent-100` | `#c6edf4` | 青色淡雅 - 背景点缀 |
| Accent 400 | `--ds-accent-400` | `#48e0dd` | 青色点缀 - 次要操作 |
| Accent 500 | `--ds-accent-500` | `#46c9d6` | 青色点缀 - 强调和反馈 |

### 2.2 Semantic Colors

| Role | Token | Value | Usage |
|---|---|---|---|
| Surface | `--ds-surface` | `#ffffff` | Dialog and editor surfaces |
| Text primary | `--ds-text-primary` | `#303133` | Labels and values |
| Text secondary | `--ds-text-secondary` | `#606266` | Hints and summaries |
| Text muted | `--ds-text-muted` | `#909399` | Empty states |
| Border | `--ds-border` | `#e9edfa` | 卡片边框 - 细边框 |
| Selected | `--ds-selected` | `#e9eaff` | 选中态 - 列表/按钮 |
| Card Shadow | `rgba(87, 85, 238, 0.06)` | Shadow | 卡片阴影 - `0 1px 3px` |
| Danger | `--ds-danger` | `#f56c6c` | Delete actions and invalid states |
| Safety | `--ds-safety` | `#f59e0b` | 安全业务语义色 - 琥珀色 |

### 2.3 Background System (浅蓝紫背景)

| 场景 | Token | Value |
|---|---|---|
| 页面底 | `--ds-bg-page` | `#f1f4fe` |
| 侧边栏亮模式 | `--ds-bg-sidebar-light` | `#eef0fc` |
| 侧边栏暗模式 | `--ds-bg-sidebar-dark` | `#161b36` |
| 背景渐变 | Gradient | `linear-gradient(#f4f6fe, #eef1fc)` |

### 2.4 Dark Mode Colors (暗色模式)

| Role | Token | Value | Usage |
|---|---|---|---|
| Dark Base | `--ds-dark-base` | `#12162b` | 暗色底 |
| Dark Card | `--ds-dark-card` | `#1b2040` | 暗色卡片背景 |
| Dark Border | `--ds-dark-border` | `#2a3054` | 暗色边框 |
| Industrial Lite | `--ds-dark-industrial-lite` | `#7c7ff0` | 主色微亮 |
| Cyan | `--ds-dark-cyan` | `#5ee7e8` | 青色 - 暗色主题点缀 |
| Text Primary | `--ds-dark-text-primary` | `#e5e7eb` | 暗色文字主 |
| Text Secondary | `--ds-dark-text-secondary` | `#94a3b8` | 暗色文字次 |

### 2.5 Extended Scales (Tailwind @theme 扩展色阶)

`frontend/src/style.css` `@theme` 中的完整色阶（令牌名保留 `industrial` / 新增 `accent`）：

| Scale | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|---|---|
| `industrial` (靛蓝) | `#f3f3fe` | `#e9eaff` | `#d6d6fd` | `#b9b9f9` | `#8a8af4` | `#5755ee` | `#5452d3` | `#4342b5` | `#35349a` | `#2a2970` |
| `accent` (青) | `#ecfbfd` | `#c6edf4` | `#a5e4ee` | `#6fd8e5` | `#48e0dd` | `#46c9d6` | `#2ca7b5` | `#1f8592` | — | — |

### 2.6 Element Plus 派生变量（style.css 覆盖）

亮色 `:root`：
- primary 系：`--el-color-primary: #5755ee`；light-3 `#8a8af4` / light-5 `#abaaf6` / light-7 `#c6c5f7` / light-8 `#d7d6f8` / light-9 `#e8e8f8` / dark-2 `#4544be`
- 边框系：`#e3e8f7`（border）/ `#e9edfa`（light）/ `#eef1fc`（lighter）/ `#f4f6fe`（extra-light）
- 填充系：`#f0f1fb`（fill）/ `#f4f6fe`（light）/ `#f8f9fe`（lighter）/ `#ffffff`（blank）
- 文字系：`#1f2437`（primary）/ `#4b5169`（regular）/ `#8b91ab`（secondary）/ `#b0b5c9`（placeholder）

暗色 `.dark`：
- primary 系：`--el-color-primary: #7c7ff0`；light-3 `#999bf4` / light-5 `#b0b2f7` / light-7 `#c8c9fa` / light-9 `#e0e1fc` / dark-2 `#6365c2`
- 表面系：`--el-bg-color: #1b2040`；overlay `#222750`；fill `#232950` / fill-light `#2a3158` / fill-lighter `#303860`
- 边框系：`#2a3054` / `#323a63` / `#3a4370`
- 文字系：`#e5e7eb`（primary）/ `#c3c8d9`（regular）/ `#94a3b8`（secondary）

### 2.7 Decorative Gradients (装饰渐变)

| 用途 | Value |
|---|---|
| 登录页背景 | `linear-gradient(135deg, #eef1fc 0%, #dcdcfb 45%, #c6edf4 100%)`（暗色：`#12162b → #1b2040 → #2a3054`） |
| 登录按钮/Logo 渐变 | `linear-gradient(90deg, #5755ee, #46c9d6)`；hover 微亮 `#6361f0 → #5ad4df` |
| 仪表盘横幅 | `linear-gradient(90deg, #eef0fc, #f8f9fe)`（暗色：`#1b2040 → #222750`） |
| 流程卡片 hover 上条 | `linear-gradient(90deg, #5755ee, #46c9d6)`

## 3. Typography

- Primary: system UI stack already used by the application.
- Body: 14px / 1.5.
- Caption and hints: 12px / 1.4.
- Labels: 14px / 1.4, medium weight.

## 4. Spacing & Layout

- Base unit: 4px.
- Dialog content gap: 16px.
- Form item gap: 16px.
- Configuration grids use 24 equal columns.
- Top-aligned labels are mandatory for style editors.
- CSS scripts, base classes, condition tables, and action lists span all 24 columns.
- Only semantically related short controls share a row: role/value type and alignment/show-label.

## 5. Components

### StyleScriptInput
- **Structure**: textarea with a trailing edit-icon button and a modal editor.
- **Variants**: base script and conditional script.
- **Spacing**: full-width, 16px form gap.
- **States**: empty, populated, focused, modal-open, disabled.
- **Accessibility**: labeled textarea; edit button has an accessible label and keyboard focus.
- **Motion**: Element Plus dialog transition only.
- **Layout**: full-width stack.

### StyleRuleTable
- **Structure**: compact bordered table with enabled switch, expression input, script input, class input, delete action.
- **Variants**: card scope and field scope.
- **Spacing**: small table density; full-width grid item.
- **States**: empty, populated, focused, disabled rule, invalid expression.
- **Accessibility**: visible column labels; tooltip help on expression label; keyboard-editable cells.
- **Motion**: no decorative motion.
- **Layout**: full-width grid.

### Configuration Dialog
- **Structure**: Element Plus dialog, top-label form, footer actions.
- **Variants**: card style and field advanced settings.
- **Spacing**: 16px grid gap; consistent aligned edges.
- **States**: default, editing, validation error, modal script editor.
- **Accessibility**: dialog focus management delegated to Element Plus; icon buttons have labels.
- **Motion**: standard dialog transition.
- **Layout**: bounded dialog with content scroll when necessary.

## 6. Motion & Interaction

- Use existing Element Plus transitions.
- Interactive controls require visible hover/focus states.
- No decorative animation is introduced.

## 7. Depth & Surface

Strategy: mixed, using Element Plus borders for editor boundaries and restrained elevation for dialogs. Tables and script inputs use `--ds-border`; dialogs use the existing Element Plus elevated surface.

## 8. Accessibility Constraints & Accepted Debt

- Every input must have a visible label or an explicit accessible label.
- Icon-only edit buttons must expose an accessible name.
- Condition help must be available through keyboard focus as well as mouse hover.
- Tables must remain usable at narrow widths through horizontal scrolling rather than clipped content.
- Accepted debt: existing application-wide type errors outside the changed components are not part of this UI refinement.

## 9. 流程设计器 (Process Designer) — 设计面

> 视觉参考：AntV X6 BPMN 例子（`x6.antv.antgroup.com/examples/showcase/practices/#bpmn`）。
> 风格定调：亮色、柔和、信息密度适中的 BPMN 建模器。节点用「柔和填充 + 同色描边 + 轻投影」，
> 节点面板用卡片式分组，属性栏用分节卡片。靛蓝 `--ds-industrial-500` / 青 `--ds-accent-500` 与参考稿的
> 主色/点缀色同源，作为本设计面主色。

### 9.1 CanvasNode（画布节点）token

| 节点类别 | Fill | Stroke | 备注 |
|---|---|---|---|
| 用户任务/发起 | `#fff`（白底） | `--ds-industrial-500` | 空白任务框，描边主色，圆角 12px |
| 服务任务 | `#f7f8ff` | `--ds-industrial-300` | 极浅靛蓝底，副色描边 |
| 调用活动/子流程 | 白底带标题带 | `--ds-industrial-200` | 子流程加标题条 |
| 事件(圆) | 白底 `#fff` | 开始 `#46c9d6`(青) / 结束 `#f56c6c`(红) | 外圈白底,粗描边 |
| 网关(菱形) | `#fffdf3` | `--ds-safety` | 浅琥珀底,琥珀描边 |

- 节点投影：`0 1px 3px rgba(31, 36, 55, 0.08)`
- 选中：描边加粗 + `box-shadow 0 0 0 3px rgba(87,85,238,0.18)` 光晕
- hover：描边主色，轻投影加深

### 9.2 NodePalette（左侧节点面板）原语

- 面板底色 `#fff`，右缘 `1px solid var(--ds-border)`
- 分组：每组一个圆角 10px 的浅色卡片块（底 `--ds-bg-page #f4f6fe`）
- 组内项：白底圆角 8px 条目，图标置于 32px 圆角方形 chip 中，chip 底色随节点类别
- hover：`background var(--ds-selected #e9eaff)`；active 微缩放
- 折页态宽度 200px → 40px 竖条

### 9.3 PropertyPanel（右侧属性栏）原语

- 面板底色 `#fff`，左缘 `1px solid var(--ds-border)`；展开 300px
- 头部：白底 + 底部细分隔线，标题 14px/600，右侧标签
- 内容区：内边距 16px，分节用 `el-divider`（文本加粗 600）
- 折页态 300px → 32px 竖条
