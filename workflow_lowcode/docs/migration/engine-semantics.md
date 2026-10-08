# 引擎语义规格（Flowable 使用语义完整提取）

> Task ID: 13-1b · 自研受控 DSL 解释器的规格来源。
> 素材范围：`backend/src/main/java/com/workflow/engine/**`、`api/controller/**`、`framework/config/FlowableEngineConfig.java`、`frontend/src/views/designer/**`、`frontend/src/stores/designerStore.ts`。
> 结论先行：设计器产物 = **BPMN XML（bpmn-js 生成）+ 每节点 configJson（node_configs 表）** 两件套；后端部署时对 XML 做"多实例/审批人改写"后交给 Flowable。自研引擎可**跳过 XML**，直接以「图模型 + 节点配置 JSON」为解释对象，实现下文 C 章的语义清单即可对等。

---

## A. 设计器 JSON Schema 规格

### A.1 设计器产物形态

| 产物 | 存储 | 说明 |
|---|---|---|
| `bpmnXml` | `process_draft.bpmn_xml` | bpmn-js 导出的 BPMN 2.0 XML（含 BPMNDI 图形信息）。前端负责：节点/连线、name、conditionExpression、发起节点 `flowable:assignee=${initiator}` + `wf:nodeRole=initiator`、ServiceTask 实现属性 |
| `nodeConfigs` | `node_config` 表（`process_def_id`=draftId, `process_definition_id` IS NULL = 当前编辑中） | `Map<nodeId, configJsonString>`。nodeId = BPMN 元素 id；特殊键 `__PROCESS__` = 流程级配置（nodeType 记为 `process`） |

nodeType 由后端从 XML 标签名解析（`ProcessDesignService.parseNodeTypes`），即 BPMN 元素本地名（userTask/serviceTask/callActivity/subProcess/exclusiveGateway…）。

### A.2 节点类型枚举（NodePalette.vue）

| 设计器类型 | BPMN XML 元素 | 关键 XML 属性 | 说明 |
|---|---|---|---|
| 开始事件 | `bpmn:startEvent` | name（部署时缺省补 "开始"） | 仅允许 1 个（前端校验） |
| 结束事件 | `bpmn:endEvent` | name（缺省补 "结束"） | ≥1 个 |
| 发起节点 | `bpmn:userTask` | `flowable:assignee="${initiator}"`、`wf:nodeRole="initiator"`（wf-moddle 扩展） | 发起人填报节点，启动后自动 complete；驳回的目标节点 |
| 用户任务（审批节点） | `bpmn:userTask` | 审批人由后端部署时从 configJson 写入 assignee/candidateUsers/MI | 主力审批节点 |
| 服务任务 | `bpmn:serviceTask` | serviceType(class/expression) | 设计器可配，当前无强语义依赖 |
| 调用活动 | `bpmn:callActivity` | calledElement + in/out 参数映射（configJson） | 子流程；子流程定义下拉来自已部署定义（按 key 去重最新版） |
| 内嵌子流程 | `bpmn:subProcess` | 内部须含开始/结束事件（前端校验） | 容器，双击进入编辑 |
| 排他网关 | `bpmn:exclusiveGateway` | 出线 conditionExpression | XOR |
| 并行网关 | `bpmn:parallelGateway` | — | AND |
| 包含网关 | `bpmn:inclusiveGateway` | 出线 conditionExpression | OR |

连线 `bpmn:sequenceFlow`：name + 可选 `conditionExpression`（`bpmn:FormalExpression` body）。

### A.3 节点级 configJson（`NodeConfigData`，designerStore.ts）

