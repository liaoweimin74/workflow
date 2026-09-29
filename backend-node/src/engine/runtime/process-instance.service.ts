import { randomBytes } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { Kysely } from 'kysely'
import { BusinessException } from '../../common/exception/business-exception'
import { snapshotAssigneeResolvers } from './assignee-resolver-registry'
import { EngineException } from '../../common/exception/engine-exception'
import { PageResponse } from '../../common/domain/page-response'
import { KYSELY } from '../../framework/database/database.module'
import type { DB } from '../../framework/database/types'
import { assertPageSize } from '../../framework/http/query-params'
import { getTenantId } from '../../framework/tenant/tenant-context'
import type { ProcessModel, ProcessPolicy, ResolutionContext } from '../process/compiler/process-model'
import { randomUuid } from '../process/process-design.service'
import { EngineRuntime, type EngineState } from './engine-runtime'
import { EnginePersistence, type InstanceRow } from './engine-persistence'
import { BackendLogicHook, newlyCompletedEndEventNodeIds } from '../logic/backend-logic-hook'
import { ProcessDesignRepository } from '../process/repository/process-design.repository'
import { parseProcessPolicy, renderProcessTemplate } from '../process/compiler/process-policy'

/** 新实例启动前没有任何已完成活动（`newlyCompletedEndEventNodeIds` 的「空快照」）。 */
const EMPTY_ACTIVITY_IDS: ReadonlySet<string> = new Set<string>()

/**
 * 流程实例服务，对齐 Java `ProcessInstanceService` 与 `ProcessHistoryService`。
 *
 * 关键行为（对齐 Java，逐条核实过）：
 *   - 启动后**自动完成发起人节点**（由引擎的 autoCompleteInitiator 实现），
 *     并写一条 action='submit' 的审批意见
 *   - 完成/驳回也写审批意见（action='approve' / 'reject'）
 *   - `instanceGet` 的 `currentNode` 实测为 **null**，而历史列表里同一运行中实例
 *     的 `currentNode` 是当前节点名 —— 两个端点的行为不同，此处分别复刻
 */

export interface StartProcessResult {
  id: string
  processDefinitionId: string
  processDefinitionKey: string
  businessKey: string | null
  tenantId: string
}

export interface ProcessInstanceVO {
  id: string
  processDefinitionId: string
  processDefinitionKey: string
  processDefinitionName: string | null
  businessKey: string | null
  tenantId: string
  ended: boolean
  suspended: boolean
  status: string
  name: string | null
  currentNode: string | null
  startTime: Date
}

export interface ExecutionNodeVO {
  activityId: string
  activityName: string | null
  type: string
  status: 'completed' | 'active' | 'predicted'
  action: string | null
  assigneeName: string | null
  candidateNames: string[] | null
  comment: string | null
  endTime: Date | null
  hasBranch: boolean
  lineType: 'solid' | 'dashed'
  multiMode: string | null
  targetUserName: string | null
}

function newId(): string {
  return randomBytes(16).toString('hex')
}

/**
 * 执行实例是否还活着（对齐 Flowable：流程实例结束 ⇒ 执行实例被删除）。
 *
 * 只有 `RUNNING` / `SUSPENDED` 才允许读写变量；`COMPLETED` / `TERMINATED` 抛
 * `EngineException`（⇒ HTTP 400 + `流程引擎错误: ...` 前缀，与 Java 一致）。
 * 消息里的 id 用**实例 id** —— Flowable 的根执行 id 就是流程实例 id。
 */
function assertExecutionAlive(row: InstanceRow): void {
  if (row.status === 'COMPLETED' || row.status === 'TERMINATED') {
    throw new EngineException(`execution ${row.id} doesn't exist`)
  }
}

@Injectable()
export class ProcessInstanceService {
  constructor(
    @Inject(KYSELY) private readonly db: Kysely<DB>,
    private readonly persistence: EnginePersistence,
    private readonly backendLogic: BackendLogicHook,
    /** 可选注入：测试手动 new 时不传；策略读取降级为空配置。 */
    private readonly designRepo?: ProcessDesignRepository,
  ) {}

  // ------------------------------------------------------------ 启动

  /** 读流程级策略（start 用；配置缺失/无 repo 安全降级为空策略）。 */
  private async loadStartPolicy(defId: string) {
    if (this.designRepo === undefined) return parseProcessPolicy(null)
    const config = await this.designRepo.findNodeConfig(defId, '__PROCESS__')
    return parseProcessPolicy(config?.config_json ?? null)
  }

