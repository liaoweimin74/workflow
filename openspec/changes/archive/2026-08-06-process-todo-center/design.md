## Context

### 现状

工作流平台后端引擎层已具备完整能力：流程定义部署、流程实例启停、任务签收/完成/转办/委派/加签/转签/驳回、会签或签、流程图高亮、多租户隔离（见 PRD 3.3 实现状态）。前端已搭建管理后台框架（Vue 3 + Element Plus + SearchTable 组件体系），流程设计器、表单设计器、流程定义管理、分类管理、用户/角色/组织等页面已实现。

但面向**普通用户**的两个核心入口缺失：
- `ProcessCenterPage.vue` 和 `ProcessTodoPage.vue` 仅为空壳（el-empty 占位）
- PRD v1.0 中无对应需求描述（已在 v1.1 补充 3.11/3.12）

### 后端 API 现状（可复用 vs 缺口）

| 能力 | 现有 API | 缺口 |
|---|---|---|
| 已部署流程列表 | `GET /api/v1/deployed-processes`（分页） | 需支持 categoryId 筛选 + name 搜索 + 仅 active |
| 流程定义详情/XML | `GET /api/v1/deployed-processes/{id}` + `/xml` | 无 |
| 分类树 | `GET /api/v1/categories/tree` | 无 |
| 发起流程 | `POST /api/v1/process-instances`（注入 initiator） | 无 |
| 待办列表 | `GET /api/tasks?assignee=` | toMap 字段不足：缺流程名称、发起人、当前节点 |
| 已办列表 | `GET /api/tasks/historic?userId=` | 同上，缺审批结果字段 |
| 任务详情 | `GET /api/tasks/{id}` | 缺流程基本信息、表单数据、流程变量 |
| 任务操作 | complete/reject/transfer/delegate/add-sign/forward-sign | 无 |
| 流程实例列表 | `GET /api/v1/process-instances`（分页） | 缺 initiator 筛选 + 状态筛选 |
| 流程高亮 | `GET /api/v1/process-instances/{id}/highlight` | 无 |
| 审批记录时间线 | 无 | **需新增**：查询历史活动节点 + 审批意见 |
| 催办 | 无 | **需新增**：PRD 3.3.5 |

### 技术栈约束

- 后端：Spring Boot + Flowable，REST 风格 `R<T>` 封装，`/api/v1/` 前缀（流程相关）或 `/api/`（任务相关，待统一）
- 前端：Vue 3 + Element Plus + TypeScript，`SearchTable` 通用表格组件，`http` 封装 axios，`R<T>` 类型
- 数据库：MySQL + Flyway 迁移

## Goals / Non-Goals

**Goals:**
- 实现流程中心页面：分类分组展示已部署流程 + 发起流程独立页面（含表单填写）
- 实现待办中心页面：待办/已办/我发起的三 Tab + 任务处理详情页（标准三段布局）
- 补齐后端 API 缺口：流程列表筛选、任务列表关联信息、我发起的查询、审批记录时间线、催办
- 复用现有引擎能力，不重复实现审批/转办/加签等逻辑

**Non-Goals:**
- 不重构现有 TaskController 的 URL 前缀（`/api/tasks` vs `/api/v1/` 暂不统一，后续技术债清理）
- 不实现流程模拟预览（PRD 3.1 标注"没实现"，属独立功能）
- 不实现表单字段细粒度权限（PRD 3.2.6 后续阶段）
- 不实现驳回到任意历史节点（PRD 3.3.4 后续阶段）
- 不做通知中心的 UI（PRD 3.7 通知能力后端预留，UI 独立迭代）
- 不做 SLA/仪表盘（PRD 3.9 后续阶段）

## Decisions

### D1: 后端 API 扩展策略 — 扩展现有 Controller，不新建

**选择**：在现有 `ProcessDefinitionController`、`TaskController`、`ProcessInstanceController` 上扩展查询参数和返回字段，不新建 Controller。

**理由**：
- 现有 Controller 已覆盖大部分能力，缺口主要是"查询参数不足"和"返回字段不全"
- 新建 Controller 会导致 URL 路径分裂，前端需对接两套 API
- 扩展方式向后兼容（新增可选参数 + 返回字段新增不破坏现有消费者）

**替代方案**：新建 `UserTaskController` 专门服务待办中心 — 否决，因任务操作 API 已在 TaskController，查询拆分会割裂。

### D2: 待办/已办列表返回字段扩展 — 封装为 VO

**选择**：新建 `TaskTodoVO` / `TaskDoneVO`，在 Service 层关联查询流程定义名称、发起人、当前节点名称，替换现有的 `Map<String, Object> toMap()`。

**理由**：
- 当前 `toMap()` 返回裸 Task 字段，前端无法直接展示流程名称/发起人
- 用 VO 替代 Map 同时提升类型安全（与项目其他 VO 如 UserVO/RoleVO 一致）
- 关联查询在 Service 层批量完成，避免 N+1

