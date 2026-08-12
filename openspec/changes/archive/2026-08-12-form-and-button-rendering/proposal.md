## Why

工作流平台的设计器已支持节点表单配置（含字段权限）和操作按钮配置（operations），但运行时页面完全没有应用这些配置——表单渲染不应用字段权限，任务处理页按钮硬编码。导致设计器里的配置形同虚设，用户配置了字段只读/隐藏但运行时仍然可编辑，配置了不允许驳回但驳回按钮仍然显示。

## What Changes

1. **表单字段权限应用到运行时**：后端解析节点/流程的 `fieldPermissions` 并返回给前端，FormRenderer 按权限控制字段渲染（EDIT/VIEW/HIDDEN）。
2. **操作按钮动态显示**：后端解析节点 `operations` 配置并返回给前端，TaskDetailPage 按配置动态显示按钮。
3. **表单配置关系明确**：表单和字段权限作为整体从同一层取（节点优先，不合并权限）。
4. **配置模型扩展**：节点级 operations 从 3 个操作扩展为 5 个（新增 allowDelegate/allowForwardSign）。
5. **流程级配置清理**：approvalPolicy 中与节点级重叠的 allowAddSigner/allowDelegate 标注弃用，只保留 allowRecall。

## Capabilities

### Modified Capabilities

- **form-runtime** — 表单运行时渲染新增字段级权限控制（EDIT/VIEW/HIDDEN），后端返回 fieldPermissions。
- **task-detail** — 任务详情页新增 operations 字段，按钮按配置动态显示。
- **process-start** — 发起页接口返回 fieldPermissions，FormRenderer 应用字段权限。
- **task-completion** — 任务完成操作受 operations 配置控制（驳回/加签等按钮的显示）。

### New Capabilities

无。本次变更是对已有能力的运行时落地，不引入新能力。

## Impact

**后端：**
- `WorkflowTaskService` — 新增 `extractFormConfig()`（替代 `extractFormKey`），新增 `extractOperations()`
- `TaskDetailVO` — 新增 `fieldPermissions` 和 `operations` 字段
- `DeployedProcessDefinition` 相关 DTO — 新增 `fieldPermissions`
- `ProcessConfigResolver` — 扩展解析逻辑

**前端：**
- `FormRenderer.vue` — 接收 `fieldPermissions` prop，初始化前应用权限到 form-create rule
- `TaskDetailPage.vue` — 按钮区改为根据 `operations` 动态渲染
- `ProcessStartPage.vue` — 传递 `fieldPermissions` 给 FormRenderer
- `UserTaskProperty.vue` — operations Tab 补全 allowDelegate/allowForwardSign
- `designerStore.ts` — `NodeConfigData.operations` 类型扩展
- `task.ts` — TaskDetailVO TS 类型同步扩展
- `processDefinition.ts` — DeployedProcessDefinition TS 类型扩展

**数据库：** 无 schema 变更。NodeConfig.config_json 的 JSON 结构扩展，旧数据兼容（缺失字段用默认值）。

**API：** `GET /api/v1/tasks/{taskId}/detail` 和 `GET /api/v1/process-definitions/{id}` 响应体新增字段，向后兼容。