  async start(
    processKey: string,
    businessKey: string | null,
    variables: Record<string, unknown> | undefined,
    startUserId?: string | null,
  ): Promise<StartProcessResult> {
    const tenantId = getTenantId()
    const def = await this.persistence.findLatestDeployedDef(tenantId, processKey)
    if (def === null) {
      throw new EngineException(`未找到已部署的流程定义: ${processKey}`)
    }

    // 流程级策略：start 门禁（可发起范围）与标题/摘要共用一次解析（Task 76）
    const startPolicy = await this.loadStartPolicy(def.id)
    // 发起人锚定**服务端登录身份**（startUserId）：
    //   - variables.initiator 由客户端传入，可伪造（Task 76 同款顾虑），仅作无登录态
    //     （系统内部调用等 startUserId 为空场景）的兜底；
    //   - 撤回（recallInstance 按 instance.initiator 判定）、发起节点待办（initiator_self）
    //     都依赖该值 —— 缺失会导致「admin 发起的流程撤回时提示只有发起人可撤回」。
    const initiator = startUserId ?? extractInitiator(variables)
    await this.assertStartAllowed(startPolicy, startUserId ?? null)

    const model = JSON.parse(def.model_json) as ProcessModel
    const state: EngineState = {
      status: 'RUNNING',
      executions: [],
      activities: [],
      tasks: [],
      joinArrivals: {},
      activeBranchSets: {},
    }

    const now = new Date()
    // 生产必须用 UUID 工厂：id 是全表主键，序号只在一个 runtime 内唯一（见引擎构造函数注释）
    const runtime = new EngineRuntime(
      model,
      state,
      () => new Date(),
      () => randomUuid(),
      // to_admin 兜底/转派目标：流程级审批管理员优先，未配置回落全局 admin
      await this.buildResolutionContext(startPolicy.adminUserIds[0] ?? undefined, initiator ?? null),
      {},
      snapshotAssigneeResolvers(),
    )
    runtime.start({ initiator: initiator ?? undefined, variables: variables ?? {} })

    // 流程级策略：自定义审批标题 / 自定义摘要 → 内部变量（随 replaceRuntimeRows 落库；startPolicy 已在门禁处解析）
    if (startPolicy.titlePattern !== null) {
      runtime.setVariable(
        '__instanceTitle',
        renderProcessTemplate(startPolicy.titlePattern, {
          processName: def.name ?? processKey,
          initiator,
          variables: runtime.getVariables(),
        }),
      )
    }
    if (startPolicy.summaryFields.length > 0) {
      const allVars = runtime.getVariables()
      runtime.setVariable(
        '__instanceSummary',
        startPolicy.summaryFields
          .map((f) => {
            const v = allVars[f]
            return `${f}:${v === undefined || v === null || typeof v === 'object' ? '' : String(v)}`
          })
          .join(' '),
      )
    }

    // ⚠️ 实例 ID 必须是 **UUID**：Flowable 的流程实例 ID 就是 UUID，
    //    而草稿/配置表用的是 32 位 hex。两者都被规范化器识别为占位符，
    //    但占位符不同（<UUID> vs <ID>），用错会直接契约失败。
    const instanceId = randomUuid()
    await this.persistence.insertInstance({
      id: instanceId,
      tenant_id: tenantId,
      process_def_id: def.id,
      process_key: processKey,
      process_name: def.name,
      business_key: businessKey,
      status: state.status === 'COMPLETED' ? 'COMPLETED' : 'RUNNING',
      initiator,
      parent_instance_id: null,
      parent_node_id: null,
      start_time: now,
      end_time: state.status === 'COMPLETED' ? now : null,
      delete_reason: null,
    })

    // 期望版本 **0**：实例刚由 `insertInstance` 写入（lock_version 从 0 起），CAS 必然成功，
    // 并把版本推进到 1 —— 后续请求一律以 `loadState` 读到的版本为准。
    await this.persistence.replaceRuntimeRows(instanceId, tenantId, state, runtime.getVariables(), 0)

    // 发起人节点的 submit 意见（对齐 Java autoCompleteInitiatorTask）
    const initiatorTask = state.tasks.find(
      (t) => t.nodeId === model.initiatorNodeId && t.status === 'COMPLETED',
    )
    if (initiatorTask !== undefined) {
      await this.insertComment(tenantId, {
        taskId: initiatorTask.id,
        instanceId,
        userId: initiator ?? '',
        action: 'submit',
        comment: null,
        targetUserId: null,
      })
    }

    // 引擎自动结果（启动时即遇到的自动通过/跳过/自动拒绝节点）→ 补审批意见
    for (const auto of runtime.getAutoCompletedTasks()) {
      if (auto.taskId === initiatorTask?.id) continue
      await this.insertComment(tenantId, {
        taskId: auto.taskId,
        instanceId,
        userId: 'system',
        action:
          auto.action === 'approve' ? 'approve' : auto.action === 'refuse' ? 'refuse' : 'system',
        comment:
          auto.comment ??
          (auto.action === 'approve'
            ? '自动通过'
            : auto.action === 'refuse'
              ? '自动拒绝'
              : '未找到办理人，自动跳过'),
        targetUserId: null,
      })
    }

    // 审批类型 auto_reject：启动即自动拒绝 → 终止实例（TERMINATED）
    if (runtime.isAutoRefused()) {
      await this.persistence.terminateInstance(instanceId, '自动拒绝')
    }

    // 节点 notify.sms=true 的新建待办 → 短信通知记录（占位表，后续接入网关）
    // 流程级 summaryShowInSms=true 且已渲染摘要 → 文案尾部附摘要
    const summaryValue = runtime.getVariables()['__instanceSummary']
    const summaryText =
      startPolicy.summaryShowInSms && typeof summaryValue === 'string' && summaryValue !== ''
        ? `【${summaryValue}】`
        : ''
    for (const task of state.tasks) {
      if (task.status !== 'CREATED' && task.status !== 'CLAIMED') continue
      const node = model.nodes[task.nodeId]
      if (node?.notify?.sms !== true) continue
      await this.db
        .insertInto('wf_engine_notify')
        .values({
          id: randomUuid(),
          tenant_id: tenantId,
          instance_id: instanceId,
          task_id: task.id,
          notify_type: 'SMS_NODE',
          target_user: task.assignee ?? '',
          content: `您有新的办理任务：${node.name ?? task.nodeId}${summaryText}`,
          status: 'PENDING',
          created_at: new Date(),
        })
        .execute()
    }

    // 节点级后端逻辑：用户任务 ENTER（对齐 Java `ACTIVITY_STARTED(userTask)`）。
    // ⚠️ 刻意**不**跑「流程开始 ENTER」—— Java 的 PROCESS_STARTED 分支把 processInstanceId
    //    当成 nodeId 传，与 node_id 永不匹配（规格 U38 记录的 Java 缺陷），
    //    「同样不触发」才是等价实现。见 BackendLogicExecutor 的类注释。
    // ⚠️ 两次调用共用同一个变量对象：`runtime.getVariables()` 是**浅拷贝**，
    //    各取一份会让后一次落库覆盖前一次的 `resultVar`（与 completeTask 同一坑）。
    const logicVars = runtime.getVariables()
    await this.backendLogic.run(
      def.id,
      instanceId,
      state.tasks.filter((t) => t.status === 'CREATED' || t.status === 'CLAIMED').map((t) => t.nodeId),
      'ENTER',
      logicVars,
    )
    // 本次走到的结束事件（流程启动即结束的场景，含子流程内部的 endEvent）→ COMPLETE 触发
    await this.backendLogic.run(
      def.id,
      instanceId,
      newlyCompletedEndEventNodeIds(state, EMPTY_ACTIVITY_IDS),
      'COMPLETE',
      logicVars,
    )

    return {
      id: instanceId,
      processDefinitionId: def.id,
      processDefinitionKey: processKey,
      businessKey,
      tenantId,
    }
  }

