import { describe, expect, it, vi } from 'vitest'
import { TaskService } from '../../../src/engine/task/task.service'
import { ProcessInstanceService } from '../../../src/engine/runtime/process-instance.service'
import { runWithTenant } from '../../../src/framework/tenant/tenant-context'

/**
 * 手写签名链路的单测（Task 64 补齐 useLast/allowUpload 时发现的欠账）：
 *
 *   ① completeTask 的 body.signature 此前**校验完就丢弃**，没有落库 ——
 *      本 spec 钉住「approve 意见必须携带 signature（有则传、无则 null）」；
 *   ② signature.required 的拦截形态（400 + 文案）；
 *   ③ getTaskDetail 仅在 signature.useLast=true 时回查 lastSignature
 *      （false/缺省不查 —— 避免每次任务详情都多打一条 DB 查询）。
 */

/** 可复用的引擎态：单执行 + 一个 CREATED 任务，Node_1 出口直达 endEvent。 */
function runningState(): Record<string, unknown> {
  return {
    status: 'RUNNING',
    executions: [
      {
        id: 'exec-1',
        nodeId: 'Node_1',
        arrivedVia: null,
        parentId: null,
        scopeId: null,
        containerId: null,
        status: 'ACTIVE',
        isScope: true,
        miRootId: null,
        miIndex: null,
      },
    ],
    tasks: [
      {
        id: 'task-1',
        executionId: 'exec-1',
        nodeId: 'Node_1',
        assignee: '1',
        candidateUsers: [],
        status: 'CREATED',
        miIndex: null,
        createTime: new Date(),
        claimTime: null,
        endTime: null,
      },
    ],
    activities: [],
    joinArrivals: {},
    activeBranchSets: {},
  }
}

function modelWith(signature: Record<string, unknown> | undefined): Record<string, unknown> {
  return {
    processKey: 'p',
    processName: 'P',
    startNodeId: 'Start_1',
    initiatorNodeId: 'Start_1',
    nodes: {
      Start_1: {
        nodeId: 'Start_1',
        nodeType: 'startEvent',
        name: '发起',
        containerId: null,
        incoming: [],
        outgoing: ['f1'],
        isInitiator: true,
        initiatorOptions: { smsOnEnd: false },
      },
      Node_1: {
        nodeId: 'Node_1',
        nodeType: 'userTask',
        name: '审批',
        containerId: null,
        incoming: ['f1'],
        outgoing: ['f2'],
        isInitiator: false,
        taskRole: 'approver',
        approvalType: 'artificial',
        approval: { userIds: ['1'], roleCodes: [], multiMode: 'or_sign' },
        signature,
      },
      End_1: {
        nodeId: 'End_1',
        nodeType: 'endEvent',
        name: '结束',
        containerId: null,
        incoming: ['f2'],
        outgoing: [],
        isInitiator: false,
      },
    },
    flows: {
      f1: { flowId: 'f1', sourceId: 'Start_1', targetId: 'Node_1', condition: null, isDefault: false },
      f2: { flowId: 'f2', sourceId: 'Node_1', targetId: 'End_1', condition: null, isDefault: false },
    },
    containers: {},
  }
}

const TASK_ROW = {
  id: 'task-1',
  instance_id: 'inst-1',
  process_def_id: 'def-1',
  node_id: 'Node_1',
  assignee: '1',
  initiator: '1',
  business_key: 'bk',
  process_name: 'P',
  create_time: new Date(),
}

/** kysely 空链 mock（buildResolutionContext 的两条查询走这里）。 */
function inertDb() {
  const chain = () => {
    const c: Record<string, unknown> = {}
    const self = () => c
    c.select = self
    c.where = self
    c.innerJoin = self
    c.orderBy = self
    c.limit = self
    c.execute = async () => []
    c.executeTakeFirst = async () => undefined
    return c
  }
  return {
    selectFrom: () => chain(),
    insertInto: () => ({ values: () => ({ execute: async () => undefined }) }),
    updateTable: () => ({ set: () => ({ where: () => ({ execute: async () => undefined }) }) }),
  } as never
}

