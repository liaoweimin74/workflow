# Design: FORM 数据源关联查询配置（queryMode config / sql 双模式）

## Context

FORM 数据源仅支持单表查询：dataPicker 关联表字段无法在列表中展示、排序、筛选。业务需要主表 JOIN 关联表的能力——简单场景应可视化配置（声明式 JOIN），复杂场景需要完整 SQL 表达力。

现系统已有统一 `DataSourceAdapter` SPI、`BizDataQueryBuilder` 参数化查询链路，以及 SQL 数据源沉淀的 `SqlTemplateEngine` / `SqlQueryEngine` / `VisualSqlGenerator`。FORM 数据源查询配置复用这些引擎能力，双模式统一执行。

## Goals / Non-Goals

**Goals:**
- FORM 数据源 params 增加 `queryMode`（`config` 声明式 JOIN / `sql` 管理员 SQL 模板），查询侧协议不变
- config 模式经 `JoinSqlGenerator` 生成 LEFT JOIN + 虚拟列 SQL；sql 模式经 `SqlTemplateEngine` 包裹管理员 SQL
- metadata 增加 JOIN 虚拟列（config 推导 / sql 声明），前端查询侧（BizDataListPage/PageDataTable）零改动即可展示、排序、筛选关联字段
- 数据源管理页 FORM 类型开放「关联查询配置」编辑区（本设计补充的管理侧能力）
- 保存校验：非法配置（目标表单不存在 / 缺 :tenantId / 列不匹配 / 参数未声明 / virtualKey 重复等）保存时 400

**Non-Goals:**
- 不做 FORM 写 JOIN（JOIN 仅查询语义，写操作仍走主表单）
- 不做 SQL→可视化反向解析
- 不改变无 queryMode 数据源行为（向后兼容，单表查询）
- 不改查询侧协议（metadata/queryData 同 SPI）

## 配置结构（FORM 数据源 params）

`queryMode` 段与自动生成端点段（list/get/create/update/delete）共存于同一 params JSON，互不冲突：

```jsonc
// config 模式：声明式 JOIN
{
  "list": { "action": "/api/v1/biz-data/biz_order", "method": "GET", "parse": "records", "totalParse": "total" },
  "queryMode": "config",
  "joins": [
    {
      "alias": "j1",                      // SQL 表别名（合法标识符）
      "targetFormKey": "biz_customer",    // 目标业务表单（wf_biz_<formKey> 物理表）
      "localField": "customer_id",        // 主表关联字段（dataPicker JSON 列自动 JSON_EXTRACT 匹配）
      "foreignField": "id",               // 目标表关联字段
      "joinField": "name",                // 目标表显示字段（虚拟列取值）
      "virtualKey": "customer_name",      // 虚拟列标识（metadata.columns 条目 key，需唯一）
      "label": "客户名称",
      "sortable": true,                   // 可排序
      "filterable": true                  // 可筛选
    }
  ]
}

// sql 模式：管理员 SQL 模板
{
  "queryMode": "sql",
  "query": "SELECT m.order_no, m.amount FROM wf_biz_order m WHERE m.tenant_id = :tenantId AND m.created_at >= :startTime",
  "columns": [
    { "key": "order_no", "label": "订单号", "columnType": "VARCHAR", "sortable": true, "filterable": true }
  ],
  "params": ["startTime"]                 // 运行时参数白名单（占位符必须命中）
}
```

## Decisions

### D1: 统一执行引擎（config / sql 共用）

- `BizDataQueryBuilder.SqlAndParams` 为中间产物（SQL + 参数绑定列表）
- config 经 `JoinSqlGenerator.buildSelect/buildCount`（LEFT JOIN 链 + 虚拟列 SELECT + 白名单筛选/排序/分页/租户）
- sql 经 `SqlTemplateEngine.wrap`（管理员 SQL 子查询包裹 + 外层筛选/排序/分页 + `:tenantId` 强制绑定 + params 白名单参数化）
- 两者统一交 `SqlQueryEngine.execPage` 执行分页，返回 `BizDataPageVO`

