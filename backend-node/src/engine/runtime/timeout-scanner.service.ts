import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Kysely } from 'kysely'
import type { DB } from '../../framework/database/types'
import { KYSELY } from '../../framework/database/database.module'
import { getTenantId, runWithTenant } from '../../framework/tenant/tenant-context'
import type { ProcessModel, ProcessPolicy, ProcessTimeoutRule } from '../process/compiler/process-model'
import { randomUuid } from '../process/process-design.service'
import { EnginePersistence } from './engine-persistence'
import { ProcessInstanceService } from './process-instance.service'
import { EngineRuntime } from './engine-runtime'
import { parseProcessPolicy } from '../process/compiler/process-policy'
import { ProcessDesignRepository } from '../process/repository/process-design.repository'

/**
 * 超时处理调度器（节点 timeout.enabled=true 的待办任务扫描）。
 *
 * 语义（对齐设计器「超时处理」配置）：
 *   - remind   ：写催办记录 + 通知记录（SMS 不发送，落 wf_engine_notify 占位）
 *   - escalate ：写催办记录 + 通知（转派给主管需要组织架构，v1 降级为提醒升级文案）
 *   - transfer ：转派给审批管理员（sys_user admin；找不到则降级为提醒）
 *   - pass     ：自动通过（写 action=approve、comment=超时自动通过 的意见）
 *   - refuse   ：自动拒绝（终止实例，写 action=refuse 意见）
 *
 * 实现说明：
 *   - 60s 轮询；扫描所有租户的开放任务（RUNNING 实例 + CREATED/CLAIMED）
 *   - 任务到达超时阈值（create_time + duration 小时）且未处理过（本调度器只认
 *     wf_engine_notify 里 TIMEOUT_REMIND 记录作为幂等标记，避免每轮重复动作）
 *   - pass/refuse 直接复用 TaskService.completeTask / instances.terminateInstance
 *     —— 但那两条链路依赖请求级租户上下文，因此每次动作都包在 runWithTenant 内
 */
