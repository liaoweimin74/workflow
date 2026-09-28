import { Inject, Injectable } from '@nestjs/common'
import { Kysely } from 'kysely'
import { BusinessException } from '../../common/exception/business-exception'
import { PageResponse } from '../../common/domain/page-response'
import { KYSELY } from '../../framework/database/database.module'
import { assertPageSize } from '../../framework/http/query-params'
import type { DB } from '../../framework/database/types'
import { getTenantId } from '../../framework/tenant/tenant-context'
import { EngineRuntime } from '../runtime/engine-runtime'
import { snapshotAssigneeResolvers } from '../runtime/assignee-resolver-registry'
import { extractFormConfig, randomUuid } from '../process/process-design.service'
import { EnginePersistence, type TaskJoinRow } from '../runtime/engine-persistence'
import { ProcessDesignRepository } from '../process/repository/process-design.repository'
import { BackendLogicHook, completedActivityIdSnapshot, newlyCompletedEndEventNodeIds } from '../logic/backend-logic-hook'
import { ProcessInstanceService } from '../runtime/process-instance.service'
import type { ProcessModel, ProcessPolicy, ResolutionContext } from '../process/compiler/process-model'
import { parseProcessPolicy, PROCESS_LEVEL_NODE_ID } from '../process/compiler/process-policy'

export { PROCESS_LEVEL_NODE_ID }

/** 节点配置里的跨表单映射（宽松解析，对齐前端 `FormFieldDataMapping`）。 */
interface DataMappingLike {
  targetField?: unknown
  source?: unknown
  sourceField?: unknown
}

/**
 * 任务服务，对齐 Java `WorkflowTaskService` 的可观测行为。
 *
 * 每个写操作都是「装载状态 → 用引擎推进 → 落库」的固定套路：
 *   引擎是纯内存的，持久化层负责装载/覆盖写入，服务层负责编排 + 写审批意见。
 */

export interface TaskTodoVO {
  taskId: string
  assignee: string | null
  businessKey: string | null
  processDefinitionId: string
  processInstanceId: string
  processName: string | null
  currentNodeName: string | null
  initiator: string | null
  initiatorName: string | null
  createTime: Date
  reminded: boolean
}

export interface TaskDoneVO extends Omit<TaskTodoVO, 'createTime'> {
  createTime: Date
  endTime: Date | null
  approveResult: string | null
  currentNode: string | null
}

export interface TaskDetailVO {
  taskId: string
  name: string | null
  description: string | null
  assignee: string | null
  assigneeName: string | null
  businessKey: string | null
  processDefinitionId: string
  processInstanceId: string
  processName: string | null
  processVersion: number | null
  initiator: string | null
  initiatorName: string | null
  createTime: Date
  isInitiatorTask: boolean
  /** 节点类别：initiator / approver / handler（运行时按钮区分；旧数据=approver）。 */
  taskRole: 'initiator' | 'approver' | 'handler'
  /** 节点级行为开关（前端按钮/表单渲染用；已与流程级 commentPolicy/signaturePolicy 合并）。 */
  nodeFlags: {
    commentRequired: boolean
    signatureEnabled: boolean
    signatureRequired: boolean
    /** 默认使用上次签名（signature.useLast） */
    signatureUseLast: boolean
    /** 支持上传签名图片（signature.allowUpload） */
    signatureAllowUpload: boolean
  }
  /** 流程级策略透出（前端按此门禁评论区/召回按钮等）。 */
  processFlags: {
    commentDisabled: boolean
    commentDisallowDelete: boolean
    commentDisallowAttachment: boolean
    approveRecall: boolean
  }
  /** 上次签名 dataURL（仅 signature.useLast=true 时回查最近一条 approve 签名，供前端默认回填） */
  lastSignature: string | null
  formKey: string | null
  fieldPermissions: unknown
  mappedData: unknown
  operations: Record<string, boolean> | null
  variables: Record<string, unknown>
}

export interface CompleteTaskResponse {
  processInstanceId: string
  processFinished: boolean
  nextTaskId: string | null
  nextTaskName: string | null
  nextTaskDefinitionKey: string | null
  nextTaskAssignee: string | null
}

/**
 * 催办频率限制（小时），对齐 Java `@Value("${workflow.remind.frequency-hours:24}")`。
 * Java 的 `application.yml` 没有覆盖这个键，所以取默认值 24。
 */
const REMIND_FREQUENCY_HOURS = 24

/** 空串/空白视作 null（对齐 Java 的 `isBlank()`；注意也要处理 undefined）。 */
function blankToNullOf(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return value.trim() === '' ? null : value
}

@Injectable()
export class TaskService {
  constructor(
    @Inject(KYSELY) private readonly db: Kysely<DB>,
    private readonly persistence: EnginePersistence,
    private readonly instances: ProcessInstanceService,
    private readonly designRepo: ProcessDesignRepository,
    private readonly backendLogic: BackendLogicHook,
  ) {}

  // ------------------------------------------------------------ 列表

  async listTodo(assignee: string, page: number, size: number): Promise<PageResponse<TaskTodoVO>> {
    assertPageSize(size)
    const tenantId = getTenantId()
    const safePage = Math.max(page, 1)
    const { rows, total } = await this.persistence.findOpenTasksByAssignee(
      tenantId,
      assignee,
      (safePage - 1) * size,
      size,
    )
    const vos = await this.toTodoVOs(rows)
    return new PageResponse(vos, safePage, size, total)
  }

  async listHistoric(userId: string, page: number, size: number): Promise<PageResponse<TaskDoneVO>> {
    assertPageSize(size)
    const tenantId = getTenantId()
    const safePage = Math.max(page, 1)
    const { rows, total } = await this.persistence.findDoneTasksByUser(
      tenantId,
      userId,
      (safePage - 1) * size,
      size,
    )

    const names = await this.persistence.findUserNames(
      rows.map((r) => r.assignee ?? '').filter((id) => id !== ''),
    )
    const out: TaskDoneVO[] = []
    for (const row of rows) {
      const model = await this.instances.loadModel(row.process_def_id)
      const currentName = model?.nodes[row.node_id]?.name ?? null
      // done 列表里的 currentNode 是**这个任务之后**流转到的节点（实测确认）
      const nextNodeId = await this.findNextActivityAfter(row.instance_id, row.end_time ?? null)
      out.push({
        taskId: row.task_id,
        assignee: row.assignee,
        businessKey: row.business_key,
        processDefinitionId: row.process_def_id,
        processInstanceId: row.instance_id,
        processName: row.process_name,
        currentNodeName: currentName,
        currentNode: nextNodeId === null ? null : (model?.nodes[nextNodeId]?.name ?? null),
        initiator: row.initiator,
        initiatorName:
          row.initiator === null ? null : (names.get(row.initiator) ?? null),
        createTime: row.create_time,
        endTime: row.end_time ?? null,
        approveResult: await this.findApproveResult(row.task_id),
        reminded: await this.isReminded(row.task_id),
      })
    }
    return new PageResponse(out, safePage, size, total)
  }

  private async toTodoVOs(rows: TaskJoinRow[]): Promise<TaskTodoVO[]> {
    const names = await this.persistence.findUserNames([
      ...rows.map((r) => r.assignee ?? ''),
      ...rows.map((r) => r.initiator ?? ''),
    ])
    const out: TaskTodoVO[] = []
    for (const row of rows) {
      const model = await this.instances.loadModel(row.process_def_id)
      out.push({
        taskId: row.task_id,
        assignee: row.assignee,
        businessKey: row.business_key,
        processDefinitionId: row.process_def_id,
        processInstanceId: row.instance_id,
        processName: row.process_name,
        currentNodeName: model?.nodes[row.node_id]?.name ?? null,
        initiator: row.initiator,
        initiatorName: row.initiator === null ? null : (names.get(row.initiator) ?? null),
        createTime: row.create_time,
        reminded: await this.isReminded(row.task_id),
      })
    }
    return out
  }

  // ------------------------------------------------------------ 详情

  async getTaskDetail(taskId: string): Promise<TaskDetailVO> {
    const tenantId = getTenantId()
    const row =
      (await this.persistence.findTaskWithInstance(taskId, tenantId)) ??
      // Java 的历史回退：运行时任务已结束（完成/取消）时按**历史任务**返回 200，
      // 而不是 404。实测于「任务委派」的 dvTaskAfterComplete（委派任务被完成、
      // 流程已结束，Java 仍返回该任务的历史快照，assignee 是 resolve 后归还的 owner）。
      // ⚠️ 只有**读**路径能这样兜底；写路径必须仍然只认待办任务（见 EnginePersistence 注释）。
      (await this.persistence.findTaskIncludingFinished(taskId, tenantId))
    if (row === null) throw new BusinessException(`任务不存在: ${taskId}`)
    const model = await this.instances.loadModel(row.process_def_id)
    const node = model?.nodes[row.node_id]
    const { state, variables } = await this.persistence.loadState(row.instance_id)
    const names = await this.persistence.findUserNames([
      row.assignee ?? '',
      row.initiator ?? '',
    ])

    return {
      taskId,
      name: node?.name ?? null,
      description: null,
      assignee: row.assignee,
      assigneeName: row.assignee === null ? null : (names.get(row.assignee) ?? null),
      businessKey: row.business_key,
      processDefinitionId: row.process_def_id,
      processInstanceId: row.instance_id,
      processName: row.process_name,
      processVersion: versionOf(row.process_def_id),
      initiator: row.initiator,
      initiatorName: row.initiator === null ? null : (names.get(row.initiator) ?? null),
      createTime: row.create_time,
      isInitiatorTask: node?.isInitiator ?? false,
      taskRole: (node?.isInitiator ?? false)
        ? 'initiator'
        : (node?.taskRole ?? 'approver'),
      ...(await this.resolveEffectiveFlags(row.process_def_id, node)),
      // 上次签名回填：仅生效 useLast=true 时查该办理人最近一条带签名的 approve 意见
      lastSignature: await this.findLastSignatureIfUseLast(row.process_def_id, node, row.assignee),
      // 表单：节点级 `form` > 流程级 `__PROCESS__` `form`（整体取，不跨层合并，对齐 Java extractFormConfig）
      ...(await this.loadTaskForm(row.process_def_id, row.node_id)),
      // 跨表单数据映射（form.dataMappings → targetField/value）；无配置或解析为空时为 null
      mappedData: await this.loadMappedData(
        model,
        row.process_def_id,
        row.instance_id,
        row.node_id,
        variables,
      ),
      // operations 来自**部署版本的 NodeConfig 快照**，不是编译模型 ——
      // 编译模型里只有 serviceTask/callActivity 带 config，userTask 的按钮开关在 wf_node_config。
      operations: await this.loadOperations(row.process_def_id, row.node_id),
      variables: mergeMultiInstanceScope(state, taskId, node?.approval, variables),
    }
  }

