# Design: 数据源字段元数据可编辑（探测获取 + 行内/详情编辑）

## Context

SQL/API 数据源的「字段元数据」tab 目前**只读**，展示后端 `getMetadata` 接口算出的列（`metadata.columns`）：

- SQL 数据源：`UnifiedDataSourceAdapter.metadata()` SQL case = 绑定表单 `columnConfig`（有 formKey 时）+ SQL 声明列 `params.columns` 合并
- API 数据源：`apiColumns`（params.columns 的 key/label/columnType 子集），在「接口配置」tab 有一张可编辑表
- 「字段元数据」tab 本身只读，无法编辑字段属性（label/组件/必填/隐藏/排序/筛选等）

问题：
1. SQL/API 数据源的字段元数据无法编辑——用户无法调整字段名/类型/约束，也无法从数据库真实结构自动获取
2. SQL 数据源字段来源混杂（表单 columnConfig + 声明列），不符合「查询输出列定义」的直觉
3. API 数据源列定义散落在「接口配置」tab 编辑，与「字段元数据」tab 展示割裂，两处编辑同一份数据易混乱

前置：SQL 数据源可视化配置的表/字段下拉已改为读取数据库真实结构（information_schema 枚举端点），本次聚焦**字段元数据本身的可编辑化 + 探测获取**。

## Goals / Non-Goals

**Goals:**
- SQL 数据源：显性按钮「执行SQL获取字段」→ 执行完整 SQL 模板（LIMIT 1）→ 从 ResultSetMetaData 取列结构 → **全量替换**字段元数据列表
- API 数据源：显性按钮「从接口推断字段」→ 调 list 操作拉样例 → 从 JSON 推断列结构 → 全量替换
- 「从主表单覆盖」按钮（SQL/API 绑定了表单时）：按 key 匹配，**完全用表单 columnConfig 覆盖**匹配列的全部属性（策略 C）；表单没有的列保留
- 「字段元数据」tab 升级为可编辑：主要属性行内编辑，全部属性通过详情表单（dialog）编辑
- 数据模型单一来源（A1）：编辑的列定义 = params.columns（升级为全字段序列化），不再有只读计算副本
- API 数据源的列定义编辑从「接口配置」tab **收敛**到「字段元数据」tab
- 不兼容老数据源：无回退/迁移逻辑

**Non-Goals:**
- 不做 componentType 下拉选项来源的完整方案（本期仅文本展示，下拉来源后续设计）
- 不实现 SQL→可视化的反向解析
- 不改 FORM/WORKFLOW/SYSTEM 数据源行为
- 不改变执行引擎（SqlQueryEngine/VisualSqlGenerator 等）——探测是独立只读能力
- 不实现 pickerConfig/subColumns/subMode 的编辑（表单字段专用，SQL/API 列定义不涉及）

## Decisions

### D1: 探测执行语义（SQL）= 模板 SQL + LIMIT 1 + 参数置空

- 后端探测端点执行传入的完整 SQL 模板，追加 `LIMIT 1`（参数置 NULL/空防绑定失败），只读 `ResultSetMetaData`
- 相比 `LIMIT 0`：确保驱动返回完整列元数据（`LIMIT 0` 依赖驱动对空结果集仍填充元数据，不可靠）
- 模板本身含 `LIMIT`/末尾分号时，后端做安全包裹（`SELECT * FROM (<sql>) _probe LIMIT 1`），两者都失败才报错
- 探测只取列结构，不返回数据行

### D2: 探测结果 → ColumnMeta DTO

后端探测返回统一 DTO（对齐现有 `ColumnInfo` 语义）：
```
ColumnMeta { key(列标识/别名), label(列名), columnType(业务类型), length, scale, nullable }
```
- `key` = 列标识（ResultSetMetaData 的 columnLabel，即 SELECT 别名优先）
- `columnType` = JDBC 类型 → 业务类型映射（复用 `ColumnTypeMapper` 白名单：VARCHAR/INT/DECIMAL/DATE/DATETIME/TEXT/TINYINT/JSON/LONGTEXT）
- `length`/`scale` 从 ResultSetMetaData 精度/小数位映射