```ts
{
  basic?:    { name?: string; description?: string }
  approval?: {
    type?: 'user' | 'dept_head' | 'expression'   // 审批人类型
    userIds?: number[]                            // type=user：用户 ID 列表
    expression?: string                           // type=expression
    multiMode?: 'countersign' | 'or_sign' | 'sequential' | ''  // 会签/或签/依次审批
  }
  form?: {
    formDefId?: string                            // 节点表单
    fieldPermissions?: Record<string, 'EDIT'|'VIEW'|'HIDDEN'>
    dataMappings?: { targetField: string; source: string; sourceField?: string }[]
    // source: form:initiator | form:<nodeId> | variable:<name>
  }
  timeout?:  { duration?: number; action?: 'remind'|'escalate' }   // 设计器可配，后端未见实现
  operations?: { allowReject?; allowAddSign?; allowTransfer?; allowDelegate? }  // 节点级开关
  condition?: string                            // （预留字段）
  callActivity?: { calledElement?: string; inParams?: ParamMapping[]; outParams?: ParamMapping[] }
  backendLogic?: BackendLogicItem[]
}

BackendLogicItem = {
  id, name, enabled: boolean,
  trigger: 'ENTER' | 'COMPLETE',
  type: 'http' | 'bean' | 'script',
  errorAction: 'IGNORE_CONTINUE' | 'FAIL_FLOW',
  resultVar?: string,                            // 执行结果写回的流程变量名
  http?:   { url, method: GET|POST|PUT|DELETE, headers?, queryParams?: ParamMapping[], bodyParams?: ParamMapping[], connTimeoutMs?=3000, readTimeoutMs?=5000, retryCount?=0 }
  bean?:   { beanName, methodName, params?: ParamMapping[] }
  script?: { language: 'groovy', source }
}
ParamMapping = { source: string /* 流程变量名 */, target: string /* 输出名 */ }
```

### A.4 流程级 configJson（`__PROCESS__`，`ProcessConfigData`）

```ts
{
  approvalPolicy: {
    deduplication: { enabled: boolean; scope: 'GLOBAL'|'PHASE'; action: 'AUTO_PASS'|'SKIP'|'ESCALATE' } // 审批人去重（设计存在，后端未见运行时实现）
    allowRecall: boolean                        // 撤回开关：仅配置项，后端无运行时 API
    operations: { allowReject; allowAddSign; allowTransfer; allowDelegate }  // 流程级总控，与节点级 AND 合并
  }
  numberRule: { enabled: boolean; pattern: string }   // 编号规则，如 '{{year}}-{{seq:4}}'
  form?: { formDefId?: string; fieldPermissions?: Record<string,'EDIT'|'VIEW'|'HIDDEN'> }  // 流程默认表单（节点未配时兜底）
  variableMappings?: { variable: string; source: 'form:initiator'|'form:<nodeId>'|'variable:<name>'; sourceField?: string }[]
}
```

### A.5 关键字段消费方速查

| 字段 | 消费位置 |
|---|---|
| `approval.userIds` / `approval.multiMode` | 部署期 `MultiInstanceBpmnRewriter`（写 XML）；运行期 `MultiInstanceApproverListener`（approverList）、`ProcessTaskPredictionService`（候选人展示） |
| `form.formDefId` / `fieldPermissions` | `WorkflowTaskService.extractFormConfig`：节点级 > `__PROCESS__` 级，整体取用不跨层合并 |
| `operations` | `WorkflowTaskService.extractOperations`：流程级 AND 节点级；默认节点级 `{allowReject:true, allowTransfer:true, allowAddSign:false, allowDelegate:false}`，流程级全 true |
| `backendLogic[]` | `ProcessConfigResolver`（按 procDefId 精确版本解析，TTL 5min 缓存）→ `BackendLogicExecutor` |
| `variableMappings` | `VariableMappingWriter`（启动后 / complete 后 / 驳回后触发） |
| `form.dataMappings` | `FormDataMerger` → TaskDetailVO.mappedData（只读聚合） |

---

## B. JSON→BPMN 转换规则摘要（部署管线，自研引擎按语义点等价实现）

部署入口 `ProcessDesignService.deploy(draftId)`，步骤：

1. **多实例/审批人改写**（`MultiInstanceBpmnRewriter.rewrite`，对每个 `bpmn:userTask`）：
   - `approval.multiMode ∈ {countersign, or_sign, sequential}` 时：
     - `flowable:assignee="${approver}"`（MI 元素变量）
     - 注入 `extensionElements → flowable:executionListener event="start" delegateExpression="${multiInstanceApproverListener}"`
     - 注入 `bpmn:multiInstanceLoopCharacteristics`：
       - `isSequential = (multiMode == sequential)`
       - `flowable:collection="${approverList}"`、`flowable:elementVariable="approver"`
       - `completionCondition`：countersign/sequential → `${rejected || (nrOfCompletedInstances == nrOfInstances)}`；or_sign → `${rejected || (nrOfCompletedInstances >= 1)}`
       - 插入位置遵循 BPMN XSD 元素顺序（extensionElements/incoming/outgoing 之后）
   - 无 multiMode 且有 `approval.userIds` 时：1 人 → `flowable:assignee=<id>`；多人 → `flowable:candidateUsers="id1,id2"`（候选人任一可领）