  // ------------------------------------------------------------ 查询

  async getInstance(instanceId: string): Promise<ProcessInstanceVO> {
    const tenantId = getTenantId()
    const row = await this.persistence.findInstance(instanceId, tenantId)
    if (row === null) throw new BusinessException(`流程实例不存在: ${instanceId}`)

    return {
      id: row.id,
      processDefinitionId: row.process_def_id,
      processDefinitionKey: row.process_key,
      processDefinitionName: row.process_name,
      businessKey: row.business_key,
      tenantId: row.tenant_id,
      ended: row.status === 'COMPLETED' || row.status === 'TERMINATED',
      suspended: row.status === 'SUSPENDED',
      status: statusText(row.status),      name: null,
      // 实测：instanceGet 的 currentNode 为 null（与历史列表不同，见类注释）
      currentNode: null,
      startTime: row.start_time,
    }
  }

  /**
   * 挂起实例（对齐 Flowable `suspendProcessInstanceById`）。
   *
   * ⚠️ 挂起**不改变「运行中」的语义**：`listRunningInstances` 的过滤条件
   *    是 `status IN ('RUNNING','SUSPENDED')`，挂起的实例仍出现在运行列表中
   *    —— 与 Flowable 的 `ProcessInstanceQuery` 一致。
   */
  async suspendInstance(instanceId: string): Promise<void> {
    await this.requireInstance(instanceId)
    await this.persistence.updateInstanceStatus(instanceId, 'SUSPENDED', null)
  }

  /** 恢复实例（对齐 Flowable `activateProcessInstanceById`）。 */
  async resumeInstance(instanceId: string): Promise<void> {
    await this.requireInstance(instanceId)
    await this.persistence.updateInstanceStatus(instanceId, 'RUNNING', null)
  }

  /**
   * 终止实例（对齐 Flowable `deleteProcessInstance(id, reason)`）。
   *
   * Java 的 handler 在 `reason` 为空时传的是字面量 `"User terminated"`。
   */
  async terminateInstance(instanceId: string, reason: string | null): Promise<void> {
    await this.requireInstance(instanceId)
    await this.persistence.terminateInstance(
      instanceId,
      reason === null || reason === '' ? 'User terminated' : reason,
    )
  }