  /**
   * 生效节点开关 + 流程级策略（nodeFlags 已与流程级 commentPolicy/signaturePolicy 合并）。
   *
   * 合并语义：
   *   - 意见必填：节点级 commentRequired OR 流程级 commentPolicy(enabled && scope=ALL)
   *   - 签名：流程级 enabled=false → 全部禁用；enabled=true 时节点未显式配置 → 用流程级默认项
   */
  private async resolveEffectiveFlags(
    processDefinitionId: string,
    node: ProcessModel['nodes'][string] | undefined,
  ): Promise<{
    nodeFlags: TaskDetailVO['nodeFlags']
    processFlags: TaskDetailVO['processFlags']
    policy: ProcessPolicy
  }> {
    const policy = await this.loadProcessPolicy(processDefinitionId)
    const commentRequired =
      node?.commentRequired === true ||
      (policy.commentPolicy.enabled && policy.commentPolicy.scope === 'ALL')
    const sig = policy.signaturePolicy
    // 节点显式配置优先；节点未配置时用流程级默认（同 completeTask 门禁口径）
    const sigEnabled = node?.signature?.enabled ?? sig.enabled
    return {
      nodeFlags: {
        commentRequired,
        signatureEnabled: sigEnabled,
        signatureRequired: sigEnabled ? (node?.signature?.required ?? sig.required) : false,
        signatureUseLast: sigEnabled ? (node?.signature?.useLast ?? sig.useLast) : false,
        signatureAllowUpload: sigEnabled
          ? (node?.signature?.allowUpload ?? sig.allowUpload)
          : false,
      },
      processFlags: {
        commentDisabled: policy.comment.disabled,
        commentDisallowDelete: policy.comment.disallowDelete,
        commentDisallowAttachment: policy.comment.disallowAttachment,
        approveRecall: policy.approveRecall,
      },
      policy,
    }
  }

  /** 上次签名回填（仅在生效 useLast=true 时查询，供前端默认回填）。 */
  private async findLastSignatureIfUseLast(
    processDefinitionId: string,
    node: ProcessModel['nodes'][string] | undefined,
    assignee: string | null,
  ): Promise<string | null> {
    const policy = await this.loadProcessPolicy(processDefinitionId)
    const sig = policy.signaturePolicy
    // 生效 useLast：节点签名链路生效时，节点显式值优先，否则落流程级默认
    const sigEnabled = node?.signature?.enabled ?? sig.enabled
    const useLast = sigEnabled ? (node?.signature?.useLast ?? sig.useLast) : false
    if (useLast !== true) return null
    return this.findLastSignature(getTenantId(), assignee)
  }

  /** 流程级策略（__PROCESS__ config_json 归一化；每次读库无缓存，配置表量小）。 */
  private async loadProcessPolicy(processDefinitionId: string): Promise<ProcessPolicy> {
    const row = await this.designRepo.findNodeConfig(
      processDefinitionId,
      PROCESS_LEVEL_NODE_ID,
    )
    return parseProcessPolicy(row?.config_json ?? null)
  }

  /**
   * 取节点的操作按钮开关（对齐 Java `WorkflowTaskService.extractOperations`）。
   *
   * ⚠️ **必须合并流程级 `__PROCESS__`**：Java 先读该部署版本的 `__PROCESS__`
   *    节点配置（流程级总控），再与节点级**逐字段 AND**。原先只读节点级，
   *    之所以一直没暴露，是因为契约场景的 `__PROCESS__` 恰好把权限都配成 true，
   *    AND 之后与节点级相同 —— 纯属巧合。流程级一旦把某个开关配成 false，
   *    两侧立刻分叉（而 `transfer` 的权限门槛正建立在同一个判断上）。
   */
  private async loadOperations(
    processDefinitionId: string,
    nodeId: string,
  ): Promise<Record<string, boolean>> {
    const [nodeConfig, processConfig] = await Promise.all([
      this.designRepo.findNodeConfig(processDefinitionId, nodeId),
      this.designRepo.findNodeConfig(processDefinitionId, PROCESS_LEVEL_NODE_ID),
    ])
    const nodeLevel = parseOperationsFromConfig(nodeConfig?.config_json ?? null)
    if (processConfig === null) {
      // 流程级未配置 ⇒ 等价于全开 ⇒ 直接返回节点级（Java 的 `!hasProcessLevel` 分支）
      return nodeLevel
    }
    const processLevel = parseProcessOperations(processConfig.config_json)
    const merged: Record<string, boolean> = {}
    for (const key of OPERATION_KEYS) merged[key] = processLevel[key] && nodeLevel[key]
    return merged
  }

  /**
   * 任务表单解析（对齐 Java `WorkflowTaskService.extractFormConfig`）：
   * 节点级 `form` > 流程级 `__PROCESS__` `form`，表单与字段权限作为整体从同一层取，
   * 不跨层合并（与发起页 resolveFormDefIds 同一套优先级语义）。
   */
  private async loadTaskForm(
    processDefinitionId: string,
    nodeId: string,
  ): Promise<{ formKey: string | null; fieldPermissions: Record<string, string> | null }> {
    const [nodeConfig, processConfig] = await Promise.all([
      this.designRepo.findNodeConfig(processDefinitionId, nodeId),
      this.designRepo.findNodeConfig(processDefinitionId, PROCESS_LEVEL_NODE_ID),
    ])
    const nodeForm = nodeConfig !== null ? extractFormConfig(nodeConfig.config_json) : null
    if (nodeForm !== null) {
      return { formKey: nodeForm.formDefId, fieldPermissions: nodeForm.fieldPermissions }
    }
    const processForm =
      processConfig !== null ? extractFormConfig(processConfig.config_json) : null
    return {
      formKey: processForm?.formDefId ?? null,
      fieldPermissions: processForm?.fieldPermissions ?? null,
    }
  }

  /**
   * 跨表单数据映射（对齐 Java `FormDataMerger.merge`）：读节点 `form.dataMappings`，
   * 按 source 解析成 `targetField → value`：
   *   - `variable:<名称>` → 流程变量
   *   - `form:initiator` → 发起节点表单**当前数据**（非快照）的 sourceField
   *   - `form:<nodeId>` → 指定节点表单当前数据的 sourceField
   * 无映射配置或解析结果为空 → null（Java 同款：空 Map 上层置 null）。
   */
  private async loadMappedData(
    model: ProcessModel | null,
    processDefinitionId: string,
    processInstanceId: string,
    nodeId: string,
    variables: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const nodeConfig = await this.designRepo.findNodeConfig(processDefinitionId, nodeId)
    if (nodeConfig === null) return null
    let parsed: { form?: { dataMappings?: DataMappingLike[] } }
    try {
      parsed = JSON.parse(nodeConfig.config_json) as typeof parsed
    } catch {
      return null
    }
    const mappings = parsed.form?.dataMappings
    if (!Array.isArray(mappings) || mappings.length === 0) return null

    // 预取该部署版本全部节点配置（映射指向节点的 formDefId 从这里解）
    const configs = await this.designRepo.findConfigsByProcessDefinitionId(processDefinitionId)
    const formDefIdOf = (ownerNodeId: string): string | null => {
      const row = configs.find((c) => c.node_id === ownerNodeId)
      if (row === undefined) return null
      return extractFormConfig(row.config_json)?.formDefId ?? null
    }

    const tenantId = getTenantId()
    const result: Record<string, unknown> = {}
    for (const mapping of mappings) {
      if (mapping === null || typeof mapping !== 'object') continue
      const targetField = typeof mapping.targetField === 'string' ? mapping.targetField : ''
      const source = typeof mapping.source === 'string' ? mapping.source : ''
      const sourceField = typeof mapping.sourceField === 'string' ? mapping.sourceField : ''
      if (targetField === '' || source === '') continue
      let value: unknown = null
      if (source.startsWith('variable:')) {
        value = variables[source.slice('variable:'.length)] ?? null
      } else if (source.startsWith('form:')) {
        const sourceNodeId = source.slice('form:'.length)
        const ownerNodeId =
          sourceNodeId === 'initiator' ? (model?.initiatorNodeId ?? null) : sourceNodeId
        const formDefId = ownerNodeId !== null ? formDefIdOf(ownerNodeId) : null
        if (formDefId !== null && sourceField !== '') {
          value = await this.readFormFieldValue(
            tenantId,
            processInstanceId,
            formDefId,
            sourceField,
          )
        }
      }
      if (value !== null && value !== undefined) result[targetField] = value
    }
    return Object.keys(result).length > 0 ? result : null
  }

