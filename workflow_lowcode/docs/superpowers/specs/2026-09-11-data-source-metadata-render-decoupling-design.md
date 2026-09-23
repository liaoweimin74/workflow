# Design: 数据源字段元数据渲染解耦（componentType 退出 metadata 渲染链路）

## Context

数据源 metadata 的 columns 复用表单 `ColumnConfig` 类型（`backend/.../engine/form/column/ColumnConfig.java`），其中混入两类语义不同的字段：

- **查询能力**（数据源本职）：key / label / columnType / length / scale / required / unique / indexed / hidden / sortable / filterable / matchType
- **渲染属性**（表单本职）：componentType / pickerConfig / storageMode / subColumns / subMode

问题：

1. componentType 是表单字段的渲染属性（表单设计器 `ColumnConfigDialog.vue` 定义），数据源不渲染，却在 metadata 中声明并允许在数据源管理页编辑——语义错位。
2. componentType 只携带组件类型字符串，复杂组件（lookupPicker / dataPicker / select）的完整配置（url / options / displayField / props）都在表单 schema.rule 里。**无 formKey 的 SQL/API 数据源**编辑弹窗与查询栏拿到 componentType 只能渲染空壳。
3. 列表渲染真正依赖的机制是 **`<key>_text` 冗余列**（后端表单发布时生成、`BizDataSupport` 为 data-picker 生成展示缓存文本）与**表单 schema**，componentType 只是触发分支的开关。

本设计将数据源 metadata 链路的渲染决策从 componentType 迁移到「表单 schema `rule.type` 优先 + `_text` 列存在性 + columnType 降级」，让数据源只负责声明"能查什么、怎么查"。

## Goals / Non-Goals

**Goals:**

- 数据源 metadata 链路的渲染决策不再依赖 componentType：
  - 数组值列展示 → 由 `<key>_text` 列存在性触发
  - 查询栏组件分支 → 有 formKey 时由表单 schema `rule.type` 驱动；无 formKey 时按 columnType 降级基础组件
  - 可筛性（JSON 主列走 `_text` 筛）→ 由 `_text` 列存在性触发
- 数据源管理页「字段元数据」tab：componentType **不再提供编辑**（FORM/WORKFLOW 只读展示来源，SQL/API/SYSTEM 隐藏该列）
- matchType（查询方式）保留在 metadata 且可编辑（查询能力，不属于本设计变更范围）

**Non-Goals:**

- 不物理删除 metadata columns 的 componentType 字段（保留向后兼容，标注弃用，彻底移除留待后续独立变更）
- 不拆分独立 `DataSourceColumn` DTO（方案 C 不做）
- 不改 matchType 查询链路（`ViewCompiler` / 后端筛选条件构造）
- 不改表单设计器（表单定义中的 componentType 是合法配置，保留）
- 不改 `BizDataListPage.vue`（表单自身列表页，消费表单定义而非数据源 metadata，已是正确样板）

## 核心机制：`_text` 列存在性替代 componentType 渲染判断

| 原 componentType 判断 | 替代机制 |
|---|---|
| 数组值列 formatter 优先读 `<key>_text`（`ARRAY_COMPONENT_TYPES`） | metadata 中存在 `<key>_text` 列 → formatter 优先读 `_text`；缺失回退 value join（现有逻辑保留） |
| 查询栏组件分支（select / tree / cascader / lookupPicker / date-picker） | 有 formKey → `findFormRuleByKey(key)?.type`（表单 schema rule，含 options/props）；无 rule → 按 columnType 降级（DATE/DATETIME → date-picker，其余 → input） |
| JSON 主列可筛性（查询走 `<key>_text` 显示列） | `<key>_text` 列存在 → 该列可筛（筛 `_text` 列）；对齐 `BizDataListPage.filterableColumns` 已有模式 |

`_text` 列已在 metadata.columns 中（hidden=true，如 `{ key: 'dept_text', columnType: 'VARCHAR', hidden: true }`），无需新增字段或能力位。

## 变更明细

