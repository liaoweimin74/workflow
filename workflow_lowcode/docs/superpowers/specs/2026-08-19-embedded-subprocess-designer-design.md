# 内嵌子流程前端支持设计

> 版本：v1.0
> 日期：2026-08-19
> 状态：待审阅
> 方案：B（双击进出编辑模式）

---

## 1. 背景与动机

流程设计器（bpmn-js 深度定制）目前仅支持线性/网关结构的流程图，内嵌子流程（Embedded SubProcess）在画布上没有任何支持——节点面板与右键菜单无入口、属性面板无编辑、双击无进出交互。

本次目标：补齐**设计器前端**的内嵌子流程支持，使其可以创建、编辑、保存、部署带内嵌子流程的流程定义。

### 与 CallActivity 的区分

| 维度 | 内嵌子流程（本次） | 调用活动 CallActivity（已有） |
|---|---|---|
| 结构 | 同一流程定义内的容器，内部再画节点 | 引用另一个已部署的流程定义 |
| 运行时 | 不产生独立实例，变量天然共享 | 产生子流程实例，需 in/out 参数映射 |
| 复用 | 不跨流程定义复用 | 跨流程定义复用 |
| 前端现状 | 无任何支持 | 已有完整配置 UI（df20f2e） |

---

## 2. 范围界定

### 2.1 包含（本次，纯前端改动）

1. 内嵌子流程的创建入口（节点面板 + 右键菜单）
2. 折叠 / 展开（bpmn-js 原生能力，保留）
3. 双击进入子流程内部编辑模式 + 面包屑返回（核心自定义交互）
4. 属性面板：名称 / 描述编辑
5. 删除子流程时级联清理内部节点配置（补现有缺口）
6. 校验增强：每个内嵌子流程内部必须有开始/结束事件

### 2.2 不包含（后续迭代）

- 多实例子流程（循环）、事件子流程、事务子流程、边界事件
- 引擎侧改动（Flowable 8 原生支持内嵌子流程的部署与执行，无需改）
- 流程跟踪页的递归展示（内嵌子流程不产生新实例，现有高亮逻辑天然兼容）

---

## 3. 现状分析（探索结论）

### 3.1 设计器结构

| 文件 | 职责 | 与本次的关系 |
|---|---|---|
| `ProcessDesigner.vue` | 主容器：工具栏 + 节点面板 + 画布 + 属性面板；eventBus 监听 | 需加双击监听、级联删除清理、面包屑 |
| `NodePalette.vue` | 左侧节点面板，`nodeGroups` 数组定义节点 | 新增 SubProcess 条目 |
| `customContextPad.ts` | 右键菜单追加逻辑 | 新增 append.sub-process |
| `PropertyPanel.vue` | 按 `selectedNodeType` 分发属性组件（v-if/v-else-if 链） | 新增 SubProcess 分支 |
| `customRenderer.ts` | 仅高亮 initiator 节点，其余 fallback | **无需改动**（SubProcess 走默认渲染） |
| `customRules.ts` | 仅限制 StartEvent 连线目标，其余不干预 | 无需改动（拖入子流程走原生规则） |
| `designerStore.ts` | 节点配置存储（`nodeConfigs: Record<nodeId, JSON>`） | 新增 subflowStack 状态 |
| `bpmnValidation.ts` | 前端校验辅助 | 新增子流程起止事件校验 |
| `bpmnModeler.ts` | 模型器初始化（additionalModules + wf moddle） | 无需改动 |

### 3.2 后端链路

- 部署走 `ProcessDesignService.deploy()`：XML 原样（经 `MultiInstanceBpmnRewriter` 会签改写 + 事件命名注入）部署到 Flowable，**无节点类型白名单**
- Flowable 8 原生支持 Embedded SubProcess 部署与执行 → 本次零后端改动
- 风险验证点：`MultiInstanceBpmnRewriter` 按 nodeId 全局匹配 XML 节点，子流程内 UserTask 会签节点 ID 全局唯一，理论可命中——需部署测试确认

### 3.3 已确认的现状缺口