### D3: 探测 API（SQL / API 两套）

```
POST /api/v1/data-sources/explore-sql
  入参: { sql: string }                    // 前端传入当前生效 SQL（visual 生成 or 手写）
  出参: R<List<ColumnMeta>>

POST /api/v1/data-sources/explore-api
  入参: { listOp: ApiOperationConfig }     // 前端传入当前填写的 list 操作配置（与数据源是否已保存解耦）
  出参: R<List<ColumnMeta>>
```
- SQL/API 探测均**不依赖数据源已保存**（新建时可先填 SQL/操作配置再探测）
- 未知/探测失败 → 400 + 明确错误消息（如 SQL 语法错误原样透出）

### D4: API 推断 = 调 list 拉样例 → JSON 键映射

- 后端用前端传入的 `listOp` 配置执行 API list 操作（复用 `HttpLogicExecutor`）拉一页（size=1）
- 取样例行的 JSON 键集合，逐键推断：
  - 标量 → 基础类型映射（字符串→VARCHAR、整数→INT/BIGINT、小数→DECIMAL、布尔→TINYINT、null→VARCHAR）
  - 对象/数组 → JSON
- `key`/`label` 均取 JSON 键名

### D5: 单一来源数据模型（不兼容老数据源）

- SQL/API params 的 `columns` 段升级为**全字段列定义**：
  ```json
  { "key": "...", "label": "...", "columnType": "...", "length": null, "scale": null,
    "required": false, "unique": false, "indexed": false, "hidden": false,
    "componentType": null, "sortable": true, "filterable": true }
  ```
- 「字段元数据」tab 行内/详情编辑的就是这份 `columns`（SQL 存 sqlConfig.declaredColumns 的升级版，API 存 apiColumns 的升级版）
- 后端 `metadata()`：
  - SQL case：直接返回 params.columns（**不再默认合并表单 columnConfig**；表单覆盖只在用户点按钮时显式发生）
  - API case：直接返回 params.columns（移除接口配置里列定义子集逻辑）
- 保存数据源时全字段写回 params.columns
- 兼容：无回退逻辑（老数据源 columns 缺失时 metadata 返回空列表，用户点探测/表单覆盖/手填生成）

### D6: 前端「字段元数据」tab 改造（SQL/API 共用一套 UI）

**工具栏**（tab 顶部，依据类型与绑定显示）：
- SQL 类型：`执行SQL获取字段`——把当前生效 SQL（visual 生成预览 SQL 或手写 queryText）POST 到 explore-sql → 全量替换列表
- API 类型：`从接口推断字段`——取当前表单填写的 list 操作配置组装 `listOp` → POST explore-api → 全量替换列表（操作配置未填完整则禁用按钮并提示）
- 绑定了表单（formKey 非空）时显示：`从主表单覆盖`——拉表单 columnConfig → 按 key 匹配全属性覆盖（策略 C）
- 类型标签（可写/只读）+ 列数统计

**行内编辑表格**（7 列）：
| 标识 key | 字段名 label | 组件类型 componentType | 必填 | 隐藏 | 排序 | 筛选 |
|---|---|---|---|---|---|---|
- key/label：input
- componentType：**文本显示**（下拉来源后续设计）
- required/hidden/sortable/filterable：checkbox/开关
- 每行操作：`详情`（打开 dialog）、`删除`（行）；表格底部 `添加列`
- SQL 数据源行内编辑与 queryMode 解耦（visual/sql 模式下都可编辑字段元数据）

**详情编辑 dialog**（全属性）：
- 基础：key、label、componentType(文本)
- 类型：columnType（白名单下拉）、length、scale
- 约束：required、unique、indexed、hidden
- 行为：sortable、filterable

### D7: API 列定义编辑收敛

- 「接口配置」tab 现有的 `apiColumns` 编辑表格（column-editor 区）**移除**
- 列定义统一在「字段元数据」tab 行内编辑 + 详情 dialog
- API 操作配置（URL/方法/参数映射）保留在「接口配置」tab