describe('TaskService.completeTask 签名落库', () => {
  function serviceWith(signature: Record<string, unknown> | undefined) {
    const recorded = { comments: [] as Array<Record<string, unknown>> }
    const service = new TaskService(
      inertDb(),
      {
        findTaskWithInstance: async () => TASK_ROW,
        loadState: async () => ({
          state: runningState(),
          variables: {},
          maxSeq: 0,
          lockVersion: 0,
        }),
        replaceRuntimeRows: async () => undefined,
        updateInstanceStatus: async () => undefined,
      } as never,
      {
        loadModel: async () => modelWith(signature),
        insertComment: async (_tenant: string, row: Record<string, unknown>) => {
          recorded.comments.push(row)
        },
      } as never,
      { findNodeConfig: async () => null } as never,
      { run: async () => 0 } as never,
    )
    return { service, recorded }
  }

  it('body.signature 有值 → approve 意见携带 signature（此前被丢弃）', async () => {
    const { service, recorded } = serviceWith({ enabled: true, required: true })
    await runWithTenant('default', () =>
      service.completeTask('task-1', { userId: '1', comment: '同意', signature: 'data:image/png;base64,AAA' }),
    )
    expect(recorded.comments).toHaveLength(1)
    expect(recorded.comments[0]).toMatchObject({
      action: 'approve',
      signature: 'data:image/png;base64,AAA',
    })
  })

  it('未签名 → 意见 signature 为 null（不缺键，schema 恒有列）', async () => {
    const { service, recorded } = serviceWith({ enabled: true })
    await runWithTenant('default', () =>
      service.completeTask('task-1', { userId: '1', comment: null }),
    )
    expect(recorded.comments[0]).toMatchObject({ action: 'approve', signature: null })
  })

  it('required=true 且未签名 → 400「此节点要求手写签名」且不落任何意见', async () => {
    const { service, recorded } = serviceWith({ enabled: true, required: true })
    const error = await runWithTenant('default', () =>
      service.completeTask('task-1', { userId: '1', comment: 'x' }).catch((e: unknown) => e),
    )
    expect((error as Error).message).toContain('此节点要求手写签名')
    expect(recorded.comments).toEqual([])
  })
})

describe('TaskService.getTaskDetail lastSignature 门控', () => {
  function detailServiceWith(options: {
    signature?: Record<string, unknown>
    lastSignatureRow?: { signature: string } | undefined
  }) {
    const recorded = { queried: 0 }
    const chain = () => {
      const c: Record<string, unknown> = {}
      const self = () => c
      c.select = self
      c.where = self
      c.innerJoin = self
      c.orderBy = self
      c.limit = self
      c.execute = async () => []
      c.executeTakeFirst = async () => options.lastSignatureRow
      return c
    }
    const db = {
      selectFrom: (table: string) => {
        if (table === 'wf_task_comment') recorded.queried += 1
        return chain()
      },
      insertInto: () => ({ values: () => ({ execute: async () => undefined }) }),
      updateTable: () => ({ set: () => ({ where: () => ({ execute: async () => undefined }) }) }),
    } as never

    const service = new TaskService(
      db,
      {
        findTaskWithInstance: async () => TASK_ROW,
        loadState: async () => ({
          state: { status: 'RUNNING', executions: [], tasks: [], activities: [] },
          variables: {},
          maxSeq: 0,
          lockVersion: 0,
        }),
        findUserNames: async () => new Map(),
      } as never,
      {
        loadModel: async () => modelWith(options.signature),
      } as never,
      { findNodeConfig: async () => null } as never,
      { run: async () => 0 } as never,
    )
    return { service, recorded }
  }

  it('useLast=true → 回查最近签名并下发 nodeFlags.signatureUseLast/AllowUpload', async () => {
    const { service, recorded } = detailServiceWith({
      signature: { enabled: true, useLast: true, allowUpload: true },
      lastSignatureRow: { signature: 'data:image/png;base64,OLD' },
    })
    const detail = await runWithTenant('default', () => service.getTaskDetail('task-1'))
    expect(recorded.queried).toBe(1)
    expect(detail.nodeFlags.signatureUseLast).toBe(true)
    expect(detail.nodeFlags.signatureAllowUpload).toBe(true)
    expect(detail.lastSignature).toBe('data:image/png;base64,OLD')
  })

  it('useLast 缺省 → 不查签名（lastSignature=null，零额外查询）', async () => {
    const { service, recorded } = detailServiceWith({ signature: { enabled: true } })
    const detail = await runWithTenant('default', () => service.getTaskDetail('task-1'))
    expect(recorded.queried).toBe(0)
    expect(detail.lastSignature).toBeNull()
    expect(detail.nodeFlags.signatureUseLast).toBe(false)
  })
})