  /** 读流程实例下指定表单当前数据（非快照）的指定字段（对齐 Java `readFormField`）。 */
  private async readFormFieldValue(
    tenantId: string,
    processInstanceId: string,
    formDefId: string,
    sourceField: string,
  ): Promise<unknown> {
    const row = await this.db
      .selectFrom('wf_form_data')
      .select('data_json')
      .where('tenant_id', '=', tenantId)
      .where('process_instance_id', '=', processInstanceId)
      .where('form_def_id', '=', formDefId)
      .where('is_snapshot', '=', 0)
      .executeTakeFirst()
    if (row?.data_json === null || row?.data_json === undefined) return null
    try {
      const data = JSON.parse(row.data_json) as Record<string, unknown>
      return data[sourceField] ?? null
    } catch {
      return null
    }
  }

  // ------------------------------------------------------------ 写操作

  async claimTask(taskId: string, userId: string): Promise<void> {
    const tenantId = getTenantId()
    const row = await this.persistence.findTaskWithInstance(taskId, tenantId)
    if (row === null) throw new BusinessException(`任务不存在: ${taskId}`)

    await this.db
      .updateTable('wfe_task')
      .set({ assignee: userId, status: 'CLAIMED', claim_time: new Date(), updated_at: new Date() })
      .where('id', '=', taskId)
      .where('status', 'in', ['CREATED', 'CLAIMED'])
      .execute()
  }

  async completeTask(
    taskId: string,
    body: { userId?: string; comment?: string; variables?: Record<string, unknown>; signature?: string },
  ): Promise<CompleteTaskResponse> {
    const tenantId = getTenantId()
    const row = await this.persistence.findTaskWithInstance(taskId, tenantId)
    if (row === null) throw new BusinessException(`任务不存在: ${taskId}`)

    const { state, variables, maxSeq, lockVersion } = await this.persistence.loadState(row.instance_id)
    const model = await this.instances.loadModel(row.process_def_id)
    if (model === null) throw new BusinessException(`缺少流程模型: ${row.process_def_id}`)

    // ① 门禁（意见必填 / 必须签名 / 必须加签）—— 在引擎推进前拦截。
    //    意见必填 = 节点级 OR 流程级 commentPolicy(enabled && scope=ALL)；
    //    签名 = 流程级 enabled=false 全禁；否则节点未显式配置用流程级默认。
    const node = model.nodes[row.node_id]
    const processPolicy = await this.loadProcessPolicy(row.process_def_id)
    if (node !== undefined) {
      const label = node.name !== '' ? node.name : row.node_id
      const commentRequired =
        node.commentRequired === true ||
        (processPolicy.commentPolicy.enabled && processPolicy.commentPolicy.scope === 'ALL')
      if (commentRequired && (body.comment ?? '').trim() === '') {
        throw new BusinessException(
          400,
          `${node.taskRole === 'handler' ? '处理' : '审批'}意见必填（节点「${label}」）`,
        )
      }
      const sig = processPolicy.signaturePolicy
      // 节点显式配置优先；节点未配置时用流程级默认（流程级只是默认值提供者，不覆盖节点显式配置）
      const sigEnabled = node.signature?.enabled ?? sig.enabled
      const sigRequired = sigEnabled ? (node.signature?.required ?? sig.required) : false
      if (sigRequired && (body.signature ?? '').trim() === '') {
        throw new BusinessException(400, `此节点要求手写签名（节点「${label}」）`)
      }
      if (node.returnOptions?.mustAddSign === true) {
        const hasAddSign = await this.hasAddSignComment(row.instance_id, row.node_id)
        if (!hasAddSign) {
          throw new BusinessException(400, `此节点必须加签后才能通过（节点「${label}」）`)
        }
      }
      // 通过/提交按钮开关（节点级 AND 流程级；缺省 true，显式 false 才拦截 ——
      // 与前端按 operations 渲染按钮的规则一致，后端兑底）
      const operations = await this.loadOperations(row.process_def_id, row.node_id)
      if (operations.allowPass !== true) {
        throw new BusinessException(400, `该节点不允许通过/提交（节点「${label}」）`)
      }
    }

    // 生产用 UUID 工厂；seedSeq 在 UUID 模式下无实际作用，保留以兼容序号模式
    const runtime = new EngineRuntime(
      model,
      state,
      () => new Date(),
      () => randomUuid(),
      // to_admin 兜底目标：流程级审批管理员优先，未配置回落全局 admin（Task 76）
      await this.buildResolutionContext(processPolicy.adminUserIds[0] ?? undefined),
      {
        dedupEnabled: processPolicy.dedup.enabled,
        dedupMode: processPolicy.dedup.mode,
        dedupSkipSameAsInitiator: processPolicy.dedup.skipSameAsInitiator,
        retakeSkipApproved: processPolicy.retakeSkipApproved,
      },
      snapshotAssigneeResolvers(),
    )
    runtime.seedSeq(maxSeq)
    runtime.restoreVariables(variables)

    // 委派任务：先 resolve（assignee 归还 owner），再推进 —— 顺序与 Java 一致，
    // 且必须在 replaceRuntimeRows **之前**改内存态（否则重写任务行时被覆盖）。
    await this.resolveDelegationIfAny(taskId, state)

    // 后端逻辑「结束事件 COMPLETE」需要知道**本次调用**新完成了哪些结束事件 ⇒ 推进前拍快照
    const completedBefore = completedActivityIdSnapshot(state)
    runtime.completeTask(taskId, body.variables ?? {})

    await this.persistence.replaceRuntimeRows(
      row.instance_id,
      tenantId,
      state,
      runtime.getVariables(),
      lockVersion,
    )

    // 自动拒绝（approvalType=auto_reject）：终止实例（TERMINATED），不走 RUNNING/COMPLETED 同步
    if (runtime.isAutoRefused()) {
      await this.instances.insertComment(tenantId, {
        taskId,
        instanceId: row.instance_id,
        userId: body.userId ?? row.assignee ?? '',
        action: 'refuse',
        comment: body.comment ?? '自动拒绝',
        targetUserId: null,
      })
      await this.instances.terminateInstance(row.instance_id, '自动拒绝')
      return {
        processInstanceId: row.instance_id,
        processFinished: true,
        nextTaskId: null,
        nextTaskName: null,
        nextTaskDefinitionKey: null,
        nextTaskAssignee: null,
      }
    }

    await this.syncInstanceStatus(row.instance_id, state)

    // 审批意见（对齐 Java：action='approve'）；signature.enabled 节点同时落手写签名（V41）
    await this.instances.insertComment(tenantId, {
      taskId,
      instanceId: row.instance_id,
      userId: body.userId ?? row.assignee ?? '',
      action: 'approve',
      comment: body.comment ?? null,
      signature: body.signature ?? null,
      targetUserId: null,
    })

    // 引擎自动结果（自动通过/跳过）→ 补审批意见，保证审批时间线完整
    for (const auto of runtime.getAutoCompletedTasks()) {
      if (auto.taskId === taskId) continue
      await this.instances.insertComment(tenantId, {
        taskId: auto.taskId,
        instanceId: row.instance_id,
        userId: 'system',
        action: auto.action === 'approve' ? 'approve' : 'system',
        comment:
          auto.comment ??
          (auto.action === 'approve' ? '自动通过' : '未找到办理人，自动跳过'),
        targetUserId: null,
      })
    }

    // 节点「发送短信给办理人」→ 通知记录落库（流程级短信摘要开启时附在文案尾部）
    const smsSummary = await this.loadSmsSummarySuffix(row.instance_id, row.process_def_id)
    await this.writeNodeSmsNotifications(tenantId, row.instance_id, state, model, smsSummary)
    // 实例结束 + 发起节点 smsOnEnd → 给发起人的短信通知
    if (state.status === 'COMPLETED') {
      await this.writeInstanceEndSms(tenantId, row.instance_id, model, row.initiator)
    }

    // 节点级后端逻辑（对齐 Java 的事件顺序：先 TASK_COMPLETED，再下一个节点的 ACTIVITY_STARTED，
    // 最后是本次走到的结束事件 ACTIVITY_COMPLETED(endEvent)）。
    // ⚠️ 三次调用必须**共用同一个变量对象**：`runtime.getVariables()` 返回的是**浅拷贝**，
    //    每次各取一份会让后一次落库时覆盖掉前一次写入的 `resultVar`
    //    （实测症状：`approveResult` 丢失、只剩 `subEndResult`）。
    //    Java 侧每次事件都从**同一个执行实例**读变量，本来就看得见前一次的写入。
    // ⚠️ 必须在 `replaceRuntimeRows` **之后**跑：它按内存变量的最终值一次性落库，
    //    提前跑会被随后的覆盖写冲掉。
    const logicVars = runtime.getVariables()
    await this.backendLogic.run(row.process_def_id, row.instance_id, [row.node_id], 'COMPLETE', logicVars)
    await this.backendLogic.run(
      row.process_def_id,
      row.instance_id,
      state.tasks.filter((t) => t.status === 'CREATED' || t.status === 'CLAIMED').map((t) => t.nodeId),
      'ENTER',
      logicVars,
    )
    // 本次走到的结束事件（含子流程内部的）→ COMPLETE 触发（对齐 Java 的 ACTIVITY_COMPLETED(endEvent)）
    await this.backendLogic.run(
      row.process_def_id,
      row.instance_id,
      newlyCompletedEndEventNodeIds(state, completedBefore),
      'COMPLETE',
      logicVars,
    )

    const nextTask = state.tasks.find((t) => t.status === 'CREATED')
    return {
      processInstanceId: row.instance_id,
      processFinished: state.status === 'COMPLETED',
      nextTaskId: nextTask?.id ?? null,
      nextTaskName:
        nextTask === undefined ? null : (model.nodes[nextTask.nodeId]?.name ?? null),
      nextTaskDefinitionKey: nextTask?.nodeId ?? null,
      nextTaskAssignee: nextTask?.assignee ?? null,
    }
  }

