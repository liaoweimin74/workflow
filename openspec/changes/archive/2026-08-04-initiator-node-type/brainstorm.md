## Design Summary

引入"发起人节点"作为 UserTask 的特化类型，通过 BPMN 扩展属性 `wf:nodeRole="initiator"` 标记。设计器节点面板提供独立入口，选中时属性面板只显示节点名称 + 表单关联，隐藏审批人/候选/会签/操作权限/超时等不适用的配置项。后端流程启动时自动注入 `initiator` 变量（当前登录用户 ID），assignee 绑定 `${initiator}`。`InitiatorNodeResolver` 改为优先查找 `nodeRole=initiator` 的节点。

### 核心问题

1. **StartEvent 不能配审批人**：BPMN 元模型里 StartEvent 没有 assignee 字段，瞬时触发不创建 Task
2. **普通 UserTask 配置过于宽松**：发起人节点如果用普通 UserTask，设计者可能错误配置候选用户、会签、或签，而这些语义对发起人节点不成立——发起人由运行时确定，非候选
3. **后端未注入 initiator 变量**：`ProcessInstanceController.start` 只传前端 variables，没有自动注入当前用户 ID 作为 `initiator`
4. **`initiator_self` 选项语义混乱**：把"发起人"当成设计时可配置的审批人类型，实际上发起人不需要"选"
5. **`InitiatorNodeResolver` 盲取第一个 UserTask**：不检查该节点 assignee 是否真是 `${initiator}`

## Alternatives Considered

### 方案 A：显式节点类型区分（扩展属性标记）

- **做法**：UserTask + `wf:nodeRole="initiator"` 扩展属性标记。设计器节点面板提供"发起人节点"入口，拖入时自动设 assignee=`${initiator}` + nodeRole=initiator。属性面板据此切换精简/完整配置。
- **优点**：
  - 设计时类型确定，事前约束，没有"配错再拦"的窗口
  - 符合 BPMN 2.0 规范（扩展属性是标准机制，Flowable 引擎忽略它，不影响执行）
  - `InitiatorNodeResolver` 可精确匹配，不再盲取第一个 UserTask
  - 流程图可自定义 renderer 视觉区分
- **缺点**：
  - 需要注册 bpmn.js moddle 扩展定义
  - 节点面板需要新增入口
  - 旧流程兼容需要回退逻辑
- **为何未采纳的反馈**：无，此为 Agreed Approach

### 方案 B：运行时约束 + 设计时警告

- **做法**：不引入新节点类型。UserTaskProperty 检测到 `assignee=${initiator}` 时（或设计者勾选"此节点为发起人节点"），自动禁用候选用户、会签、或签、驳回等不适用的配置项。
- **优点**：
  - 不需要 moddle 扩展，实现量小
  - 复用现有 UserTask 机制
- **缺点**：
  - 依赖正则匹配 `${initiator}` 字符串，脆弱
  - 设计者得先配错（或先选 initiator 类型）才触发约束，是事后补救
  - 没有独立节点入口，设计者可能不知道有这个选项
  - `InitiatorNodeResolver` 仍需盲取第一个 UserTask
- **为何未采纳**：事后约束不如事前类型区分可靠，且字符串匹配脆弱

### 方案 C：纯后端注入，前端不改

- **做法**：只修后端 start 接口注入 `initiator` 变量，前端设计器完全不动。设计者自行在普通 UserTask 的表达式中写 `${initiator}`。
- **优点**：改动最小
- **缺点**：
  - 设计者仍可在发起人节点上错误配置候选用户、会签等
  - 没有视觉区分，流程图上看不出哪个是发起人节点
  - `InitiatorNodeResolver` 仍盲取第一个 UserTask
  - `initiator_self` 语义混乱问题不解决
- **为何未采纳**：没有解决核心问题（设计者可错误配置），只是补了后端注入

## Agreed Approach

**方案 A：显式节点类型区分**。

理由：核心问题是设计时就应区分两种语义不同的 UserTask。方案 A 是事前约束——类型对了配置项自然就对了。方案 B 是事后补救，依赖字符串匹配。方案 C 完全不解决前端配置宽松问题。

## Key Decisions

1. **扩展属性而非新元素**：用 `wf:nodeRole="initiator"` 标记 UserTask，不发明新 BPMN 元素，保持规范合规性
2. **assignee 自动绑定**：发起人节点的 assignee 固定为 `${initiator}`，设计者不可编辑
3. **精简属性面板**：发起人节点只显示节点名称 + 表单关联，隐藏审批人/候选/会签/操作权限/超时
4. **后端自动注入**：`ProcessInstanceController.start` 从 SecurityContext 取当前用户 ID，自动 `variables.put("initiator", currentUserId)`
5. **`InitiatorNodeResolver` 精确匹配**：优先找 `nodeRole=initiator` 的节点，找不到回退到第一个 UserTask（兼容旧流程）
6. **移除 `initiator_self` 选项**：审批类型里的 `initiator_self` 移除，改为节点类型区分
7. **视觉区分**：bpmn.js 自定义 renderer 给发起人节点不同颜色/图标

## Open Questions

无。设计已在讨论中确认。