describe('ProcessInstanceService.reInitiate', () => {
  function reinitServiceWith(options: {
    instance?: Record<string, unknown> | null
    model?: Record<string, unknown> | null
  }) {
    const service = new ProcessInstanceService(
      inertDb(),
      {
        findInstance: async () =>
          options.instance === undefined
            ? {
                id: 'inst-1',
                tenant_id: 'default',
                process_def_id: 'def-1',
                process_key: 'leave',
                process_name: '请假',
                business_key: 'bk-1',
                status: 'COMPLETED',
                initiator: '1',
                parent_instance_id: null,
                parent_node_id: null,
                start_time: new Date(),
                end_time: new Date(),
                delete_reason: null,
              }
            : options.instance,
        // reInitiate 校验读**最新部署版本**（findLatestDeployedDef，model_json 反序列化）
        findLatestDeployedDef: async () =>
          options.model === null
            ? null
            : { model_json: JSON.stringify(options.model ?? modelWith(undefined)) },
        loadState: async () => ({
          state: { status: 'COMPLETED', executions: [], tasks: [], activities: [] },
          variables: { day: 3, initiator: '1' },
          maxSeq: 0,
          lockVersion: 0,
        }),
      } as never,
      { run: async () => 0 } as never,
    )
    const startSpy = vi
      .spyOn(service, 'start')
      .mockResolvedValue({ id: 'inst-new', processDefinitionId: 'def-2', processDefinitionKey: 'leave', businessKey: 'bk-1', tenantId: 'default' })
    return { service, startSpy }
  }

  it('RUNNING 实例 → 400「流程仍在进行中」，不发起', async () => {
    const { service, startSpy } = reinitServiceWith({
      instance: { id: 'inst-1', process_def_id: 'def-1', process_key: 'leave', business_key: 'bk', status: 'RUNNING', initiator: '1' },
    })
    const error = await runWithTenant('default', () =>
      service.reInitiate('inst-1', '1').catch((e: unknown) => e),
    )
    expect((error as Error).message).toBe('流程仍在进行中，无法再次发起')
    expect(startSpy).not.toHaveBeenCalled()
  })

  it('发起节点 reInitiate=false → 400「该流程不支持再次发起」', async () => {
    const model = modelWith(undefined) as Record<string, unknown>
    const nodes = model.nodes as Record<string, unknown>
    nodes.Start_1 = { ...(nodes.Start_1 as Record<string, unknown>), initiatorOptions: { reInitiate: false } }
    const { service, startSpy } = reinitServiceWith({ model })
    const error = await runWithTenant('default', () =>
      service.reInitiate('inst-1', '1').catch((e: unknown) => e),
    )
    expect((error as Error).message).toBe('该流程不支持再次发起')
    expect(startSpy).not.toHaveBeenCalled()
  })

  it('非发起人 → 403', async () => {
    const { service, startSpy } = reinitServiceWith({})
    const error = await runWithTenant('default', () =>
      service.reInitiate('inst-1', '999').catch((e: unknown) => e),
    )
    expect((error as Error).message).toBe('只有发起人可以再次发起')
    expect(startSpy).not.toHaveBeenCalled()
  })

  it('已结束 + 发起人 → 复制变量（含 initiator）调用 start 发起新实例', async () => {
    const { service, startSpy } = reinitServiceWith({})
    const result = await runWithTenant('default', () => service.reInitiate('inst-1', '1'))
    expect(startSpy).toHaveBeenCalledTimes(1)
    expect(startSpy).toHaveBeenCalledWith('leave', 'bk-1', { day: 3, initiator: '1' })
    expect(result.id).toBe('inst-new')
  })
})
