# Brainstorm：将工作流表单统一进数据源体系

## Design Summary

<!-- Validated design from brainstorming session -->

### 背景与问题

数据源体系目前支持三种类型（FORM/SYSTEM/API），经 `DataSourceAdapter` SPI 统一供给。工作流表单（流程发起/审批表单）数据存储于 `wf_form_data`（按流程实例粒度的 JSON blob，非快照数据用于节点间传递），无法被数据源体系消费；视图轨（VIEW）绑定的是业务表单 formKey 直连物理表，未走统一的数据源协议。

用户目标：
1. **架构统一优先**——四类数据（工作流表单/业务表单/系统结构/外部API）走同一套数据源绑定模式，页面组件以相同方式取数；
2. 交付边界：**含一个消费端打通**——选定为**视图轨通用渲染器**端到端验证；
3. 跨实例列表报表、dataPicker 数据引用等高级场景为后续扩展。

### 现状关键事实

- `DataSourceDefinition`：type=FORM/SYSTEM/API，formKey/sourceKey/params，DRAFT/ENABLED/DISABLED 状态机
- `UnifiedDataSourceAdapter`：switch 分发三类；FORM→`BizDataService`（物理表 `wf_biz_<formKey>` + ColumnConfig）；SYSTEM→user-tree/dept-tree 只读；API→`HttpLogicExecutor`
- 统一端点 `/v1/data-sources/{id}/metadata|data`；`InternalDataSourceRouter` 做操作级权限
- 工作流表单与业务表单共用 `FormDefinition`，但仅 BUSINESS 类型有 column_config；工作流表单只有 schema（form-create rule JSON）
- `FormData`（wf_form_data）：formDefId + processInstanceId + taskId + dataJson + isSnapshot；非快照每实例每表单一行；快照审批时冻结不可变
- PAGE 轨已有"页面数据源绑定"完整模式：`schema.dataSources[] {id, refId, searchFields}` + 组件 `dataSourceId` → `/pages/{pageKey}/ds/{dataSourceId}/data` → 解析 refId 经 SPI 查数
- VIEW 轨现状：ViewDesigner 选已发布业务表单 → PageValidator 校验（formKey 必填/已发布/BUSINESS/列引用合法）→ ViewCompiler 编译 {rule, option} → 渲染时 `/pages/{pageKey}/data` → filter 白名单 → `bizDataService.query(formKey)` 直连物理表

## Alternatives Considered

<!--
依 openspec/config.yaml 的 brainstorm rule：須涵蓋 2-3 個替代方案並說明取捨。
-->

### 方案 A：彻底统一——全量切换 + 自动迁移（采用）

- **做法**：PageDefinition 新增 dataSourceId 取代 formKey 直连；视图设计器改为"选数据源→拉 metadata→配筛选/展示列"；存量视图启动时自动迁移（每个 formKey 视图映射到自动创建的 FORM 数据源并回填 id）。同时新增 WORKFLOW 数据源类型接入 SPI。
- **优点**：一步达成"四类数据一个模式"；ViewCompiler/PageValidator/渲染器无分支残留；后续页面轨、dataPicker 引用直接复用同一协议。
- **缺點**：改造量最大（模型 + 迁移 + 设计器 + 编译器 + 渲染器 + 校验器）。
- **為何未採用**：（此为最终采用方案）

### 方案 B：渐进双轨

- **做法**：dataSourceId 可选新增，formKey 保留并存；新建视图可选任意数据源，旧视图继续 formKey 直连；渲染器内部做适配层收敛取数管道。
- **優點**：风险最低，可灰度。
- **缺點**：双路径长期并存，校验器/编译器带分支；"架构一致"目标打折；日后仍需二次清理。
- **為何未採用**：省下的前期成本会转化为长期分支维护成本，与架构统一的初衷相悖。

### 方案 C：最小侵入——仅渲染器内部统一

- **做法**：PageDefinition 模型不动，渲染器把 formKey 包装成虚拟 FORM 数据源调用统一管道。
- **優點**：改动最小。
- **缺點**：设计器里仍只能选业务表单，无法在设计期绑定 SYSTEM/API/WORKFLOW 数据源。
- **為何未採用**：不满足用户核心诉求（页面组件以相同模式绑定四类数据源）。

## Agreed Approach

采用**方案 A：彻底统一 + 自动迁移**。

理由：用户明确以架构一致为首要目标，且主动选择接受较大改造量的视图轨通用渲染器作为验证端；存量 VIEW 页面为阶段一新落地产物，数量少、迁移机械（formKey→FORM 数据源映射确定性强），风险可控。

## Key Decisions

1. **WORKFLOW 数据源类型**：
   - `type = "WORKFLOW"`，复用 `formKey` 字段存工作流表单定义 key
   - enable 校验：表单存在、最新版 PUBLISHED、且 `type != BUSINESS`（BUSINESS 表单走 FORM 类型，避免重复表达）
   - 只读：metadata 返回 `writable=false`；create/update/delete 抛 BusinessException(400)
   - InternalDataSourceRouter 仅放行 list/get
2. **WORKFLOW metadata 构成**：固定 5 系统列（instanceId/processStatus/initiatorName/startTime/currentNodeName）+ 从最新 PUBLISHED schema 解析的表单列（field/title/type 映射 ColumnConfig；数字→INT/DECIMAL、日期→DATE/DATETIME、其余 VARCHAR；子表/文件类字段不展开）
3. **WORKFLOW query 行语义**：一行 = 一个流程实例的当前表单数据（非快照且 processInstanceId IS NOT NULL）+ 系统列；跨版本语义：旧版本实例字段按最新 schema 展开，缺失空值、多余忽略；筛选/keyword 用 MySQL JSON_EXTRACT；排序第一版仅支持系统列
4. **已知限制**：JSON 字段无索引，大数据量分页筛选性能受限；高吞吐报表场景的演进方向是"发起时物化影子表"，不在本次范围
5. **VIEW 轨模型**：PageDefinition 新增 `dataSourceId`；`formKey` 保留不清空（迁移溯源），代码不再读取
6. **VIEW 发布校验**：dataSourceId 必填、数据源存在且 ENABLED、searchFields/columns 引用列存在于 metadata.columns；大字段禁筛规则仅对声明了 columnType∈{JSON,TEXT,LONGTEXT} 的列生效
7. **VIEW 取数路径**：`/pages/{pageKey}/data` → 解析 page.dataSourceId → dsService.queryData()（searchFields 白名单过滤逻辑原样保留）
8. **详情弹窗双轨**：数据源 type=FORM 时反查 formKey 用 FormRenderer 渲染表单详情（存量体验零损失）；其余类型渲染只读 KV 列表
9. **写操作按钮显隐**：open-create/edit/delete 仅当 metadata.writable=true 时渲染；只读数据源仅保留 open-detail/open-link/refresh/export
10. **存量自动迁移**：启动时 ApplicationRunner 幂等执行；扫描 type=VIEW 且 formKey 非空且 dataSourceId 为空的页面；按命名约定复用或创建同名 FORM 数据源（直接 ENABLED，前提 PUBLISHED+BUSINESS）；表单不满足则跳过该页并记日志（错误延迟到发布校验暴露）；逐页面独立事务

## Open Questions

无——消费场景、交付边界、验证端、方案选型及两个消费端行为决策均已在讨论中确认。
