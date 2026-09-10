# 流程配置层级与版本体系设计

> 变更：`process-config-and-version`
> 范围：问题 1（配置层级）、问题 2（操作语义）、问题 3（部署变化检测）、问题 5（历史版本查看）
> 依据：`brainstorm.md` 已确认的设计决策

## Context

当前工作流平台存在四类配置与版本问题：

1. **配置层级混乱**：节点级 `operations`（5 个操作权限位）是运行时唯一依据，流程级 `__PROCESS__` 配置中的 `allowAddSigner` / `allowDelegate` 是历史残留（`designerStore.ts` 已标 `@deprecated`，后端无任何消费方），但 `ProcessProperty.vue` UI 仍展示这两个开关，造成"流程级与节点级配置并存"的困惑。
2. **操作语义重叠**：转办（`TransferService` 基于 `setAssignee`）与转签（`ForwardSignService` 基于 MI 实例 delete+add）在会签/或签节点上运行时效果等价（`TransferService` 注释自认"业务上等价于转签"），仅审计 action 与权限位不同。委派（`delegateTask`，resolve 后任务回原办理人）语义完全不同。
3. **部署变化检测缺陷**：`ProcessDesignService.deploy()`（第 209 行）用 `draft.getDeployedXml()` 与 `effectiveBpmnXml`（`MultiInstanceBpmnRewriter.rewrite` 结果，仅会签/或签改写）比较。审批人、操作权限、超时、表单绑定、`__PROCESS__` 等配置不体现于 XML → 修改后被误判"流程数据未变化，无需部署"→ 配置永不生效。
4. **历史版本不可见**：数据已备齐（Flowable `ACT_GE_BYTEARRAY` 按版本存 XML、`wf_node_config` 有按 `processDefinitionId` 的配置快照 `snapshotNodeConfigs`），但 `listProcessDefinitions` 用 `.latestVersion()` 只返回最新版，前端无版本历史入口与只读视图。

约束：现有 `__PROCESS__` 配置存储机制、nodeConfig 版本快照机制、`/editor` 接口形状均复用，不做破坏性变更。

## Goals / Non-Goals

**Goals:**
- 建立"流程级总控 + 节点级覆盖"的操作权限配置模型，运行时生效
- 消除转办/转签的用户认知负担（UI 合并），保留委派独立语义与审计
- 修复部署变化检测：配置（含 `__PROCESS__`）任一变化即可部署，真无变化才拦截
- 提供流程历史版本的查看入口：版本列表 + 各版本编辑器数据（XML + 配置快照）

**Non-Goals:**
- 问题 4（表单版本管理）——后续变更，本变更只保证历史版本查看在表单环节的已知限制被记录
- 问题 6（底表/业务表单）——后续变更
- 版本对比（diff）视图——设计文档标注的第二期
- 流程实例详情页"查看所用版本配置"联动——仅做流程管理列表入口（open question 待定）
- 审批人去重、流程编号的运行时执行逻辑——仅保留配置（现状）

## Decisions

### D1: 流程级操作权限总控（问题 1）

**方案：** `ProcessConfigData.approvalPolicy` 新增 `operations` 四开关（`allowReject` / `allowAddSign` / `allowTransfer` / `allowDelegate`，默认全开），替代废弃的 `allowAddSigner` / `allowDelegate`。生效规则 = **流程级 AND 节点级**。

**改动点：**
- 前端 `designerStore.ts`：`ProcessConfigData` 增加 `operations` 字段，移除 `allowAddSigner` / `allowDelegate`；`DEFAULT_PROCESS_CONFIG` 同步
- 前端 `ProcessProperty.vue`：废弃两开关替换为"节点操作权限"分区，四个总控开关
- 后端：新增 `OperationsConfig` 的流程级解析——运行时读取当前部署版本（或草稿）的 `__PROCESS__` 配置，与节点级 AND 叠加

**备选：** 只保留节点级（后端零改动）——无法满足管理员统一治理；保留双入口——继续迷惑用户。D1 是治理需求与实现成本的平衡。

### D2: 转办/转签 UI 合并 + 委派保留（问题 2）

**方案：**
- 前端：`TaskDetailPage.vue`"更多操作"移除"转签"，保留"转办/委派/加签"
- 节点配置：`NodeConfigData.operations` 移除 `allowForwardSign`，`allowTransfer` 语义扩展为"允许转办（含会签节点转签）"；运行时忽略旧数据中的 `allowForwardSign`（JSON 反序列化宽容）
- 后端：`POST /api/v1/tasks/{id}/transfer` 统一走 `TransferService`——其 `setAssignee` 实现天然覆盖多实例节点（子任务独立，改 assignee 后原办理人待办消失、目标用户待办出现，运行时效果等价于转签），无需按节点类型路由；`/forward-sign` 接口保留兼容但不再从前端暴露
- 委派：`POST /api/v1/tasks/{id}/delegate` 与 `allowDelegate` 独立保留（`delegateTask` 的"代办不交权、resolve 回原办理人"是不可合并的业务语义）

**备选：** 三个操作全保留——用户需理解"会签节点用转签"；MI 节点路由到 `ForwardSignService`（delete+add）——运行时效果与 setAssignee 等价但会重建 MI 执行树、产生副作用，无收益。D2 采用统一 `setAssignee`，保留审计语义的同时消除 UI 认知负担。