@Injectable()
export class TimeoutScannerService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null
  /** 扫描中标志（防止上一轮未结束时重叠执行）。 */
  private running = false

  constructor(
    @Inject(KYSELY) private readonly db: Kysely<DB>,
    private readonly persistence: EnginePersistence,
    private readonly instances: ProcessInstanceService,
    /** 可选注入：测试手动 new 时不传；流程级规则组读取降级为空。 */
    private readonly designRepo?: ProcessDesignRepository,
  ) {}

  onModuleInit(): void {
    // 沙箱/生产都默认开启；60s 间隔足够（超时粒度是小时级）
    this.timer = setInterval(() => {
      void this.scanOnce()
    }, 60_000)
    // 不阻塞进程退出的保险
    if (typeof this.timer.unref === 'function') this.timer.unref()
  }

  onModuleDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }

  /** 单轮扫描（公开便于测试手动触发）。 */
  async scanOnce(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      const tenantRows = await this.db
        .selectFrom('wfe_task')
        .innerJoin('wfe_process_instance', 'wfe_process_instance.id', 'wfe_task.instance_id')
        .select(['wfe_task.tenant_id as tenantId'])
        .where('wfe_task.status', 'in', ['CREATED', 'CLAIMED'])
        .where('wfe_process_instance.status', '=', 'RUNNING')
        .groupBy('wfe_task.tenant_id')
        .execute()
      for (const row of tenantRows) {
        await runWithTenant(row.tenantId, () => this.scanTenant())
      }
    } catch {
      // 调度器永不抛错（无请求上下文可接）；异常留日志
      // eslint-disable-next-line no-console
      console.error('[TimeoutScanner] 扫描失败', new Date().toISOString())
    } finally {
      this.running = false
    }
  }

  private async scanTenant(): Promise<void> {
    const tenantId = getTenantId()
    const rows = await this.db
      .selectFrom('wfe_task')
      .innerJoin('wfe_process_instance', 'wfe_process_instance.id', 'wfe_task.instance_id')
      .select([
        'wfe_task.id as taskId',
        'wfe_task.node_id as nodeId',
        'wfe_task.instance_id as instanceId',
        'wfe_task.create_time as createTime',
        'wfe_task.tenant_id as tenantId',
        'wfe_task.assignee as assignee',
      ])
      .where('wfe_task.tenant_id', '=', tenantId)
      .where('wfe_task.status', 'in', ['CREATED', 'CLAIMED'])
      .where('wfe_process_instance.status', '=', 'RUNNING')
      .execute()

    // 按 definition 分组加载模型与流程级策略（一租户内定义数有限）
    const modelCache = new Map<string, ProcessModel>()
    const policyCache = new Map<string, ProcessPolicy>()
    for (const row of rows) {
      const model = await this.loadModelForTask(row.instanceId, modelCache)
      if (model === null) continue
      const defId = await this.findDefIdForInstance(row.instanceId)
      if (defId === null) continue
      let policy = policyCache.get(defId)
      if (policy === undefined) {
        policy = await this.loadPolicyForDef(defId)
        policyCache.set(defId, policy)
      }
      const node = model.nodes[row.nodeId]

      // 节点未开启超时 → 流程级规则组兕底（对齐设计器「超时处理」：“此配置不对已
      // 经开启了超时处理的节点生效”；pass/refuse 对办理(handler)节点不生效）
      if (node?.timeout?.enabled !== true) {
        if (policy.timeoutRules.length === 0) continue
        await this.applyProcessTimeoutRules(row, node?.taskRole, policy.timeoutRules)
        continue
      }

      const durationHours = node.timeout.duration ?? 24
      const deadline = new Date(row.createTime).getTime() + durationHours * 3_600_000
      if (Date.now() < deadline) continue

      // 幂等：该任务已做过超时处理则跳过
      const processed = await this.db
        .selectFrom('wf_engine_notify')
        .select('id')
        .where('task_id', '=', row.taskId)
        .where('notify_type', '=', 'TIMEOUT_REMIND')
        .limit(1)
        .executeTakeFirst()
      if (processed !== undefined) continue

      await this.applyTimeoutAction(row, node.timeout.action ?? 'remind', 'TIMEOUT_REMIND')
    }
  }

  /** 单条规则的时长（毫秒）。 */
  private ruleDurationMs(rule: ProcessTimeoutRule): number {
    const unitMinutes = rule.unit === 'minute' ? 1 : rule.unit === 'hour' ? 60 : 1440
    return rule.duration * unitMinutes * 60_000
  }

  /**
   * 流程级规则组处理：对每条规则独立计算 deadline 与幂等标记。
   * 幂等：动作类（transfer/pass/refuse）靠 TIMEOUT_{ACTION} notify 记录；
   * remind 非重复靠 TIMEOUT_REMIND 记录，重复提醒需距上次提醒 ≥ 规则时长。
   */
  private async applyProcessTimeoutRules(
    row: {
      taskId: string
      instanceId: string
      nodeId: string
      assignee: string | null
      createTime: Date
    },
    taskRole: string | undefined,
    rules: ProcessTimeoutRule[],
  ): Promise<void> {
    const now = Date.now()
    for (const rule of rules) {
      const handlerNode = taskRole === 'handler'
      if (handlerNode && (rule.action === 'pass' || rule.action === 'refuse')) continue
      const durationMs = this.ruleDurationMs(rule)
      if (now < new Date(row.createTime).getTime() + durationMs) continue

      if (rule.action === 'remind') {
        const last = await this.db
          .selectFrom('wf_engine_notify')
          .select(['id', 'created_at'])
          .where('task_id', '=', row.taskId)
          .where('notify_type', '=', 'TIMEOUT_REMIND')
          .orderBy('created_at', 'desc')
          .limit(1)
          .executeTakeFirst()
        if (last !== undefined) {
          if (rule.repeat !== true) continue
          const lastAt = last.created_at === null ? 0 : new Date(last.created_at).getTime()
          if (now - lastAt < durationMs) continue
        }
        // 幂等标记（与节点级同类型）
        await this.writeNotify(row, 'TIMEOUT_REMIND', '任务超时，自动提醒（流程级规则）')
        // 被提醒人：当前审批人 / 审批管理员 / 更多员工
        const targets = await this.resolveNotifyTargets(row, rule)
        const smsTargets = rule.sms ? targets : []
        for (const target of smsTargets) {
          await this.writeNotify(row, 'SMS_TIMEOUT', '任务超时，自动提醒（流程级规则）', target)
        }
        await this.instances.insertComment(getTenantId(), {
          taskId: row.taskId,
          instanceId: row.instanceId,
          userId: 'system',
          action: 'remind',
          comment: '任务超时，自动提醒（流程级规则）',
          targetUserId: null,
        })
        continue
      }

      // 动作类：幂等 = 已有 TIMEOUT_{ACTION} 记录
      const notifyType = `TIMEOUT_${rule.action.toUpperCase()}`
      const done = await this.db
        .selectFrom('wf_engine_notify')
        .select('id')
        .where('task_id', '=', row.taskId)
        .where('notify_type', '=', notifyType)
        .limit(1)
        .executeTakeFirst()
      if (done !== undefined) continue
      await this.applyTimeoutAction(row, rule.action, notifyType)
    }
  }

  /** 被提醒人集合（当前审批人/审批管理员/更多员工）。 */
  private async resolveNotifyTargets(
    row: { taskId: string; assignee: string | null },
    rule: ProcessTimeoutRule,
  ): Promise<string[]> {
    const targets: string[] = []
    if (rule.notifyAssignee && row.assignee !== null && row.assignee !== '') {
      targets.push(row.assignee)
    }
    if (rule.notifyAdmin) {
      const admin = await this.db
        .selectFrom('sys_user')
        .select('id')
        .where('username', '=', 'admin')
        .where('is_deleted', '=', 0)
        .executeTakeFirst()
      if (admin !== undefined) targets.push(String(admin.id))
    }
    for (const extra of rule.notifyUserIds ?? []) {
      if (!targets.includes(extra)) targets.push(extra)
    }
    return targets
  }

  /** 落一条 wf_engine_notify（幂等标记 / 短信占位）。 */
  private async writeNotify(
    row: { instanceId: string; taskId: string },
    notifyType: string,
    content: string,
    targetUser = '',
  ): Promise<void> {
    await this.db
      .insertInto('wf_engine_notify')
      .values({
        id: randomUuid(),
        tenant_id: getTenantId(),
        instance_id: row.instanceId,
        task_id: row.taskId,
        notify_type: notifyType,
        target_user: targetUser,
        content,
        status: 'SENT',
        created_at: new Date(),
      })
      .execute()
  }

  private async applyTimeoutAction(
    row: { taskId: string; instanceId: string; nodeId: string },
    action: 'remind' | 'escalate' | 'transfer' | 'pass' | 'refuse',
    notifyType: string,
  ): Promise<void> {
    const tenantId = getTenantId()
    // 幂等标记（remind/escalate/transfer 落通知；pass/refuse 靠任务状态自然幂等）
    await this.writeNotify(row, notifyType, `任务超时（${action}）`)

    if (action === 'remind' || action === 'escalate') {
      await this.instances.insertComment(tenantId, {
        taskId: row.taskId,
        instanceId: row.instanceId,
        userId: 'system',
        action: 'remind',
        comment: action === 'remind' ? '任务超时，自动提醒' : '任务超时，升级提醒',
        targetUserId: null,
      })
      return
    }

    if (action === 'transfer') {
      // 转派给审批管理员（sys_user admin）；查不到降级为提醒
      const admin = await this.db
        .selectFrom('sys_user')
        .select('id')
        .where('username', '=', 'admin')
        .where('is_deleted', '=', 0)
        .executeTakeFirst()
      if (admin !== undefined) {
        await this.db
          .updateTable('wfe_task')
          .set({ assignee: String(admin.id), updated_at: new Date() })
          .where('id', '=', row.taskId)
          .execute()
        await this.instances.insertComment(tenantId, {
          taskId: row.taskId,
          instanceId: row.instanceId,
          userId: 'system',
          action: 'transfer',
          comment: '任务超时，自动转派审批管理员',
          targetUserId: String(admin.id),
        })
        return
      }
      await this.instances.insertComment(tenantId, {
        taskId: row.taskId,
        instanceId: row.instanceId,
        userId: 'system',
        action: 'remind',
        comment: '任务超时（转派失败：未找到审批管理员）',
        targetUserId: null,
      })
      return
    }

    if (action === 'pass') {
      await runWithTenant(tenantId, async () => {
        await this.completeAsSystem(row.taskId, '超时自动通过')
      })
      return
    }

    // refuse：终止实例
    await this.instances.insertComment(tenantId, {
      taskId: row.taskId,
      instanceId: row.instanceId,
      userId: 'system',
      action: 'refuse',
      comment: '超时自动拒绝',
      targetUserId: null,
    })
    await this.instances.terminateInstance(row.instanceId, '超时自动拒绝')
  }

  /** 超时自动通过（系统身份完成）。 */
  private async completeAsSystem(taskId: string, comment: string): Promise<void> {
    const tenantId = getTenantId()
    const row = await this.persistence.findTaskWithInstance(taskId, tenantId)
    if (row === null) return
    const { state, variables, maxSeq, lockVersion } = await this.persistence.loadState(
      row.instance_id,
    )
    const model = await this.instances.loadModel(row.process_def_id)
    if (model === null) return
    const runtime = new EngineRuntime(model, state, () => new Date(), () => randomUuid())
    runtime.seedSeq(maxSeq)
    runtime.restoreVariables(variables)
    try {
      runtime.completeTask(taskId, {})
    } catch {
      return // 任务可能已被处理
    }
    await this.persistence.replaceRuntimeRows(
      row.instance_id,
      tenantId,
      state,
      runtime.getVariables(),
      lockVersion,
    )
    const finished = state.status === 'COMPLETED'
    await this.persistence.updateInstanceStatus(
      row.instance_id,
      finished ? 'COMPLETED' : 'RUNNING',
      finished ? new Date() : null,
    )
    await this.instances.insertComment(tenantId, {
      taskId,
      instanceId: row.instance_id,
      userId: 'system',
      action: 'approve',
      comment,
      targetUserId: null,
    })
  }

  private async loadModelForTask(
    instanceId: string,
    cache: Map<string, ProcessModel>,
  ): Promise<ProcessModel | null> {
    const instance = await this.db
      .selectFrom('wfe_process_instance')
      .select('process_def_id')
      .where('id', '=', instanceId)
      .executeTakeFirst()
    if (instance === undefined) return null
    const cached = cache.get(instance.process_def_id)
    if (cached !== undefined) return cached
    const model = await this.instances.loadModel(instance.process_def_id)
    if (model !== null) cache.set(instance.process_def_id, model)
    return model
  }

  /** 实例 → 部署版本 ID（流程级策略读取用）。 */
  private async findDefIdForInstance(instanceId: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('wfe_process_instance')
      .select('process_def_id')
      .where('id', '=', instanceId)
      .executeTakeFirst()
    return row?.process_def_id ?? null
  }

  /** 读部署版本的流程级策略（__PROCESS__ config_json；无 repo 时空策略）。 */
  private async loadPolicyForDef(defId: string): Promise<ProcessPolicy> {
    if (this.designRepo === undefined) return parseProcessPolicy(null)
    const config = await this.designRepo.findNodeConfig(defId, '__PROCESS__')
    return parseProcessPolicy(config?.config_json ?? null)
  }
}