### 后端（无实质代码改动，仅注释）

- `UnifiedDataSourceAdapter.metadata`：FORM/WORKFLOW 分支仍返回表单列（含 componentType，保留向后兼容）；`SortableResolver` 继续在组装时消费表单列定义推导 sortable（查询能力推导，合法，不改）。
- `DataSourceMetadata.java`：更新类注释，标注 columns 中的 componentType 为弃用（deprecated），渲染决策不再消费。

### 前端

| 文件 | 改造 |
|---|---|
| `PageDataTable.vue` | ① 数组值判断：`ARRAY_COMPONENT_TYPES.includes(c.componentType)`（resolvedColumns 两处、displayColumnKey）→ `hasTextColumn(c.key)`（metadata 中存在 `<key>_text`）；② 查询栏 `resolvedSearchFields`：`meta?.componentType` 分支 → `findFormRuleByKey(key)?.type` 优先，无 rule 按 columnType 降级；删除 `ARRAY_COMPONENT_TYPES` 常量 |
| `PageDataCards.vue` | 同上（数组值判断 / displayColumnKey），删除 `ARRAY_COMPONENT_TYPES` 常量 |
| `ViewDesigner.vue` | `filterableColumns`：`ARRAY_QUERY_TYPES.includes(c.componentType)` → `_text` 列存在性；colorPicker 特判改为有 formKey 时读表单 schema `rule.type`，无则按 columnType 常规；删除 `ARRAY_QUERY_TYPES` 常量 |
| `DsBindingConfigDialog.vue` | `loadTableCandidates` 中 `ARRAY_QUERY_TYPES.includes(c.componentType)` → `<key>_text` 列存在性判断（基于**完整 meta.columns**，因 `_text` 列为 hidden=true 不在过滤后的 cols 中） |
| `DataSourceListPage.vue` | 字段元数据 tab：组件类型列 FORM/WORKFLOW 只读展示文本、SQL/API/SYSTEM 隐藏；「字段详情」弹窗 componentType 选择器同步只读/隐藏；「从主表单覆盖」（handleOverlayFromForm）不再补 componentType |

## 边界行为

- **FORM 数据源**（含 config / sql 模式）：主表单数组列有 `_text`（表单发布生成）→ 正常渲染；JOIN 虚拟列无 `_text` → 直接显示 joinField 值；查询栏有 formKey 走 schema rule。
- **SQL / API 无 formKey**：数组列显示原始值（数据形态决定，现状如此）、查询栏降级基础组件——行为诚实化，不再出现"有 componentType 却渲染不出 lookupPicker"的空壳。
- **老数据缺 `_text`**：回退 value join（现有逻辑已处理）。

## 测试

- 后端：无实质代码改动，现有测试保持通过（`UnifiedDataSourceAdapterTest` 等）。
- 前端：
  - `PageDataTable.test.ts`：数组值列 formatter / 查询栏组件分支用例改为 `_text` 列存在性与 schema rule.type 语义（如 "透传 componentType" 用例改为 "metadata 含 `<key>_text` 列 → formatter 优先 _text"）。
  - `PageDataCards.test.ts`：同上。
  - `ViewDesigner.test.ts`：可筛列判断用例（数组列经 `_text` 可筛、colorPicker 特判来源）。
  - `DataSourceListPage.test.ts`：管理页 componentType 只读/隐藏用例、从主表单覆盖不再补 componentType。
  - `DsBindingConfigDialog` 相关测试（如有）。

## 影响面与风险

- 改 6 个前端文件 + 前端测试；后端仅注释。
- 风险低：渲染数据源（`_text` 列、表单 schema）本就存在，只是判断源切换。
- 无 formKey 数据源查询栏/数组列展示降级为诚实行为（原本也渲染不了复杂组件）。

## 迁移与向后兼容

- metadata 返回结构不变（componentType 字段保留），现有消费方（依赖 componentType 的旧逻辑）不破坏。
- 新增渲染决策完全绕过 componentType；后续可单独发起变更物理移除该字段。
