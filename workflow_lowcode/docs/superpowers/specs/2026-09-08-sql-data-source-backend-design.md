# Design: 数据源泛化（source_key 唯一标识）+ SQL 数据源后端

## Context

当前数据源有四种类型 FORM/WORKFLOW/SYSTEM/API，字段使用与类型强绑定：

- `form_key`：FORM/WORKFLOW 绑定业务表单（对应 `wf_biz_<formKey>` 物理表），SYSTEM/API 为空
- `source_key`：SYSTEM/API 外部标识（dept-tree/external-stock 等），FORM/WORKFLOW 为空

问题：
1. 数据源在页面设计器被引用时，FORM 类型缺乏类型无关的稳定唯一标识（只能靠内部 `id`）
2. SQL 数据源：前端已有完整配置 UI（SqlEditor/VisualQueryBuilder），但后端**无独立 type=SQL**，执行能力散落在 FORM 的 queryMode=sql/visual 扩展中
3. API 数据源绑定表单后，`metadata` 未透传 formKey，前端编辑弹窗无法按表单 schema 构建

**关键发现（后端已有能力，无需重建）**：
- `SqlTemplateEngine`：validate（仅 SELECT + 强制 `:tenantId` + 列白名单 + 参数白名单）+ wrap（子查询分页 + 筛选/排序/关键词 + 参数绑定）——完整
- `SqlQueryEngine`：execPage（COUNT+SELECT 组装分页）+ wrapSubquery——完整
- `VisualSqlGenerator`：visual 配置 → SQL（含 `:tenantId`）——完整
- `FormQueryConfig`：解析 params 的 queryMode/query/columns/params——可复用
- `BizDataSupport.querySqlTemplate`：sql/visual 执行入口（wrap + execPage）——可复用
- `BizDataSupport.toSqlVO`：行 → BizDataVO，`id` 取行内 id 列兜底、剔除系统列——已实现 id 约定
- FORM 数据源已通过 `queryMode=sql/visual` 使用以上全部能力

## Goals / Non-Goals

**Goals:**
- `source_key` 成为所有数据源类型的唯一标识（必填、租户内唯一、DB 唯一约束）
- `form_key` 从"类型强绑定"变为"可选默认表单绑定"（FORM/WORKFLOW 必填且=source_key；SQL/API 可选）
- 独立 `type=SQL` 数据源，复用现有 SqlTemplateEngine/SqlQueryEngine
- SQL 数据源：list 走 SQL 执行；get/create/update/delete 委托绑定表单 CRUD；无表单时只读
- API 数据源 `metadata` 透传 formKey，接通前端按表单 schema 构建编辑弹窗

**Non-Goals:**
- 不实现 SQL 数据源写 SQL（INSERT/UPDATE/DELETE 模板）——写操作一律委托表单
- 不做 SQL→可视化反向解析
- 不改变 FORM/WORKFLOW/SYSTEM 现有行为（除 source_key 迁移与校验放宽）
- 不改主键约定：数据源记录主键统一为 `id` 字段

## Decisions

### D1: source_key 全局唯一标识

- 所有类型（FORM/WORKFLOW/SYSTEM/API/SQL）`source_key` **必填**、**租户内唯一**
- DB 新增唯一索引 `uk_source_key(tenant_id, source_key)`
- 存量迁移：`UPDATE wf_data_source SET source_key = form_key WHERE type IN ('FORM','WORKFLOW') AND source_key IS NULL`
- 唯一性校验：`create`/`update` 时 `existsByTenantIdAndSourceKey` 检查（排除自身）
- SYSTEM 类型（dept-tree/user-tree）已满足约束，SystemDataSourceInitializer 无需改

### D2: form_key 可选默认表单绑定

- FORM/WORKFLOW：`form_key` 必填，**保存时自动 = `source_key`**（语义上表单 key 即数据源标识）
- SQL/API：`form_key` 可选——绑定时表单提供默认 CRUD 能力；空时数据源仅只读
- 校验：`form_key` 提供时校验表单存在；为空则跳过（不再强制）
- `enable`：FORM 类型 `requirePublishedForm` 改为**仅当 formKey 非空时执行**

### D3: 独立 type=SQL 数据源（复用现有引擎）