2. **事件名注入**：StartEvent 缺名补 `开始`，EndEvent 缺名补 `结束`。
3. **变更检测**：SHA-256（改写后 XML + 排序后的 nodeConfigs 规范化 JSON）；与上次部署 hash 相同 → 拒绝部署（400 "流程数据未变化"）。历史数据无 hash 时降级：XML 相同且配置等于上次版本快照 → 未变化。
4. **部署**：`createDeployment().name().addString("<key>.bpmn20.xml", xml).tenantId(tenant)[.category(categoryId)]`（targetNamespace=categoryId）。XML 校验失败转友好提示。
5. **版本绑定**：draft → DEPLOYED、deployId、deployedXml、deployedConfigHash、processDefinitionId、version；**NodeConfig 版本快照**（`process_definition_id`=新 procDefId，幂等重建）——运行时一律按 procDefId 查快照，保证"实例所用配置 = 部署时配置"。
6. **映射校验**：`FormMappingValidator.validate(procDefId)`（字段存在性/变量名唯一/循环引用），失败阻断部署。

**自研引擎对应语义点清单**：①审批人集合与单/多实例模式定义 ②MI 完成条件（全部/任一）③rejected 短路 ④发起人节点标记（assignee=${initiator}）⑤节点/事件缺省名 ⑥节点配置随版本固化 ⑦部署防重（hash） ⑧流程级分类/租户 ⑨表单映射静态校验。XML/DI 可丢弃——前端图渲染已由 bpmn-js/前端自有 XML 处理。

---

## C. 运行时语义清单（自研解释器必须支持）

### C.1 启动
- 入参 `{processKey, businessKey?, variables?, formDefId?}`；按 key + tenant 启动**最新版本**定义。
- 注入 `initiator` 变量（当前登录用户 ID 字符串）。
- **自动完成发起节点**：定位 `wf:nodeRole=initiator`（兜底第一个 userTask）上的任务，`complete(变量)` 推进到首个审批节点；写 comment `action=submit`。
- 表单数据落库（form_data，非快照）；写流程级 variableMappings。
- 触发全局事件：PROCESS_STARTED → start 节点 ENTER 后置逻辑；TASK_ASSIGNED → 通知。

### C.2 节点到达时的任务分配规则（实际支持的种类）
| 规则 | 来源 | 行为 |
|---|---|---|
| 发起人本人 | 发起节点 `assignee=${initiator}` | 启动时自动 complete（不停留） |
| 指定用户-单人 | `approval.userIds` 长度 1 | `assignee=该用户` |
| 指定用户-多人（候选） | `approval.userIds` 长度 >1 且无 multiMode | `candidateUsers`，候选人 claim 认领后办理 |
| 会签/或签/依次审批 | `approval.multiMode` + `approval.userIds` | MI：approverList 由 listener 从 NodeConfig 读取；每人一个实例（assignee=approver）；完成条件见 B-1 |
| 流程表达式 | `approval.type='expression'` | **仅前端设计器/校验支持，后端无解析执行实现（迁移缺口）** |
| 部门主管 | `approval.type='dept_head'` | 同上，**未实现（迁移缺口）** |

### C.3 完成任务
- 委派中的任务先 `resolveTask` 再 complete。
- complete(taskId, variables) 写入变量 → 写 variableMappings → 写 comment `action=approve` → 判断流程是否结束（查 runtime）→ 返回 `CompleteTaskResponse{processFinished, nextTask...}`（下一任务按 `processInstanceId` singleResult 取，即单任务路径假设）。

### C.4 多实例会签/或签/依次
- 计数语义：完成条件表达式驱动；`rejected=true` 任一实例触发即可整体终止（三条模式共用）。
- 依次审批（sequential）同样要求全部完成。