  /**
   * 再次发起（设计器发起节点 `initiator.reInitiate=false` 时拦截）。
   *
   * 语义（对齐钉钉「再次发起」）：
   *   - 仅**已结束**实例可再次发起（RUNNING/SUSPENDED → 400）
   *   - 发起节点配置 reInitiate === false → 400「该流程不支持再次发起」
   *   - 仅原发起人可再次发起（v1 不做管理员豁免，避免引入角色查询）
   *   - 复制原实例**全部流程变量**作为新实例的发起变量（含 initiator，
     便于审批人解析 `${initiator}` 一类表达式；过程变量一并带出属可接受简化）
   *
   * ⚠️ reInitiate 校验读**最新部署版本**的发起节点配置，而不是原实例的冻结版本
   *    —— 用户在设计器关掉「再次发起」后，期望对**当下**的再次发起操作立即生效
   *    （操作发生在当下，配置也应取当下）；实例运行态仍按各自的冻结版本，互不影响。
   * ⚠️ 不能走 `getVariables`：它对已结束实例 assertExecutionAlive 抛 400
   *    （对齐 Flowable 的行为）。再次发起恰恰只发生在实例结束后，
   *    因此直接 loadState 读变量（结束实例的 wfe_variable 行仍在）。
   */
  async reInitiate(instanceId: string, userId: string): Promise<StartProcessResult> {
    const tenantId = getTenantId()
    const row = await this.requireInstance(instanceId)

    if (row.status === 'RUNNING' || row.status === 'SUSPENDED') {
      throw new BusinessException(400, '流程仍在进行中，无法再次发起')
    }
    if (row.initiator !== null && row.initiator !== '' && row.initiator !== userId) {
      throw new BusinessException(403, '只有发起人可以再次发起')
    }

    const latestDef = await this.persistence.findLatestDeployedDef(tenantId, row.process_key)
    if (latestDef !== null) {
      const model = JSON.parse(latestDef.model_json) as ProcessModel
      const initiatorNodeId = model.initiatorNodeId ?? ''
      const initiatorNode = initiatorNodeId !== '' ? model.nodes[initiatorNodeId] : undefined
      if (initiatorNode?.initiatorOptions?.reInitiate === false) {
        throw new BusinessException(400, '该流程不支持再次发起')
      }
    }

    const { variables } = await this.persistence.loadState(instanceId)
    const startVariables: Record<string, unknown> = { ...variables }
    if (row.initiator !== null && row.initiator !== '') {
      startVariables.initiator = row.initiator
    }

    return this.start(row.process_key, row.business_key, startVariables, userId)
  }

  private async requireInstance(instanceId: string): Promise<InstanceRow> {
    const row = await this.persistence.findInstance(instanceId, getTenantId())
    if (row === null) throw new BusinessException(`流程实例不存在: ${instanceId}`)
    return row
  }

  async listInstances(page: number, size: number): Promise<PageResponse<ProcessInstanceVO>> {
    assertPageSize(size)
    const tenantId = getTenantId()
    const safePage = Math.max(page, 1)
    const { rows, total } = await this.persistence.listRunningInstances(
      tenantId,
      (safePage - 1) * size,
      size,
    )
    return new PageResponse(await this.toVOs(rows, tenantId, false), safePage, size, total)
  }

  async listHistory(page: number, size: number): Promise<PageResponse<ProcessInstanceVO>> {
    assertPageSize(size)
    const tenantId = getTenantId()
    const safePage = Math.max(page, 1)
    const { rows, total } = await this.persistence.listAllInstances(
      tenantId,
      (safePage - 1) * size,
      size,
    )
    return new PageResponse(await this.toVOs(rows, tenantId, true), safePage, size, total)
  }

  /** 历史列表里 currentNode 取当前活动节点名（与 instanceGet 不同，见类注释）。 */
  private async toVOs(
    rows: InstanceRow[],
    _tenantId: string,
    fillCurrentNode: boolean,
  ): Promise<ProcessInstanceVO[]> {
    const out: ProcessInstanceVO[] = []
    for (const row of rows) {
      const ended = row.status === 'COMPLETED' || row.status === 'TERMINATED'
      let currentNode: string | null = null
      // ⚠️ 只有历史列表填 currentNode —— 实测：运行中列表的该字段是 null（与 instanceGet 一致）
      if (fillCurrentNode && !ended) {
        const active = await this.persistence.findActiveActivities(row.id)
        const first = active[0]
        if (first !== undefined) {
          const model = await this.loadModel(row.process_def_id)
          currentNode = model?.nodes[first.node_id]?.name ?? null
        }
      }
      out.push({
        id: row.id,
        processDefinitionId: row.process_def_id,
        processDefinitionKey: row.process_key,
        processDefinitionName: row.process_name,
        businessKey: row.business_key,
        tenantId: row.tenant_id,
        ended,
        suspended: row.status === 'SUSPENDED',
        status: ended ? 'completed' : statusText(row.status),
        name: null,
        currentNode,
        startTime: row.start_time,
      })
    }
    return out
  }

