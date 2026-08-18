# 字段权限表格紧凑化设计

- 日期：2026-08-18
- 状态：待用户审阅
- 涉及组件：`frontend/src/views/designer/properties/FormPropertyTab.vue`（节点级字段权限表格）

## 1. 背景与问题

节点级「字段权限」表格当前三列：字段名 / 权限 / 数据来源。数据来源列为嵌套下拉（源类型选择 + 源字段/源节点/源变量选择，垂直堆叠），导致：

1. **每行过高**：数据来源列垂直堆叠 2 个下拉，行高显著增加；
2. **横向滚动**：字段名 + 权限 + 数据来源（170px+）总宽超出属性配置栏（约 300-400px），必须横向滚动，交互不友好；
3. **表格臃肿**：字段多（实测最大表单 11 字段）+ 每行高，整体观感差。

真实使用模式：**多数字段保持默认权限即可，仅少数字段需精调数据来源/特殊权限**。

## 2. 方案选择

经用户确认，采用**方案 A：紧凑表格 + 行内展开**。

- 方案 B（抽屉编辑器）：空间最大但跳转交互、改动大 — 未选
- 方案 C（卡片网格）：窄栏拥挤、改动大 — 未选

## 3. 设计

### 3.1 表格结构（默认 3 列，紧凑）

| 列 | 内容 | 宽度 |
|---|---|---|
| 字段名 | 文本，超长省略号截断 | flex |
| 权限 | 权限下拉（EDIT/VIEW/HIDDEN） | 固定 100px |
| 映射 | 「映射」按钮 —— 已配置时显示来源摘要并高亮为主题色 | 固定 ~110px |

### 3.2 行内展开交互（手风琴）

- 点击「映射」按钮 → 该行**下方就地展开**来源配置区（源类型下拉 + 源字段/源节点/源变量选择，复用现有 `source-cell` 逻辑）；再次点击收起
- **手风琴**：展开某行时自动收起此前展开的行（`expandedField: string | null`），保证属性栏内视图聚焦，避免多行同时展开导致表格过长
- 展开状态：单值 `ref<string | null>`（字段名），切换逻辑 `expandedField = expandedField === field ? null : field`

### 3.3 来源摘要文案（已配置映射的按钮显示）

格式：`← <来源类型中文>.<来源目标>`，按 `dataMappings[field].source` 解析：

| 存储格式 | 摘要显示 |
|---|---|
| `form:initiator` + `sourceField` | `← 发起人表单.姓名` |
| `form:<nodeId>` + `sourceField` | `← 节点.<源字段>`（节点名优先，缺省回退 nodeId） |
| `variable:<name>` | `← 变量.requestAmount` |

- 未配置（source 为空）：按钮显示「映射」（普通样式）
- 超长摘要省略号截断

### 3.4 行为规则

- 未展开的行只有一行控件高度，属性栏内**无需横向滚动**
- 权限默认值不变：选择表单后默认全字段 `EDIT`
- 存储格式不变（`FormFieldDataMapping[]`），仅 UI 层折叠/展开
- 数据来源类型切换（onSourceChange）/节点切换（onNodeChange）/源字段加载逻辑**完全复用现有实现**，仅从"常驻渲染"改为"展开时渲染"

## 4. 实现要点

- `FormPropertyTab.vue`：
  - 模板：表格增加「映射」操作列；`source-cell` 从常驻改为 `v-if="expandedField === row.field"` 条件渲染；行尾按钮文案 = 摘要或「映射」
  - 脚本：新增 `expandedField = ref<string | null>(null)`；新增 `mappingSummary(field): string` 生成摘要；`toggleExpand(field)` 切换
  - 复用一个 source-cell 内容区块即可（同一行只展开一次，无需 clone）
- 流程级 `ProcessFormPropertyTab.vue`（两列，无数据来源列）：**不动**，本身已紧凑
- 后端/存储：**零改动**

## 5. 测试策略（TDD）

更新 `frontend/src/views/designer/properties/__tests__/FormPropertyTabs.test.ts`：

**RED→GREEN 顺序：**

1. **默认不渲染 source-cell**：挂载后未点击映射按钮，`document.querySelector('.source-cell')` 不存在
2. **点击展开**：点击某行「映射」按钮 → 该行 `.source-cell` 出现
3. **手风琴收起**：点击行 A 展开 → 点击行 B 展开 → 行 A 的 source-cell 消失、行 B 出现
4. **再点收起**：点击已展开行的「映射」按钮 → 该行 source-cell 消失
5. **摘要文案**：
   - 预置 `dataMappings: [{ targetField: 'name', source: 'form:initiator', sourceField: 'name' }]` → 按钮文本含「发起人表单」
   - 预置 `variable:` 来源 → 按钮文本含「变量」
6. **既有回归**：现有 4 个数据来源配置测试需改为"先点映射按钮展开，再配置"（触发方式变化），断言逻辑不变

## 6. 影响范围

- 修改：`FormPropertyTab.vue`、`FormPropertyTabs.test.ts`
- 不动：`ProcessFormPropertyTab.vue`、stores、API、后端

## 7. 验收标准

- [ ] 未配置映射的字段行高≈单行，属性栏无需横向滚动
- [ ] 已配置映射的字段按钮显示来源摘要（`← 发起人表单.姓名` 等）
- [ ] 手风琴展开/收起符合预期，展开时来源配置可用（源字段加载、节点切换与页面前行为一致）
- [ ] 存储格式不变，保存/回读数据兼容
- [ ] 前后端全量测试通过（前端 designer 套件 22 用例 + 既有 533 后端用例无回归）