- `DataSourceDefinitionService.SUPPORTED_TYPES` 加 `"SQL"`
- SQL 数据源 `params` 结构（前端已定义）：
  ```json
  {
    "queryMode": "sql" | "visual",
    "query": "SELECT ... FROM ... WHERE tenant_id = :tenantId",
    "columns": [{"key":"order_no","label":"订单号","columnType":"VARCHAR","sortable":true,"filterable":true}],
    "params": ["startTime"]
  }
  ```
- 执行路径复用：`FormQueryConfig.parse(params)` → `SqlTemplateEngine.wrap()` → `SqlQueryEngine.execPage()` → `toSqlVO()`

### D4: SQL 数据源 CRUD 语义

| 操作 | formKey 非空 | formKey 空 |
|------|-------------|-----------|
| list | 执行 SQL（强制 `:tenantId`） | 同左（只读可用） |
| get | 委托 `BizDataService.getById(formKey, id)` | 400「未绑定表单」 |
| create/update/delete | 委托 `BizDataService.create/update/delete(formKey, ...)`（update 透传 version） | 400「未绑定表单，不支持写操作」 |
| metadata | columns = params.columns；writable=true；透传 formKey | columns 同上；writable=false |

- 前端 `PageDataTable` 现有逻辑零改动：CRUD 已走统一 `/data-sources/{id}/data`，编辑弹窗已按 formKey schema 构建；writable=false 时编辑入口不出现

### D5: 主键统一为 id

- 不暴露 pkField 配置，默认 `id` 列即主键
- SQL 结果 `toSqlVO` 已把行内 `id` 列映射到 `BizDataVO.id`（现有行为）
- SQL 数据源委托表单 CRUD 时 `row.id`（= SQL 结果 id 列值）直接传给 `BizDataService`（业务表主键即 id，天然对齐）
- 约束：SQL 若未输出 `id` 列，list 可用、行级操作不可用（点击时 400「缺少 id 列」）

### D6: API 数据源表单绑定接通

- `UnifiedDataSourceAdapter.apiMetadata()` 增加 `m.setFormKey(ds.getFormKey())`
- 前端 `PageDataTable.loadFormSchema` 收到非空 formKey 后即按表单 schema 构建编辑弹窗，CRUD 仍走 HTTP（现有 apiCreate/apiUpdate/apiDelete）——最小改动接通

### D7: 安全（复用引擎既有防线）

| 层 | 措施 |
|----|------|
| 语句类型 | 仅 SELECT（SqlTemplateEngine.validate 强制，写语句 400） |
| 租户隔离 | 强制 `:tenantId` 占位符 + 执行时绑定当前租户（已实现） |
| 值注入 | 占位符全部参数绑定（NamedParameterJdbcTemplate） |
| 列注入 | 筛选/排序仅允许 columns 中 sortable/filterable 列（白名单已实现） |
| 参数白名单 | 非 `:tenantId` 占位符必须命中 declaredParams（已实现） |

## 影响面

### 后端
- `DataSourceDefinitionService`：SUPPORTED_TYPES + source_key 必填/唯一校验 + form_key 可空 + SQL 类型 validate
- `UnifiedDataSourceAdapter`：supports + SQL 分支（query 走引擎 / get/create/update/delete 委托表单）+ apiMetadata.setFormKey
- `DataSourceDefinitionRepository`：`existsByTenantIdAndSourceKey`（已有）+ 唯一索引迁移
- `DataSourceMetadata`：无改动（已含 formKey 字段）
- DB 迁移：`uk_source_key` + FORM/WORKFLOW source_key 回填

### 前端
- `DataSourceListPage`：所有类型显示 `source_key`（必填+唯一性提示）；`form_key` 可选（SQL/API 显示绑定选择器）；SQL 类型配置区（VQB/SqlEditor）重新接入
- `PageDataTable`：零改动（已有 formKey schema 构建逻辑）

### 测试
- 后端：SQL 类型 list/get/写操作委托表单/无表单只读；source_key 唯一性；form_key 可空
- 前端：source_key 必填/唯一性；SQL 类型保存/回填
- 存量：FORM/WORKFLOW source_key=form_key 迁移后现有查询不回归

## 风险与注意
- FORM 类型 formKey 为空时物理表仍按 `wf_biz_<formKey>`——本设计中 FORM formKey 必填且=source_key，不引入空 formKey 的 FORM
- SQL 数据源无表单时 `metadata.writable=false`，前端不出现新增/编辑入口，符合"只读"预期
- 迁移需在唯一索引创建前回填 source_key，避免约束冲突
