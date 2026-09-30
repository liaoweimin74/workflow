import { describe, expect, it } from 'vitest'
import { ProcessInstanceService } from '../../../src/engine/runtime/process-instance.service'
import { VariableMappingWriter } from '../../../src/engine/form/mapping/variable-mapping.writer'
import { runWithTenant } from '../../../src/framework/tenant/tenant-context'

/**
 * 发起表单数据传递链（Task 118）：「发起时填写的表单没有传递到下一个节点」根治。
 *
 * Java 原版 start 端点在流程启动成功后做两件事（ProcessInstanceController.start）：
 *   ① formDataService.save(formDefId, instanceId, null, dataJson) —— 表单数据落
 *      wf_form_data，供下一节点表单回显（同 formDefId 读当前数据）与 form:initiator
 *      数据映射读取；保存失败不影响流程启动。
 *   ② variableMappingWriter.write —— 流程级 variableMappings 写入目标流程变量。
 * Nest 移植时两步全部丢失，且 controller 丢弃 body.formDefId —— 修复后逐一对位。
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
    c.selectAll = self
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

interface StartHarness {
  service: ProcessInstanceService
  saved: Array<{ formDefId: string | null; instanceId: string | null; taskId: string | null; dataJson: string | null }>
  persistedVariables: Record<string, unknown> | undefined
  instanceId: string | undefined
}

function startHarness(options: {
  formDefId?: string | null
  formDataService?: { save: (...args: unknown[]) => Promise<unknown> }
  mappingWriter?: { compute: (...args: unknown[]) => Promise<Record<string, unknown>> }
  variables?: Record<string, unknown>
} = {}): StartHarness {
  const saved: StartHarness['saved'] = []
  let persistedVariables: Record<string, unknown> | undefined
  let instanceId: string | undefined
  const persistence = {
    findLatestDeployedDef: async () => ({ model_json: JSON.stringify(model()) }),
    insertInstance: async (row: Record<string, unknown>) => {
      instanceId = row.id as string
    },
    replaceRuntimeRows: async (
      _instanceId: string,
      _tenantId: string,
      _state: unknown,
      variables: Record<string, unknown>,
    ) => {
      persistedVariables = variables
    },
  } as never
  const formDataService = {
    save: async (formDefId: unknown, instanceId: unknown, taskId: unknown, dataJson: unknown) => {
      // 注入自定义行为时先委托（抛错则不记录 —— 「失败不影响启动」用例不关心记录）
      if (options.formDataService) {
        await options.formDataService.save(formDefId, instanceId, taskId, dataJson)
      }
      saved.push({
        formDefId: formDefId as string | null,
        instanceId: instanceId as string | null,
        taskId: taskId as string | null,
        dataJson: dataJson as string | null,
      })
      return undefined
    },
  }
  const service = new ProcessInstanceService(
    inertDb(),
    persistence,
    { run: async () => 0 } as never,
    // designRepo（start 门禁策略读取降级路径）
    { findNodeConfig: async () => null } as never,
    formDataService as never,
    options.mappingWriter as never,
  )
  return {
    service,
    saved,
    get persistedVariables() {
      return persistedVariables
    },
    get instanceId() {
      return instanceId
    },
  }
}

describe('ProcessInstanceService.start 发起表单落库（Java formDataService.save 对位）', () => {
  it('带 formDefId 发起 → 表单数据落 wf_form_data（taskId=null，dataJson 含表单字段）', async () => {
    const h = startHarness({ formDefId: 'fd-100' })
    await runWithTenant('default', () =>
      h.service.start('p', null, { reason: '请假事由', days: 2 }, '9', 'fd-100'),
    )
    expect(h.saved).toHaveLength(1)
    const row = h.saved[0]!
    expect(row.formDefId).toBe('fd-100')
    expect(row.taskId).toBeNull()
    expect(row.instanceId).toBe(h.instanceId)
    const data = JSON.parse(row.dataJson ?? '{}') as Record<string, unknown>
    expect(data['reason']).toBe('请假事由')
    expect(data['days']).toBe(2)
  })

  it('不带 formDefId 发起（无表单流程）→ 不写 wf_form_data', async () => {
    const h = startHarness()
    await runWithTenant('default', () => h.service.start('p', null, {}, '9'))
    expect(h.saved).toHaveLength(0)
  })

  it('空字符串 formDefId → 不写（与 Java 的 isEmpty 判空一致）', async () => {
    const h = startHarness({ formDefId: '' })
    await runWithTenant('default', () => h.service.start('p', null, {}, '9', ''))
    expect(h.saved).toHaveLength(0)
  })

  it('表单保存失败（如表单定义已删）→ 流程照常启动（Java 同款容错）', async () => {
    const h = startHarness({
      formDefId: 'fd-gone',
      formDataService: {
        save: async () => {
          throw new Error('Form definition not found: fd-gone')
        },
      },
    })
    await expect(
      runWithTenant('default', () => h.service.start('p', null, { a: 1 }, '9', 'fd-gone')),
    ).resolves.toHaveProperty('id')
    expect(h.instanceId).toBeDefined()
  })
})

describe('ProcessInstanceService.start 流程变量映射写入（Java VariableMappingWriter 对位）', () => {
  it('映射结果 merge 进实例变量（与 replaceRuntimeRows 同一次落库）', async () => {
    const h = startHarness({
      formDefId: 'fd-100',
      mappingWriter: {
        compute: async () => ({ approvedAmount: 6400 }),
      },
    })
    await runWithTenant('default', () =>
      h.service.start('p', null, { amount: 6400 }, '9', 'fd-100'),
    )
    expect(h.persistedVariables?.['approvedAmount']).toBe(6400)
    // 原有变量不丢
    expect(h.persistedVariables?.['amount']).toBe(6400)
  })

  it('映射计算抛错 → 发起不受影响（Java 同款吞掉）', async () => {
    const h = startHarness({
      mappingWriter: {
        compute: async () => {
          throw new Error('db down')
        },
      },
    })
    await expect(
      runWithTenant('default', () => h.service.start('p', null, {}, '9')),
    ).resolves.toHaveProperty('id')
    expect(h.instanceId).toBeDefined()
  })
})

// ---------------------------------------------------------------- writer 单测

/** wf_form_data 查询 mock：executeTakeFirst 返回指定行。 */
function formDataDb(row: { data_json: string | null } | undefined) {
  const chain = () => {
    const c: Record<string, unknown> = {}
    const self = () => c
    c.select = self
    c.where = self
    c.executeTakeFirst = async () => row
    return c
  }
  return { selectFrom: () => chain() } as never
}

