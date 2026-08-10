## Design Summary

本期实现两个目标：

1. **表单生成与显示**：每个节点根据流程表单配置和节点表单配置生成和显示表单，并应用字段级权限（EDIT/VIEW/HIDDEN）。
2. **按钮显示**：每个节点根据节点配置中的 operations 属性和流程配置中的 approvalPolicy 动态显示相关操作按钮。

### 现状

- 后端 `WorkflowTaskService.extractFormKey()` 已实现"节点表单优先、流程默认表单兜底"的 formDefId 解析。
- 设计器已支持节点级 `form.fieldPermissions` 和 `operations` 配置，流程级 `__PROCESS__` 节点有 `approvalPolicy` 配置。
- 但运行时未应用：`TaskDetailVO` 不含 `fieldPermissions` / `operations`；`FormRenderer` 不接收字段权限；`TaskDetailPage` 按钮硬编码。

## Alternatives Considered

### 方案 A：双重控制（流程级 AND 节点级）

- **做法**：流程级和节点级都配置全部操作类型，按钮显示 = 流程级允许 AND 节点级允许。
- **优点**：全局兜底能力强，流程设计者可一句话关闭整个流程的某类操作；节点级做细粒度覆盖。
- **缺点**：配置复杂度上升，用户需理解"两层取交集"；排查"按钮为何不显示"需同时检查两层；默认值语义陷阱；UI 重复。
- **为何未采用**：第一期复杂度过高，职责分层对简单流程过度设计。

### 方案 B：只做节点级，流程级不动

- **做法**：只把节点级 operations 接到前端按钮显示，流程级 approvalPolicy 完全不接入。
- **优点**：最简单，改动最小。
- **缺点**：撤回等发起人全局行为无处配置；流程级 approvalPolicy 成为死代码。
- **为何未采用**：撤回是发起人行为，不属于具体审批节点，放节点级不合适，需要流程级承载。

### 方案 C：节点级为主，流程级只管全局行为

- **做法**：节点级 operations 控制审批人按钮（驳回/加签/转办/委派/转签），流程级 approvalPolicy 只控制发起人全局行为（撤回）。
- **优点**：职责清晰，无双重控制复杂度；流程级保留对全局行为的控制能力。
- **缺点**：流程级 approvalPolicy 中与节点级重叠的配置（allowAddSigner/allowDelegate）需清理或标注弃用。
- **为何采用**：复杂度适中，职责边界清晰，符合第一期需求。

## Agreed Approach

采用方案 C：**节点级为主，流程级只管全局行为**。

- 节点级 `operations`：完整控制每个审批按钮的显示（allowReject/allowAddSign/allowTransfer/allowDelegate/allowForwardSign）
- 流程级 `approvalPolicy`：只保留 `allowRecall`（撤回），移除与节点级重叠的 `allowAddSigner/allowDelegate`
- 按钮显示规则：节点级 operations 决定显示与否；"通过"按钮始终显示
- 表单配置关系：节点优先，不合并权限——表单和字段权限作为整体从同一层取

## Key Decisions

1. **表单选择优先级**：节点配了 formDefId → 用节点的；节点没配 → 用流程默认的；都没配 → 无表单。（现有逻辑保持不变）

2. **字段权限不合并**：始终取最终选中表单所对应的那一层配置，不跨层合并。选了节点表单用节点配置的 fieldPermissions，用流程默认表单用流程配置的 fieldPermissions，该层没配则所有字段默认 EDIT。

3. **字段权限应用到渲染**：FormRenderer 接收 fieldPermissions prop，EDIT → 正常可编辑，VIEW → 只读（disabled），HIDDEN → 不渲染。

4. **按钮显示策略**：节点级为主，流程级只管全局行为（撤回）。不做双重控制。

5. **操作集扩展**：节点级 operations 从 {allowReject, allowAddSign, allowTransfer} 扩展为 {allowReject, allowAddSign, allowTransfer, allowDelegate, allowForwardSign}。

6. **后端 API 扩展**：TaskDetailVO 新增 fieldPermissions 和 operations 字段；发起页接口同步返回 fieldPermissions。

7. **不做后端权限校验**：本期前端控制显示，后端 API 层面的操作权限校验后续做。

## Open Questions

无。所有关键问题已在 brainstorming 中解决。