### C.5 驳回 / 拒绝
- **驳回（reject）= 退回发起人节点**：目标只能是 initiator 节点（`InitiatorNodeResolver`：wf:nodeRole=initiator → 兜底第一个 userTask）；当前已在发起节点时禁止驳回。**不支持任意回退到中间节点**。
- 实现：设变量 `rejected=true`（终止 MI）→ `changeActivityState: moveActivityIdTo(current → initiator)`（MI 并行整体回退，取消全部子实例）→ comment `action=reject` → 写 variableMappings（发起人重新填报后变量刷新）。
- **拒绝（refuse）= 终止流程**：comment `action=refuse` → `deleteProcessInstance(reason)`。
- 撤销/撤回（recall）：流程级配置 `allowRecall` 存在，**后端无运行时 API（迁移缺口）**。

### C.6 加签 / 转签 / 转办 / 委派
| 操作 | API | 语义 | comment.action |
|---|---|---|---|
| 加签 addSign | MI 节点：`addMultiInstanceExecution(activityId, piId, {approver:user})` 每人一次；非 MI：`addCandidateUser` | 新增审批实例，受完成条件约束；前/后加签在 MI 下行为一致 | add_sign（target=逗号拼接用户） |
| 转签 forwardSign | `deleteMultiInstanceExecution(executionId, false)` + `addMultiInstanceExecution` | MI 实例级换人：删旧实例（不计完成数，不影响计数）+ 加新实例 | forward_sign |
| 转办 transfer | `setAssignee(taskId, toUser)` | 换 assignee（单实例/MI 子任务通用）；校验 from≠to、`allowTransfer`（流程级 AND 节点级）；审计 `wf_task_transfer` | transfer |
| 委派 delegate | `delegateTask(taskId, to)` | Flowable 委派：原 assignee 仍是 owner，被委派人 resolve 后回到原 assignee；complete 时先 resolve | delegate |

> 权限差异点：`extractOperations` 提供 4 开关，服务端目前仅 transfer 强制校验；addSign/delegate 未强制（迁移时应统一）。审批意见统一存业务表 `wf_task_comment`（非 Flowable Comment API）。

### C.7 催办 remind
- 任务须存在；目标 = assignee ?? owner；频率限制：同任务 24h（`workflow.remind.frequency-hours`）内不可重复；记录 `wf_task_remind`；通知出口当前为 log（后续对接通知中心）。

### C.8 实例管理
- 挂起/恢复：`suspendProcessInstanceById` / `activateProcessInstanceById`；定义级 suspend/activate（启动入口被停用）。
- 终止：`deleteProcessInstance(reason)`。
- 列表：运行中 → ProcessInstanceQuery（tenant、variableValueEquals("initiator")、active/suspended、processDefinitionNameLike）；"我发起的" → HistoricProcessInstanceQuery（unfinished/finished、startedBy、startedAfter/Before）。

### C.9 网关与条件表达式语法
- 排他/包含网关出线 `conditionExpression` = UEL：`${approved == true}`、`${approved == false}`、`${amount > 10000}`、`${amount > 100000}`（前端预设）；可用变量 = 流程变量全集（initiator、approved、amount、rejected、approverList、resultVar 回写、variableMappings 产物）。
- 预测遍历规则（`ProcessTaskPredictionService`）：无条件出线继续深入；有条件出线停止并标记分支；到 endEvent 停止；visited 集防环（MI 按活动实例 ID 区分已完成/活跃）。

### C.10 监听 / 后置逻辑触发时机
- 全局事件监听（`BackendLogicEventListener`，全局注册，isFailOnException=false）：
  - `PROCESS_STARTED` → start 节点 **ENTER**
  - `ACTIVITY_STARTED`(userTask) → 节点 **ENTER**
  - `TASK_COMPLETED` → 节点 **COMPLETE**
  - `ACTIVITY_COMPLETED`(endEvent) → 节点 **COMPLETE**
- 执行链：`ProcessConfigResolver`（版本快照 + 5min TTL 缓存）→ `BackendLogicExecutor`：
  - 逐条执行 enabled 且 trigger 匹配的 backendLogic 项；成功且配置 `resultVar` → `setVariable(executionId, resultVar, result)`；
  - 失败按 `errorAction`：`IGNORE_CONTINUE` 记日志继续；否则抛出中断流转（FAIL_FLOW）。
