# Design: FORM 数据源 JOIN 统一 SQL 引擎

## Context

当前 FORM 数据源（`wf_biz_<formKey>`）通过 `BizDataQueryBuilder` 做单表 SELECT，无 JOIN 能力。dataPicker 在写时快照 `_text` 列，更新后过期。查询白名单（filter/sort/keywordColumn）只接受主表列，不支持关联表字段。

用户需求：主表 JOIN 关联表（dataPicker 外键），列表显示关联字段、按关联字段过滤与排序。且多数场景是简单 SQL（可视化配置即可），少数复杂场景需要完整 SQL 表达力 —— 两者应并存。

**现有相关约束**：
- `DataSourceAdapter` SPI：统一 metadata/query/get/create/update/delete 分发
- FORM 数据源 params 自动生成且只读（datasource-auto-params、data-source-management spec）
- FORM 数据源 metadata 每列声明 `sortable`（datasource-field-sorting spec）
- `BizDataQueryBuilder`：单表 filter/sort/keyword，参数化绑定
- 前端 `BizDataListPage.vue` / `PageDataTable.vue` 通过 metadata + queryData 协议消费，虚拟列自动渲染

## Goals / Non-Goals

**Goals:**
- 支持 FORM 数据源跨表 JOIN 关联查询：列表显示关联字段、按关联字段排序、按关联字段筛选
- 双模式统一引擎：配置驱动（简单 JOIN）与 SQL 模板（复杂 SQL）并存，底层同一执行路径
- 配置可"查看生成 SQL"迁移升级为 SQL 模板
- 前端零改动（同 DataSourceAdapter SPI、同 metadata/queryData 协议）
- 平台基础设施统一保障：分页、租户隔离（tenantId）、参数绑定防注入、filter/sort 白名单

**Non-Goals:**
- 不改变 dataPicker `_text` 快照机制（保留作兜底展示）
- 不引入新的数据源类型（沿用 FORM + params.queryMode 扩展）
- 不做可视化的 SQL 编辑器/语法高亮（仅文本输入 + 校验）
- 不支持写操作的 JOIN 复杂化（创建/更新仍是单行主表写）

## Decisions

### D1: queryMode 双模式并存于 FORM 数据源 params

`DataSourceDefinition.params` 增加 `queryMode` 字段：

```jsonc
// 模式 1：config（声明式 JOIN，系统生成 SQL）
{ "queryMode": "config",
  "joins": [{ "alias": "c", "targetFormKey": "customer",
              "localField": "customer_id", "foreignField": "id",
              "joinField": "name", "virtualKey": "customer_name",
              "label": "客户名称", "sortable": true, "filterable": true }] }

// 模式 2：sql（管理员 SQL 模板，系统包裹）
{ "queryMode": "sql",
  "query": "SELECT o.id, o.order_no, c.name AS customer_name ... WHERE o.tenant_id = :tenantId",
  "columns": [{ "key": "order_no", "label": "订单号", "columnType": "VARCHAR", "sortable": true },
              { "key": "customer_name", "label": "客户名称", "columnType": "VARCHAR", "sortable": true, "filterable": true }] }
```

**为什么不用新数据源类型**：FORM 数据源已绑定 formKey，CRUD/生命周期/租户隔离逻辑完整。JOIN/SQL 是查询增强，不是新数据源；复用 FORM 类型 + queryMode 扩展，最小侵入，前端 SPI 不变。

### D2: 统一 SQL 执行引擎（核心）

```
query(req)
  ├─ queryMode == "config" → JoinSqlGenerator.generate(...) → SqlAndParams
  ├─ queryMode == "sql"    → SqlTemplateEngine.wrap(...)    → SqlAndParams
  └─ → 统一执行器(tenantId 注入 + filter 白名单 + ORDER BY + LIMIT/OFFSET + COUNT) → BizDataPageVO
```

- **SqlAndParams**：`(String sql, List<Object> params)` 统一中间产物
- **JoinSqlGenerator**：把 joins[] 翻译成 `LEFT JOIN + 虚拟列 SELECT`（config 模式）
- **SqlTemplateEngine**：把管理员 SQL 包裹为 `SELECT * FROM (管理员SQL) _qs WHERE ...`（sql 模式）
- **统一执行器**：共享 filter 白名单注入、ORDER BY、分页、COUNT、租户隔离

**为什么统一引擎**：分页 / 排序 / 筛选 / 租户隔离是横切关注点，两模式复用同一套注入逻辑，避免双实现漂移。config 是"生成 SQL 的 DSL"，sql 是"直接给 SQL"——两者殊途同归到一个执行 SQL。

### D3: FORM 数据源 params 放开部分编辑

原"params 自动生成只读"改为：**CRUD 接口部分自动生成只读；JOIN/SQL 查询配置部分允许管理员编辑**。@i 如 datasource-auto-params 既有约束冲突，需 MODIFIED。

**为什么**：JOIN/SQL 配置是业务定制，无法自动生成，必须允许管理员配置。但 CRUD 接口地址仍由系统保证一致。

