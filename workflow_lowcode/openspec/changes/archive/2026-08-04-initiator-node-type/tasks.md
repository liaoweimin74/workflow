## 1. bpmn.js moddle 扩展定义

- [ ] 1.1 创建 `frontend/src/views/designer/utils/wf-moddle.json`，定义 `wf` 命名空间和 `nodeRole` 扩展属性（extends `bpmn:UserTask`）
- [ ] 1.2 修改 `frontend/src/views/designer/utils/bpmnModeler.ts`，在 modeler 初始化时注册 moddle 扩展（`moddleExtensions: { wf: wfModdle }`）
- [ ] 1.3 验证导出 XML 包含 `xmlns:wf` 命名空间和 `wf:nodeRole` 属性

## 2. 自定义 renderer

- [ ] 2.1 创建 `frontend/src/views/designer/utils/customRenderer.ts`，继承 BaseRenderer，对 `wf:nodeRole=initiator` 的 UserTask 使用浅蓝色填充
- [ ] 2.2 在 `bpmnModeler.ts` 的 additionalModules 中注册 custom renderer module
- [ ] 2.3 验证发起人节点在画布上显示浅蓝色填充

## 3. 节点面板入口

- [ ] 3.1 修改 `NodePalette.vue`：`PaletteNode` 接口新增 `nodeRole?: string` 字段
- [ ] 3.2 在"活动"分组新增"发起人节点"项（`type: 'bpmn:UserTask'`, `nodeRole: 'initiator'`）
- [ ] 3.3 修改 `handleDragStart` 传递 `node-role` data

## 4. handleDrop 创建逻辑

- [ ] 4.1 修改 `ProcessDesigner.vue:handleDrop`，读取 `node-role` data
- [ ] 4.2 当 `nodeRole === 'initiator'` 时，创建 UserTask 后通过 `modeling.updateProperties` 设置 `assignee: '${initiator}'` 和 `wf:nodeRole: 'initiator'`
- [ ] 4.3 验证拖入发起人节点后元素具有正确的 assignee 和 nodeRole 属性

## 5. 属性面板路由

- [ ] 5.1 创建 `frontend/src/views/designer/properties/InitiatorTaskProperty.vue`（精简面板：节点ID、名称、描述、表单关联）
- [ ] 5.2 修改 `PropertyPanel.vue`：选中 UserTask 时检查 `wf:nodeRole`，`initiator` 渲染 `InitiatorTaskProperty`，否则渲染 `UserTaskProperty`

## 6. 移除 initiator_self

- [ ] 6.1 修改 `UserTaskProperty.vue`：审批类型选项移除 `initiator_self`
- [ ] 6.2 修改 `designerStore.ts`：`NodeConfigData.approval.type` 类型定义移除 `'initiator_self'`
- [ ] 6.3 加载已有 `initiator_self` 配置时视为 `type: ''`（兼容处理）

## 7. 后端 initiator 变量注入

- [ ] 7.1 修改 `ProcessInstanceController.java:start`：从 `SecurityContextHolder` 取 `LoginUser.userId`，转为字符串放入 variables
- [ ] 7.2 如果前端已传 `initiator` 变量，后端覆盖（后端为准）
- [ ] 7.3 编写单元测试验证注入逻辑

## 8. InitiatorNodeResolver 精确匹配

- [ ] 8.1 修改 `InitiatorNodeResolver.java:resolve`：遍历 UserTask 检查 `wf:nodeRole` 属性（通过 Flowable `BpmnModel` 的 `getAttributes()` API）
- [ ] 8.2 找到 `nodeRole=initiator` 的节点返回其 ID，找不到回退到第一个 UserTask
- [ ] 8.3 更新单元测试覆盖精确匹配和回退逻辑

## 9. 集成测试

- [ ] 9.1 端到端测试：拖入发起人节点 → 部署流程 → 启动流程 → 验证发起人待办出现 → 完成发起人节点 → 验证流程继续
- [ ] 9.2 驳回测试：从审批节点驳回 → 验证回退到发起人节点（`nodeRole=initiator`）
- [ ] 9.3 旧流程兼容测试：无 `wf:nodeRole` 的流程驳回 → 验证回退到第一个 UserTask