- 三类执行器：
  - **http**：URL/headers/query/body 支持 `{{var}}` 占位替换（`VariableResolver`）；超时默认 3000/5000ms；仅对网络异常按 retryCount 重试（间隔 200ms）；响应体（String）作为返回值。
  - **bean**：`@BackendLogicBean` 白名单注册表（构造期扫描 Spring 容器）；按 beanName+methodName 反射调用；参数 = `params[].source` 依序从流程变量取值；参数个数不符即拒绝。
  - **script**：仅 groovy；GroovyShell 以流程变量为绑定执行，返回值为结果。
- MI 审批人注入：MI userTask start 事件的 executionListener（delegateExpression=${multiInstanceApproverListener}）读取 NodeConfig `approval.userIds` → `setVariable(approverList)`，并初始化 `rejected=false`。
- 通知桥接（全局监听）：`TASK_ASSIGNED` → 待办通知办理人；`PROCESS_COMPLETED` → 通知发起人（站内信 + SSE）。

### C.11 查询/详情语义（前端依赖的契约）
- 待办：assignee（或 candidateUser）+ tenant，按创建时间倒序；createTime 范围引擎原生过滤；processName/initiator 组装后在内存过滤（自研应下沉为 SQL）。
- 已办：HistoricTask finished + endTime 范围；**补充集**：用户操作过但任务已易主（转办/委派/加签/转签）→ 从 wf_task_comment 按 user_id 反查 taskId 并入；approveResult = 该任务最新 comment.action；currentNode = 实例当前活跃任务名（顿号连接）。
- 详情：runtime 优先、history 兜底；formDefId/字段权限（节点级>流程级）；operations AND 合并；variables（运行中 task variables / 结束后历史变量）；mappedData（dataMappings 聚合，只读、缺源跳过）。
- 流程图高亮：completed = HistoricActivityInstance(endTime!=null)；active = runtime ActivityInstanceQuery（MI 去重按 activityId）。
- 审批记录时间线：HistoricActivityInstance(userTask, startTime 升序) + wf_task_comment（按 taskId 关联取最新一条）；预测时间线以 wf_task_comment 每条为记录（含 submit/approve/reject/transfer/delegate/add_sign/forward_sign/refuse）。
- 表单-流程绑定守护：表单挂了 processKey 时——更新数据需无 active 实例（按 businessKey）、删除需无任何历史实例。

---

## D. Flowable API 调用分组统计

> 方法：对 `backend/src/main/java/com/workflow` 全量 grep 计数（引擎 API 方法调用点）。直接方法调用约 **140+ 处**；叠加服务注入/引用点后与既有口径 "199 处" 同量级。分组如下：

### TaskService（约 40 处）
| 方法 | 次数 | 用途 |
|---|---|---|
| createTaskQuery | 23 | 待办/候选列表、任务与下一任务查询、催办/加签/转签/驳回前置查询、活跃任务名、看板、业务数据页当前节点 |
| complete | 3 | 发起节点自动完成、completeTask、completeTaskWithResponse |
| resolveTask | 2 | 委派回退（complete 前） |
| delegateTask | 2 | 委派 |
| claim | 1 | 候选人认领 |
| setAssignee | 1 | 转办 |
| addCandidateUser | 1 | 非 MI 加签 |
| getVariables | 1 | 任务详情变量 |

常用过滤器：taskTenantId / taskAssignee / taskCandidateUser / taskId / processInstanceId / taskDefinitionKey / taskIds / taskCreatedAfter|Before / active()；排序 orderByTaskCreateTime。

### RuntimeService（约 45 处）
| 方法 | 次数 | 用途 |
|---|---|---|
| setVariable(s) | 12 | complete 变量、rejected 标记、approverList、resultVar 回写、variableMappings、变量管理接口 |
| getVariable(s) | 8 | 详情/映射/逻辑执行上下文 |
| createProcessInstanceQuery | 7 | 实例列表/详情、批量 PI、运行中判定、businessKey 守卫、看板 |
| startProcessInstanceByKeyAndTenantId | 2 | 启动（含/不含 businessKey） |
| addMultiInstanceExecution | 4 | 加签 ×N、转签加新 |
| deleteMultiInstanceExecution | 1 | 转签删旧（不计完成） |
| createChangeActivityStateBuilder | 1 | 驳回 changeActivityState |
| createActivityInstanceQuery | 2 | 高亮 active、预测 active |
| suspend/activate/deleteProcessInstance | 3 | 实例挂起/恢复/终止 |
| removeVariable | 1 | 变量删除 |

