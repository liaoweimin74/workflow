# Design：将工作流表单统一进数据源体系

## Context

数据源体系已通过 `DataSourceAdapter` SPI 统一了三类供给：FORM（业务表单物理表）、SYSTEM（用户/部门只读）、API（外部 HTTP）。统一端点 `/v1/data-sources/{id}/metadata|data` 由 `UnifiedDataSourceAdapter` switch 分发，PAGE 轨已有"页面数据源绑定"完整模式（`schema.dataSources[] {id, refId, searchFields}` → 解析 refId 经 SPI 查数）。

两处未统一：

1. **工作流表单**：与业务表单共用 `FormDefinition`，但仅 BUSINESS 类型有 column_config；流程表单数据存 `wf_form_data`（formDefId + processInstanceId + dataJson + isSnapshot），按流程实例粒度、JSON blob，无法被数据源消费。
2. **视图轨（VIEW）**：PageDefinition 以 formKey 直连业务表，发布校验基于 column_config，取数走 `bizDataService.query(formKey)`，绕过了 SPI。

关键约束：

- `FormData` 非快照记录每（tenant, processInstance, formDefId）一行；同一 formKey 多版本产生多个 formDefId
- 工作流表单无 column_config，列定义只能从 schema（form-create rule JSON）解析
- 项目数据库为 MySQL 方言（DDL Builder 已如此假设）
- 存量 VIEW 页面为阶段一新落地产物，数量少

## Goals / Non-Goals

**Goals:**

- 新增 WORKFLOW 数据源类型接入 SPI：metadata/query/get 只读可用，CUD 明确拒绝
- 视图轨从 formKey 直连切换为 dataSourceId 经 SPI 取数，四类数据源在设计器中平等可选
- 存量 VIEW 页面启动时自动迁移到 FORM 数据源，行为零回归
- 一个消费端端到端验证：视图渲染器绑定 WORKFLOW 数据源展示跨实例表单数据 + 筛选

**Non-Goals:**

- 高吞吐跨实例报表的物化优化（影子表方案留作后续演进）
- 表单内 dataPicker/LookupPicker 引用 WORKFLOW 数据源的改造
- PAGE 轨多数据源联动的功能增强（现有机制不动）
- WORKFLOW 数据源的快照数据、发起页草稿暴露
- 非 MySQL 数据库支持

## Decisions

### D1. WORKFLOW 类型定义与生命周期

- `type = "WORKFLOW"`，复用 `formKey` 字段存表单定义 key（对齐 FORM 用法）
- enable 校验：表单存在、最新版 PUBLISHED、且 `type != BUSINESS`——BUSINESS 表单已有 FORM 类型表达，禁止重复避免语义分叉
- 全只读：metadata 返回 `writable=false`；create/update/delete 抛 `BusinessException(400)`
- InternalDataSourceRouter 仅放行 list/get

*备选：允许绑定任意类型表单 → 否决，同一表单两种数据源表达会让消费者困惑。*

### D2. WORKFLOW metadata 构成

固定 5 系统列 + schema 解析的表单列：

| 来源 | 列 | columnType |
|---|---|---|
| 系统列 | instanceId / processStatus / initiatorName / startTime / currentNodeName | VARCHAR / DATETIME(startTime) |
| schema.rule[] | field→key, title→label | 数字→INT/DECIMAL、日期→DATE/DATETIME、其余默认 VARCHAR |

子表/文件类字段不展开。新增独立组件 `FormSchemaColumnExtractor` 承担解析，供 adapter 复用与单独测试。

### D3. WORKFLOW query 行语义

- 范围：`wf_form_data WHERE tenant_id=? AND form_def_id IN (该 key 全部版本的 formDefId) AND is_snapshot=false AND process_instance_id IS NOT NULL`
- 行 = 5 系统列 + dataJson 字段展开；跨版本：旧实例字段按最新 PUBLISHED schema 展开，缺失空值、多余忽略
- 筛选/keyword 用 MySQL `JSON_EXTRACT` 实现等值/LIKE；排序第一版仅支持系统列（start_time / created_at）

### D4. VIEW 轨模型与校验

- PageDefinition 新增 `dataSourceId` 列；`formKey` 保留不清空（迁移溯源），代码不再读取
- 发布校验改为：dataSourceId 必填、数据源存在且 ENABLED、searchFields/columns 引用列存在于 metadata.columns；大字段禁筛规则仅对声明了 `columnType ∈ {JSON, TEXT, LONGTEXT}` 的列生效（SYSTEM/API/WORKFLOW 无 columnType 的列不受限）
- ViewCompiler 编译逻辑不变（searchFields/columns 结构未变，仅候选列来源变化）

### D5. VIEW 取数路径

`/pages/{pageKey}/data` → 解析 `page.dataSourceId` → `dsService.queryData()`（searchFields 白名单过滤原样保留）。删除对 BizDataService 的直接依赖。

### D6. 消费端行为

- 详情弹窗双轨：type=FORM 反查 formKey 渲染 FormRenderer 表单详情（存量体验零损失）；其余类型只读 KV 列表
- 写操作按钮（open-create/edit/delete）仅当 `metadata.writable=true` 渲染；只读数据源保留 open-detail/open-link/refresh/export

### D7. 存量迁移

启动时 ApplicationRunner 幂等执行：扫描 `type=VIEW AND formKey 非空 AND dataSourceId 为空` → 对每个唯一 formKey 按命名约定复用或创建 FORM 数据源（直接 ENABLED，前提 PUBLISHED+BUSINESS）→ 回填 page.dataSourceId。表单不满足则跳过该页并记日志（错误延迟到发布校验暴露）；逐页面独立事务。

## Risks / Trade-offs

- [JSON_EXTRACT 无索引，大数据量分页筛选慢] → 第一版接受；规格注明限制，演进方向为发起时物化影子表（Non-Goal）
- [旧版本流程实例字段与最新 schema 不一致] → 展开时以最新 schema 为准，缺失空值多余忽略，不抛错
- [迁移时业务表单被删/未发布导致跳过] → 页面保留 formKey 与日志线索，发布校验时报明确错误引导重绑
- [ViewDesigner 改造后误选 DISABLED 数据源] → 下拉仅拉取 getEnabledDataSources；发布校验二次兜底
- [详情弹窗 KV 模式信息密度低于表单渲染] → 仅影响非 FORM 类型（新场景），存量 FORM 视图走原路径

## Migration Plan

1. 后端：SPI 接入 WORKFLOW → PageQueryController/Validator 切换 → 迁移器上线（启动自动执行）
2. 前端：ViewDesigner 绑定区改造 + PageRenderer 详情/按钮显隐逻辑
3. 回滚策略：迁移器幂等且只增不改（回填 dataSourceId 可清空复原）；formKey 未删除，代码回滚到 formKey 直连分支即可恢复旧行为
4. 验证：集成测试（发起流程 → 建 WORKFLOW 数据源 → query 断言行展开）+ 手工验收（跨实例列表筛选可用、存量视图回归不变）

## Open Questions

无——设计已在 brainstorming 阶段逐节确认。