### D3: 部署变化检测 = XML + 配置整体 hash（问题 3）

**方案：**
- `ProcessDraft` 新增 `deployedConfigHash` 字段（`VARCHAR(64)`）
- Flyway 迁移：`ALTER TABLE wf_process_draft ADD COLUMN deployed_config_hash VARCHAR(64) NULL`
- `deploy()` 判定逻辑：
  ```
  canonicalJson = nodeConfigMap 按 nodeId 排序后规范化序列化
  currentHash = SHA-256(effectiveBpmnXml + "|" + canonicalJson)
  若 deployedConfigHash 非空：相等 → "流程数据未变化，无需部署"；不等 → 部署并更新 hash
  若 deployedConfigHash 为空（历史数据）：降级用现有 deployedXml 比较（保持旧行为），部署后写 hash
  ```
- 部署成功后：`draft.setDeployedConfigHash(currentHash)`，`deployedXml` 继续保留（兼容降级）

**备选：** 去掉变化校验——Flowable 每次 deploy 创建新 deployment 与 processDefinitionId，空版本膨胀。D3 用双保险（hash 为主、旧行为降级）平滑迁移。

### D4: 历史版本查看（问题 5）

**方案：**
- 后端 `ProcessDefinitionController` / `DeployedProcessController` 新增两接口：
  - `GET /api/v1/deployed-processes/{key}/versions` → `[{ procDefId, version, name, deploymentTime, isLatest }]`（按 tenant 过滤，从 Flowable `ProcessDefinitionQuery` 全版本查询，含非 latest）
  - `GET /api/v1/deployed-processes/versions/{procDefId}/editor` → `EditorDTO` 形状：`bpmnXml`（`repositoryService.getProcessModel(procDefId)`）+ `nodeConfigs`（`nodeConfigRepository` 按 `processDefId + processDefinitionId` 精确查询，含 `__PROCESS__` 快照）——复用现有 `loadEditor` 的返回结构，前端零适配
- 前端：
  - `ProcessListPage.vue` 操作列加"版本历史"→ 版本列表抽屉（版本号/部署时间/最新标记）
  - 点某版本 → 只读设计器页：`ProcessDesigner.vue` 增加 `readOnly` 模式（bpmn-js 以 viewer 形态加载、禁用编辑与保存）；属性面板以只读形式展示该版本节点配置（复用属性组件 + `readOnly` prop，本次先覆盖"基本信息 + 配置 JSON 只读"，完整只读表单后续迭代）

**备选：** 不做（维持 latestVersion 现状）——无法追溯历史配置。D4 复用全部现有数据与接口形状，成本集中在只读视图。

## Risks / Trade-offs

- [hash 误判：JSON 序列化顺序不稳定] → 规范化：nodeConfigMap 按键排序（`TreeMap`）后由 `ObjectMapper` 序列化；hash 前统一 trim
- [历史数据首次迁移产生一次空版本] → 已设计降级路径：`deployedConfigHash` 为空时用 `deployedXml` 比较，行为与现状一致；部署成功后立即写 hash，之后全部走 hash 判定
- [旧 nodeConfig 含 `allowForwardSign` 残留] → 后端 `OperationsConfig` 解析时忽略未知字段；前端 `NodeConfigData` 移除字段后，旧 JSON 中的多余键被 Vue/JSON 宽容处理，不阻塞
- [MI 路由误判：transfer 在 MI 节点上目标用户与现有 MI 成员冲突] → 复用现有 `ForwardSignService` 的成员校验逻辑，路由只做节点类型判断
- [Flowable 历史 XML 读取失败（部署被清理/异常）] → `getProcessModel` 包 try-catch，返回 404 与友好提示，不阻断列表
- [只读设计器属性面板改造范围过大] → 本期只读视图聚焦"流程图渲染 + 配置数据只读展示"，不追求与编辑态完全一致的交互

## Migration Plan

1. 后端：Flyway 新增 `V*__add_deployed_config_hash.sql`（加列）
2. 后端：`ProcessDraft` 实体加字段；`deploy()` 改 hash 判定（含降级）
3. 后端：`OperationsConfig` 增加流程级叠加解析；`transfer` 接口加 MI 路由
4. 前端：`designerStore.ts` 类型与默认值更新；`ProcessProperty.vue` 总控开关；`UserTaskProperty.vue` 移除转签项；`TaskDetailPage.vue` 菜单合并
5. 后端：版本列表 + 版本 editor 两接口
6. 前端：`ProcessListPage` 版本历史抽屉 + 只读设计器
7. 回滚：hash 判定为纯新增逻辑（旧逻辑走降级路径），接口为纯新增；前端为 UI 调整，均可安全回退

## Open Questions

1. 流程实例详情页是否本次一并提供"查看所用版本配置"入口（默认：仅流程管理列表入口）
2. 只读属性面板的覆盖范围：先"基本信息 + 配置 JSON 只读"还是直接完整只读表单（默认：前者）
3. 版本列表是否展示流程名称变更历史（Flowable 无此信息，默认仅展示当前名称）
