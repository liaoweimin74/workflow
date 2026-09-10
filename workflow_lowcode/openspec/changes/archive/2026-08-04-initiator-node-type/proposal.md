## Why

当前流程设计器中所有 UserTask 共用同一套属性面板，设计者可能在发起人节点上错误配置候选用户、会签、或签等不适用选项。同时后端启动流程时未自动注入 `initiator` 变量，导致 `${initiator}` 表达式解析为 null。需要引入显式的发起人节点类型，从设计时就约束配置项，并补齐后端变量注入。

## What Changes

**发起人节点类型**
- From: 所有 UserTask 共用完整属性面板，可配置审批人/候选/会签/操作权限/超时
- To: 新增"发起人节点"类型（UserTask + `wf:nodeRole="initiator"`），属性面板只显示节点名称 + 表单关联
- Reason: 发起人是运行时确定的唯一身份，不应有候选/会签等配置
- Impact: non-breaking，旧流程不受影响

**后端 initiator 变量注入**
- From: `ProcessInstanceController.start` 只传前端 variables，不注入当前用户
- To: 自动从 SecurityContext 取 `LoginUser.userId` 放入 `variables.put("initiator", userId)`
- Reason: `${initiator}` 表达式需要此变量才能解析
- Impact: non-breaking，新增变量不影响已有逻辑

**InitiatorNodeResolver 精确匹配**
- From: 盲取流程定义中第一个 UserTask 作为发起人节点
- To: 优先查找 `wf:nodeRole=initiator` 的 UserTask，找不到回退到第一个 UserTask
- Reason: 第一个 UserTask 不一定是发起人节点
- Impact: non-breaking，回退逻辑兼容旧流程

**移除 initiator_self 审批类型**
- From: UserTaskProperty 审批类型有 `initiator_self`（发起人自选）选项
- To: 移除该选项，发起人语义由节点类型而非审批类型表达
- Reason: 语义混乱，发起人不需要"选"
- Impact: breaking（设计时），已使用 `initiator_self` 的流程配置需迁移为发起人节点

## Capabilities

### New Capabilities
- `initiator-node`: 发起人节点类型定义，包括 bpmn.js moddle 扩展、节点面板入口、精简属性面板、自定义 renderer
- `process-initiator-injection`: 后端流程启动时自动注入 initiator 变量

### Modified Capabilities
- `task-reject`: 驳回目标解析逻辑改为优先匹配 `nodeRole=initiator` 节点

## Impact

- **前端**：`bpmnModeler.ts`（注册 moddle 扩展 + custom renderer）、`NodePalette.vue`（新节点入口）、`ProcessDesigner.vue`（handleDrop 创建逻辑）、`PropertyPanel.vue`（路由分支）、新增 `InitiatorTaskProperty.vue`、`UserTaskProperty.vue`（移除 initiator_self）、`designerStore.ts`（类型定义清理）
- **后端**：`ProcessInstanceController.java`（注入 initiator）、`InitiatorNodeResolver.java`（精确匹配）
- **依赖**：无新增第三方依赖，bpmn.js 原生支持 moddle 扩展
- **数据库**：无变更
- **API**：无接口变更，`POST /api/v1/process-instances` 行为变化仅为自动注入变量
