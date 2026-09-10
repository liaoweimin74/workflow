## Why

业务表单的数组值组件（select/tree/elTreeSelect/transfer/cascader）当前列类型随单选/多选配置漂移（select 单选 VARCHAR、多选 JSON；elTreeSelect 单选曾 VARCHAR），数据落库后再切换配置即格式错位、回显异常。同时组件存储的是 option value 而非显示文本，导致业务数据列表/数据表格只显示原始 value、筛选匹配 value 而非用户可见的 label。现在处理：这些字段已取消隐藏进入列表，显示与查询缺陷必须一并解决。预期收益：列类型稳定、单选/多选自由切换、列表按 label 显示与模糊查询可用。

## What Changes

**数组组件列结构（主列 + 冗余显示列）**
- From: 数组组件单列存储——select 单选 VARCHAR/多选 JSON、elTreeSelect 单选 JSON/多选 JSON、tree/transfer/cascader JSON 数组；无显示文本列。
- To: 数组组件发布生成双列——`<key>` JSON 存叶子 value 数组（单选 `["x"]`、多选 `["x","y"]`）+ `<key>_text` VARCHAR(255) 存显示文本（cascader 全路径 `/` 分隔、其余叶子 label，多选叶子 `, ` 连接）。
- Reason: 列类型稳定不漂移 + label 可用于显示与查询。
- Impact: 非破坏（新列生成，旧列语义不变）；已发布表单需重新发布生成 text 列。

**cascader 值语义**
- From: `emitPath: true`（默认），值字段存完整路径数组。
- To: 默认 `emitPath: false`，值只存最下级叶子 value；text 列存全路径显示文本。
- Reason: 值语义与 select/tree 统一（叶子 value），text 列保留全路径信息。
- Impact: 非破坏（新建组件默认；存量保持用户配置）。

**写入链路（label 由前端生成）**
- From: 前端只提交 value，后端存主列。
- To: 前端提交预处理遍历数组组件，用渲染时 options 做 value→label 映射生成 `<key>_text`，后端 `BizDataService.create/update` 落两列。
- Reason: 组件 options 在前端上下文（静态/数据源），前端生成最直接，规避后端反解复杂度。
- Impact: 非破坏；提交链路新增预处理逻辑。

**列表显示与查询**
- From: 列表显示原始 value（JSON 数组字面量）；JSON 列不可筛选、VARCHAR 单列筛选匹配 value。
- To: 列表列 render 读 `<key>_text`（缺失回退 value）；模糊搜索走 text 列 LIKE（单选多选统一）；精确筛选走主列 JSON 分支（`JSON_CONTAINS` / `->>'$[0]'` / `JSON_OVERLAPS`）。
- Reason: 按用户可见的 label 显示与筛选。
- Impact: 非破坏；`BizDataListPage`/`PageDataTable`/`BizDataQueryBuilder` 适配。

## Capabilities

### New Capabilities
- `array-value-label-columns`: 数组值组件统一"叶子 value（JSON 主列）+ 显示文本（`<key>_text` 冗余列）"双列存储，覆盖列映射、前端 label 生成、列表显示、模糊/精确查询、回显。

### Modified Capabilities
- `biz-form-json-multi-values`: 多值组件列映射从"单 JSON 列"扩展为"主列 JSON + text 冗余显示列"；映射范围扩展（select 多选、cascader、elTreeSelect 单选也统一 JSON 数组）；新增 text 列生成与前端写入 requirement。

## Impact

- 前端：`ColumnConfigDialog.vue`（双列生成）、`cascader.js`（emitPath=false）、表单提交预处理（value→label）、`BizDataListPage.vue`（显示 text 列）、`PageDataTable.vue`（元数据列读 text）。
- 后端：`ColumnTypeMapper.java`（双列映射）、`BizDataService.java`（create/update 落两列）、`BizDataQueryBuilder.java`（JSON 列查询分支）。
- 存量：已发布表单需重新发布生成 text 列并回填；主列存量数据按新语义回填（路径→叶子、单值→数组）。
- 依赖：精确查询的 `JSON_OVERLAPS` 需 MySQL 8.0.17+（需确认部署版本）。
