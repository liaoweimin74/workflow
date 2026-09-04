## ADDED Requirements

### Requirement: 系统 SHALL 提供统一字段渲染样式模型 FieldStyle

系统 SHALL 提供统一字段渲染样式模型 `FieldStyle`，卡片（ListCards）与表格（PageRenderer/PageDataTable）共用。`FieldStyle` SHALL 包含结构化视觉属性：`color`、`backgroundColor`、`fontFamily`、`fontSize`、`fontWeight`、`align`（`left|center|right`）；SHALL 包含逃生舱：`className`（静态 CSS 类）、`css`（原生 CSS 字符串）；SHALL 包含条件样式 `dynamic`（见条件样式要求）。

#### Scenario: 结构化字体颜色生效
- **WHEN** `FieldStyle` 配置 `{ color: '#f00', fontFamily: 'monospace', fontSize: 14, fontWeight: 600, align: 'center' }`
- **THEN** 卡片与表格渲染时 SHALL 使用该颜色、字体、字号、字重并对齐居中

#### Scenario: className 与 css 逃生舱生效
- **WHEN** `FieldStyle` 配置 `{ className: 'col-highlight', css: 'text-decoration: underline' }`
- **THEN** 渲染元素 SHALL 附加 `col-highlight` class 并应用 `text-decoration: underline` 内联样式

### Requirement: 系统 SHALL 提供统一条件样式模型 ConditionalStyle

系统 SHALL 提供条件样式模型 `ConditionalStyle`：`when`（沙箱求值的条件表达式，上下文含 `$row.xxx` 与 `value`）、可选 `style`（命中时应用的 CSS 属性映射）、可选 `className`（命中时附加的类名）。字段级（`FieldStyle.dynamic`）与卡片级（`CardStyle.dynamic`）SHALL 复用同一模型。多条规则 SHALL 按数组顺序求值，**首个命中**的条件生效（break）。

#### Scenario: 首个命中条件生效
- **WHEN** `dynamic` 为 `[{ when: "$row.status === '异常'", style: { color: 'red' } }, { when: "true", style: { color: 'blue' } }]`，行状态为 `异常`
- **THEN** SHALL 应用 `color: red`，不应用后续 `color: blue`

#### Scenario: 无命中用基础样式
- **WHEN** `dynamic` 规则均未命中，`when` 表达式返回假值
- **THEN** SHALL 保持基础样式（不叠加任何条件样式）

### Requirement: 系统 SHALL 提供统一解析入口 resolveFieldStyle

系统 SHALL 提供 `resolveFieldStyle(base, columnStyle, row)` 统一解析入口，返回合并后的最终样式。合并优先级 SHALL 为：条件命中（dynamic）> 字段级 `columnStyle` > 卡片/表格级 `base` > 默认值。条件命中合并 SHALL 覆盖同名字段已解析的样式。

#### Scenario: 优先级字段级高于基础级
- **WHEN** `base` 配置 `{ color: 'black' }`，`columnStyle` 配置 `{ color: 'red' }`，无条件样式
- **THEN** SHALL 返回 `{ color: 'red' }`

#### Scenario: 条件命中覆盖字段级
- **WHEN** `columnStyle` 配置 `{ color: 'black', dynamic: [{ when: "true", style: { color: 'red' } }] }`
- **THEN** SHALL 返回 `{ color: 'red' }`（条件覆盖字段级）

### Requirement: 系统 SHALL 提供旧样式字段兼容迁移

系统 SHALL 提供 `normalizeColumnStyle`，读取兼容并收敛旧分散字段：`fontFamily → style.fontFamily`、`fontSize → style.fontSize`、`fontWeight → style.fontWeight`、`fontColor → style.color`、`className → style.className`、旧 `style`（CSS 字符串）→ `style.css`、`styleExpr → style.dynamic`。迁移 SHALL 幂等（重复调用结果一致），并优先保留已存在的 `style` 结构化字段。

#### Scenario: fontColor 迁移为 color
- **WHEN** 列配置含 `{ fontColor: '#f00' }` 且无 `style.color`
- **THEN** `normalizeColumnStyle` 结果 SHALL 含 `style.color === '#f00'`

#### Scenario: 已有结构化值不被覆盖
- **WHEN** 列配置含 `{ style: { color: '#0f0' }, fontColor: '#f00' }`
- **THEN** `normalizeColumnStyle` 结果 SHALL 保留 `style.color === '#0f0'`（旧值让位）