### D8: 主表单覆盖（策略 C）实现

- 前端点击 `从主表单覆盖` → 调既有接口拉表单 columnConfig（复用 getMetadata 的 formKey 或 form 定义接口）
- 覆盖规则：对每一条表单 columnConfig，若其 key 存在于当前列表 → 用表单条目**全属性覆盖**该列（key 不变，label/columnType/length/scale/required/unique/indexed/hidden/componentType/sortable/filterable 全部取表单值）
- 表单有、当前列表无的 key → **追加**到列表
- 当前列表有、表单无的 key → 保留不动

### D9: 下游消费自动跟随

- 编辑后的 columns 经 `metadata()` 返回，页面设计器/数据预览/白名单校验（sortable/filterable 排序筛选约束）自动消费同一份数据
- 「数据预览」tab 列头来自 metadata.columns，编辑后自动反映

## 影响面

### 后端
- 新增 `ColumnMeta` DTO（或复用 `ColumnInfo`）+ 探测执行器（explore-sql：参数置空 + LIMIT 1 + ResultSetMetaData 映射）
- 新增 API 推断执行器（explore-api：复用 HttpLogicExecutor 拉样例 + JSON 键推断）
- 新增 Controller 端点（`/api/v1/data-sources/explore-sql`、`/api/v1/data-sources/explore-api`）
- `UnifiedDataSourceAdapter.metadata()`：SQL case 改为直接返回 params.columns；API case 移除列定义子集逻辑
- `ColumnConfig` 序列化：确认全字段 JSON 往返（现有 getter/setter 已齐全，前端 ColumnConfigItem 需补字段）
- `FormQueryConfig.parseColumns`：扩展解析全字段（现仅 key/label/columnType/sortable/filterable）

### 前端
- `ColumnConfigItem` 类型：补 length/scale/required/unique/indexed/hidden/componentType 等字段
- `DataSourceListPage.vue`：
  - 「字段元数据」tab 从只读表 → 可编辑表格（工具栏按钮 + 行内编辑 7 列 + 详情 dialog + 增删行）
  - SQL `sqlConfig.declaredColumns` 升级为全字段承载；API `apiColumns` 保留但只从字段元数据 tab 编辑
  - `buildSqlParams`/`buildApiParams`：全字段序列化 columns
  - 「接口配置」tab 移除 apiColumns column-editor 区
- `api/data-source.ts`：新增 `exploreSql` / `exploreApi` /（如需要）表单 columnConfig 拉取接口

### 测试
- 后端（TDD）：
  - explore-sql：LIMIT 1 探测返回列结构；参数置空不报绑定错误；含 LIMIT 模板安全包裹；非法 SQL 400
  - metadata() SQL case：直接返回 params.columns（无表单列合并）；columns 空 → 空列表
  - explore-api：样例 JSON → 类型推断（标量/对象/数组）
- 前端：字段元数据行内编辑/详情 dialog 保存；执行SQL/从接口推断/从主表单覆盖按钮行为与全量替换/覆盖；接口配置 tab 无列编辑器回归

## 风险与注意
- 探测执行的是**用户填写的 SQL**——执行层已强制 SELECT + `:tenantId`（复用 SqlTemplateEngine.validate），探测端点同样复用该防线，避免任意 SQL 执行面
- `LIMIT 1` 包裹与模板自带 LIMIT 的冲突：优先直接追加；模板以 `;` 结尾或含 LIMIT 时包裹子查询；两者皆失败透出原始错误
- 多租户：SQL 探测在数据源租户上下文执行，`:tenantId` 注入遵循现有引擎契约
- 可视化模式探测用前端 `generatePreviewSql()`（简化预览），与后端 VisualSqlGenerator 生成的真实 SQL 可能有细微列差异——设计上以「当前保存的 query」为准；若 visual 配置未保存，预览 SQL 即探测 SQL（与现状预览行为一致）
