## Context

工作流平台已实现流程设计器（BPMN + 节点属性配置）、表单设计器、流程引擎核心能力。当前状态：

- **数据模型层已具备**：`NodeConfig` 表存储节点配置（`config_json` 含 `form`/`operations`/`approval` 等），`__PROCESS__` 特殊节点存储流程级配置（`approvalPolicy`/`form`）。
- **表单选择已实现**：`WorkflowTaskService.extractFormKey()` 实现"节点表单优先、流程默认表单兜底"的 formDefId 解析。
- **设计器配置已实现**：`FormPropertyTab.vue` 支持字段权限配置（EDIT/VIEW/HIDDEN），`UserTaskProperty.vue` 支持 operations 配置。
- **运行时未应用**：`TaskDetailVO` 不含 `fieldPermissions`/`operations`；`FormRenderer` 不接收字段权限；`TaskDetailPage` 按钮硬编码，完全忽略配置。

约束：
- 后端 Spring Boot + Flowable，前端 Vue 3 + Element Plus + form-create
- 表单引擎使用 form-create，字段权限需通过 form-create 的 rule 机制控制
- 现有 `extractFormKey` 逻辑需保持向后兼容

## Goals / Non-Goals

**Goals:**

1. **表单生成与显示**：运行时根据流程/节点表单配置渲染表单，并应用字段级权限（EDIT/VIEW/HIDDEN）。
2. **按钮显示**：任务处理页根据节点 operations 配置动态显示操作按钮（驳回/加签/转办/委派/转签）。
3. **配置模型清理**：扩展节点级 operations 操作集，清理流程级 approvalPolicy 中与节点级重叠的配置。

**Non-Goals:**

- 不做后端 API 层面的操作权限校验（前端控制显示，后端校验后续做）
- 不做双重控制（流程级 AND 节点级取交集）
- 不做字段权限的动态变更（权限在设计器配好后静态使用）
- 不做"创建时填写 vs 审批时查看"白名单模式（已被字段级权限取代）
- 不做流程级 approvalPolicy 接入按钮显示（除撤回外，后续再做）

## Decisions

### D1: 表单与字段权限作为整体从同一层取

**决策**：表单选择和字段权限不独立解析，而是作为整体从同一配置层取。

**逻辑**：
```
节点配了 formDefId → 用节点的 formDefId + 节点的 fieldPermissions
节点没配 → 用流程默认的 formDefId + 流程默认的 fieldPermissions
都没配 → 无表单
该层没配 fieldPermissions → 所有字段默认 EDIT
```

**理由**：避免跨层合并的复杂度。如果节点和流程用不同表单，合并字段权限无意义；如果用同一表单，节点配置应该完整覆盖该节点的权限需求。

**实现**：重构 `extractFormKey` 为 `extractFormConfig`，同时返回 `formDefId` 和 `fieldPermissions`。

### D2: 字段权限通过 form-create rule 机制控制

**决策**：FormRenderer 接收 `fieldPermissions` prop，在渲染前遍历 form-create rule，按权限设置：
- EDIT → 不修改（默认可编辑）
- VIEW → 设置 `rule.props.disabled = true`（只读）
- HIDDEN → 从 rule 数组中移除该字段（不渲染）

**理由**：form-create 的 `rule.props.disabled` 是已有的只读控制方式（前序 commit 已验证）。HIDDEN 移除 rule 比 CSS 隐藏更彻底，避免值被提交。

### D3: 节点级 operations 扩展为完整操作集

**决策**：`NodeConfigData.operations` 从 `{allowReject, allowAddSign, allowTransfer}` 扩展为 `{allowReject, allowAddSign, allowTransfer, allowDelegate, allowForwardSign}`。

**默认值**：
- `allowReject: true`（默认允许驳回）
- `allowTransfer: true`（默认允许转办）
- `allowAddSign: false`（默认不允许加签）
- `allowDelegate: false`（默认不允许委派）
- `allowForwardSign: false`（默认不允许转签）

**理由**：加签/委派/转签是较重操作，默认关闭更安全。驳回/转办是基础审批操作，默认开启。

### D4: TaskDetailVO 扩展 fieldPermissions 和 operations

**决策**：`TaskDetailVO` 新增两个字段：
```java
private Map<String, String> fieldPermissions;  // field -> "EDIT"|"VIEW"|"HIDDEN"
private OperationsConfig operations;            // 操作权限
```

`OperationsConfig` 结构：
```java
public class OperationsConfig {
    private boolean allowReject;
    private boolean allowAddSign;
    private boolean allowTransfer;
    private boolean allowDelegate;
    private boolean allowForwardSign;
}
```

### D5: 发起页接口同步返回 fieldPermissions

**决策**：发起页 `GET /api/v1/process-definitions/{id}`（DeployedProcessDefinition）响应中已有 `formDefId`，新增 `fieldPermissions`。

**来源**：从发起人节点（第一个 userTask）的 NodeConfig 解析。如果发起人节点没配表单，用流程默认表单的 fieldPermissions。

### D6: 按钮显示规则

**决策**：`TaskDetailPage` 按钮显示逻辑：
- "通过" — 始终显示
- "驳回" — `operations.allowReject == true` 时显示
- "转办" — `operations.allowTransfer == true` 时显示
- "委派" — `operations.allowDelegate == true` 时显示
- "加签" — `operations.allowAddSign == true` 时显示
- "转签" — `operations.allowForwardSign == true` 时显示

当所有非"通过"操作都不可用时，不显示"更多操作"下拉。

### D7: 流程级 approvalPolicy 清理

**决策**：`ProcessConfigData.approvalPolicy` 保留 `allowRecall`，移除 `allowAddSigner` 和 `allowDelegate`（这两个已由节点级 operations 覆盖）。

**迁移**：已有数据中 `allowAddSigner`/`allowDelegate` 值不主动删除，但前端不再读取。

## Risks / Trade-offs

- **[字段权限不合并可能不满足复杂场景]** → 第一期接受此限制；后续如需合并可在 `extractFormConfig` 中增加合并逻辑。
- **[前端控制按钮显示，后端不校验]** → 存在绕过前端直接调 API 的风险。→ 后续在后端 API 层补充操作权限校验。
- **[HIDDEN 字段值不提交可能丢失数据]** → 发起时填写的字段在审批节点被 HIDDEN，该字段值仍在流程变量中，只是不显示。→ 可接受，字段值已持久化在 form_data 和流程变量中。
- **[form-create rule 修改时机]** → 需在 form-create 初始化前修改 rule，初始化后动态修改可能不生效（前序 commit 已踩坑）。→ 在 FormRenderer 初始化表单前一次性应用权限。
- **[已有流程配置的兼容性]** → 扩展 operations 后，旧配置缺少新字段（allowDelegate/allowForwardSign）。→ 解析时使用默认值兜底。
