## Context

### 当前状态

前端设计器已支持会签/或签/转办/驳回等审批策略配置，配置存入 `wf_node_config.configJson`。但后端运行时不读配置：

- `WorkflowTaskService.completeTask()` 裸调 `flowableTaskService.complete()`，不处理会签或签
- `ProcessDesignService.deploy()` 直接部署前端传来的 BPMN XML，不读 `wf_node_config` 注入 MI 元素
- 无驳回、转办、流程变量管理、流程图高亮接口

### Spike 验证结果（4/4 通过）

| Spike | 命题 | 结果 |
|---|---|---|
| Spike-1 | MI parallel 会签 | ✅ `collection` + `elementVariable` + `assignee="${approver}"` 正确分配 |
| Spike-2 | MI 或签 | ✅ `completionCondition >= 1` 生效，其余任务自动删除 |
| Spike-3 | 单实例驳回 | ✅ `moveActivityIdTo` 生效，变量保留，历史 `deleteReason` 自动标记 |
| Spike-4 | MI 节点驳回 | ✅ `moveActivityIdTo` 对 MI 节点生效，整体回退 + 重新展开 |

### 约束

- 多租户：所有查询带 `tenantId` 过滤（`TenantProvider`）
- `wf_node_config` 的 `multiMode` 与 BPMN XML 必须一致（部署是冻结点）
- 审批人集合通过流程变量 `approverList` 注入 MI `collection`

### 利益相关者

- 前端设计器：需改造 BPMN XML 生成或后端部署时改写
- 后端运行时：新增驳回/转办/变量/高亮能力
- API 消费方：新增 7 个接口端点

## Goals / Non-Goals

**Goals:**

1. 会签/或签运行时生效：部署时把 `multiMode` 翻译成 BPMN MI 元素
2. 驳回到发起人节点：单实例 + MI 节点均支持，`changeActivityState` 路线
3. 转办（transfer）：`setAssignee` + `wf_task_transfer` 审计表
4. 流程变量管理：实例级 CRUD 接口
5. 流程图高亮跟踪：后端返回 activity 状态列表 + bpmnXml
6. `complete` 返回值扩展：返回 `nodeCompleted`/`remaining`/`processAdvanced`

**Non-Goals:**

- 加签/转签（下期）
- 催办/超时（下期）
- 审批人去重（下期）
- 通知中心（后补）
- 前端设计器 UI 改造（仅 BPMN XML 生成逻辑，不改 UI 交互）
- MI 驳回的"部分回退"语义（本期只做整体回退）

## Decisions

### D1: 会签或签 — 后端部署时改写 BPMN XML

**选择**：后端 `ProcessDesignService.deploy()` 时读 `wf_node_config.configJson.approval.multiMode`，用 Flowable `BpmnXMLConverter` 改写 BPMN XML 注入 `multiInstanceLoopCharacteristics`。

**理由**：
- 前端不碰 BPMN XML 操作逻辑，降低前端复杂度
- 逻辑集中在后端，`wf_node_config` 与 BPMN XML 一致性由后端保证
- Spike 验证 MI 语法（`collection` + `elementVariable` + `assignee` + `completionCondition`）正确

**翻译规则**：
```
multiMode = "countersign"
  → completionCondition: ${nrOfCompletedInstances == nrOfInstances}

multiMode = "or_sign"
  → completionCondition: ${nrOfCompletedInstances >= 1}

approval.userIds → 流程变量 approverList（部署时注入默认值，运行时可覆盖）
approval.expression → 流程变量 approverList（表达式解析）
```

**替代方案**：前端设计器部署时翻译 → 前端需写 bpmn-js moddle 逻辑，逻辑分散，未采用。

### D2: 驳回 — changeActivityState + 发起人节点自动识别

**选择**：`runtimeService.createChangeActivityStateBuilder().moveActivityIdTo(currentActivityId, initiatorActivityId).changeState()`。

**发起人节点识别**：解析 BPMN 模型，找 `startEvent` 的 `outgoing` sequenceFlow 指向的第一个 `userTask`。

**MI 节点驳回**：`moveActivityIdTo` 对 MI 节点直接生效（Spike-4 验证），所有实例回收，重新提交后用原 `approverList` 重新展开。已审过的人需重审（整体回退语义）。

**替代方案**：终止+重启 → 丢失执行树，未采用。

### D3: 转办 — setAssignee + 审计表

**选择**：`flowableTaskService.setAssignee(taskId, toUser)` + 新增 `wf_task_transfer` 表记录转办历史。

**与 delegate 区别**：
- `delegate`：`owner=A, assignee=B`，B 完成后回到 A
- `transfer`：`assignee=B, owner=null`，A 彻底脱离，B 是新审批人