  /**
   * 驳回（把任务退回发起人节点重新填写），对齐 Java `RejectService.reject`。
   *
   * ⚠️ 与「拒绝」（`refuse`）**不是一回事**：驳回让流程**继续**，拒绝直接终止实例。
   *
   * ⚠️ 两条错误的形态：
   *    - 任务不存在 → Java 抛 `IllegalStateException("Task not found: " + id)`
   *      → **HTTP 500 + body code 500**（不是 BusinessException 的 200+code）；
   *    - 引擎侧拒绝（例如「当前节点已经是发起人节点」）→ Java 同样是
   *      `IllegalStateException` → **HTTP 500**，且消息**不带任何前缀**。
   *      引擎内部抛的是 `EngineException`（全局过滤器会加「流程引擎错误: 」前缀并给 HTTP 400），
   *      所以这里必须转成普通 `Error` —— 契约场景 `rjRejectAtInitiator` 实测
   *      Java 是 `500 + "Cannot reject: current node is already the initiator node"`。
   *
   * ⚠️ 操作人取**登录态**（Java 的 `getCurrentUserId()`），不认 body 里的 userId；
   *    且 Java 只在 userId 非 null 时才写审批意见。
   */
  async rejectTask(taskId: string, userId: string, reason: string | null): Promise<void> {
    const tenantId = getTenantId()
    const row = await this.persistence.findTaskWithInstance(taskId, tenantId)
    if (row === null) throw new Error(`Task not found: ${taskId}`)

    const { state, variables, maxSeq, lockVersion } = await this.persistence.loadState(row.instance_id)
    const model = await this.instances.loadModel(row.process_def_id)
    if (model === null) throw new BusinessException(`缺少流程模型: ${row.process_def_id}`)

    // 退回权限门禁：节点级 allowReturn（旧数据缺省回退 allowReject 语义）
    const operations = await this.loadOperations(row.process_def_id, row.node_id)
    if (operations.allowReturn !== true && operations.allowReject !== true) {
      throw new BusinessException(400, '该节点不允许退回')
    }
    // 意见必填：退回理由必填 = 节点级 OR 流程级 commentPolicy(enabled)（REJECT_RETURN 与 ALL 都覆盖退回）
    const rejectNode = model.nodes[row.node_id]
    const processPolicyForReject = await this.loadProcessPolicy(row.process_def_id)
    const rejectCommentRequired =
      rejectNode?.commentRequired === true || processPolicyForReject.commentPolicy.enabled
    if (rejectCommentRequired && (reason ?? '').trim() === '') {
      const label =
        rejectNode !== undefined && rejectNode.name !== '' ? rejectNode.name : row.node_id
      throw new BusinessException(400, `审批意见必填（节点「${label}」）`)
    }

    // 生产用 UUID 工厂；seedSeq 在 UUID 模式无实际作用，保留以兼容序号模式
    // policy：retakeSkipApproved 由 reject() 收集已通过节点写入 __retakeApprovedNodes；
    //        dedup 口径同步注入（后续重走节点的任务创建消费）
    const runtime = new EngineRuntime(
      model,
      state,
      () => new Date(),
      () => randomUuid(),
      {},
      {
        dedupEnabled: processPolicyForReject.dedup.enabled,
        dedupMode: processPolicyForReject.dedup.mode,
        dedupSkipSameAsInitiator: processPolicyForReject.dedup.skipSameAsInitiator,
        retakeSkipApproved: processPolicyForReject.retakeSkipApproved,
      },
      snapshotAssigneeResolvers(),
    )
    runtime.seedSeq(maxSeq)
    runtime.restoreVariables(variables)
    try {
      runtime.reject(taskId, reason)
    } catch (error) {
      // 引擎异常 → Java 的 IllegalStateException 形态（HTTP 500、消息不加前缀）
      throw new Error(error instanceof Error ? error.message : String(error), { cause: error })
    }

    await this.persistence.replaceRuntimeRows(
      row.instance_id,
      tenantId,
      state,
      runtime.getVariables(),
      lockVersion,
    )
    await this.syncInstanceStatus(row.instance_id, state)
    await this.instances.insertComment(tenantId, {
      taskId,
      instanceId: row.instance_id,
      userId,
      action: 'reject',
      comment: reason,
      targetUserId: null,
    })
  }

  /**
   * 委派（对齐 Java `WorkflowTaskService.delegateTaskWithComment`）。
   *
   * ⚠️ **委派 ≠ 转办**：Java 走 Flowable `delegateTask` —— 原办理人进 `owner`、
   *    assignee 改成被委派人、任务置 `PENDING`；被委派人「完成」时**先 resolve
   *    （assignee 归还 owner）再 complete**（见下方的 `resolveDelegationIfAny`）。
   *    转办则是换人即完、没有回还。
   *
   * ⚠️ Java **不校验** `delegateTo`（与 transfer 的「同人校验」不同），也不校验它存在；
   *    空值行为照抄（golden 里没有空值场景，但不要自作主张加校验）。
   *
   * 错误形态：任务不存在 → `IllegalStateException` 形态 ⇒ **HTTP 500**。
   * 意见：`action='delegate'`、`targetUserId` = 被委派人；只有 `fromUser` 非 null 时才写。
   */
  async delegateTask(
    taskId: string,
    body: { delegateTo: string | null; fromUser: string | null; comment: string | null },
  ): Promise<void> {
    const tenantId = getTenantId()
    const row = await this.persistence.findTaskWithInstance(taskId, tenantId)
    if (row === null) throw new Error(`Task not found: ${taskId}`)

    const now = new Date()
    // 原办理人（可能为 null：无 assignee 的候选人任务也能被委派）
    const owner = row.assignee
    await this.db
      .updateTable('wfe_task')
      .set({ assignee: body.delegateTo, updated_at: now })
      .where('id', '=', taskId)
      .execute()

    await this.db
      .insertInto('wfe_task_delegation')
      .values({
        task_id: taskId,
        instance_id: row.instance_id,
        tenant_id: tenantId,
        owner,
        delegation_state: 'PENDING',
        created_at: now,
        updated_at: now,
      })
      .onDuplicateKeyUpdate({
        owner,
        delegation_state: 'PENDING',
        updated_at: now,
      })
      .execute()

    if (body.fromUser !== null) {
      await this.instances.insertComment(tenantId, {
        taskId,
        instanceId: row.instance_id,
        userId: body.fromUser,
        action: 'delegate',
        comment: body.comment,
        targetUserId: body.delegateTo,
      })
    }
  }

  /**
   * 委派任务的「完成」前处理（对齐 Java 的 `resolveTask`）。
   *
   * Java 的两条 complete 路径都是同一段：
   * ```java
   * if (task.getDelegationState() != null) { taskService.resolveTask(taskId); }
   * taskService.complete(taskId, variables);
   * ```
   * `resolveTask` 把 assignee 归还 owner、委派态置 RESOLVED —— 于是**同一个任务**
   * 在被委派人手里「完成」后，历史里那条任务记录的 assignee 是**原办理人**。
   * 契约场景据此断言（`dvTaskAfterComplete.assignee === "1"`）。
   *
   * 必须在引擎推进**之前**改内存态里的 assignee：`replaceRuntimeRows` 会用
   * `state.tasks` 整表重写，晚一步就被覆盖掉了。
   */
  private async resolveDelegationIfAny(
    taskId: string,
    state: { tasks: Array<{ id: string; assignee: string | null }> },
  ): Promise<void> {
    const delegation = await this.db
      .selectFrom('wfe_task_delegation')
      .select(['owner', 'delegation_state'])
      .where('task_id', '=', taskId)
      .executeTakeFirst()
    if (delegation === undefined || delegation.delegation_state !== 'PENDING') return

    const task = state.tasks.find((t) => t.id === taskId)
    if (task !== undefined) task.assignee = delegation.owner
    await this.db
      .updateTable('wfe_task_delegation')
      .set({ delegation_state: 'RESOLVED', updated_at: new Date() })
      .where('task_id', '=', taskId)
      .execute()
  }