  async getHighlight(instanceId: string): Promise<{
    completedActivityIds: string[]
    activeActivityIds: string[]
  }> {
    const tenantId = getTenantId()
    const row = await this.persistence.findInstance(instanceId, tenantId)
    if (row === null) throw new BusinessException(`流程实例不存在: ${instanceId}`)

    const activities = await this.persistence.findActivitiesOrdered(instanceId)

    const dedup = (ids: string[]): string[] => [...new Set(ids)]
    return {
      // 已完成：有结束时间的活动，按时间顺序
      completedActivityIds: dedup(
        activities.filter((a) => a.end_time !== null).map((a) => a.node_id),
      ),
      // ⚠️ 语义与字段名不符，但必须照抄：Java 查的是 runtime 的活动实例表，
      //    返回的是该实例**走过的全部活动**（含已结束的），而不只是当前活跃的。
      //    实测：completed 4 个 / active 5 个 —— active 恰是 completed 加上当前节点。
      activeActivityIds: dedup(activities.map((a) => a.node_id)),
    }
  }

  async getVariables(instanceId: string): Promise<Record<string, unknown>> {
    const tenantId = getTenantId()
    const row = await this.persistence.findInstance(instanceId, tenantId)
    if (row === null) throw new BusinessException(`流程实例不存在: ${instanceId}`)
    // ⚠️ 实例**已结束**时执行实例已被删除 ⇒ 读变量报 400
    //    `流程引擎错误: execution <id> doesn't exist`（Flowable 的原话，契约场景
    //    「节点后端逻辑（HTTP 动作）」的 blVarsAfterFinish 实测钉住）。
    //    这不是缺陷而是现状：前端拿不到「已结束实例的变量」这个能力。
    //    判据用「实例状态」而不是「有没有变量行」—— 结束的实例仍然留着 wfe_variable 行。
    assertExecutionAlive(row)
    const { variables } = await this.persistence.loadState(instanceId)
    return variables
  }

  /**
   * 取单个流程变量。
   *
   * ⚠️ 变量不存在时返回 **null**，不是 404 —— Java 走
   *    `runtimeService.getVariable(pi, name)`，Flowable 对不存在的变量返回 null，
   *    于是响应是 `{code:200, data:null}`。把它写成 404 会让前端拿不到
   *    「这个变量没有值」这个正常状态。
   */
  async getVariable(instanceId: string, name: string): Promise<unknown> {
    const variables = await this.getVariables(instanceId)
    return variables[name] ?? null
  }

  /** 批量设置流程变量（合并语义：未提及的变量保持原值）。 */
  async setVariables(instanceId: string, variables: Record<string, unknown>): Promise<void> {
    const tenantId = getTenantId()
    const row = await this.persistence.findInstance(instanceId, tenantId)
    if (row === null) throw new BusinessException(`流程实例不存在: ${instanceId}`)
    // 写变量同样要执行实例活着（Flowable 的 `setVariable` 在已结束实例上也是同一条错误）
    assertExecutionAlive(row)
    const loaded = await this.persistence.loadState(instanceId)
    await this.persistence.replaceVariables(
      instanceId,
      { ...loaded.variables, ...variables },
      loaded.lockVersion,
    )
  }

  /** 设置单个流程变量。 */
  async setVariable(instanceId: string, name: string, value: unknown): Promise<void> {
    await this.setVariables(instanceId, { [name]: value })
  }

  /**
   * 删除流程变量。
   *
   * 变量不存在时**静默成功**（Flowable 的 `removeVariable` 也是幂等的）。
   */
  async removeVariable(instanceId: string, name: string): Promise<void> {
    const tenantId = getTenantId()
    const row = await this.persistence.findInstance(instanceId, tenantId)
    if (row === null) throw new BusinessException(`流程实例不存在: ${instanceId}`)
    assertExecutionAlive(row)
    const loaded = await this.persistence.loadState(instanceId)
    const current = loaded.variables
    delete current[name]
    await this.persistence.replaceVariables(instanceId, current, loaded.lockVersion)
  }

  /**
   * 经任务设置流程变量（写到该任务所属的实例上）。
   *
   * ⚠️ 任务不存在时 Java 抛的是 `IllegalStateException("Task not found: " + taskId)`
   *    —— 普通异常 → **HTTP 500**，不是业务 200。这里用普通 Error 保持同样的状态码。
   *    写成 BusinessException 会把 500 悄悄变成 200，属于契约分叉。
   */
  async setTaskVariables(taskId: string, variables: Record<string, unknown>): Promise<void> {
    const task = await this.persistence.findTaskWithInstance(taskId, getTenantId())
    if (task === null) {
      throw new Error(`Task not found: ${taskId}`)
    }
    await this.setVariables(task.instance_id, variables)
  }

