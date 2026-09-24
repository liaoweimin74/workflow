# Proposal：将工作流表单统一进数据源体系

## Why

数据源体系已用统一 SPI 覆盖业务表单/系统结构/外部 API 三类供给，但工作流表单数据（wf_form_data 按流程实例的 JSON blob）无法被消费，视图轨也绕过 SPI 以 formKey 直连业务表。四类数据取数路径不一致，导致页面组件无法以相同模式绑定所有数据源。现在处理正当其时：PAGE 轨的数据源绑定模式已验证可复用，存量 VIEW 页面少、迁移成本低；统一后新增数据类型只需扩展 SPI 供给方，消费端零改动。

## What Changes

**WORKFLOW 数据源类型**
- From: 数据源仅支持 FORM/SYSTEM/API，流程表单数据不可消费
- To: 新增 WORKFLOW 类型绑定已发布非业务表单，暴露跨实例当前数据（只读），metadata 由 schema 解析生成
- Reason: 架构统一的供给侧前提
- Impact: 非破坏性新增；DataSourceAdapter/管理页/enable 校验扩展

**视图轨绑定模型**
- From: VIEW 页面以 formKey 直连业务表物理表查询
- To: VIEW 页面以 dataSourceId 经 DataSourceAdapter SPI 统一取数，设计器可选四类数据源
- Reason: 消费端统一协议，消除直连旁路
- Impact: 破坏性模型切换，依赖自动迁移保障存量兼容

**存量自动迁移**
- From: 存量 VIEW 页面仅有 formKey
- To: 启动时幂等迁移：每个 formKey 自动映射 FORM 数据源并回填 dataSourceId
- Reason: 全量切换的安全垫
- Impact: 对用户透明，行为零回归

## Capabilities

### New Capabilities

- `workflow-form-datasource`: WORKFLOW 类型数据源的完整能力——定义/启用校验（非 BUSINESS 已发布表单）、schema→列解析 metadata、跨实例当前数据 query/get（系统列+JSON 字段展开）、CUD 拒绝与只读约束
- `view-datasource-binding`: 视图轨统一数据源绑定的完整能力——dataSourceId 模型、发布校验（ENABLED+列引用白名单）、渲染器经 SPI 取数、详情弹窗双轨与写按钮 writable 显隐
- `view-datasource-migration`: 存量视图自动迁移能力——启动时幂等扫描、formKey→FORM 数据源复用或创建、逐页面独立事务与跳过日志

### Modified Capabilities

（无既有 specs 目录，本次均为新能力）

## Impact

- **后端**：`UnifiedDataSourceAdapter`（WORKFLOW 分支）、`DataSourceDefinitionService.enable` 校验、新增 `FormSchemaColumnExtractor` 与 wf_form_data 查询服务、`PageDefinition` 实体加列、`PageValidator`/`PageQueryController` 切换、新增迁移 ApplicationRunner
- **前端**：`ViewDesigner.vue` 绑定区改数据源选择、`PageRenderer.vue` 详情弹窗双轨与按钮显隐
- **数据库**：wf_page_def 加 dataSource_id 列（DDL）；无破坏性 schema 变更
- **API**：`/v1/data-sources` 行为扩展（新 type）；`/v1/pages/{pageKey}/data` 内部实现切换、契约不变