  /**
   * 加签（对齐 Java `AddSignService.addSign`）。
   *
   * 与转签的区别：转签是**换人**（删一个槽位、加一个槽位），加签是**只加不删** ——
   * 新增的人成为新的 MI 子实例，必须他也办完流程才前进。
   *
   * 错误形态（抄 Java）：`users` 为空 → `IllegalArgumentException` 形态 ⇒ **HTTP 400**
   * （消息逐字 `AddSign users cannot be empty`）；任务不存在 → 普通 `Error` ⇒ **HTTP 500**。
   *
   * ⚠️ 意见里的 `targetUserId` 是**逗号拼接的多人**（`String.join(",", users)`），
   *    与转签/转办只记一个人的写法不同。
   */
  async addSignTask(
    taskId: string,
    body: { users: string[] | null; userId: string | null; comment: string | null },
  ): Promise<void> {
    const tenantId = getTenantId()
    const users = body.users ?? []
    if (users.length === 0) {
      const err = new Error('AddSign users cannot be empty')
      err.name = 'IllegalArgumentException'
      throw err
    }

    const row = await this.persistence.findTaskWithInstance(taskId, tenantId)
    if (row === null) throw new Error(`Task not found: ${taskId}`)

    const { state, variables, maxSeq, lockVersion } = await this.persistence.loadState(row.instance_id)
    const model = await this.instances.loadModel(row.process_def_id)
    if (model === null) throw new BusinessException(`缺少流程模型: ${row.process_def_id}`)

    const runtime = new EngineRuntime(
      model,
      state,
      () => new Date(),
      () => randomUuid(),
      {},
      {},
      snapshotAssigneeResolvers(),
    )
    runtime.seedSeq(maxSeq)
    runtime.restoreVariables(variables)

    // 分流：MI 节点 → 引擎加子实例；非 MI 节点 → 加候选人（Java 的 addCandidateUser）
    const engineTask = state.tasks.find((t) => t.id === taskId)
    const execution =
      engineTask === undefined
        ? undefined
        : state.executions.find((e) => e.id === engineTask.executionId)
    const isMultiInstance = execution !== undefined && execution.miRootId !== null

    if (isMultiInstance) {
      try {
        runtime.addSign(taskId, users)
      } catch (error) {
        // 引擎异常 → Java 的 IllegalStateException 形态（HTTP 500、消息不加前缀）
        throw new Error(error instanceof Error ? error.message : String(error), { cause: error })
      }
    } else if (engineTask !== undefined) {
      // ⚠️ 这条分支在本项目**不可观测**（没有候选人列表端点、claim 也不校验候选人），
      //    但仍按 Java 语义写候选表 —— 数据模型要对，将来补端点时才不缺数据。规格 U37。
      for (const user of users) {
        if (!engineTask.candidateUsers.includes(user)) engineTask.candidateUsers.push(user)
      }
    }

    await this.persistence.replaceRuntimeRows(
      row.instance_id,
      tenantId,
      state,
      runtime.getVariables(),
      lockVersion,
    )
    await this.syncInstanceStatus(row.instance_id, state)

    if (body.userId !== null) {
      await this.instances.insertComment(tenantId, {
        taskId,
        instanceId: row.instance_id,
        userId: body.userId,
        action: 'add_sign',
        comment: body.comment,
        targetUserId: users.join(','),
      })
    }
  }

  /**
   * 转签（对齐 Java `ForwardSignService.forwardSign`）。
   *
   * 与转办的区别：转办是**整个任务换人**（适合单实例），转签是**多实例节点里把
   * 当前审批人的那一个实例换成另一个人** —— 删除的实例**不计入完成计数**，
   * 否则会签的 `completionCondition` 会被提前满足。
   *
   * 三条错误形态必须区分（抄 Java）：
   *   1. `toUser` 为空 → `IllegalArgumentException` 形态 ⇒ **HTTP 400**
   *      （消息逐字：`toUser cannot be null or blank`）；
   *   2. 任务不存在 → 普通 `Error`（Java 是 `IllegalStateException`）⇒ **HTTP 500**；
   *   3. 节点不是多实例 → 引擎抛错，服务层转成普通 `Error`（同样 500）——
   *      照抄 `rejectTask` 的转换：**不能让 `EngineException` 冒出去**，
   *      它会被过滤器加上「流程引擎错误: 」前缀并给 400，与 Java 分叉。
   *
   * ⚠️ 审批意见只在 `userId` **非 null** 时写（Java 的 `if (userId != null)`）。
   *    `action` 是 `forward_sign`、`targetUserId` 记的是**转给谁** ——
   *    这一点与 refuse/reject（`targetUserId: null`）不同。
   */
  async forwardSignTask(
    taskId: string,
    body: { userId: string | null; toUser: string | null; comment: string | null },
  ): Promise<void> {
    const tenantId = getTenantId()
    const toUser = body.toUser ?? ''
    if (toUser.trim() === '') {
      const err = new Error('toUser cannot be null or blank')
      err.name = 'IllegalArgumentException'
      throw err
    }

    const row = await this.persistence.findTaskWithInstance(taskId, tenantId)
    if (row === null) throw new Error(`Task not found: ${taskId}`)

    const { state, variables, maxSeq, lockVersion } = await this.persistence.loadState(row.instance_id)
    const model = await this.instances.loadModel(row.process_def_id)
    if (model === null) throw new BusinessException(`缺少流程模型: ${row.process_def_id}`)

    const runtime = new EngineRuntime(
      model,
      state,
      () => new Date(),
      () => randomUuid(),
      {},
      {},
      snapshotAssigneeResolvers(),
    )
    runtime.seedSeq(maxSeq)
    runtime.restoreVariables(variables)
    try {
      runtime.forwardSign(taskId, toUser)
    } catch (error) {
      // 引擎异常 → Java 的 IllegalStateException 形态（HTTP 500、消息不加前缀）
      throw new Error(error instanceof Error ? error.message : String(error), { cause: error })
    }

    await this.persistence.replaceRuntimeRows(
      row.instance_id,
      tenantId,
      state,
      runtime.getVariables(),
      lockVersion,
    )
    await this.syncInstanceStatus(row.instance_id, state)

    if (body.userId !== null) {
      await this.instances.insertComment(tenantId, {
        taskId,
        instanceId: row.instance_id,
        userId: body.userId,
        action: 'forward_sign',
        comment: body.comment,
        targetUserId: toUser,
      })
    }
  }

  /** 引擎判定完成后同步实例状态。 */
  private async syncInstanceStatus(
    instanceId: string,
    state: { status: string },
  ): Promise<void> {
    const finished = state.status === 'COMPLETED'
    await this.persistence.updateInstanceStatus(
      instanceId,
      finished ? 'COMPLETED' : 'RUNNING',
      finished ? new Date() : null,
    )
  }

  /**
   * 拒绝（不同意并终止整个流程），对齐 Java `TaskController.refuse`。
   *
   * ⚠️ 与「驳回」（`reject`）**不是一回事**：
   *    - 驳回：把任务退回发起人节点重新填写，流程继续；
   *    - 拒绝：写一条 `action='refuse'` 的意见，然后**终止整个流程实例**。
   *
   * ⚠️ 顺序即契约：**先写意见，再终止**。若反过来，终止会取消任务行，
   *    而 Java 的写意见不依赖任务存活（它直接落 `wf_task_comment`）——
   *    顺序反了在「意见里带任务 id」的场景下看不出差别，但终止失败时行为不同。
   *
   * ⚠️ 任务不存在时用的是**普通 `Error`**：Java 抛
   *    `IllegalStateException("Task not found: " + id)` → **HTTP 500 + body code 500**，
   *    而 `reject` 那边抛的是 `BusinessException(\`任务不存在: ...\`)` → HTTP 200 + body code。
   *    两个端点的错误形态**刻意不同**，别统一。
   *
   * ⚠️ 终止原因的空值兜底是 `'审批拒绝，流程终止'`（Java 的写法）。注意
   *    `ProcessInstanceService.terminateInstance` 自己的兜底是 `'User terminated'`，
   *    所以**必须在这里显式传**，不能依赖下游。
   */
  async refuseTask(taskId: string, userId: string, reason: string | null): Promise<void> {
    const tenantId = getTenantId()
    const row = await this.persistence.findTaskWithInstance(taskId, tenantId)
    if (row === null) throw new Error(`Task not found: ${taskId}`)

    // 拒绝权限门禁：节点级 allowRefuse（旧数据缺省回退 allowReject 语义）
    const operations = await this.loadOperations(row.process_def_id, row.node_id)
    if (operations.allowRefuse !== true && operations.allowReject !== true) {
      throw new BusinessException(400, '该节点不允许拒绝')
    }
    // 意见必填节点：拒绝理由也必填；**办理节点没有「拒绝」语义**（仅审批节点可拒绝终止
    // 流程）—— 前端已按 taskRole 隐藏按钮，这里后端兑底拦截
    const model = await this.instances.loadModel(row.process_def_id)
    const refuseNode = model?.nodes[row.node_id]
    if (refuseNode?.taskRole === 'handler') {
      throw new BusinessException(400, '办理节点不支持拒绝操作')
    }
    // 拒绝理由必填 = 节点级 OR 流程级 commentPolicy(enabled)（REJECT_RETURN 与 ALL 都覆盖拒绝）
    const processPolicyForRefuse = await this.loadProcessPolicy(row.process_def_id)
    const refuseCommentRequired =
      refuseNode?.commentRequired === true || processPolicyForRefuse.commentPolicy.enabled
    if (refuseCommentRequired && (reason ?? '').trim() === '') {
      const label =
        refuseNode !== undefined && refuseNode.name !== '' ? refuseNode.name : row.node_id
      throw new BusinessException(400, `审批意见必填（节点「${label}」）`)
    }

    await this.instances.insertComment(tenantId, {
      taskId,
      instanceId: row.instance_id,
      userId,
      action: 'refuse',
      comment: reason,
      targetUserId: null,
    })
    await this.instances.terminateInstance(
      row.instance_id,
      reason ?? '审批拒绝，流程终止',
    )
  }

