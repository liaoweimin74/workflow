## Context

业务表单（BUSINESS/WORKFLOW）中的数组值组件（select/tree/elTreeSelect/transfer/cascader）当前存储存在两类缺陷（已在前序调查确认）：

- **列类型随单选/多选配置漂移**：select 单选 VARCHAR、多选 JSON；elTreeSelect 单选曾 VARCHAR。数据落库后再切换配置即格式错位，VARCHAR 存数组经 `BizDataService.serializeJsonColumns` 序列化后回显类型不匹配（问题 5A/5B）。
- **存 value 不可按 label 显示/查询**：组件存储的是 option 的 value 而非显示文本，列表显示原始 value、筛选匹配 value 而非用户可见的 label（问题 1/4）。

相关现状：
- dataPicker 已有双列先例：`<key>` 存 id、`<key>_text` 存冗余显示文本（`ColumnTypeMapper.mapPickerToColumns` / `BizDataService.resolvePickerValues`）。
- `BizDataListPage.filterableColumns`（99-106 行）排除 JSON/TEXT 列；`BizDataQueryBuilder.appendStructuredFilters`（176-262 行）对物理列直接 `= ?` / `LIKE ?`。
- 数组组件 options 位置不一：select/checkbox 在 `rule.options`，tree/transfer 在 `props.data`，cascader 在 `props.options`；`resolveOptionRules` 渲染时已填好。

## Goals / Non-Goals

**Goals:**
- 数组组件列类型稳定：主列统一 JSON 存"叶子 value 数组"（单选 `["x"]`、多选 `["x","y"]`），不再随配置漂移。
- 列表显示与按 label 查询可用：`<key>_text` 冗余列存显示文本。
- 回显正确：主列 value 匹配渲染时已加载的 options。
- 单选/多选自由切换，无需数据迁移（值形态统一为数组）。

**Non-Goals:**
- 不改变表单回显组件（el-select/el-tree-select/el-transfer/el-cascader）自身行为。
- 不实现后端对 options 的解析生成 label（label 由前端提交）。
- 不重构 dataPicker 现有双列实现（保持后端 resolvePickerValues），仅保证列结构一致。

## Decisions

### 1. 列结构（发布时数组组件生成两列）
| 列 | 类型 | 内容 | 用途 |
|---|---|---|---|
| `<key>` | JSON | 叶子 value 数组（单选 `["x"]`、多选 `["x","y"]`） | 回显、精确查询（JSON_CONTAINS）、统计 |
| `<key>_text` | VARCHAR(255) | 显示文本：树形/级联（cascader/tree/elTreeSelect）带前导 `/` 的完整路径（`/总公司/武汉分公司`），多选逗号无空格连接（`/A/x,/B/y`）；select/checkbox/transfer 叶子 label | 列表显示（取叶子 label）、模糊查询（LIKE） |

- 数组组件集合：`select`（单选与多选）/ `checkbox` / `multiSelect` / `multiSelectPro` / `tree` / `elTreeSelect` / `elTransfer` / `cascader`。
- select 单选/多选统一 JSON 双列（查询走 `_text` 列，主列仅存值回显；select 单选提交单值字符串存入 JSON 列，宽松兼容）。
- 列映射改动点：`ColumnTypeMapper.java`（后端）+ `ColumnConfigDialog.vue`（前端）为数组组件生成主列 + text 列。

### 2. cascader/树形值统一叶子数组
- `cascader.js` 默认 `props.emitPath = false`（新建组件默认）；存量已建组件保持用户配置。
- **主列统一存最下级叶子 value 数组**（单选 `["leaf"]`、多选 `["leaf1","leaf2"]`）。提交时单选单值、`emitPath=true` 路径数组（`[l1,l2,leaf]`）统一转换为叶子数组（取路径最后一段）。
- text 列存带前导 `/` 的完整路径（`/省/市/leaf`；多选逗号无空格连接 `/A/x,/B/y`）。

### 3. label 由前端提交生成
- 前端在提交预处理中遍历 schema 数组组件，用渲染时持有的 options 做 value→label 映射，生成 `<key>_text` 一并提交。
- **必须使用渲染时解析后的选项**（FormRenderer.getFormData 基于 resolvedSchema——异步数据源已加载）；原始 schema（schemaRules）的选项可能为空，会导致映射失败回退 value。
- 树形（tree/elTreeSelect）与级联（cascader）显示文本为**带前导 `/`** 的完整路径（多选逗号无空格连接）；select/checkbox/transfer 为叶子 label。
- **树形/级联提交统一转叶子数组**：单选单值 → `[v]`；cascader `emitPath=true` 路径数组 → 取路径最后一段（叶子）后存数组（`toLeafArray`）。
- **`<key>_text` 覆盖策略**：`buildText` 返回 `{text, mapped}`——`mapped=true`（至少一个 value 映射成功）时覆盖为最新文本；`mapped=false`（全部回退 value）时保留已有 `_text`，避免双跑（FormRenderer 生成 → BizDataListPage 用原始 schemaRules 再跑）时选项缺失导致覆盖为 value（分隔符比较（`, ` vs `,`）有歧义，已改结构化标志）。
- 后端 `BizDataService.create/update` 直接落两列，不做 options 解析。
- 组件 options 取值位置：`rule.options`（select/checkbox）/ `props.data`（tree/transfer/elTreeSelect）/ `props.options`（cascader）。