ProcessInstanceQuery 过滤器：processInstanceIds / TenantId / BusinessKey / variableValueEquals("initiator") / processDefinitionNameLike / active() / suspended()。

### HistoryService（约 30 处）
| 方法 | 次数 | 用途 |
|---|---|---|
| createHistoricProcessInstanceQuery | 11 | "我发起的"、实例详情兜底、已办 VO、表单删除守卫、看板（startedBy/startedAfter|Before/finished/unfinished）、完成通知 |
| createHistoricTaskInstanceQuery | 5 | 已办列表（finished + endTime 范围）、按 taskIds 批量、已办详情、看板 |
| createHistoricActivityInstanceQuery | 3 | 高亮 completed、审批记录时间线、预测历史 |
| createHistoricVariableInstanceQuery | 3 | 结束实例的 initiator/变量回溯 |

### RepositoryService（约 20 处）
| 方法 | 次数 | 用途 |
|---|---|---|
| createProcessDefinitionQuery | 7 | 定义列表/详情、批量名称映射、部署校验、看板（latestVersion/CategoryLike/NameLike/active|suspended/deploymentId） |
| getBpmnModel | 5 | 发起节点解析、MI 判定（加签）、预测路径遍历、定义 XML 视图 |
| createDeployment | 2 | 设计器部署、通用部署 |
| getProcessModel | 1 | 定义 XML 查看 |
| suspend/activateProcessDefinitionById | 2 | 定义停用/启用 |

### ManagementService
- 0 处（未使用 job/作业管理）。

### 引擎模型/事件扩展
- BpmnModel 遍历：FlowElement/FlowNode/SequenceFlow（targetRef、conditionExpression、outgoingFlows）、UserTask attributes（wf:nodeRole=initiator，兼容 `nodeRole`/`wf:nodeRole` 两种 key）、Activity.loopCharacteristics != null 判定 MI。
- 全局事件：PROCESS_STARTED、ACTIVITY_STARTED、TASK_COMPLETED、ACTIVITY_COMPLETED、TASK_ASSIGNED、PROCESS_COMPLETED。
- 引擎装配：ProcessEngineConfigurationConfigurer（databaseType=mysql + 全局 eventListeners）；JavaDelegate（multiInstanceApproverListener）；executionListener（delegateExpression）；Flowable Spring Boot 自动建表（Flyway 之后）。
- 未使用的引擎能力：任务标签/父任务、Flowable Comment API（意见自存 wf_task_comment）、IdentityService、身份关联表（candidate 用 candidateUsers 内联）、信号/消息事件、定时边界事件、作业管理。

---

## E. 自研解释器建议数据表

> 设计原则：①每张运行/历史表都带 `tenant_id`（现平台所有查询按租户隔离）；②NodeConfig 按 **process_definition_id 精确版本**固化；③审批动作/转办/催办均为业务表（现平台已如此，直接沿用）；④解释器需要"令牌/执行流"表支撑网关并行与 MI 计数、驳回 changeState。

### E.1 沿用（已存在于平台业务侧，非 Flowable 表）
- `wf_task_comment`（id, tenant_id, task_id, process_instance_id, user_id, action[submit|approve|reject|refuse|transfer|delegate|add_sign|forward_sign], comment, target_user_id, created_at）——审批时间线与已办补充集的唯一来源。
- `wf_task_transfer`（task_id, process_instance_id, from_user, to_user, reason）——转办审计。
- `wf_task_remind`（task_id, process_instance_id, remind_from, remind_to, remind_time）——催办 + 24h 限频查询。
- `node_config`（process_def_id, process_definition_id 可空=编辑中, node_id, node_type, config_json）——按版本快照。
- `form_data`（form_def_id, process_instance_id, is_snapshot, data_json）。

### E.2 定义侧
```sql
wf_process_definition(
  id PK, process_key, name, version INT, tenant_id, category_id,
  status[DRAFT|DEPLOYED|MODIFIED|SUSPENDED],   -- 迁移时定义级停用=不可发起
  diagram_json,          -- 解释器直接消费的图模型（节点+连线+条件，替代 BPMN XML）
  deployed_hash CHAR(64), deployed_at, created_by, created_at, updated_at
  UNIQUE(process_key, version, tenant_id))
```