  /**
   * 转办（`TransferService.transfer`）：直接更换 assignee，原办理人不再持有任务。
   *
   * ⚠️ 与**委派**（delegate）的区别：委派后原 assignee 仍是 owner，被委派人处理完会归还；
   *    转办是彻底移交。本实现只做转办。
   *
   * ⚠️ 三种错误的形态**各不相同**，照抄 Java：
   *    - `fromUser == toUser` → `IllegalArgumentException` → **HTTP 400**
   *    - 任务不存在 → `IllegalStateException` → **HTTP 500**
   *    - 节点不允许转办 → `BusinessException(400, ...)` → **HTTP 200 + body code 400**
   *
   * ⚠️ `wf_task_transfer.from_user` 与 `wf_task_comment.user_id` 取的**不是同一个值**：
   *    前者是 `task.getAssignee()`（改之前的办理人），后者是入参 `fromUser`（调用方/登录人）。
   *    两者在「管理员替别人转办」时不同，别合并成一个变量。
   */
  async transferTask(
    taskId: string,
    body: { fromUser?: string; toUser?: string; reason?: string },
  ): Promise<void> {
    const tenantId = getTenantId()
    const toUser = body.toUser ?? ''
    const fromUser = body.fromUser ?? ''

    // ① 同人校验（Java 用 Objects.equals 的等价：两边都不是空时比较）
    if (fromUser !== '' && fromUser === toUser) {
      const err = new Error(`Cannot transfer to the same user: ${toUser}`)
      err.name = 'IllegalArgumentException'
      throw err
    }

    const row = await this.persistence.findTaskWithInstance(taskId, tenantId)
    if (row === null) throw new Error(`Task not found: ${taskId}`)

    // ② 权限门槛：流程级 AND 节点级 allowTransfer（见 loadOperations）
    const operations = await this.loadOperations(row.process_def_id, row.node_id)
    if (!operations.allowTransfer) {
      throw new BusinessException(400, '该节点不允许转办')
    }

    const previousAssignee = row.assignee
    await this.db
      .updateTable('wfe_task')
      .set({ assignee: toUser, updated_at: new Date() })
      .where('id', '=', taskId)
      .execute()

    // ③ 审计：from_user 用**改之前**的办理人（可能为 null → 由数据库拒绝，与 Java 一致）
    await this.instances.insertTaskTransfer(tenantId, {
      taskId,
      instanceId: row.instance_id,
      fromUser: previousAssignee ?? (null as unknown as string),
      toUser,
      reason: body.reason ?? null,
    })

    // ④ 审批意见：user_id 用入参 fromUser（Java 只在它非 null 时才写）
    if (body.fromUser !== null && body.fromUser !== undefined) {
      await this.instances.insertComment(tenantId, {
        taskId,
        instanceId: row.instance_id,
        userId: body.fromUser,
        action: 'transfer',
        comment: body.reason ?? null,
        targetUserId: toUser,
      })
    }
  }

  // ------------------------------------------------------------ 催办
  /**
   * 对指定任务发起催办（对齐 Java `TaskRemindService.remind`）。
   *
   * ⚠️ 三条错误都用**普通 `Error`** 而不是 `BusinessException`：
   *    Java 侧抛的是 `IllegalStateException`，被兜底处理器映射成
   *    **HTTP 500 + body `{code:500, msg:<异常消息>}`**；而 `BusinessException`
   *    会走 HTTP 200 + body code。两者在契约里完全不同，不能混用。
   *    消息文案逐字照抄（含 SQL 风格的 `Task not found: ` 前缀）。
   *
   * ⚠️ 频率限制是「同一 taskId 在 `frequencyHours` 小时内不可重复催办」，
   *    按任务而非按人。任务每轮契约场景都是新建的，所以这条限制
   *    **不会跨录制轮次生效**。
   */
  async remindTask(taskId: string, remindFrom: string): Promise<void> {
    const tenantId = getTenantId()
    const row = await this.persistence.findTaskWithInstance(taskId, tenantId)
    if (row === null) throw new Error(`Task not found: ${taskId}`)

    await this.requireRemindWithinFrequency(taskId)

    // ⚠️ Java 是 `assignee` 取不到就退到 `owner`（委派场景下 Flowable 会把原办理人
    //    放进 owner）。**委派端点已迁移**（V36 + `wfe_task_delegation` 侧表），
    //    所以这条回退在 Node 侧是**有意省略**而不是「还没做」：我们的委派把
    //    「原办理人」存在侧表 `wfe_task_delegation.owner`，不往 `wfe_task` 加列
    //    （`replaceRuntimeRows` 是全量重建任务行、列清单固定，加列会被冲掉）。
    //    **判据**：至今没有契约场景能触发「委派中 → 催办」这条组合，所以回退不可达；
    //    若将来要支持，应从侧表取 owner 兜底，而不是给 `wfe_task` 加列。
    const remindTo = blankToNullOf(row.assignee)
    if (remindTo === null) {
      throw new Error(`Task ${taskId} has no assignee or owner to remind`)
    }

    await this.db
      .insertInto('wf_task_remind')
      .values({
        id: randomUuid(),
        tenant_id: tenantId,
        task_id: taskId,
        process_instance_id: row.instance_id,
        remind_from: remindFrom,
        remind_to: remindTo,
        remind_time: new Date(),
      })
      .execute()
  }

  /**
   * 对某流程实例下**所有活跃任务**逐个催办（对齐 `TaskRemindController.remindByInstance`）。
   *
   * 返回三态：没有活跃任务 / 全部被跳过 / 至少成功一个 —— 控制器据此给出
   * Java 的三种响应（404 / 429 / 成功）。把判定放在这里而不是控制器，
   * 是为了让「跳过」的语义（只吞频率限制与无办理人）在同一个地方一眼看全。
   */
  async remindByInstance(
    processInstanceId: string,
    remindFrom: string,
  ): Promise<'noTasks' | 'allSkipped' | 'ok'> {
    const tasks = (await this.persistence.findTasks(processInstanceId)).filter(
      (t) => t.status === 'CREATED' || t.status === 'CLAIMED',
    )
    if (tasks.length === 0) return 'noTasks'

    // 发起节点「审批催办」配置：关闭 → 不可催办；开启 → 按间隔限流（实例级）
    const instance = await this.db
      .selectFrom('wfe_process_instance')
      .select(['process_def_id'])
      .where('id', '=', processInstanceId)
      .executeTakeFirst()
    if (instance !== undefined) {
      const model = await this.instances.loadModel(instance.process_def_id)
      const initiatorNode =
        model?.initiatorNodeId !== null && model?.initiatorNodeId !== undefined
          ? model.nodes[model.initiatorNodeId]
          : undefined
      const urge = initiatorNode?.initiatorOptions?.urge
      if (urge?.enabled === false) return 'allSkipped'
      if (urge?.enabled === true) {
        const unitMinutes = urge.unit === 'hour' ? 60 : urge.unit === 'day' ? 1440 : 1
        const intervalMinutes = Math.max(1, urge.interval ?? 5) * unitMinutes
        const last = await this.db
          .selectFrom('wf_task_remind')
          .select('remind_time')
          .where('process_instance_id', '=', processInstanceId)
          .orderBy('remind_time', 'desc')
          .limit(1)
          .executeTakeFirst()
        if (last?.remind_time !== null && last?.remind_time !== undefined) {
          const elapsedMinutes = (Date.now() - new Date(last.remind_time).getTime()) / 60_000
          if (elapsedMinutes < intervalMinutes) return 'allSkipped'
        }
      }
    }

    let reminded = 0
    for (const task of tasks) {
      try {
        await this.remindTask(task.id, remindFrom)
        reminded++
      } catch {
        // 对齐 Java：只吞 IllegalStateException（频率限制 / 无办理人），继续下一个
      }
    }
    return reminded === 0 ? 'allSkipped' : 'ok'
  }

  /** 频率限制：同一任务 `REMIND_FREQUENCY_HOURS` 小时内已催办过则拒绝。 */
  private async requireRemindWithinFrequency(taskId: string): Promise<void> {
    const last = await this.db
      .selectFrom('wf_task_remind')
      .select('remind_time')
      .where('task_id', '=', taskId)
      .orderBy('remind_time', 'desc')
      .limit(1)
      .executeTakeFirst()
    if (last === undefined || last.remind_time === null) return
    // Java 用 Duration.toHours()（向下取整），所以 59 分钟算 0 小时
    const hours = Math.floor((Date.now() - new Date(last.remind_time).getTime()) / 3_600_000)
    if (hours < REMIND_FREQUENCY_HOURS) {
      throw new Error(
        `Task ${taskId} was reminded ${hours}h ago, within the ${REMIND_FREQUENCY_HOURS}h frequency limit`,
      )
    }
  }