**审计表结构**：
```
wf_task_transfer
  id, tenant_id, task_id, process_instance_id,
  from_user, to_user, reason, created_at
```

### D4: 流程变量 — 实例级 CRUD

**选择**：`runtimeService.getVariables/setVariable/removeVariable(processInstanceId, ...)`。

**接口**：
- `GET /process-instances/{id}/variables`
- `GET /process-instances/{id}/variables/{name}`
- `POST /process-instances/{id}/variables`
- `DELETE /process-instances/{id}/variables/{name}`

### D5: 流程图高亮 — 格式 A（数据 + bpmn-js）

**选择**：后端返回 `bpmnXml` + `activities[]`（含 status） + `sequenceFlows[]`（含 status），前端 bpmn-js 加 CSS class 渲染。

**数据来源**：
- `COMPLETED`：`ACT_HI_ACTINST` endTime IS NOT NULL
- `ACTIVE`：`runtimeService.getActiveActivityIds(pid)`
- `PENDING`：BPMN 模型全量 activityId 减去 COMPLETED + ACTIVE
- 连线 `TRAVERSED`：`ACT_HI_ACTINST` activityType=sequenceFlow 有记录

**驳回后高亮**：有 endTime 即 COMPLETED，不区分 REJECTED（决策⑧）。

### D6: complete 返回值扩展

**选择**：`POST /tasks/{id}/complete` 返回 `CompleteTaskResponse`。

```
CompleteTaskResponse {
  nodeCompleted: boolean    // 当前节点是否全部完成（MI: nrOfCompletedInstances == nrOfInstances）
  remaining: int            // 剩余未完成数
  processAdvanced: boolean  // 流程是否已前进（nodeCompleted && 无同 activityId 的活跃任务）
}
```

**实现**：complete 后查 `taskService.createTaskQuery().processInstanceId(pid).taskDefinitionKey(activityId).count()`。单实例任务时 `nodeCompleted=true, remaining=0, processAdvanced=true`。

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| 后端改写 BPMN XML 可能破坏前端设计器再次加载 | 改写只发生在 deploy 时，`wf_process_drafts.bpmnXml` 存原始 XML；改写后的 XML 只传给 Flowable |
| `approverList` 变量名硬编码，多节点会签可能冲突 | 每个会签节点的 approverList 绑定到节点级 execution variable（MI 的 elementVariable 作用域是实例级） |
| MI 驳回整体回退体验差（已审的人要重审） | 本期接受，下期考虑"部分回退"（保留已审记录，只回退未审的） |
| `changeActivityState` 在复杂流程（并行网关 + MI）可能行为不明 | 本期只验证了线性流程 + MI，复杂场景留风险；实现时加 try-catch，失败则返回错误提示 |
| `complete` 返回值扩展破坏现有 API 消费方 | `R<Void>` → `R<CompleteTaskResponse>`，向后不兼容；但当前无外部消费方，前端同步改 |
| 转办审计表与 Flowable 历史表数据冗余 | 审计表只记录转办操作本身（from/to/reason），不记录任务状态；Flowable 历史记 assignee 变化 |

## Migration Plan

### 部署步骤

1. 新增 `wf_task_transfer` 表（Flyway 迁移脚本）
2. 后端部署改写逻辑上线后，**已部署的流程定义不受影响**（BPMN XML 已在 Flowable 里）
3. 新部署的流程定义会走改写逻辑，MI 元素自动注入
4. 前端 `complete` 接口消费方需适配新返回值

### 回滚策略

- `wf_task_transfer` 表保留，无副作用
- 部署改写逻辑通过 feature flag 控制（`workflow.deploy.mi-rewrite.enabled`），可关闭
- `complete` 返回值通过 Accept header 版本控制，或前端适配后无回滚需求

## Open Questions

### Q1: approverList 变量注入时机

部署时注入默认 approverList（从 `wf_node_config.userIds` 解析），还是启动流程时由调用方传入？

**倾向**：两者都支持。部署时注入默认值（`approval.userIds` → `${approverList}` 默认值），启动时 `startProcess` 的 variables 可覆盖。需确认 Flowable 是否支持流程变量默认值——若不支持，改为启动时必传。

### Q2: 后端 BPMN XML 改写的实现方式

用 Flowable 的 `BpmnXMLConverter` 解析 → 改写 DOM → 序列化，还是用字符串替换？

**倾向**：`BpmnXMLConverter` 解析为 `BpmnModel` 对象，操作对象后序列化。更安全，不依赖字符串匹配。实现时确认 API。