### E.3 实例/执行流侧
```sql
wf_process_instance(
  id PK, definition_id FK, process_key, definition_version, tenant_id,
  business_key, initiator, title,
  status[RUNNING|SUSPENDED|COMPLETED|TERMINATED],
  start_time, end_time, end_reason,
  -- "我发起的"按 initiator + status 过滤（对应 variableValueEquals("initiator")，建议落列而非变量查询）
  INDEX(tenant_id, initiator, status), INDEX(tenant_id, business_key))

wf_execution(  -- 解释器令牌：网关并行/MI/跳转都需要
  id PK, instance_id FK, parent_execution_id, node_id,
  is_mi_root BOOL, mi_seq INT,          -- MI 子实例序号
  active BOOL, suspended BOOL, created_at)

wf_variable(
  instance_id FK, name, var_type, text_value / number_value / json_value,
  -- 或 instance 级 JSON 列 + 变更历史表；必须支持按 name 精确查（initiator、rejected、approverList、resultVar…）
  PRIMARY KEY(instance_id, name))
```

### E.4 任务侧（运行 + 历史合一或分离，需支撑两类查询）
```sql
wf_task(
  id PK, instance_id FK, definition_id, node_id, node_name, tenant_id,
  assignee, owner,                      -- owner=委派原办理人
  delegation_state[NULL|PENDING],
  candidate_scope,                      -- 多人候选（原 candidateUsers），或拆 identity_link 表
  mi_root_execution_id,                 -- 归属 MI（或 NULL）
  status[PENDING|COMPLETED|CANCELLED|TRANSFERRED],
  form_def_id,
  create_time, claim_time, end_time,
  INDEX(tenant_id, assignee, status, create_time),       -- 待办
  INDEX(tenant_id, assignee, status, end_time),          -- 已办(finished)
  INDEX(instance_id, node_id))                            -- 下一任务/活跃节点查询

wf_identity_link(task_id, user_id, type[CANDIDATE])        -- 若需支持候选人查询与认领
```
已办语义注意：①finished = status=COMPLETED（含被 changeState 取消的 CANCELLED 不算）；②"操作过但已易主"的已办 = join wf_task_comment(user_id) 补充；③approveResult = 该 task 最新 comment.action。

### E.5 历史活动（高亮/审批记录/预测）
```sql
wf_activity_instance(
  id PK, instance_id FK, node_id, node_type, node_name, tenant_id,
  assignee, start_time, end_time, status[RUNNING|COMPLETED|CANCELLED],
  mi_group_id)          -- MI 子实例同组（高亮去重、预测区分"同节点已完成/活跃"）
```

### E.6 必备语义能力对照（表↔操作）
| 操作 | 依赖 |
|---|---|
| 驳回到发起节点 | wf_execution（取消当前节点全部令牌，含 MI 组）+ 在 instance 上重启发起节点令牌 + rejected 变量 |
| 会签/或签完成判定 | wf_execution MI 组计数（完成数/总数）+ 完成条件求值器 |
| 加签/转签 | wf_execution 增删子令牌（删除不计完成） |
| 委派 | wf_task.delegation_state + owner |
| 变更历史回放（changeState 审计） | 建议 wf_instance_mutation 审计表（action, payload, operator, time） |

---

## F. 迁移缺口 / 风险清单（设计存在、引擎未闭环）
1. 审批人 `type=expression` / `dept_head`：设计器与校验支持，后端无解析/执行（当前部署校验会因"未配置审批人"通过 expression 分支，但运行时无 assignee 来源）。
2. 撤回（recall）：`allowRecall` 配置无运行时 API。
3. 审批人去重 deduplication（AUTO_PASS/SKIP/ESCALATE）：无运行时实现。
4. 节点超时 timeout（remind/escalate）：无调度实现。
5. 编号规则 numberRule：无生成实现。
6. addSign/delegate 的服务端权限未强制（仅 transfer 强制）。
7. complete 后"下一任务"按单任务假设（singleResult），并行网关多任务场景取值不完整。
8. 待办/已办 processName、initiator 过滤在内存中做，分页 total 不准确（自研应下沉 SQL）。