  /**
   * 审批时间线（对齐 Java `ProcessHistoryService.getApprovalHistory`）。
   *
   * ⚠️ **以「活动实例」为主体，不是以「审批意见」为主体**（规格 U26）：
   *    Java 取的是历史活动实例里 `activityType=userTask` 的那些，**每一次节点激活都是一条**，
   *    再把该次激活对应任务的审批意见挂上去。所以「活跃但还没有意见」的那次激活
   *    **也在列表里**（`endTime` 为 null、`action`/`comment` 为 null）。
   *    旧实现按 `wf_task_comment` 逐条映射，会把这种节点整条丢掉 —— 驳回后发起人节点
   *    被重新激活时，前端时间线就少一步（契约里表现为**长度告警**）。
   *
   * ⚠️ **活动与任务的配对**：`wfe_activity` 上没有 assignee / task_id 列（Java 的
   *    `HistoricActivityInstance` 两者都有，是 Flowable 写进去的）。这里按
   *    `(execution_id, node_id)` 分组、**各自按时间升序一一认领**：同一执行同一节点的
   *    第 i 次激活，对应该组合下的第 i 个任务。驳回把 token 移回发起人节点复用同一个
   *    执行，正是"同执行同节点多次激活"的来源。
   */
  async getHistory(instanceId: string): Promise<
    Array<{
      activityId: string
      activityName: string | null
      action: string | null
      assignee: string | null
      assigneeName: string | null
      comment: string | null
      startTime: Date | null
      endTime: Date | null
    }>
  > {
    const tenantId = getTenantId()
    const row = await this.persistence.findInstance(instanceId, tenantId)
    if (row === null) throw new BusinessException(`流程实例不存在: ${instanceId}`)

    const [activities, tasks, comments, model] = await Promise.all([
      this.persistence.findActivitiesForHistory(instanceId),
      this.persistence.findTasks(instanceId),
      this.db
        .selectFrom('wf_task_comment')
        .selectAll()
        .where('process_instance_id', '=', instanceId)
        .orderBy('created_at', 'asc')
        .execute(),
      this.loadModel(row.process_def_id),
    ])

    // 意见按 taskId 分组取**最后一条**（Java 用 toMap 的 merge 保留 replacement）
    const commentByTaskId = new Map<string, (typeof comments)[number]>()
    for (const comment of comments) commentByTaskId.set(comment.task_id, comment)

    // 任务按 (execution_id, node_id) 时间升序排队，供活动逐个认领
    const pool = new Map<string, Array<{ id: string; assignee: string | null }>>()
    for (const task of [...tasks].sort((a, b) => a.create_time.getTime() - b.create_time.getTime())) {
      const key = `${task.execution_id ?? ''}|${task.node_id}`
      const queue = pool.get(key) ?? []
      queue.push({ id: task.id, assignee: task.assignee })
      pool.set(key, queue)
    }

    const userActivities = activities.filter((a) => a.node_type === 'userTask')
    const names = await this.persistence.findUserNames([
      ...new Set(
        userActivities
          .map((a) => pool.get(`${a.execution_id ?? ''}|${a.node_id}`)?.[0]?.assignee)
          .filter((id): id is string => id !== undefined && id !== null && id !== ''),
      ),
    ])

    return userActivities.map((activity) => {
      const task = pool.get(`${activity.execution_id ?? ''}|${activity.node_id}`)?.shift()
      const comment = task === undefined ? undefined : commentByTaskId.get(task.id)
      const assignee = task?.assignee ?? null
      return {
        activityId: activity.node_id,
        // 优先用活动上记的名字（发放当时的名字），回退到当前模型
        activityName: activity.node_name ?? model?.nodes[activity.node_id]?.name ?? null,
        action: comment?.action ?? null,
        assignee,
        assigneeName: assignee === null ? null : (names.get(assignee) ?? null),
        comment: comment?.comment ?? null,
        startTime: activity.start_time,
        endTime: activity.end_time,
      }
    })
  }

