import { describe, expect, it } from 'vitest'
import { ProcessInstanceService } from '../../../src/engine/runtime/process-instance.service'
import { runWithTenant } from '../../../src/framework/tenant/tenant-context'

/**
 * start() 发起人锚定（撤回 bug 根治）：
 *
 *   instance.initiator / variables.initiator 决定：
 *     - recallInstance 的「只有发起人可以撤回流程」判定；
 *     - 发起节点待办（initiator_self 选人）与再次发起（reInitiate）的门禁。
 *
 *   此前 initiator 只从客户端 variables.initiator 提取（可伪造），前端发起页不传时
 *   落库为 null → admin 发起的流程撤回直接 400。修复后服务端登录身份（startUserId）
 *   优先，客户端变量仅在无登录态（系统内部调用）时兜底。
 */

/** 可复用的引擎模型：发起节点 → 审批节点（userIds=['1']）→ 结束。 */
function model(): Record<string, unknown> {
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

/** kysely 空链 mock（insertComment / buildResolutionContext 的查询走这里）。 */
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

async function startWith(
  variables: Record<string, unknown> | undefined,
  startUserId: string | null,
): Promise<{ instanceInitiator: unknown; variableInitiator: unknown }> {
  const captured: { instance?: Record<string, unknown>; variables?: Record<string, unknown> } = {}
  const persistence = {
    findLatestDeployedDef: async () => ({ model_json: JSON.stringify(model()) }),
    insertInstance: async (row: Record<string, unknown>) => {
      captured.instance = row
    },
    replaceRuntimeRows: async (
      _instanceId: string,
      _tenantId: string,
      _state: unknown,
      variables: Record<string, unknown>,
    ) => {
      captured.variables = variables
    },
  } as never
  const service = new ProcessInstanceService(
    inertDb(),
    persistence,
    { run: async () => 0 } as never,
  )
  await runWithTenant('default', () => service.start('p', null, variables, startUserId))
  return {
    instanceInitiator: captured.instance?.initiator,
    variableInitiator: captured.variables?.initiator,
  }
}

describe('ProcessInstanceService.start 发起人锚定', () => {
  it('登录态发起（不传 variables.initiator）→ instance/variables 都写登录用户', async () => {
    const { instanceInitiator, variableInitiator } = await startWith({}, '9')
    expect(instanceInitiator).toBe('9')
    expect(variableInitiator).toBe('9')
  })

  it('客户端伪造 variables.initiator → 服务端登录身份优先（防伪造）', async () => {
    const { instanceInitiator, variableInitiator } = await startWith(
      { initiator: 'attacker' },
      '9',
    )
    expect(instanceInitiator).toBe('9')
    expect(variableInitiator).toBe('9')
  })

  it('无登录态（系统内部调用）→ 回落客户端 variables.initiator（兼容保留）', async () => {
    const { instanceInitiator, variableInitiator } = await startWith({ initiator: '7' }, null)
    expect(instanceInitiator).toBe('7')
    expect(variableInitiator).toBe('7')
  })
})