1. `ProcessDesigner.vue` 的 `shape.remove` 监听只 `deleteNodeConfig(element.id)`，**删除 SubProcess 不级联清理内部节点 config** → 产生孤儿数据
2. `validateBpmnXml` 全局查询 startEvent/endEvent，天然覆盖子流程内部，但**不校验"每个子流程内部必须有起止事件"** → 空子流程要等 Flowable 报错

---

## 4. 组件与文件改动清单

| 文件 | 改动类型 | 内容 |
|---|---|---|
| `NodePalette.vue` | 修改 | 活动组新增 `{ type: 'bpmn:SubProcess', label: '内嵌子流程', description: '子流程容器，可折叠，双击进入编辑', iconClass: 'bpmn-icon-sub-process' }` |
| `customContextPad.ts` | 修改 | 追加 `entries['append.sub-process']`（复用 `appendAction('bpmn:SubProcess', 'bpmn-icon-sub-process', '追加内嵌子流程')`） |
| `properties/SubProcessProperty.vue` | **新建** | 属性面板：节点 ID（只读）、名称、描述 |
| `PropertyPanel.vue` | 修改 | 分发链加 `sub-process-property` v-else-if；`nodeTypeLabel` 加 `SubProcess: '内嵌子流程'` |
| `stores/designerStore.ts` | 修改 | 新增 `subflowStack` 及 enter/exit/exitAll actions |
| `utils/subflowNavigation.ts` | **新建** | 进出子流程的纯逻辑：外部元素收集、视图聚焦计算、隐藏/恢复 |
| `ProcessDesigner.vue` | 修改 | 双击监听、面包屑渲染、删除级联清理 |
| `utils/bpmnValidation.ts` | 修改 | 新增子流程起止事件校验函数 |
| `designer-theme.css` | 可选 | 对齐主题的 SubProcess 卡片样式（视观感决定） |

---

## 5. 核心交互设计：双击进出编辑模式

### 5.1 状态管理（designerStore.ts）

```ts
/** 当前进入的子流程节点 id 栈；空数组 = 主流程视图 */
const subflowStack = ref<string[]>([])

function enterSubflow(nodeId: string)  // push，并清空 selectedNodeId
function exitSubflow()                 // pop
function exitAllSubflows()            // 清空
```

进入状态**不持久化**——保存/重载回主流程视图。

### 5.2 进入（展开态双击 SubProcess）

1. 覆盖 bpmn-js 原生双击：`eventBus.on('element.dblclick', ...)`，命中 SubProcess 时 `event.preventDefault()`；若当前折叠先自动展开
2. `designerStore.enterSubflow(id)`，清空选中
3. 隐藏外部元素：遍历 `elementRegistry.getAll()`，收集 parent 链不经过该子流程的所有元素（含外部连线），对其 graphics 设 `display: none`；隐藏集作为"进入快照"保存
4. 聚焦：计算子流程 bounds，`canvas.viewbox()` 缩放居中到子流程（带 padding）

### 5.3 返回

- 工具栏中部（`DesignerToolbar` center 区）出现面包屑：`流程名 › 子流程名`（嵌套逐级），点击任一级返回至该层级
- 恢复流程：取消隐藏（依据快照）、恢复进入前 viewbox、`exitSubflow()` 弹栈

### 5.4 约束与约定

- 折叠态双击 = 展开并进入（统一心智）；折叠按钮（bpmn-js 原生 +/-）保留独立切换
- 嵌套天然支持（栈式）；面包屑超长截断显示
- 只读模式复用进入逻辑（聚焦查看，无编辑）
- 子流程内部编辑时，属性面板、节点面板、右键菜单均照常工作（内部节点 id 全局唯一，与主流程无异）
- 双击监听注册在 `initModeler` 返回的 modeler 实例上，随 `destroyModeler` 销毁，无泄漏

---

## 6. 数据流