  // ------------------------------------------------------------ 撤回
  /**
   * 发起人撤回流程（回退到发起节点等待重新提交）。
   *
   * 门禁：实例 RUNNING + 调用者为发起人 + 发起节点未配置 disallowRecall
   *      + 活跃节点未配置 blockRecall。撤回后设变量 recalled=true，
   *      审批意见 action='recall'。
   */
  async recallInstance(instanceId: string, userId: string, reason: string | null): Promise<void> {
    const tenantId = getTenantId()
    const instance = await this.db
      .selectFrom('wfe_process_instance')
      .select(['id', 'status', 'initiator', 'process_def_id'])
      .where('id', '=', instanceId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst()
    if (instance === undefined) throw new BusinessException(`流程实例不存在: ${instanceId}`)
    if (instance.status !== 'RUNNING') {
      throw new BusinessException(400, '流程已结束，无法撤回')
    }
    if (instance.initiator === null || instance.initiator !== userId) {
      throw new BusinessException(400, '只有发起人可以撤回流程')
    }

    const model = await this.instances.loadModel(instance.process_def_id)
    if (model === null || model.initiatorNodeId === null) {
      throw new BusinessException(400, '流程缺少发起节点，无法撤回')
    }

    // ① 发起节点配置：不允许撤销/撤回
    const initiatorNode = model.nodes[model.initiatorNodeId]
    if (initiatorNode?.initiatorOptions?.disallowRecall === true) {
      throw new BusinessException(400, '发起人已配置不允许撤销/撤回')
    }

    // ② 活跃节点配置：流程到达此节点后禁止撤销/撤回
    const openTasks = (await this.persistence.findTasks(instanceId)).filter(
      (t) => t.status === 'CREATED' || t.status === 'CLAIMED',
    )
    for (const task of openTasks) {
      const node = model.nodes[task.node_id]
      if (node?.blockRecall === true) {
        throw new BusinessException(
          400,
          `流程已到达「${node.name !== '' ? node.name : node.nodeId}」，该节点禁止撤销/撤回`,
        )
      }
    }

    const { state, variables, maxSeq, lockVersion } = await this.persistence.loadState(instanceId)
    const runtime = new EngineRuntime(
      model,
      state,
      () => new Date(),
      () => randomUuid(),
      await this.buildResolutionContext(),
      {},
      snapshotAssigneeResolvers(),
    )
    runtime.seedSeq(maxSeq)
    runtime.restoreVariables(variables)
    try {
      runtime.recallToInitiator()
    } catch (error) {
      // 新 API 无 Java 对齐包袱：统一走 BusinessException（HTTP 200 + body code）
      throw new BusinessException(400, error instanceof Error ? error.message : String(error))
    }

    await this.persistence.replaceRuntimeRows(
      instanceId,
      tenantId,
      state,
      runtime.getVariables(),
      lockVersion,
    )
    await this.syncInstanceStatus(instanceId, state)

    await this.instances.insertComment(tenantId, {
      taskId: openTasks[0]?.id ?? '',
      instanceId,
      userId,
      action: 'recall',
      comment: reason,
      targetUserId: null,
    })
  }

  // ------------------------------------------------------------ 审批召回

  /**
   * 审批召回：审批人撤回自己**已办理**的审批，流程回到该节点等待重新处理。
   *
   * 门禁（对齐钉钉「审批召回」）：
   *   ① 流程级 approveRecall 开启；
   *   ② 任务已完成且调用者 = 办理人；
   *   ③ 实例 RUNNING；
   *   ④ 召回之后没有其他审批人再办结（「下个节点审批前」）；
   *   ⑤ 发起节点任务不支持（走 recallInstance）；
   *   ⑥ 多实例（会签/依次）节点 v1 整体不支持（引擎重走会重置 MI 计数）。
   *
   * 意见 action='approve_recall'；实例变量 approveRecalled=true。
   */
  async recallApproval(taskId: string, userId: string): Promise<void> {
    const tenantId = getTenantId()
    const row = await this.persistence.findTaskWithInstance(taskId, tenantId)
    if (row === null) throw new BusinessException(`任务不存在: ${taskId}`)

    const taskRow = await this.db
      .selectFrom('wfe_task')
      .select(['id', 'status', 'assignee', 'node_id'])
      .where('id', '=', taskId)
      .executeTakeFirst()
    if (taskRow === undefined) throw new BusinessException(`任务不存在: ${taskId}`)
    if (taskRow.status !== 'COMPLETED') {
      throw new BusinessException(400, '仅已办理的审批任务可以召回')
    }
    if (taskRow.assignee !== userId) {
      throw new BusinessException(403, '仅任务办理人本人可以召回')
    }

    const instanceRow = await this.db
      .selectFrom('wfe_process_instance')
      .select('status')
      .where('id', '=', row.instance_id)
      .executeTakeFirst()
    if (instanceRow === undefined || instanceRow.status !== 'RUNNING') {
      throw new BusinessException(400, '流程已结束，无法召回')
    }

    const model = await this.instances.loadModel(row.process_def_id)
    if (model === null) throw new BusinessException(`缺少流程模型: ${row.process_def_id}`)
    const node = model.nodes[row.node_id]
    if (node === undefined || node.isInitiator === true) {
      throw new BusinessException(400, '发起节点任务不支持召回')
    }
    if (node.approval !== undefined && node.approval.multiMode !== 'single') {
      throw new BusinessException(400, '会签/依次审批节点暂不支持召回')
    }

    const processPolicy = await this.loadProcessPolicy(row.process_def_id)
    if (processPolicy.approveRecall !== true) {
      throw new BusinessException(400, '该流程未开启审批召回')
    }

    // ④ 召回之后没有其他审批人再办结：比较完成时间（end_time）
    const myEnd = await this.db
      .selectFrom('wfe_task')
      .select('end_time')
      .where('id', '=', taskId)
      .executeTakeFirst()
    if (myEnd !== undefined && myEnd.end_time !== null) {
      const later = await this.db
        .selectFrom('wfe_task')
        .select('id')
        .where('instance_id', '=', row.instance_id)
        .where('status', '=', 'COMPLETED')
        .where('id', '!=', taskId)
        .where('end_time', '>', myEnd.end_time)
        .limit(1)
        .executeTakeFirst()
      if (later !== undefined) {
        throw new BusinessException(400, '后续节点已有人办理，无法召回')
      }
    }

    const { state, variables, maxSeq, lockVersion } = await this.persistence.loadState(row.instance_id)
    const runtime = new EngineRuntime(
      model,
      state,
      () => new Date(),
      () => randomUuid(),
      await this.buildResolutionContext(),
      {
        dedupEnabled: processPolicy.dedup.enabled,
        dedupMode: processPolicy.dedup.mode,
        dedupSkipSameAsInitiator: processPolicy.dedup.skipSameAsInitiator,
        retakeSkipApproved: false,
        // 召回重走必须忽略去重：否则召回者刚办过，会被去重 auto-pass 掉
        skipDedupForRecall: true,
      },
      snapshotAssigneeResolvers(),
    )
    runtime.seedSeq(maxSeq)
    runtime.restoreVariables(variables)
    try {
      runtime.recallApproval(row.node_id)
    } catch (error) {
      throw new BusinessException(400, error instanceof Error ? error.message : String(error))
    }

    await this.persistence.replaceRuntimeRows(
      row.instance_id,
      tenantId,
      state,
      runtime.getVariables(),
      lockVersion,
    )
    await this.syncInstanceStatus(row.instance_id, state)

    await this.instances.insertComment(tenantId, {
      taskId,
      instanceId: row.instance_id,
      userId,
      action: 'approve_recall',
      comment: '审批召回，重新处理',
      targetUserId: null,
    })
  }

  // ------------------------------------------------------------ 解析上下文与通知

  /**
   * 审批/办理人解析上下文（服务层预计算）。
   *
   * adminUserId：sys_user 中 username='admin' 的用户（找不到策略 to_admin / 超时转派兜底）。
   * initiatorSupervisor：org 表无负责人字段，v1 恒为 null（supervisor/dept_head 策略降级到旧语义）。
   * roleMemberships：角色编码 → 成员用户 ID 列表（role 类型审批人解析用；表小全量预查）。
   * adminUserIdOverride：流程级审批管理员（adminUserIds[0]）传入时优先（Task 76）。
   */
  private async buildResolutionContext(adminUserIdOverride?: string): Promise<ResolutionContext> {
    const admin = await this.db
      .selectFrom('sys_user')
      .select('id')
      .where('username', '=', 'admin')
      .where('is_deleted', '=', 0)
      .executeTakeFirst()
    const roleRows = await this.db
      .selectFrom('sys_role')
      .innerJoin('sys_user_role', 'sys_user_role.role_id', 'sys_role.id')
      .select(['sys_role.role_code', 'sys_user_role.user_id'])
      .where('sys_role.is_deleted', '=', 0)
      .where('sys_role.status', '=', 1)
      .execute()
    const roleMemberships: Record<string, string[]> = {}
    for (const row of roleRows) {
      if (row.role_code === null) continue
      const members = roleMemberships[row.role_code] ?? []
      members.push(String(row.user_id))
      roleMemberships[row.role_code] = members
    }
    return {
      adminUserId: adminUserIdOverride ?? (admin === undefined ? null : String(admin.id)),
      initiatorSupervisor: null,
      roleMemberships,
    }
  }

  /** 此实例+节点下是否存在加签意见（必须加签门禁用）。 */
  private async hasAddSignComment(instanceId: string, nodeId: string): Promise<boolean> {
    const taskRows = await this.db
      .selectFrom('wfe_task')
      .select('id')
      .where('instance_id', '=', instanceId)
      .where('node_id', '=', nodeId)
      .execute()
    if (taskRows.length === 0) return false
    const comment = await this.db
      .selectFrom('wf_task_comment')
      .select('id')
      .where('action', '=', 'add_sign')
      .where(
        'task_id',
        'in',
        taskRows.map((r) => r.id),
      )
      .limit(1)
      .executeTakeFirst()
    return comment !== undefined
  }

  /**
   * 查用户最近一条手写签名（signature.useLast=true 时 getTaskDetail 回填用）。
   * 取该用户 tenant 内 action=approve 且 signature 非空的最新意见。
   */
  private async findLastSignature(tenantId: string, userId: string | null): Promise<string | null> {
    if (userId === null || userId === '') return null
    const row = await this.db
      .selectFrom('wf_task_comment')
      .select('signature')
      .where('tenant_id', '=', tenantId)
      .where('user_id', '=', userId)
      .where('action', '=', 'approve')
      .where('signature', 'is not', null)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst()
    return row?.signature ?? null
  }

  /**
   * 实例变量 __instanceSummary → 短信摘要后缀（流程级 summaryShowInSms=true 时生效）。
   * 变量未渲染（未配置摘要）或策略未开启 → 空串。
   */
  private async loadSmsSummarySuffix(
    instanceId: string,
    processDefinitionId: string,
  ): Promise<string> {
    const policy = await this.loadProcessPolicy(processDefinitionId)
    if (!policy.summaryShowInSms || policy.summaryFields.length === 0) return ''
    const row = await this.db
      .selectFrom('wfe_variable')
      .select('value_json')
      .where('instance_id', '=', instanceId)
      .where('name', '=', '__instanceSummary')
      .executeTakeFirst()
    if (row === undefined || row.value_json === null) return ''
    try {
      const value = JSON.parse(row.value_json) as unknown
      if (typeof value === 'string' && value !== '') return `【${value}】`
    } catch {
      // 非 JSON 字符串也接受
      if (row.value_json !== '') return `【${row.value_json}】`
    }
    return ''
  }

  /** 节点 notify.sms=true 的新建待办 → 写短信通知记录（占位表，后续接入网关）。 */
  private async writeNodeSmsNotifications(
    tenantId: string,
    instanceId: string,
    state: { tasks: Array<{ id: string; nodeId: string; status: string; assignee: string | null }> },
    model: { nodes: Record<string, { notify?: { sms?: boolean }; name?: string }> },
    smsSummarySuffix = '',
  ): Promise<void> {
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
          content: `您有新的办理任务：${node.name ?? task.nodeId}${smsSummarySuffix}`,
          status: 'PENDING',
          created_at: new Date(),
        })
        .execute()
    }
  }

  /** 实例结束 + 发起节点 smsOnEnd=true → 给发起人的短信通知记录。 */
  private async writeInstanceEndSms(
    tenantId: string,
    instanceId: string,
    model: {
      initiatorNodeId: string | null
      nodes: Record<string, { initiatorOptions?: { smsOnEnd?: boolean } }>
    },
    initiator: string | null,
  ): Promise<void> {
    if (initiator === null || initiator === '') return
    const initiatorNode =
      model.initiatorNodeId !== null && model.initiatorNodeId !== undefined
        ? model.nodes[model.initiatorNodeId]
        : undefined
    if (initiatorNode?.initiatorOptions?.smsOnEnd !== true) return
    await this.db
      .insertInto('wf_engine_notify')
      .values({
        id: randomUuid(),
        tenant_id: tenantId,
        instance_id: instanceId,
        task_id: null,
        notify_type: 'SMS_END',
        target_user: initiator,
        content: '您发起的流程已结束',
        status: 'PENDING',
        created_at: new Date(),
      })
      .execute()
  }

  // ------------------------------------------------------------ 辅助查询

  private async findApproveResult(taskId: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('wf_task_comment')
      .select('action')
      .where('task_id', '=', taskId)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst()
    return row?.action ?? null
  }

  private async isReminded(taskId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('wf_task_remind')
      .select('id')
      .where('task_id', '=', taskId)
      .limit(1)
      .executeTakeFirst()
    return row !== undefined
  }

  /** 某个活动结束之后启动的下一个活动节点（done 列表的 currentNode 用它）。 */
  private async findNextActivityAfter(
    instanceId: string,
    after: Date | null,
  ): Promise<string | null> {
    if (after === null) return null
    const rows = await this.db
      .selectFrom('wfe_activity')
      .select('node_id')
      .where('instance_id', '=', instanceId)
      .where('start_time', '>', after)
      .orderBy('start_time', 'asc')
      .limit(1)
      .executeTakeFirst()
    return rows?.node_id ?? null
  }
}

