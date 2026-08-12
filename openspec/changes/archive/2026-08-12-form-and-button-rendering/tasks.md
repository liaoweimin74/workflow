## 1. 后端：表单配置解析

- [ ] 1.1 创建 `FormConfigResult` DTO（含 `formDefId` 和 `fieldPermissions` 字段）
- [ ] 1.2 在 `WorkflowTaskService` 中新增 `extractFormConfig(processDefId, taskDefKey)` 方法，重构现有 `extractFormKey` 为其内部调用
- [ ] 1.3 `extractFormConfig` 逻辑：节点优先取 form + fieldPermissions，节点没配取流程级，都不配返回 null

## 2. 后端：操作权限解析

- [ ] 2.1 创建 `OperationsConfig` DTO（含 allowReject/allowAddSign/allowTransfer/allowDelegate/allowForwardSign 五个 boolean 字段）
- [ ] 2.2 在 `WorkflowTaskService` 中新增 `extractOperations(processDefId, taskDefKey)` 方法，从 NodeConfig 解析 operations，缺失字段用默认值补全
- [ ] 2.3 默认值：allowReject=true, allowTransfer=true, allowAddSign=false, allowDelegate=false, allowForwardSign=false

## 3. 后端：TaskDetailVO 扩展

- [ ] 3.1 `TaskDetailVO` 新增 `fieldPermissions`（Map<String,String>）和 `operations`（OperationsConfig）字段
- [ ] 3.2 `WorkflowTaskService.getTaskDetail()` 中调用 `extractFormConfig` 填充 fieldPermissions，调用 `extractOperations` 填充 operations

## 4. 后端：发起页接口扩展

- [ ] 4.1 `DeployedProcessDefinition` DTO（或对应 VO）新增 `fieldPermissions` 字段
- [ ] 4.2 发起页加载流程定义接口中，调用 `extractFormConfig` 解析发起人节点的表单配置（第一个 userTask），填充 formDefId 和 fieldPermissions

## 5. 后端：单元测试

- [ ] 5.1 测试 `extractFormConfig`：节点配置表单、节点未配流程有默认、都未配三种场景
- [ ] 5.2 测试 `extractOperations`：节点配置完整、节点部分配置（缺字段用默认值补全）、节点未配置（全默认值）三种场景
- [ ] 5.3 测试 TaskDetailVO 包含 fieldPermissions 和 operations 字段

## 6. 前端：FormRenderer 字段权限

- [ ] 6.1 `FormRenderer.vue` 新增 `fieldPermissions` prop（类型 `Record<string, 'EDIT'|'VIEW'|'HIDDEN'>`）
- [ ] 6.2 在 form-create 初始化前，遍历 rule 数组应用权限：VIEW → rule.props.disabled=true，HIDDEN → 从数组移除
- [ ] 6.3 确保权限在 form-create 实例创建前一次性应用（初始化后不可动态修改）
- [ ] 6.4 fieldPermissions 为空或未传入时，所有字段默认可编辑

## 7. 前端：TaskDetailPage 按钮动态渲染

- [ ] 7.1 `task.ts` 中 TaskDetailVO TS 类型新增 `fieldPermissions` 和 `operations` 字段
- [ ] 7.2 定义 `OperationsConfig` TS 接口（allowReject/allowAddSign/allowTransfer/allowDelegate/allowForwardSign）
- [ ] 7.3 `TaskDetailPage.vue` 将 `taskDetail.fieldPermissions` 传给 FormRenderer
- [ ] 7.4 `TaskDetailPage.vue` 按钮区改为根据 `operations` 动态渲染：驳回按 allowReject，更多操作下拉按 allowTransfer/allowDelegate/allowAddSign/allowForwardSign
- [ ] 7.5 所有更多操作均不可用时不显示下拉按钮
- [ ] 7.6 "通过"按钮始终显示

## 8. 前端：发起页字段权限

- [ ] 8.1 `processDefinition.ts` 中 DeployedProcessDefinition TS 类型新增 `fieldPermissions` 字段
- [ ] 8.2 `ProcessStartPage.vue` 将 `fieldPermissions` 传给 FormRenderer

## 9. 前端：设计器操作配置扩展

- [ ] 9.1 `designerStore.ts` 中 `NodeConfigData.operations` 类型新增 `allowDelegate` 和 `allowForwardSign` 字段
- [ ] 9.2 `UserTaskProperty.vue` 操作 Tab 补全"允许委派"和"允许转签"开关
- [ ] 9.3 流程级 `ProcessConfigData.approvalPolicy` 中 `allowAddSigner` 和 `allowDelegate` 标注弃用注释

## 10. 前端：集成验证

- [ ] 10.1 验证发起页：配置字段权限后发起流程，表单按权限渲染
- [ ] 10.2 验证审批页：配置字段权限后任务详情页表单按权限渲染
- [ ] 10.3 验证按钮显示：配置 operations 后任务详情页按钮按配置显示/隐藏
- [ ] 10.4 验证旧配置兼容：已有流程节点缺少 allowDelegate/allowForwardSign 时不报错，按钮按默认值显示
