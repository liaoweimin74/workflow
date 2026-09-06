# Proposal: FORM 数据源 JOIN 统一 SQL 引擎

## Why

当前 FORM 数据源仅支持单表查询，dataPicker 关联表字段无法在列表中显示，也无法按关联字段排序/筛选；业务需要主表 JOIN 关联表的能力。多数场景是简单 JOIN（应可视化配置），少数复杂场景需要完整 SQL 表达力（配置表达不了）。现系统已有统一 `DataSourceAdapter` SPI 与 `BizDataQueryBuilder` 参数化查询链路，是引入该能力的最佳时机。预期收益：列表可展示/排序/筛选关联字段，简单场景保持直观，复杂场景不被配置天花板限制，且前端零改动。

## What Changes

**FORM 数据源查询模式（queryMode）**
- From: FORM 数据源 params 自动生成只读、单表查询、无 JOIN、filter/sort 仅主表列
- To: params 增加 `queryMode`（config/SQL 双模式）并开放 JOIN/SQL 部分编辑；支持跨表 JOIN、按关联字段排序/筛选
- Reason: 简单场景可视化配置，复杂场景 SQL 模板，统一执行引擎
- Impact: non-breaking；FORM 数据源管理页开放 JOIN/SQL 配置入口，查询侧协议不变

**配置→SQL 统一执行引擎**
- From: `BizDataQueryBuilder` 单一构建单表 SQL
- To: config 模式经 `JoinSqlGenerator` 生成 SQL、sql 模式经 `SqlTemplateEngine` 包裹管理员 SQL，两者产出统一 SqlAndParams 交共享执行器（分页/排序/筛选/租户隔离）
- Reason: 分页/排序/筛选/租户隔离为横切关注点，两模式复用一套注入逻辑
- Impact: non-breaking；FORM 数据源查询内部重构，对外协议不变

**metadata 虚拟列**
- From: metadata 仅主表 column_config
- To: 增加 JOIN 虚拟列（config 推导 / SQL 声明），声明 sortable/filterable
- Reason: 前端可无感渲染与排序关联字段
- Impact: non-breaking；metadata.columns 增加虚拟列条目

**SQL 模板安全约束**
- From: 无 SQL 模板能力
- To: 仅 SELECT、必须含 `:tenantId` 强制绑定、参数化绑定 + filter/sort 白名单
- Reason: 原生 SQL 能力须以安全兜底
- Impact: non-breaking；仅管理员可配置，最终用户不可改

## Capabilities

### New Capabilities
- `form-join-query`: FORM 数据源跨表 JOIN 关联查询能力（config 声明式 JOIN + SQL 模板双模式统一引擎、按关联字段排序/筛选、metadata 虚拟列）

### Modified Capabilities
- `data-source-management`: FORM 数据源 params 由"自动生成只读"改为"CRUD 接口自动生成只读 + JOIN/SQL 查询配置开放编辑"
- `datasource-auto-params`: FORM 数据源 params 生成逻辑扩展支持 queryMode 的 JOIN/SQL 配置段
- `datasource-field-sorting`: 排序白名单从主表 column_config 扩展包含 JOIN 虚拟列 / SQL 声明列

## Impact

- **后端**：`BizDataQueryBuilder`（重构为统一引擎）、`UnifiedDataSourceAdapter`（queryMode 分流）、`DataSourceDefinitionService`（params 开放编辑 + targetFormKey 校验）、新增 `JoinSqlGenerator` / `SqlTemplateEngine` / `SqlTemplateValidator`
- **前端**：`DataSourceListPage.vue`（新增 JOIN/SQL 配置入口与参数编辑）、查询侧（`BizDataListPage`/`PageDataTable` 通过 metadata 自动渲染虚拟列）零改动
- **测试**：JoinSqlGenerator / SqlTemplateEngine 单测 + FORM 数据源 query/metadata 集成测试 + SQL 模板安全校验测试
- **API**：外部协议不变（metadata/queryData 同 SPI）；仅数据源管理接口放开 params 编辑权限