  /**
   * 待办预测：已发生的活动（completed/active）+ 从当前节点向前推演的后续节点（predicted）。
   *
   * 对齐 Java `ProcessTaskPredictionService` 的**可观测形状**：
   *   completed/active → lineType 'solid'；predicted → 'dashed'；
   *   发起人节点带 action 'submit'，其余 action 为 null。
   *
   * 说明：Java 版还会按历史耗时、分支概率做加权推演（553 行）；P1 只做
   * 确定性的前向遍历（单分支顺序推演），多分支与子流程的推演留到 P2。
   */
  async getPrediction(instanceId: string): Promise<ExecutionNodeVO[]> {
    const tenantId = getTenantId()
    const row = await this.persistence.findInstance(instanceId, tenantId)
    if (row === null) throw new BusinessException(`流程实例不存在: ${instanceId}`)

    const model = await this.loadModel(row.process_def_id)
    if (model === null) throw new EngineException(`缺少流程模型: ${row.process_def_id}`)

    const [activities, tasks] = await Promise.all([
      this.persistence.findActivitiesOrdered(instanceId),
      this.persistence.findTasks(instanceId),
    ])
    const completed = activities.filter((a) => a.end_time !== null)
    const active = activities.filter((a) => a.end_time === null)
    // 节点的结束时间：取该节点最后一次活动的 endTime（预测列表里要回填）
    const endTimeByNode = new Map<string, Date>()
    for (const a of activities) {
      if (a.end_time !== null) endTimeByNode.set(a.node_id, a.end_time)
    }

    const activeSet = new Set(active.map((a) => a.node_id))
    const completedOrder: string[] = []
    for (const a of completed) {
      // 连线也会记活动实例（对齐 Flowable），但预测列表里只应有真实节点
      if (model.nodes[a.node_id] === undefined) continue
      if (model.nodes[a.node_id].nodeType === 'startEvent') continue
      if (!completedOrder.includes(a.node_id)) completedOrder.push(a.node_id)
    }

    const assignees = new Map(tasks.map((t) => [t.node_id, t.assignee]))
    const names = await this.persistence.findUserNames(
      tasks.map((t) => t.assignee ?? '').filter((id) => id !== ''),
    )

    const out: ExecutionNodeVO[] = []
    const push = (nodeId: string, status: ExecutionNodeVO['status']): void => {
      const node = model.nodes[nodeId]
      if (node === undefined) return
      const assignee = assignees.get(nodeId) ?? null
      out.push({
        activityId: nodeId,
        activityName: node.name === '' ? null : node.name,
        type: node.nodeType,
        status,
        action: node.isInitiator && status === 'completed' ? 'submit' : null,
        assigneeName: assignee === null ? null : (names.get(assignee) ?? null),
        candidateNames: null,
        comment: null,
        endTime: status === 'predicted' ? null : (endTimeByNode.get(nodeId) ?? null),
        hasBranch: node.outgoing.length > 1,
        lineType: status === 'predicted' ? 'dashed' : 'solid',
        multiMode:
          node.approval !== undefined && node.approval.multiMode !== 'single'
            ? node.approval.multiMode
            : null,
        targetUserName: null,
      })
    }

    for (const nodeId of completedOrder) push(nodeId, 'completed')
    for (const nodeId of activeSet) {
      if (model.nodes[nodeId] === undefined) continue
      push(nodeId, 'active')
    }

    // 从当前活动节点向前推演（确定性单路径；遇到分支或汇聚即停止）
    let cursor = [...activeSet][0]
    const visited = new Set([...completedOrder, ...activeSet])
    let guard = 0
    while (cursor !== undefined && guard++ < 100) {
      const node = model.nodes[cursor]
      if (node === undefined || node.outgoing.length !== 1) break
      const flow = model.flows[node.outgoing[0]]
      if (flow === undefined) break
      const nextId = flow.targetId
      if (visited.has(nextId)) break
      visited.add(nextId)
      const nextNode = model.nodes[nextId]
      if (nextNode === undefined) break
      push(nextId, 'predicted')
      if (nextNode.nodeType === 'endEvent') break
      cursor = nextId
    }

    return out
  }

  // ------------------------------------------------------------ 辅助

  async loadModel(processDefId: string): Promise<ProcessModel | null> {
    const def = await this.persistence.findProcessDefById(processDefId)
    if (def === null) return null
    return JSON.parse(def.model_json) as ProcessModel
  }

  /**
   * start() 可发起范围门禁（Task 76）：
   * - starterScope.mode=ALL → 不校验（向后兼容，存量流程行为不变）
   * - SPECIFIED → 系统管理员（username='admin'）绕过；否则发起人须命中 userIds
   *   名单或拥有 roleIds 任一角色（sys_role.role_code，角色启用未删）
   * - startUserId 缺省（测试/内部调用未传）→ 不校验：门禁只认登录用户，
   *   不信任客户端 variables.initiator（可伪造）
   */
  private async assertStartAllowed(policy: ProcessPolicy, startUserId: string | null): Promise<void> {
    if (startUserId === null || startUserId === '') return
    const scope = policy.starterScope
    if (scope.mode !== 'SPECIFIED') return

    const userIdNum = Number(startUserId)
    if (Number.isFinite(userIdNum)) {
      // 系统管理员绕过（username='admin' 即全局 admin，与 page-access.guard 口径一致）
      const user = await this.db
        .selectFrom('sys_user')
        .select(['id', 'username'])
        .where('id', '=', userIdNum)
        .where('is_deleted', '=', 0)
        .executeTakeFirst()
      if (user !== undefined && user.username === 'admin') return
    }

    if (scope.userIds.includes(startUserId)) return

    if (scope.roleIds.length > 0) {
      const roleRows = await this.db
        .selectFrom('sys_user_role')
        .innerJoin('sys_role', 'sys_role.id', 'sys_user_role.role_id')
        .select('sys_role.role_code')
        .where('sys_user_role.user_id', '=', userIdNum)
        .where('sys_role.is_deleted', '=', 0)
        .where('sys_role.status', '=', 1)
        .execute()
      const codes = new Set(roleRows.map((r) => r.role_code).filter((c): c is string => c !== null))
      if (scope.roleIds.some((code) => codes.has(code))) return
    }

    throw new BusinessException(403, '您不在该流程的可发起人员范围内')
  }