**替代方案**：前端二次查询关联信息 — 否决，N+1 请求性能差且逻辑分散。

### D3: 审批记录时间线 — 新增 HistoryController

**选择**：新建 `ProcessHistoryController`，`GET /api/v1/process-instances/{id}/history` 返回审批记录时间线（节点名称、办理人、处理时间、意见、操作类型）。

**理由**：
- Flowable `HistoryService` 提供历史活动与历史变量查询，但需聚合为前端可直接渲染的结构
- 与 `highlight` 端点同属流程实例维度，放 ProcessInstanceController 过载，独立 Controller 更清晰
- 审批意见存储：复用 Flowable 的 `taskLocalVariables`（comment 变量）或新增 `wf_task_comment` 表（Flyway 迁移）

**替代方案**：放 ProcessInstanceController 作为子路径 — 可接受，但该 Controller 已有 7 个端点，继续加不利于维护。

### D4: "我发起的"查询 — 扩展流程实例列表 + 发起人变量

**选择**：扩展 `GET /api/v1/process-instances` 支持 `initiator`、`status` 参数；发起人通过 `POST` 时注入的 `initiator` 流程变量筛选。

**理由**：
- 已有 `POST /api/v1/process-instances` 注入 `initiator` 变量（ProcessInstanceController:38）
- `ProcessInstanceService.listProcessInstances` 扩展查询条件即可
- 状态筛选：进行中（!ended）、已结束（ended）通过 Flowable 查询条件实现

### D5: 催办 — 新增 RemindController + 频率限制

**选择**：新建 `RemindController`，`POST /api/v1/tasks/{id}/remind`，记录催办时间到 `wf_task_remind` 表（Flyway），同任务 24h 内不可重复催办（可配置）。

**理由**：
- PRD 3.3.5 要求"同任务有催办频率限制"，需持久化记录
- 催办触发通知（PRD 3.7），通知通道后续实现，本期先记录 + 返回状态

### D6: 前端路由结构

**选择**：
- `/process/center` — 流程中心（已有路由）
- `/process/start/:processDefinitionId` — 发起流程页（新增）
- `/process/todo` — 待办中心（已有路由，改造为 Tab）
- `/process/todo/:taskId` — 任务处理详情页（新增）
- `/process/todo/done/:taskId` — 已办只读详情页（新增）
- `/process/instance/:instanceId` — 流程实例跟踪页（新增，"我发起的"点击跟踪跳转）

**理由**：复用现有 `/process/` 前缀，路由层级清晰；详情页独立路由便于浏览器前进后退。

### D7: 前端组件复用

**选择**：
- 列表页复用 `SearchTable` 组件（已用于 ProcessListPage、UserPage 等）
- 表单渲染复用 `FormRenderer` 组件（已存在于 `frontend/src/views/form/components/`）
- 流程图复用设计器的 BPMN 渲染能力（只读模式）
- 用户选择器复用系统已有的用户选择组件（OrgPage 中有用户树）

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| [审批意见存储方案不确定] Flowable comment API 与自定义表各有利弊 | 先用 Flyway 建 `wf_task_comment` 表，Service 层封装，后续可切换存储不破坏 API |
| [待办列表关联查询性能] 批量查流程定义名称/发起人可能有 N+1 | Service 层用 `IN` 查询批量获取，Map 映射，单次列表最多 1+2 次额外查询 |
| [催办频率限制并发] 两人同时催办同一任务 | `wf_task_remind` 表对 (task_id) 加唯一约束或用乐观锁 |
| [TaskController URL 前缀不统一] `/api/tasks` vs `/api/v1/` | 本期不统一，避免破坏现有前端；记录为技术债，后续统一迁移 |
| [流程图只读渲染] 设计器 bpmn-js 实例可能不便复用为只读 | 抽取独立的 `BpmnViewer` 组件，基于 bpmn-js 的 Viewer 模块 |

## Migration Plan

1. **后端先行**：Flyway 迁移（wf_task_comment, wf_task_remind 表）→ 新增/扩展 Service → 新增/扩展 Controller → 集成测试
2. **前端跟进**：API 模块封装 → 流程中心页面 → 发起流程页 → 待办中心三 Tab → 任务处理详情页 → 流程实例跟踪页
3. **回滚策略**：前端页面为新增，回滚仅需移除路由；后端新增表和 API 端点为加法式变更，回滚需删除新增表和端点（无破坏性变更）

## Open Questions

- 审批意见是否需要支持富文本？**暂定纯文本**，PRD 未要求富文本，降低复杂度。
- 流程中心卡片的"流程图标"如何配置？**暂定使用分类默认图标 + 流程定义无图标字段**，后续流程设计器增加图标配置时再对接。
