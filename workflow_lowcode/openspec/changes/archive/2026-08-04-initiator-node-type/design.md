## Context

当前项目的流程设计器中，所有 UserTask 共用同一套属性面板（`UserTaskProperty.vue`），设计者可以给任何 UserTask 配置审批类型（指定用户/部门负责人/发起人自选/表达式）、候选用户、会签/或签、操作权限和超时。

但这套模型对"发起人节点"不成立——发起人是运行时确定的唯一身份（谁调 start API 谁就是发起人），不是候选出来的。当前存在三个问题：

1. **后端未注入 `initiator` 变量**：`ProcessInstanceController.start` 只传前端 variables，没有自动注入当前用户 ID
2. **前端 `initiator_self` 选项语义混乱**：把"发起人"当成设计时可配置的审批人类型
3. **`InitiatorNodeResolver` 盲取第一个 UserTask**：不检查该节点是否真是发起人节点

bpmn.js modeler 当前没有注册任何 moddle 扩展定义（`bpmnModeler.ts` 只引入了 minimap、disablePalette、customContextPad 三个 additionalModule）。节点面板（`NodePalette.vue`）通过 drag-and-drop 传递 `node-type` 字符串，`ProcessDesigner.vue:handleDrop` 用 `elementFactory.createShape({ type: nodeType })` 创建元素。

## Goals / Non-Goals

**Goals:**

1. 引入"发起人节点"作为 UserTask 的特化类型，通过 `wf:nodeRole="initiator"` 扩展属性标记
2. 节点面板新增"发起人节点"入口，拖入时自动设 `assignee=${initiator}` + `wf:nodeRole="initiator"`
3. 选中发起人节点时，属性面板只显示节点名称 + 表单关联，隐藏审批人/候选/会签/操作权限/超时
4. 后端 `ProcessInstanceController.start` 自动注入 `initiator` 变量（当前登录用户 ID）
5. `InitiatorNodeResolver` 改为优先查找 `nodeRole=initiator` 的节点，找不到回退到第一个 UserTask
6. 移除 `initiator_self` 审批类型选项
7. 发起人节点在流程图上有视觉区分（自定义 renderer）

**Non-Goals:**

- 不修改 StartEvent 的行为或属性面板
- 不修改流程发起的前端 UI（"发起流程"页面）
- 不修改 Flowable 引擎核心行为
- 不修改已部署流程的运行时行为（仅影响设计时和新发起的流程）
- 不实现"发起人节点"的特殊驳回逻辑（驳回仍由 `InitiatorNodeResolver` + `RejectService` 处理）

## Decisions

### D1: moddle 扩展定义

注册自定义命名空间 `wf` 和 `nodeRole` 属性：

```json
{
  "name": "Workflow",
  "uri": "http://workflow.com/schema/bpmn/wf",
  "prefix": "wf",
  "xml": { "tagAlias": "lowerCase" },
  "associations": [],
  "types": [
    {
      "name": "InitiatorNodeAttributed",
      "extends": ["bpmn:UserTask"],
      "properties": [
        {
          "name": "nodeRole",
          "isAttr": true,
          "type": "String"
        }
      ]
    }
  ]
}
```

文件放在 `frontend/src/views/designer/utils/wf-moddle.json`，在 `bpmnModeler.ts` 的 `additionalModules` 里通过 `moddleExtensions: { wf: wfModdle }` 注册。

### D2: 节点面板入口

`NodePalette.vue` 的"活动"分组新增一项：

```ts
{ type: 'bpmn:UserTask', label: '发起人节点', description: '发起人填报节点', iconClass: 'bpmn-icon-user-task' }
```

`type` 仍为 `bpmn:UserTask`（BPMN 层面就是 UserTask），但通过额外的 `nodeRole` 元数据区分。`PaletteNode` 接口新增可选字段 `nodeRole?: string`，`handleDragStart` 传递 `node-role` 数据。

### D3: handleDrop 创建逻辑

`ProcessDesigner.vue:handleDrop` 读取 `node-role` data。如果 `nodeRole === 'initiator'`：
- `elementFactory.createShape({ type: 'bpmn:UserTask' })`
- 创建后通过 `modeling.updateProperties` 设置 `assignee: '${initiator}'` 和 `wf:nodeRole: 'initiator'`

### D4: 属性面板路由

`PropertyPanel.vue` 在渲染 `UserTaskProperty` 之前检查 `wf:nodeRole`：
- `nodeRole === 'initiator'` → 渲染新的 `InitiatorTaskProperty` 组件（精简面板）
- 否则 → 渲染现有 `UserTaskProperty`（完整面板）

### D5: InitiatorTaskProperty 组件

只显示：
- 节点 ID（只读）
- 节点名称（可编辑）
- 节点描述（可编辑）
- 表单关联（`FormPropertyTab`）

不显示：审批人配置、候选用户、会签/或签、操作权限、超时设置。

### D6: 后端注入 initiator

`ProcessInstanceController.start` 从 `SecurityContextHolder` 取 `LoginUser.userId`，转为字符串放入 `variables.put("initiator", userId.toString())`。

如果前端已经传了 `initiator` 变量，后端覆盖（后端为准）。

### D7: InitiatorNodeResolver 精确匹配

`resolve` 方法改为：
1. 遍历所有 UserTask，检查 `wf:nodeRole` 扩展属性
2. 找到 `nodeRole=initiator` 的节点 → 返回其 ID
3. 找不到 → 回退到现有逻辑（第一个 UserTask），兼容旧流程

读取扩展属性用 Flowable 的 `BpmnModel` API：`userTask.getAttributes().get("nodeRole")`（Flowable 把未知命名空间属性放在 `attributes` map 里）。

### D8: 移除 initiator_self

`UserTaskProperty.vue` 审批类型选项移除 `initiator_self`。`designerStore.ts` 的 `NodeConfigData.approval.type` 类型定义移除 `'initiator_self'`。

### D9: 自定义 renderer

在 `bpmnModeler.ts` 注册 custom renderer module，对 `wf:nodeRole=initiator` 的 UserTask 使用不同填充色（如浅蓝 `#e3f2fd`）+ 左上角小图标标记。renderer 检查 `element.businessObject.get('wf:nodeRole')`。

## Risks / Trade-offs

### 旧流程兼容

已部署的流程没有 `wf:nodeRole` 属性。`InitiatorNodeResolver` 的回退逻辑（第一个 UserTask）确保旧流程仍能工作。但旧流程如果第一个 UserTask 不是真正的发起人节点，驳回行为不变（本来就可能不正确）。

### moddle 扩展的 XML 序列化

`wf:nodeRole` 会出现在导出的 BPMN XML 中。如果用户把 XML 导入到不支持 `wf:` 命名空间的工具，属性会被忽略但不报错（BPMN 2.0 规范允许未知扩展属性）。

### 前端变量名冲突

如果流程设计者在表达式中用了 `${initiator}` 但后端没注入（比如旧版后端），表达式会解析为 null。D6 修复后不再有此问题，但需要确保所有 start 路径都注入。