### D4: SQL 模板安全约束

- 仅允许 SELECT（SqlTemplateValidator 校验，禁 INSERT/UPDATE/DELETE/DROP/ALTER/comment 注入）
- 必须包含 `:tenantId` 占位符且由系统强制绑定（防止跨租户）
- 全参数化绑定（PreparedStatement），filter/sort 列名白名单校验（防注入）
- 仅管理员可配置（数据源管理页），最终用户不可改

**为什么**：SQL 模板等于给管理员"半原生 SQL"能力，必须用白名单 + 参数绑定 + 租户强约束兜底，否则是安全后门。

### D5: filter/sort 白名单扩展到虚拟列

config 模式：虚拟列（virtualKey）声明 `filterable`/`sortable` → 加入 metadata 与查询白名单。
sql 模式：管理员 columns 声明 `filterable`/`sortable` → 作为 filter/sort 白名单。
filter 协议复用 `BizDataQueryBuilder` 现有 `{logic, conditions:[{column,op,value}]}`。

**为什么**：前端已按现有 filter/sort 协议发送请求，白名单扩展即可无感支持关联字段筛选/排序。

### D6: metadata 统一（虚拟列自动渲染）

config 模式：JoinSqlGenerator 解析 joins 生成 `ColumnConfig`（virtualKey→key, label, sortable, filterable, columnType）。
sql 模式：管理员 columns 直接映射 `ColumnConfig`。
统一 merge 进 FORM 数据源 metadata.columns；前端现有渲染逻辑零改动。

### D7: SQL 模板运行时参数透传（params）

某些复杂 SQL 需要运行时从前端传入参数（如统计 SQL 的时间段 `WHERE create_time BETWEEN :startTime AND :endTime`）。这不同于 `filter`（针对数据列的白名单筛选）——`params` 是绑定到 SQL 占位符的通用的运行时参数。

- **请求侧**：`BizDataQueryRequest` 增加 `params`（JSON 字符串，与 filter 一致的解析路径），前端查询请求透传 `{startTime, endTime}`。
- **配置侧**：sql 模式增加 `params` 白名单声明（管理员声明哪些参数可被前端传入），保存时校验参数名合法、与 SQL 占位符匹配。
- **执行侧**：命中白名单的前端参数值参数化绑定到 `:paramName` 占位符；未声明/非法键拒绝（400）。此机制与 `:tenantId`（强制绑定、不可被前端覆盖）区分。

**为什么用独立 params 段而非复用 filter**：filter 的 `{column,op,value}` 结构化条件是绑定到数据列的；而 SQL 参数可以是任意名字、任意语义（时间段、聚合阈值、分组维度等），无法用列白名单表达。独立 `params` 段 + 白名单声明，既满足灵活透传又保持安全边界。

## Risks / Trade-offs

- **[SQL 兼容性]** ⚠️ sql 模式包裹子查询后，MySQL 的 ORDER BY 需基于外层别名（`customer_name`），而非内层函数列 → 缓解：SqlTemplateEngine 只允许对管理员声明的 columns key 排序，避免引用内层表达式。
- **[COUNT 语义]** 聚合/去重 SQL 包裹 `SELECT COUNT(1) FROM (...)` 的 total 可能与列表行数不一致 → 缓解：实现时用集成测试锁定常见聚合场景；文档注明"COUNT 基于包裹结果集"。
- **[租户隔离误配]** 管理员忘写 `:tenantId` → 缓解：SqlTemplateValidator 强制校验含 `:tenantId`，否则拒绝保存。
- **[SQL 注入]** 原生 SQL 能力是双刃剑 → 缓解：只读白名单 + 参数绑定 + tenant 强制注入；SQL 仅管理员可配。
- **[配置与物理表漂移]** joins 引用目标视图在 DDL schema 中编译（targetFormKey→wf_biz_<key>），targetFormKey 不存在时报错 → 缓解：保存时校验 targetFormKey 对应表单存在。
- **[性能]** 深 JOIN 关联可能导致全表扫描 → 缓解：虚拟列排序尽量走主表外键，文档给出索引建议（非阻塞）。

## Migration Plan

1. 后端：新增 JoinSqlGenerator / SqlTemplateEngine / SqlTemplateValidator + FORM 数据源 queryMode 分流
2. 后端：FORM 数据源 params CRUD 部分保留自动生成，JOIN/SQL 部分开放编辑
3. 后端：metadata 增加虚拟列；filter/sort 白名单扩展
4. 前端：数据源管理页增加 JOIN/SQL 配置入口（开放编辑），查询侧零改动
5. 后端测试：JoinSqlGenerator / SqlTemplateEngine 单测 + FORM 数据源 query 集成测试
6. 渐进启用：现有数据源默认 queryMode=config 且无 joins（等价当前行为），向后兼容

**Rollback**：queryMode 字段默认缺省即当前单表行为；若 JOIN 配置出问题，清空 joins/query 即回退单表，无需动 schema。
