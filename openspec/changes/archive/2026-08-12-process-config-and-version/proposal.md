# Proposal: process-config-and-version

## Why

当前工作流平台存在四个配置与版本问题：

1. **配置层级混乱**：节点级 `operations`（5 个操作权限位）是运行时唯一依据，但流程级 `__PROCESS__` 配置里残留了从未被后端消费的 `allowAddSigner` / `allowDelegate` 开关，UI 上仍展示——用户无法理解"流程级与节点级配置的关系"，管理员也无法统一治理操作权限。
2. **操作语义重叠**：转办（`setAssignee`）与转签（MI 实例 delete+add）在会签/或签节点上运行时效果等价，仅审计 action 与权限位不同；用户被迫理解"会签节点用转签、普通节点用转办"的底层差异。委派（`delegateTask`，resolve 后回原办理人）语义完全不同但常被混为一谈。
3. **部署变化检测缺陷（bug）**：`deploy()` 仅比较"改写后 XML"（只含会签/或签改写），审批人、操作权限、超时、表单绑定、`__PROCESS__` 等配置变化不体现于 XML → 修改后被误判"流程数据未变化，无需部署"→ 配置永不生效。
4. **历史版本不可见**：数据已备齐（Flowable 按版本存 XML、`wf_node_config` 有按 `processDefinitionId` 的配置快照），但接口只返回 `.latestVersion()`，前端无版本历史入口与只读视图，无法追溯历史配置。

## What Changes

- **D1 流程级操作权限总控**：`ProcessConfigData.approvalPolicy` 新增 `operations` 四开关（驳回/加签/转办/委派，默认全开），替换废弃的 `allowAddSigner` / `allowDelegate`；生效规则 = 流程级 AND 节点级；后端运行时解析叠加 `__PROCESS__` 配置。
- **D2 转办/转签 UI 合并**：前端"更多操作"移除"转签"；`allowForwardSign` 从节点配置移除、并入 `allowTransfer`；后端 `transfer` 接口按任务节点是否 MI 自动路由（MI → `ForwardSignService` 保审计语义，非 MI → `TransferService`）；委派独立保留。
- **D3 部署变化检测 = XML + 配置整体 hash**：`ProcessDraft` 新增 `deployedConfigHash`（SHA-256(effectiveBpmnXml + 规范化 nodeConfigMap)）；部署时比较 hash，任一变化即可部署；历史数据降级用 `deployedXml` 比较，部署成功后写 hash。
- **D4 历史版本查看**：新增 `GET /deployed-processes/{key}/versions`（版本列表）与 `GET /deployed-processes/versions/{procDefId}/editor`（该版本 XML + 配置快照，复用 editor 形状）；前端流程列表加"版本历史"抽屉 + 只读设计器（bpmn-js 仅渲染 + 属性面板只读）。

## Capabilities

**New Capabilities:**
- `process-operation-policy`：流程级操作权限总控模型（配置结构、AND 生效规则、运行时叠加解析）
- `deploy-change-detection`：部署变化检测（XML + 配置整体 hash、历史数据降级）
- `process-version-history`：流程历史版本查看（版本列表 API、版本 editor API、前端版本抽屉与只读设计器）

**Modified Capabilities:**
- `task-transfer`：转办权限控制叠加流程级开关；转办接口增加 MI 节点路由（合并转签语义）
- `task-detail`：任务详情页操作菜单移除"转签"，转办/委派/加签保留
- `bpmn-designer`：流程属性面板增加"操作权限总控"分区；节点属性移除"允许转签"项

## Impact

**后端：**
- `ProcessDraft` 实体 + Flyway 迁移：新增 `deployed_config_hash` 列
- `ProcessDesignService.deploy()`：变化检测改为 hash 比较（含降级路径）
- `OperationsConfig` 解析：叠加流程级 `__PROCESS__` 配置（AND 规则）
- `TaskController.transfer`：按节点是否 MI 自动路由（复用 `AddSignService.isMultiInstanceActivity` 同类逻辑）
- `ProcessDefinitionController` / `DeployedProcessController`：新增版本列表与版本 editor 接口
- `MultiInstanceBpmnRewriter`：无改动（rewrite 结果仍作为 effectiveBpmnXml 参与 hash）

**前端：**
- `stores/designerStore.ts`：`ProcessConfigData` 类型与默认值更新（operations、移除废弃字段）
- `views/designer/properties/ProcessProperty.vue`：操作权限总控分区
- `views/designer/properties/UserTaskProperty.vue`：移除允许转签项
- `views/process/TaskDetailPage.vue`：操作菜单合并
- `views/process/ProcessListPage.vue`：版本历史抽屉
- `views/designer/ProcessDesigner.vue`：`readOnly` 模式（仅渲染 + 只读属性）
- `api/processDefinition.ts`：新接口封装

**依赖：** 无新增第三方依赖。数据层全部复用现有存储（Flowable XML、`wf_node_config` 版本快照、`wf_process_draft`）。