### 4. 显示方式（对齐 dataPicker 双列）
- 列表列 prop=主列 key，`render`/`formatter` 读 `row.data[<key>_text]`，经 `leafDisplayText` 取**叶子 label**（每段路径取最后一段，逗号连接）显示；缺失回退主列 value。
- 改动点：`BizDataListPage.vue`（columns render）+ `PageDataTable.vue`（元数据列 formatter 读 text 列）。
- **页面表格用户配置列**：`PageDataTable.resolvedColumns` 用户配置列分支按 metaColumns 的 componentType 识别数组值组件，覆盖 render 读 `<key>_text`（叶子 label），缺失回退 value join——与元数据列分支/metaColumns 分支一致。

### 5. 查询
- 模糊搜索：用户文本输入，`<key>_text` 列 LIKE（单选多选统一；text 列 VARCHAR 可进 `filterableColumns`）。
- **查询栏组件化**（SearchTable）：单选选项类字段（select/tree/elTreeSelect/cascader 单选）生成下拉组件（选项=显示值 label，查询值=label，`_text` 列精确等值）；日期字段日期选择器；其余 input 模糊。
- **页面设计器表格（ViewDesigner/PageDataTable）选项组件可查询**：选项类组件主列（JSON）在"显示&查询"页签视为可筛（`filterableColumns` 保留 componentType 选项类的 JSON 列）；查询栏输入/筛选提交时 `resolveSearchColumn` 将主列映射 `<key>_text`（显示值 label，LIKE/等值匹配显示列）——与业务列表查询语义一致。
- 精确筛选（PageDataTable 结构化 filter / 数据表格联动，传 value）：主列 JSON 分支——`eq → JSON_CONTAINS(col, ?)`（value 参数序列化为 JSON 片段 `'"x"'`）、单选 `col->>'$[0]' = ?`、`in → JSON_OVERLAPS`。
- 改动点：`BizDataQueryBuilder.appendStructuredFilters` 按列类型分支；`BizDataListPage.searchFields` 按 componentType + schema rule 生成查询组件（`resolveOptionRules` 解析选项供下拉）。

### 6. 回显
- 主列 value 匹配渲染时已加载的 options（`resolveOptionRules` / 静态 options）。
- **单选数组解包 + 类型归一化**：树形/级联单选主列为数组时解包为单值（取最后一段叶子，兼容存量路径数组）；随后按树节点 value **类型归一化**（`findNodeValue` String 匹配 → 真实 value，字符串 `'7'` → 数字 `7`），保证 el-tree-select/el-cascader 按 nodeKey 匹配成功、输入框正常回显节点名称（`normalizeEchoData`，FormRenderer 回显接入）。单选判定仅依据 `multiple`（`showCheckbox` 仅为 UI 勾选）。
- **兜底注入仅限扁平组件**：select/checkbox/multiSelect 等扁平选项组件 options 无匹配时注入 `{value, label: 叶子}`；**匹配判定为严格类型比较**（组件内匹配类型敏感，字符串 v-model `'7'` 与数据源数字 id `7` 视为不匹配 → 注入字符串 value 兜底项显示 label）；树形结构组件（tree/elTreeSelect/cascader）**不注入**——根级孤立节点会污染树结构，导致组件匹配/选中节点错乱。

## Risks / Trade-offs

- **存储冗余与一致性**：双列双写；options 变更后旧 text label 过期（dataPicker 已接受该权衡；显示准确性以"回显 value"为准）。
- **存量迁移**：已发布表单重新发布生成 text 列；存量主列数据按新语义回填（路径→叶子、单值→数组）需一次性迁移脚本或发布时重建。
- **text 列长度**：cascader 全路径可能超 64 字符，用 VARCHAR(255) 保证可筛选；超长（>255）为边缘场景，发布校验给出提示。
- **精确查询依赖 MySQL 8.0.17+**：JSON_OVERLAPS 需 8.0.17+；JSON_CONTAINS 5.7+ 即有。需确认部署 MySQL 版本。
- **前端提交链路**：生成 text 列需遍历 schema + options 映射，FormRenderer 提交钩子 / BizDataListPage 提交预处理需新增逻辑并有对应测试。