/** 从 processDefinitionId（key:version:uuid）取版本号。 */
export function versionOf(processDefinitionId: string): number | null {
  const parts = processDefinitionId.split(':')
  if (parts.length < 2) return null
  const n = Number(parts[1])
  return Number.isFinite(n) ? n : null
}

/**
 * 操作开关的键（`com.workflow.api.dto.OperationsConfig` 的四字段 + 新增三键）。
 *
 * 新增键：allowPass（通过，恒真核心动作）、allowRefuse（拒绝）、allowReturn（退回）。
 * 旧数据缺新键 → 默认 true（保持既有按钮可见行为）；显式 false 才关闭。
 * **顺序无关**（JSON 对象按键比对），但保持与 Java 声明一致便于对照。
 */
const OPERATION_KEYS = [
  'allowReject',
  'allowAddSign',
  'allowTransfer',
  'allowDelegate',
  'allowPass',
  'allowRefuse',
  'allowReturn',
] as const

/**
 * 节点级 operation 的**缺键默认值**。
 *
 * ⚠️ 来自 Java `OperationsConfig` 的**字段初始化器**，不是 `false`：
 *    `allowReject = true`、`allowAddSign = false`、`allowTransfer = true`、`allowDelegate = false`。
 *    原先写成 `Boolean(source[key])`（缺键即 false）会让「配置里没写 allowReject/allowTransfer」
 *    的两侧取值分叉。之所以一直没暴露，是因为契约场景的节点级配置恰好写全了这两项。
 */
const OPERATION_DEFAULTS: Record<(typeof OPERATION_KEYS)[number], boolean> = {
  allowReject: true,
  allowAddSign: false,
  allowTransfer: true,
  allowDelegate: false,
  allowPass: true,
  allowRefuse: true,
  allowReturn: true,
}

/**
 * 解析节点级 operations（对齐 Java `parseOperationsFromConfig`）。
 *
 * - `configJson` 为 null、或 `operations` 不是对象 ⇒ 返回**整套默认值**；
 * - 否则只在键存在时覆盖默认值。
 *
 * ⚠️ 与旧实现的差别就在这里：旧实现解析失败返回 `null`（响应里是 `operations: null`），
 *    而 Java 永远返回一个对象（`OperationsConfig` 的字段有默认值）。
 *    所以本函数**永不为 null**。
 */
export function parseOperationsFromConfig(
  configJson: string | null,
): Record<string, boolean> {
  const out: Record<string, boolean> = { ...OPERATION_DEFAULTS }
  if (configJson === null) return out
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(configJson) as Record<string, unknown>
  } catch {
    // Java 的 catch 分支返回的是刚构造的 result（即默认值），不是 null
    return out
  }
  const operations = parsed.operations
  if (operations === null || typeof operations !== 'object' || Array.isArray(operations)) {
    return out
  }
  for (const key of OPERATION_KEYS) {
    const value = (operations as Record<string, unknown>)[key]
    if (value !== undefined) out[key] = Boolean(value)
  }
  // 配置里出现的其它开关也一并带回（向前兼容 Java 侧 DTO 未来加字段）
  for (const [key, value] of Object.entries(operations as Record<string, unknown>)) {
    if (!(key in out)) out[key] = Boolean(value)
  }
  return out
}

/**
 * 解析流程级 operations（对齐 Java `parseProcessOperations`）。
 *
 * ⚠️ 读的是 **`approvalPolicy.operations`**（与节点级的 `operations` 不同一层），
 *    而且四个键的默认值在这里是**全 `true`**（Java 先 `setAllowXxx(true)` 再覆盖）
 *    —— 与节点级的默认值不同，别把两者合并成一个函数。
 */
export function parseProcessOperations(configJson: string | null): Record<string, boolean> {
  const out: Record<string, boolean> = {
    allowReject: true,
    allowAddSign: true,
    allowTransfer: true,
    allowDelegate: true,
    allowPass: true,
    allowRefuse: true,
    allowReturn: true,
  }
  if (configJson === null) return out
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(configJson) as Record<string, unknown>
  } catch {
    return out
  }
  const policy = parsed.approvalPolicy
  if (policy === null || typeof policy !== 'object') return out
  const operations = (policy as Record<string, unknown>).operations
  if (operations === null || typeof operations !== 'object' || Array.isArray(operations)) {
    return out
  }
  for (const key of OPERATION_KEYS) {
    const value = (operations as Record<string, unknown>)[key]
    if (value !== undefined) out[key] = Boolean(value)
  }
  return out
}

/**
 * 多实例节点的「作用域内建变量」（对齐 Flowable 的 MI 内建变量）。
 *
 * 为什么需要这一段：Java 的 `GET /tasks/{id}` 返回的 `variables` 是
 * `taskService.getVariables(taskId)` —— 它会**沿执行作用域链**把 MI 根上的局部变量
 * 一并带出来。Node 侧原先只给实例级变量，于是**多实例任务**的任务详情少了 7 个键
 * （`approver`/`approverList`/`loopCounter`/`nrOfInstances`/`nrOfActiveInstances`/
 * `nrOfCompletedInstances`/`rejected`）—— 契约场景「任务转签」当场报出。
 *
 * ⚠️ `rejected` 是 MI 作用域的**局部**变量（Flowable 的 completionCondition
 *    `${rejected || nrOfCompletedInstances == nrOfInstances}` 依赖它，所以 rewriter
 *    在进入 MI 时把它初始化成 false）。实例级如果已被设成 true，这里**以实例级为准**
 *    （MI + 驳回的组合没有 golden 覆盖，取更符合直觉的一种并留痕）。
 *
 * ⚠️ 非 MI 任务原样返回 `variables` —— 不能无条件加这些键，否则所有单实例任务的
 *    任务详情都会多出 7 个 Java 没有的字段。
 */
function mergeMultiInstanceScope(
  state: {
    tasks: Array<{ id: string; executionId: string; assignee: string | null }>
    executions: Array<{
      id: string
      miRootId: string | null
      miIndex: number | null
      status: string
    }>
  },
  taskId: string,
  approval: { userIds: string[] } | undefined,
  variables: Record<string, unknown>,
): Record<string, unknown> {
  const task = state.tasks.find((t) => t.id === taskId)
  if (task === undefined) return variables
  const execution = state.executions.find((e) => e.id === task.executionId)
  if (execution === undefined || execution.miRootId === null) return variables

  // ⚠️ MI **根**自身的 `miRootId` 指向自己（`root.miRootId = root.id`），
  //    不排掉它会把实例数多算 1（实测：2 个审批人算出 nrOfInstances=3）。
  const children = state.executions.filter(
    (e) => e.miRootId === execution.miRootId && e.id !== e.miRootId,
  )
  return {
    ...variables,
    approver: task.assignee,
    approverList: approval?.userIds ?? [],
    loopCounter: execution.miIndex ?? 0,
    nrOfInstances: children.length,
    nrOfActiveInstances: children.filter((c) => c.status !== 'COMPLETED').length,
    nrOfCompletedInstances: children.filter((c) => c.status === 'COMPLETED').length,
    rejected: variables.rejected ?? false,
  }
}