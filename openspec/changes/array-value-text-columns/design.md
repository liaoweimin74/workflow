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
| `<key>_text` | VARCHAR(255) | 显示文本：树形/级联（cascader/tree/elTreeSelect）完整路径 `/` 分隔；select/checkbox/transfer 叶子 label；多选叶子间 `, ` | 列表显示、模糊查询（LIKE） |

- 数组组件集合：`select`（单选与多选）/ `checkbox` / `multiSelect` / `multiSelectPro` / `tree` / `elTreeSelect` / `elTransfer` / `cascader`。
- select 单选/多选统一 JSON 双列（查询走 `_text` 列，主列仅存值回显；select 单选提交单值字符串存入 JSON 列，宽松兼容）。
- 列映射改动点：`ColumnTypeMapper.java`（后端）+ `ColumnConfigDialog.vue`（前端）为数组组件生成主列 + text 列。

### 2. cascader emitPath=false
- `cascader.js` 默认 `props.emitPath = false`（新建组件默认）；存量已建组件保持用户配置。
- 值字段只存最下级叶子 value；text 列存全路径（`/` 分隔，多选叶子间 `, `）。

### 3. label 由前端提交生成
- 前端在提交预处理中遍历 schema 数组组件，用渲染时持有的 options 做 value→label 映射，生成 `<key>_text` 一并提交。
- **必须使用渲染时解析后的选项**（FormRenderer.getFormData 基于 resolvedSchema——异步数据源已加载）；原始 schema（schemaRules）的选项可能为空，会导致映射失败回退 value。
- 树形（tree/elTreeSelect）与级联（cascader）显示文本为完整路径 `/` 分隔；select/checkbox/transfer 为叶子 label；多选叶子间 `, ` 连接。
- **cascader emitPath=true（存量/已配置）**：提交值为路径数组（单选 `[l1,l2,leaf]`），按路径段映射 label 并 `/` 连接；`emitPath=false`（默认）值为叶子，每叶子取完整路径。
- **`<key>_text` 覆盖策略**：值可映射时覆盖为最新文本（编辑改值保持一致）；选项缺失（纯 value 回退）时保留已有 `_text`，避免劣化。
- 后端 `BizDataService.create/update` 直接落两列，不做 options 解析。
- 组件 options 取值位置：`rule.options`（select/checkbox）/ `props.data`（tree/transfer/elTreeSelect）/ `props.options`（cascader）。

### 4. 显示方式（对齐 dataPicker 双列）
- 列表列 prop=主列 key，`render` 读 `row.data[<key>_text]`，缺失回退主列 value。
- 改动点：`BizDataListPage.vue`（columns render）+ `PageDataTable.vue`（元数据列 formatter 读 text 列）。

### 5. 查询
- 模糊搜索：`<key>_text` 列 LIKE（单选多选统一；text 列 VARCHAR 可进 `filterableColumns`）。
- 精确筛选（结构化 filter / 数据表格联动）：主列 JSON 分支——`eq → JSON_CONTAINS(col, ?)`（value 参数序列化为 JSON 片段 `'"x"'`）、单选 `col->>'$[0]' = ?`、`in → JSON_OVERLAPS`。
- 改动点：`BizDataQueryBuilder.appendStructuredFilters` 按列类型分支。

### 6. 回显
- 主列 value 匹配渲染时已加载的 options（`resolveOptionRules` / 静态 options），显示文本由组件自身渲染，不读显示列。
- 兜底：options 无匹配项时（异步数据源未就绪/类型不匹配/静态缺失），用 `<key>_text` 注入 `{value, label}` 兜底选项项（`injectFallbackOptions`，FormRenderer 渲染前接入），避免组件回退显示原始 value。

## Risks / Trade-offs

- **存储冗余与一致性**：双列双写；options 变更后旧 text label 过期（dataPicker 已接受该权衡；显示准确性以"回显 value"为准）。
- **存量迁移**：已发布表单重新发布生成 text 列；存量主列数据按新语义回填（路径→叶子、单值→数组）需一次性迁移脚本或发布时重建。
- **text 列长度**：cascader 全路径可能超 64 字符，用 VARCHAR(255) 保证可筛选；超长（>255）为边缘场景，发布校验给出提示。
- **精确查询依赖 MySQL 8.0.17+**：JSON_OVERLAPS 需 8.0.17+；JSON_CONTAINS 5.7+ 即有。需确认部署 MySQL 版本。
- **前端提交链路**：生成 text 列需遍历 schema + options 映射，FormRenderer 提交钩子 / BizDataListPage 提交预处理需新增逻辑并有对应测试。
