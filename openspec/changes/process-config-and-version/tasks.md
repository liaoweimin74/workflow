# Tasks: process-config-and-version

## 1. 后端：部署变化检测（deploy-change-detection）

- [ ] 1.1 `ProcessDraft` 实体新增 `deployedConfigHash` 字段（VARCHAR(64)），含 getter/setter
- [ ] 1.2 新增 Flyway 迁移脚本：`wf_process_draft` 表加 `deployed_config_hash VARCHAR(64) NULL` 列
- [ ] 1.3 `ProcessDesignService.deploy()` 实现 hash 计算：nodeConfigMap 按 nodeId 排序（TreeMap）+ ObjectMapper 规范化序列化，与 effectiveBpmnXml 拼接后 SHA-256
- [ ] 1.4 `deploy()` 变化判定逻辑改造：hash 非空时比较 hash（相同拒绝 400），hash 为空时降级比较 deployedXml（保持旧行为）
- [ ] 1.5 部署成功后写入 `deployedConfigHash` 并保存
- [ ] 1.6 单元测试 `ProcessDesignServiceDeployTest`：仅节点配置变化可部署、仅 `__PROCESS__` 变化可部署、内容无变化拦截、历史数据降级路径

## 2. 后端：操作权限解析改造（process-operation-policy + task-detail）

- [ ] 2.1 `OperationsConfig` DTO 移除 `allowForwardSign` 字段
- [ ] 2.2 `extractOperations` 增加流程级叠加解析：按 processDefinitionId 读取 `__PROCESS__` 配置的 operations，与节点级 AND 合并；流程级未配置视为全开
- [ ] 2.3 单测：`extractOperations` 流程级/节点级 AND 叠加（流程级关、节点级关、节点级默认值、无 allowForwardSign）

## 3. 后端：转办权限校验与多实例语义锁定（task-transfer）

- [ ] 3.1 `TaskController.transfer` 增加服务层权限校验：`extractOperations`（流程级 AND 节点级）`allowTransfer = false` 时返回 400，任务不变
- [ ] 3.2 单元测试锁定 `TransferService` 多实例语义：MI 节点任务 setAssignee 后原办理人待办消失、目标用户待办出现、其他实例不受影响、审计 action=transfer
- [ ] 3.3 单测：权限校验（节点禁止转办返回 400；流程级禁止转办返回 400；校验失败时 assignee 不变）

## 4. 前端：配置层级与操作菜单（process-operation-policy + bpmn-designer + task-detail）

- [ ] 4.1 `designerStore.ts`：`ProcessConfigData` 新增 `approvalPolicy.operations`（4 开关），移除 `allowAddSigner`/`allowDelegate`；`DEFAULT_PROCESS_CONFIG` 同步
- [ ] 4.2 `api/task.ts` 与前端类型：`OperationsConfig` 移除 `allowForwardSign`
- [ ] 4.3 `ProcessProperty.vue`：废弃两开关替换为"节点操作权限"分区（允许驳回/加签/转办/委派 4 开关，绑定 approvalPolicy.operations）
- [ ] 4.4 `UserTaskProperty.vue`：操作分区移除"允许转签"项，保留 4 项
- [ ] 4.5 `TaskDetailPage.vue`：更多操作菜单移除"转签"入口；按钮显隐逻辑按新 operations（无 allowForwardSign）

## 5. 后端：历史版本接口（process-version-history）

- [ ] 5.1 新增 `GET /api/v1/deployed-processes/{key}/versions`：按租户查 Flowable 全版本（含非 latest），按版本号倒序，响应含 procDefId/version/name/deploymentTime/isLatest
- [ ] 5.2 新增 `GET /api/v1/deployed-processes/versions/{procDefId}/editor`：bpmnXml 从 `repositoryService.getProcessModel` 读取（try-catch 返回 404），nodeConfigs 从 wf_node_config 按 processDefId+processDefinitionId 精确查快照（含 `__PROCESS__`），复用 EditorDTO 形状
- [ ] 5.3 单测：版本列表（多版本、isLatest 标记、租户隔离、key 不存在返回空数组）
- [ ] 5.4 单测：版本 editor（快照读取正确、XML 读取失败返回 404）

## 6. 前端：历史版本查看（process-version-history）

- [ ] 6.1 `api/processDefinition.ts`：封装 `getVersions(key)` 与 `getVersionEditor(procDefId)` 接口
- [ ] 6.2 `ProcessListPage.vue`：操作列加"版本历史"按钮，打开版本列表抽屉（版本号/部署时间/最新标记），点版本跳转只读设计器
- [ ] 6.3 `ProcessDesigner.vue` 增加 `readOnly` 模式：bpmn-js 仅渲染（禁用编辑/拖拽/删除），工具栏隐藏保存/部署/导入，显示返回按钮
- [ ] 6.4 只读属性面板：选中节点时以只读形式展示基本信息 + 配置 JSON（本次覆盖范围，完整只读表单后续迭代）
- [ ] 6.5 路由：只读设计器路由（如 `/workflow/designer/:procDefId?readonly=1`）接入流程列表跳转