- 子流程及内部节点 id 全局唯一（bpmn-js 生成）→ `nodeConfigs` / 后端 `NodeConfig` 表**无需 schema 改动**
- 保存（`PUT /{id}/design`）与部署（`POST /{id}/deploy`）走现有链路，XML 原样传递，进出状态不参与序列化
- 子流程内部 UserTask 的会签/或签配置照常工作（`NodeConfigData.approval`）；部署改写逻辑实现在验证阶段跑测试确认
- **删除级联**：扩展 `ProcessDesigner.vue` 的 `shape.remove` 监听——删除元素为 SubProcess 时，遍历其后代节点逐一 `deleteNodeConfig`，补孤儿数据缺口

---

## 7. 校验

`bpmnValidation.ts` 新增（DOM 查询，纯函数，可单测）：

```ts
/** 校验每个 subProcess 内部是否包含开始与结束事件。
 *  返回错误消息列表，无错误返回空数组。 */
export function validateSubProcessBoundaries(xml: string): string[]
```

- 对每个 `bpmn:subProcess` 元素：内部含 startEvent 但缺 endEvent（或反之）→ 返回错误
- `ProcessDesigner.vue` 的 `validateBpmnXml` 并入该校验，缺失时阻断部署并提示
- 现有全局"必须有开始事件"校验天然覆盖子流程内部事件，无需修改

---

## 8. 错误处理与边界

| 场景 | 处理 |
|---|---|
| 空子流程（无起止事件）部署 | 新校验拦截（友好提示）；Flowable 报错兜底仍在 |
| 删除正在编辑中的子流程（栈顶元素被删） | 自动 `exitSubflow()` 回退一级，视图不残留隐藏态 |
| 隐藏集快照与多层嵌套冲突 | 每次进入独立快照（数组栈），返回只恢复栈顶快照 |
| XML 导入含子流程（历史流程/跨系统） | 打开即支持（bpmn-js 原生解析），无需迁移逻辑 |
| 子流程内无起点时拖入节点 | 不特殊处理（与主流程空白画布行为一致） |

---

## 9. 测试策略

### 9.1 单元测试（Vitest，遵循现有 `properties/__tests__/` 模式）

| 目标 | 覆盖点 |
|---|---|
| `subflowNavigation.ts`（新建） | `collectExternalElements()` 过滤正确性（含/不含子流程后代、连线处理）；`isDescendantOf()` 层级判断 |
| `bpmnValidation.ts` | `validateSubProcessBoundaries()`：正常子流程 / 缺 start / 缺 end / 嵌套子流程 / 无子流程 的 XML 样例 |
| `SubProcessProperty.vue` | 渲染 basic.name 回填、读写触发 `updateBpmn` |
| `NodePalette.vue` | 新增 SubProcess 条目存在（如有现有测试文件则追加） |

### 9.2 集成验证（手动）

1. 拖入子流程 → 拖入内部节点 → 连线 → 折叠/展开
2. 双击进出（含嵌套两级）、面包屑返回各层级
3. 删除子流程 → 确认内部节点 config 被清理（查 Network/DB）
4. 保存 → 重载 → 子流程完整恢复
5. 部署 → 新版本生效；含子流程内会签节点的部署正常（验证 MultiInstanceBpmnRewriter）
6. 只读模式双击子流程聚焦查看

### 9.3 回归

- CallActivity 既有功能不受影响（与 SubProcess 无交互点）
- 发起人节点唯一性规则、开始事件连线规则不受影响

---

## 10. 验收标准

- [ ] 节点面板与右键菜单可创建内嵌子流程，画布正常渲染、可折叠/展开
- [ ] 双击展开态子流程进入内部编辑模式，外部元素隐藏、视图聚焦
- [ ] 面包屑可返回主流程及各嵌套层级，视图完整恢复
- [ ] 子流程内部可正常拖入节点、连线、配置属性（含右键追加）
- [ ] 删除子流程级联清理内部节点配置，无孤儿数据
- [ ] 空子流程部署被前端校验拦截，提示缺起止事件
- [ ] 含子流程的流程保存/重载/部署均正常；含子流程内会签节点的部署通过
- [ ] 只读模式可双击子流程聚焦查看
- [ ] 单元测试通过，既有测试无回归