### D2: metadata 虚拟列

- config 模式：从 joins[] 推导虚拟列（`key=virtualKey`、`ref=alias.joinField`、类型取目标表单 joinField 列类型、能力取 sortable/filterable 声明）并入 column_config
- sql 模式：columns 声明映射为列定义返回
- 前端按 metadata 自动渲染/排序/筛选，查询侧零改动

### D3: SQL 模板安全约束（sql 模式）

- 仅允许 SELECT、必须含 `:tenantId`、columns 声明必须与 SELECT 输出列匹配（`*` 通配跳过逐列匹配）
- 模板非 `:tenantId` 占位符必须命中 `params` 白名单，白名单参数名须为合法标识符
- 仅管理员可配置（数据源管理页权限），最终用户不可改

### D4: 保存校验（DataSourceDefinitionService）

- FORM 数据源 create/update/enable 时解析 params 的 `queryMode` 段：
  - `config`：joins 非空；每项 alias 合法标识符、targetFormKey 表单存在、localField/foreignField/joinField/label 非空、virtualKey 非空且查询内唯一
  - `sql`：query/columns/参数白名单复用 `SqlTemplateEngine.validate`，`IllegalArgumentException` 转 `BusinessException(400)`
  - 未知 queryMode → 400
- 无 queryMode 段（老数据源）→ 跳过校验，保持单表查询向后兼容
- create 时传入 config/sql 段：校验通过后与自动生成端点**合并**保存

### D5: 数据源管理页「关联查询配置」编辑区

- FORM 类型开放「编辑」按钮，接口配置 tab 显示端点（只读）+ 关联查询配置区
- queryMode 三选：单表查询 / 声明式 JOIN（config）/ SQL 模板（sql）
- config 模式：多 JOIN 卡片编辑（目标表单下拉 = enabled 的 FORM 数据源；主表/目标表字段下拉从表单 schema 提取，可手输；virtualKey/label/alias/能力标记）
- sql 模式：复用 `SqlEditor` 组件（query 文本 + columns 声明 + params 白名单）
- 保存：保留原 params 端点段（list/get/create/update/delete）+ 叠加 queryMode 配置段
- 创建（create）时由后端 `mergeQueryConfig` 合并端点与 queryMode 段

### D6: 运行时参数透传（sql 模式）

- `BizDataQueryRequest.params`（JSON 字符串）透传前端自定义查询参数
- 命中 `params` 白名单的值参数化绑定到 `:paramName` 占位符；未声明/非法键拒绝（400）
- 前端 `BizDataQueryParams` / `DataSourceQueryParams` 增加 `params` 段透传

## 迁移路径

1. 存量 FORM 数据源（无 queryMode）行为不变——`FormQueryConfig.parse` 缺省返回空配置，调用方回退单表查询
2. 需要跨表展示/排序/筛选：数据源管理页编辑 FORM → 配置声明式 JOIN（简单场景）或 SQL 模板（复杂场景）→ 保存（校验）
3. 「查看生成 SQL」：config 模式 SQL 由 `JoinSqlGenerator` 生成（可结合预览）；sql 模式即管理员 SQL 本身；不提供反向解析

## Impact

- **后端**：`DataSourceDefinitionService`（保存校验 + create 合并）、`FormQueryConfig`（解析）、`JoinSqlGenerator` / `SqlTemplateEngine` / `SqlQueryEngine`（引擎）、`UnifiedDataSourceAdapter`（queryMode 分流）、`BizDataSupport`（config/sql 执行）
- **前端**：`DataSourceListPage.vue`（FORM 关联查询配置编辑区 + 编辑按钮开放）、`FormJoinConfig.vue`（新组件）、查询侧（BizDataListPage/PageDataTable）零改动
- **API**：外部查询协议不变；仅数据源管理接口放开 FORM params 编辑
