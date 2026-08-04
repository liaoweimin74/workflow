# 发起人节点类型 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** 引入发起人节点类型，从设计时约束配置项，并补齐后端 initiator 变量注入。

**Architecture:** 前端通过 bpmn.js moddle 扩展注册 `wf:nodeRole` 属性，节点面板新增发起人节点入口，属性面板按 nodeRole 切换精简/完整配置。后端启动流程时自动注入 initiator 变量，InitiatorNodeResolver 精确匹配 nodeRole=initiator 节点。

**Tech Stack:** Vue 3 + bpmn.js (moddle + custom renderer) + Flowable Engine + Spring Security

---

## Task 1: moddle 扩展定义

- [ ] **Step 1:** 创建 `frontend/src/views/designer/utils/wf-moddle.json`
  - name: "Workflow", uri: "http://workflow.com/schema/bpmn/wf", prefix: "wf"
  - 定义 InitiatorNodeAttributed type extends bpmn:UserTask，添加 nodeRole 属性 (isAttr: true, type: String)
- [ ] **Step 2:** 修改 `bpmnModeler.ts`，import wf-moddle.json，在 BpmnModeler 构造参数中添加 `moddleExtensions: { wf: wfModdle }`
- [ ] **Step 3:** 启动设计器，从 XML 导入/导出验证 `wf:nodeRole` 属性持久化
- [ ] **Step 4:** 验证 `vue-tsc --noEmit` 无新增类型错误

## Task 2: 自定义 renderer

- [ ] **Step 1:** 创建 `frontend/src/views/designer/utils/customRenderer.ts`
  - 继承 `BaseRenderer`（从 `bpmn-js/lib/draw/BaseRenderer`）
  - 重写 `canRender(element)` — 检查 `element.businessObject.get('wf:nodeRole') === 'initiator'`
  - 重写 `drawShape(parent, shape)` — 调用默认渲染后追加浅蓝色填充 rect
  - `this.style(self)` — 设置优先级
- [ ] **Step 2:** 在 `bpmnModeler.ts` additionalModules 中注册 custom renderer module
- [ ] **Step 3:** 拖入发起人节点，验证画布上显示浅蓝色（`#e3f2fd`）填充
- [ ] **Step 4:** 验证普通 UserTask 保持默认渲染

## Task 3: 节点面板入口

- [ ] **Step 1:** 修改 `NodePalette.vue`：`PaletteNode` 接口新增 `nodeRole?: string`
- [ ] **Step 2:** 在 nodeGroups "活动" 分组中新增项：`{ type: 'bpmn:UserTask', label: '发起人节点', description: '发起人填报节点', iconClass: 'bpmn-icon-user-task', nodeRole: 'initiator' }`
- [ ] **Step 3:** 修改 `handleDragStart`：`event.dataTransfer.setData('node-role', node.nodeRole || '')`
- [ ] **Step 4:** 验证节点面板出现"发起人节点"入口，可拖拽

## Task 4: handleDrop 创建逻辑

- [ ] **Step 1:** 修改 `ProcessDesigner.vue:handleDrop`：读取 `const nodeRole = event.dataTransfer?.getData('node-role')`
- [ ] **Step 2:** `modeling.createShape` 后，如果 `nodeRole === 'initiator'`，调用 `modeling.updateProperties(shape, { 'flowable:assignee': '${initiator}', 'wf:nodeRole': 'initiator' })`
- [ ] **Step 3:** 验证拖入发起人节点后，元素 businessObject 具有 assignee 和 nodeRole 属性
- [ ] **Step 4:** 验证导出 XML 中该节点包含 `flowable:assignee="${initiator}"` 和 `wf:nodeRole="initiator"`

## Task 5: InitiatorTaskProperty 组件

- [ ] **Step 1:** 创建 `frontend/src/views/designer/properties/InitiatorTaskProperty.vue`
  - 参照 `EventProperty.vue` 结构（节点 ID 只读 + 名称 + 描述 + FormPropertyTab）
  - 不包含审批人配置、候选用户、会签/或签、操作权限、超时
- [ ] **Step 2:** 修改 `PropertyPanel.vue`：UserTask 分支前检查 `wf:nodeRole`
  - 获取选中元素的 businessObject，读取 `bo.get('wf:nodeRole')`
  - 如果 `=== 'initiator'`，渲染 `<initiator-task-property>`
  - 否则渲染 `<user-task-property>`
- [ ] **Step 3:** 选中发起人节点时验证显示精简面板
- [ ] **Step 4:** 选中普通 UserTask 时验证显示完整面板

## Task 6: 移除 initiator_self

- [ ] **Step 1:** 修改 `UserTaskProperty.vue`：radio 选项移除 `{ value: 'initiator_self', label: '发起人自选' }`
- [ ] **Step 2:** 修改 `UserTaskProperty.vue`：approval.type 类型定义移除 `'initiator_self'`
- [ ] **Step 3:** 修改 `designerStore.ts`：`NodeConfigData.approval.type` 联合类型移除 `'initiator_self'`
- [ ] **Step 4:** `loadConfig` 中如果读到 `type === 'initiator_self'`，设为 `type: ''`（兼容）
- [ ] **Step 5:** 验证 `vue-tsc --noEmit` 无新增类型错误

## Task 7: 后端 initiator 变量注入

- [ ] **Step 1:** 修改 `ProcessInstanceController.java:start` 方法
  - 从 `SecurityContextHolder.getContext().getAuthentication().getPrincipal()` 取 `LoginUser`
  - `variables.put("initiator", String.valueOf(loginUser.getUserId()))`
  - 放在 `processInstanceService.startProcess` 调用之前
- [ ] **Step 2:** 编写单元测试 `ProcessInstanceControllerTest`
  - mock SecurityContext，验证 variables 包含 initiator
  - 验证前端传入的 initiator 被覆盖
- [ ] **Step 3:** 运行 `mvn test` 验证通过

## Task 8: InitiatorNodeResolver 精确匹配

- [ ] **Step 1:** 修改 `InitiatorNodeResolver.java:resolve`
  - 遍历所有 UserTask，通过 `userTask.getAttributes().get("nodeRole")` 读取扩展属性
  - 注意 Flowable 把未知命名空间属性放在 `attributes` map 中，key 可能是 `wf:nodeRole` 或 `nodeRole`，需要测试确认
  - 找到 `nodeRole=initiator` 返回其 ID
  - 找不到回退到现有逻辑（第一个 UserTask）
- [ ] **Step 2:** 更新 `InitiatorNodeResolverTest`
  - 测试用例 1：BPMN 含 `wf:nodeRole=initiator` → 返回该节点
  - 测试用例 2：BPMN 不含 nodeRole → 回退第一个 UserTask
  - 测试用例 3：多个 nodeRole=initiator → 返回第一个匹配
- [ ] **Step 3:** 运行 `mvn test` 验证通过

## Task 9: 集成验证

- [ ] **Step 1:** 前端构建 `npm run build` 无错误
- [ ] **Step 2:** 后端构建 `mvn compile` 无错误
- [ ] **Step 3:** 后端全量测试 `mvn test` 通过
- [ ] **Step 4:** 手动验证：拖入发起人节点 → 配置表单 → 部署 → 启动流程 → 验证发起人待办 → 完成 → 验证流程继续
- [ ] **Step 5:** 手动验证：驳回 → 验证回退到发起人节点