function writerHarness(options: {
  processConfig: string | null
  nodeConfigs?: Array<{ node_id: string; config_json: string }>
  formDataRow?: { data_json: string | null }
}) {
  const designRepo = {
    findNodeConfig: async (_defId: string, nodeId: string) =>
      nodeId === '__PROCESS__' && options.processConfig !== null
        ? { config_json: options.processConfig }
        : null,
    findConfigsByProcessDefinitionId: async () => options.nodeConfigs ?? [],
  } as never
  return new VariableMappingWriter(formDataDb(options.formDataRow), designRepo)
}

describe('VariableMappingWriter.compute', () => {
  it('variable: 源 → 从当前流程变量取值', async () => {
    const writer = writerHarness({
      processConfig: JSON.stringify({
        variableMappings: [{ source: 'variable:amount', variable: 'approvedAmount' }],
      }),
    })
    const result = await runWithTenant('default', () =>
      writer.compute('def-1', 'inst-1', { amount: 6400 }, 'Start_1'),
    )
    expect(result).toEqual({ approvedAmount: 6400 })
  })

  it('form:initiator 源 → 解析发起节点表单 → 读 wf_form_data 当前数据字段', async () => {
    const writer = writerHarness({
      processConfig: JSON.stringify({
        variableMappings: [{ source: 'form:initiator', variable: 'reason', sourceField: 'reason' }],
      }),
      nodeConfigs: [
        { node_id: 'Start_1', config_json: JSON.stringify({ form: { formDefId: 'fd-100' } }) },
      ],
      formDataRow: { data_json: JSON.stringify({ reason: '请假事由A' }) },
    })
    const result = await runWithTenant('default', () =>
      writer.compute('def-1', 'inst-1', {}, 'Start_1'),
    )
    expect(result).toEqual({ reason: '请假事由A' })
  })

  it('form:<nodeId> 源 → 按节点配置解析 formDefId', async () => {
    const writer = writerHarness({
      processConfig: JSON.stringify({
        variableMappings: [{ source: 'form:Node_1', variable: 'score', sourceField: 'score' }],
      }),
      nodeConfigs: [
        { node_id: 'Node_1', config_json: JSON.stringify({ form: { formDefId: 'fd-200' } }) },
      ],
      formDataRow: { data_json: JSON.stringify({ score: 88 }) },
    })
    const result = await runWithTenant('default', () =>
      writer.compute('def-1', 'inst-1', {}, 'Start_1'),
    )
    expect(result).toEqual({ score: 88 })
  })

  it('源缺失（变量不存在 / 表单数据行不存在）→ 该条跳过，不写 null', async () => {
    const writer = writerHarness({
      processConfig: JSON.stringify({
        variableMappings: [
          { source: 'variable:ghost', variable: 'v1' },
          { source: 'form:initiator', variable: 'v2', sourceField: 'ghost' },
          { source: 'variable:amount', variable: 'v3' },
        ],
      }),
      nodeConfigs: [
        { node_id: 'Start_1', config_json: JSON.stringify({ form: { formDefId: 'fd-100' } }) },
      ],
      formDataRow: { data_json: JSON.stringify({ reason: 'x' }) },
    })
    const result = await runWithTenant('default', () =>
      writer.compute('def-1', 'inst-1', { amount: 1 }, 'Start_1'),
    )
    expect(result).toEqual({ v3: 1 })
  })

  it('无 __PROCESS__ 配置 / 无 variableMappings / 坏 JSON → 空对象', async () => {
    const none = writerHarness({ processConfig: null })
    await expect(
      runWithTenant('default', () => none.compute('def-1', 'inst-1', {}, null)),
    ).resolves.toEqual({})
    const empty = writerHarness({ processConfig: JSON.stringify({}) })
    await expect(
      runWithTenant('default', () => empty.compute('def-1', 'inst-1', {}, null)),
    ).resolves.toEqual({})
    const broken = writerHarness({ processConfig: 'not-json{{' })
    await expect(
      runWithTenant('default', () => broken.compute('def-1', 'inst-1', {}, null)),
    ).resolves.toEqual({})
  })

  it('form: 源节点未配置表单 / sourceField 为空 → 该条跳过', async () => {
    const noForm = writerHarness({
      processConfig: JSON.stringify({
        variableMappings: [{ source: 'form:Node_X', variable: 'v', sourceField: 'f' }],
      }),
      nodeConfigs: [],
    })
    await expect(
      runWithTenant('default', () => noForm.compute('def-1', 'inst-1', {}, 'Start_1')),
    ).resolves.toEqual({})
    const noField = writerHarness({
      processConfig: JSON.stringify({
        variableMappings: [{ source: 'form:initiator', variable: 'v', sourceField: '' }],
      }),
      nodeConfigs: [
        { node_id: 'Start_1', config_json: JSON.stringify({ form: { formDefId: 'fd-100' } }) },
      ],
    })
    await expect(
      runWithTenant('default', () => noField.compute('def-1', 'inst-1', {}, 'Start_1')),
    ).resolves.toEqual({})
  })
})