  /**
   * 审批/办理人解析上下文（服务层预计算；与 TaskService 同一口径）。
   * adminUserId：sys_user 中 username='admin' 的用户。
   * initiatorSupervisor：发起人所属组织的负责人（V43：sys_organization.leader_id；
   *   supervisor 策略 / 表达式 initiator.deptManager 由降级变为真实生效）。
   * adminUserIdOverride：流程级审批管理员（adminUserIds[0]）传入时优先，to_admin 兜底/转派走流程管理员。
   */
  private async buildResolutionContext(
    adminUserIdOverride?: string,
    initiatorUserId?: string | null,
  ): Promise<ResolutionContext> {
    const admin = await this.db
      .selectFrom('sys_user')
      .select('id')
      .where('username', '=', 'admin')
      .where('is_deleted', '=', 0)
      .executeTakeFirst()
    let initiatorSupervisor: string | null = null
    if (initiatorUserId !== undefined && initiatorUserId !== null && initiatorUserId !== '') {
      initiatorSupervisor = await this.findOrgLeaderByUserId(initiatorUserId)
    }
    return {
      adminUserId: adminUserIdOverride ?? (admin === undefined ? null : String(admin.id)),
      initiatorSupervisor,
    }
  }

  /**
   * 用户所属组织的负责人用户 ID（V43：sys_user.org_id → sys_organization.leader_id）。
   * 无组织/组织无负责人/任一已删除 → null（引擎按策略降级）。
   */
  private async findOrgLeaderByUserId(userId: string): Promise<string | null> {
    const idNum = Number(userId)
    if (!Number.isFinite(idNum)) return null
    const row = await this.db
      .selectFrom('sys_user as u')
      .innerJoin('sys_organization as o', 'o.id', 'u.org_id')
      .select('o.leader_id')
      .where('u.id', '=', idNum)
      .where('u.is_deleted', '=', 0)
      .where('o.is_deleted', '=', 0)
      .executeTakeFirst()
    if (row === undefined || row.leader_id === null || row.leader_id === undefined) return null
    return String(row.leader_id)
  }

  async insertComment(
    tenantId: string,
    params: {
      taskId: string
      instanceId: string
      userId: string
      action: string
      comment: string | null
      targetUserId: string | null
      /** 手写签名 dataURL（V41；signature.enabled 节点 completeTask 时随 approve 意见存储） */
      signature?: string | null
    },
  ): Promise<void> {
    await this.db
      .insertInto('wf_task_comment')
      .values({
        id: newId(),
        tenant_id: tenantId,
        task_id: params.taskId,
        process_instance_id: params.instanceId,
        user_id: params.userId,
        action: params.action,
        comment: params.comment,
        signature: params.signature ?? null,
        target_user_id: params.targetUserId,
        created_at: new Date(),
      })
      .execute()
  }

  /**
   * 写一条转办审计（`wf_task_transfer`）。
   *
   * ⚠️ `fromUser` 传的是**改 assignee 之前**的办理人（Java 就是这么取的：
   *    `record.setFromUser(task.getAssignee())` 在 `setAssignee` 之后调用，
   *    但 `task` 是同一个已加载实体的旧快照 —— 这里必须由调用方先把旧值取出来）。
   *    该列 NOT NULL：旧办理人为 null 时会让数据库拒绝（→ 500），与 Java 一致。
   */
  async insertTaskTransfer(
    tenantId: string,
    params: {
      taskId: string
      instanceId: string
      fromUser: string
      toUser: string
      reason: string | null
    },
  ): Promise<void> {
    await this.db
      .insertInto('wf_task_transfer')
      .values({
        id: newId(),
        tenant_id: tenantId,
        task_id: params.taskId,
        process_instance_id: params.instanceId,
        from_user: params.fromUser,
        to_user: params.toUser,
        reason: params.reason,
        created_at: new Date(),
      })
      .execute()
  }
}

/** 从变量里取发起人 ID（对齐 Java 用 `initiator` 变量）。 */
export function extractInitiator(variables: Record<string, unknown> | undefined): string | null {
  const value = variables?.initiator
  if (typeof value === 'string' && value !== '') return value
  if (typeof value === 'number') return String(value)
  return null
}

/** 实例状态 → 响应里的 status 文本（Java 用 "running"/"completed"）。 */
/**
 * 实例状态 → 契约里的文案。
 *
 * ⚠️ Java 的映射规则是**按标志位**而不是按枚举名（两处 `toMap`/`toHistoricMap` 都一样）：
 *    `suspended → "suspended"`，`ended → "completed"`，否则 `"running"`。
 *    所以被**终止**的实例文案是 `"completed"`（Flowable 的历史实例状态就是已完成），
 *    不是 `"terminated"` —— 这里曾经按枚举名映射成 `terminated`，
 *    是契约场景「流程实例状态变更」把它抓出来的。
 */
function statusText(status: string): string {
  const suspended = status === 'SUSPENDED'
  const ended = status === 'COMPLETED' || status === 'TERMINATED'
  if (suspended) return 'suspended'
  return ended ? 'completed' : 'running'
}
