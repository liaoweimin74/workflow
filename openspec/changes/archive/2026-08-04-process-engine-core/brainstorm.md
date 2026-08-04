## Design Summary

本文档总结 PRD 3.3 流程执行引擎「核心先行」变更的需求探索与设计决策。

探索通过 `/opsx-explore` 完成，期间通过 4 个 spike 测试验证了 Flowable 8 的关键能力，全部通过。详见 `docs/superpowers/specs/2026-08-03-engine-spike-design.md`。

### 背景

前端设计器已支持会签/或签/加签/转办/驳回/超时等审批策略配置，配置存入 `wf_node_config` JSON。但后端运行时 `WorkflowTaskService.completeTask` 裸调 `flowableTaskService.complete()`，完全不读取配置——配置是"死"的。本期补齐运行时执行能力。

### 范围（核心先行）

- **会签/或签运行时**：BPMN MI 原生路线
- **驳回到发起人**：changeActivityState 路线（单实例 + MI 整体回退）
- **转办（transfer）**：setAssignee + 审计表
- **流程变量管理**：实例级 CRUD 接口
- **流程图高亮跟踪**：后端返回数据 + 前端 bpmn-js 渲染
- **complete 返回值扩展**：返回节点状态（nodeCompleted/remaining/processAdvanced）

### 不在范围

加签/转签 | 催办 | 超时 | 审批人去重 | 通知中心（均下期）

## Alternatives Considered

### 方案 A：BPMN MI 原生路线（会签或签）

- **做法**：设计器部署时把 `multiMode` 翻译成 BPMN `multiInstanceLoopCharacteristics`，审批人集合通过流程变量 `collection` 注入，Flowable 原生驱动多实例展开/完成/清理
- **优点**：
  - Flowable 原生支持，状态自动管理（`nrOfActiveInstances`/`nrOfCompletedInstances`）
  - 任务查询天然兼容（每个 MI 实例是独立 ACT_RU_TASK 行，assignee 各自不同）
  - 或签完成后其余任务引擎自动删除，无残留
  - Spike-1/2 已验证通过
- **缺点**：
  - 需改设计器的 BPMN XML 生成逻辑（部署时翻译 multiMode → MI XML）
  - `wf_node_config` 的 multiMode 与 BPMN XML 必须一致（部署是冻结点）
- **为何采用**：spike 验证通过，原生路线最稳定，状态机不自己维护

### 方案 B：自定义 TaskListener 路线（会签或签）

- **做法**：BPMN 保持单实例任务，运行时 TaskListener 读 `wf_node_config.multiMode`，手动创建 N 个子任务，跟踪完成计数
- **优点**：与现有 `wf_node_config` 配置耦合自然，不改设计器 XML 生成
- **缺点**：
  - 重造轮子，状态机自己维护（完成计数、或签取消其余），易错
  - 任务查询要自己拆/合，与 Flowable 原生查询不兼容
  - MI 驳回场景更复杂
- **为何未采用**：spike 确认 MI 原生路线可行，自定义路线工作量大且风险高

### 方案 C：终止 + 重启路线（驳回 fallback）

- **做法**：驳回时记住当前变量，删除流程实例，从发起人节点重新启动
- **优点**：不依赖 `changeActivityState`，任何版本 Flowable 都能用
- **缺点**：
  - 丢失运行时执行树（历史链路断裂）
  - 变量需手动保存/恢复，容易丢
  - 重新启动后流程版本可能变化
- **为何未采用**：spike-3/4 验证 `changeActivityState` 对单实例和 MI 节点均生效，无需 fallback

## Agreed Approach

采用 **方案 A（BPMN MI 原生）** + **changeActivityState 驳回**，具体路线：

| 能力 | 路线 | 依据 |
|---|---|---|
| 会签/或签 | BPMN MI 原生 | Spike-1/2 通过 |
| 单实例驳回 | `moveActivityIdTo` | Spike-3 通过 |
| MI 节点驳回 | `moveActivityIdTo` 整体回退 | Spike-4 通过 |

## Key Decisions

| # | 决策点 | 选择 | 理由 |
|---|---|---|---|
| 1 | 会签或签驱动方式 | BPMN MI 原生 | spike 验证通过，Flowable 自动管理状态 |
| 2 | 驳回路线 | changeActivityState | spike 验证通过，变量保留、历史可追溯 |
| 3 | 转办实现 | `setAssignee` + `wf_task_transfer` 审计表 | 任务状态清晰，审计可查，区别于 delegate |
| 4 | 流程变量级别 | 实例级 | PRD 无分支局部变量需求，业务系统对接需全局可见 |
| 5 | 流程图高亮格式 | 格式 A（数据 + bpmn-js 渲染） | 前端已用 bpmn-js，可交互，后端不掺视图 |
| 6 | complete 返回值 | 扩展返回 nodeCompleted/remaining/processAdvanced | 会签体验要求即时反馈，避免前端多一次请求 |
| 7 | MI 节点驳回语义 | 整体回退（所有人重审） | spike-4 验证 `moveActivityIdTo` 对 MI 生效 |
| 8 | 驳回后高亮 | 简单，endTime 即 COMPLETED | 不区分 REJECTED，`deleteReason` 行为本期不深究 |
| 9 | 发起人节点识别 | start 后第一个 userTask | 不改前端，自动识别覆盖 90% 场景 |
| 10 | 催办/超时/加签/转签/去重 | 不在本期 | 核心先行，下期 change |

## Open Questions

### BPMN XML 翻译在哪一层实现？

两个候选，等实现时定：
- **候选 1**：前端设计器部署时翻译（后端零改动，前端写 bpmn-js moddle 逻辑）
- **候选 2**：后端部署时翻译（前端零改动，后端用 BpmnXMLConverter 改写）

倾向候选 2——逻辑集中在后端，前端不碰 BPMN XML 操作。但实现时若 MI 语法复杂需服务端构造，候选 1 更自然。

### complete 返回值扩展的 DTO 结构

需在实现时设计：
```
CompleteTaskResponse {
  nodeCompleted: boolean    // 当前节点是否全部完成
  remaining: int            // 剩余未完成数（会签场景）
  processAdvanced: boolean  // 流程是否已前进到下一节点
}
```

单实例任务时 `nodeCompleted=true, remaining=0, processAdvanced=true`；会签部分完成时 `nodeCompleted=false, remaining=N, processAdvanced=false`。
