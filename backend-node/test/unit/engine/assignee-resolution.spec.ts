import { describe, expect, it } from 'vitest'
import { compileProcess } from '../../../src/engine/process/compiler/process-compiler'
import { EngineRuntime, createEngineState } from '../../../src/engine/runtime/engine-runtime'
import type { ResolutionContext } from '../../../src/engine/process/compiler/process-model'
import type { AssigneeResolveFn } from '../../../src/engine/runtime/assignee-resolver-registry'

/**
 * 审批/办理人类型化解析（Task 61）：role / expression / handler 节点类别。
 *
 * 纯内存模型测试，不碰数据库 —— 引擎经 ResolutionContext 接收服务层预查的
 * 组织数据（roleMemberships / initiatorSupervisor），解析为空时按
 * 「找不到办理人」策略降级（未配置策略则建候选人任务，assignee 为 null）。
 */

const DEFS = (body: string): string =>
  `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:wf="http://workflow.com/schema/bpmn/wf" xmlns:flowable="http://flowable.org/bpmn">
  <bpmn:process id="p" name="测试流程">${body}</bpmn:process>
</bpmn:definitions>`

/** start → 发起人 → 目标节点(T) → end 骨架（目标节点段由参数拼）。 */
const FLOW = (target: string): string => `
  <bpmn:startEvent id="S"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
  <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="Init" />
  <bpmn:userTask id="Init" name="发起" wf:nodeRole="initiator">
    <bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>F2</bpmn:outgoing></bpmn:userTask>
  <bpmn:sequenceFlow id="F2" sourceRef="Init" targetRef="T" />
  ${target}
  <bpmn:sequenceFlow id="F3" sourceRef="T" targetRef="E" />
  <bpmn:endEvent id="E"><bpmn:incoming>F3</bpmn:incoming></bpmn:endEvent>`

const APPROVER = `
  <bpmn:userTask id="T" name="审批">
    <bpmn:incoming>F2</bpmn:incoming><bpmn:outgoing>F3</bpmn:outgoing></bpmn:userTask>`

const HANDLER = `
  <bpmn:userTask id="T" name="办理" wf:nodeRole="handler">
    <bpmn:incoming>F2</bpmn:incoming><bpmn:outgoing>F3</bpmn:outgoing></bpmn:userTask>`

let uuidSeq = 0

function boot(
  targetBpmn: string,
  targetConfig: Record<string, unknown>,
  options?: {
    resolution?: ResolutionContext
    variables?: Record<string, unknown>
    initiator?: string
    assigneeResolvers?: Record<string, AssigneeResolveFn>
  },
): { rt: EngineRuntime; state: ReturnType<typeof createEngineState> } {
  const model = compileProcess({
    bpmnXml: DEFS(FLOW(targetBpmn)),
    nodeConfigs: { T: JSON.stringify({ basic: { name: '目标' }, ...targetConfig }) },
  })
  const state = createEngineState()
  const rt = new EngineRuntime(
    model,
    state,
    () => new Date(),
    () => `u${++uuidSeq}`,
    options?.resolution ?? {},
    {},
    options?.assigneeResolvers ?? {},
  )
  rt.start({ initiator: options?.initiator ?? '1', variables: options?.variables ?? {} })
  return { rt, state }
}

/** 目标节点落在发起人之后的唯一待办（assignee 可能为 null = 候选人任务）。 */
function targetTask(rt: EngineRuntime): { assignee: string | null; nodeId: string } {
  const open = rt.openTasks()
  expect(open).toHaveLength(1)
  expect(open[0].nodeId).toBe('T')
  return { assignee: open[0].assignee, nodeId: open[0].nodeId }
}

describe('审批人类型化解析：role', () => {
  it('roleCode 单成员 → 单实例 assignee', () => {
    const { rt } = boot(APPROVER, { approval: { type: 'role', roleCodes: ['ROLE_A'] } }, {
      resolution: { roleMemberships: { ROLE_A: ['5'] } },
    })
    expect(targetTask(rt).assignee).toBe('5')
  })

  it('roleCodes 多角色取成员并集去重（countersign 展开为每成员一个任务）', () => {
    const { rt } = boot(
      APPROVER,
      { approval: { type: 'role', roleCodes: ['ROLE_A', 'ROLE_B'], multiMode: 'countersign' } },
      { resolution: { roleMemberships: { ROLE_A: ['5', '6'], ROLE_B: ['6', '7'] } } },
    )
    const open = rt.openTasks()
    expect(open).toHaveLength(3)
    expect(open.map((t) => t.assignee).sort()).toEqual(['5', '6', '7'])
  })

  it('roleCodes 无匹配成员 → 解析为空 → 建候选人任务（assignee null）', () => {
    const { rt } = boot(APPROVER, { approval: { type: 'role', roleCodes: ['ROLE_X'] } }, {
      resolution: { roleMemberships: { ROLE_A: ['5'] } },
    })
    expect(targetTask(rt).assignee).toBeNull()
  })

  it('解析为空 + noAssigneePolicy=to_user → 转指定用户', () => {
    const { rt } = boot(
      APPROVER,
      {
        approval: { type: 'role', roleCodes: ['ROLE_X'] },
        assigneeOptions: { noAssigneePolicy: 'to_user', toUserId: '9' },
      },
      { resolution: { roleMemberships: {} } },
    )
    expect(targetTask(rt).assignee).toBe('9')
  })
})

describe('审批人类型化解析：expression', () => {
  it('${initiator} → 发起人', () => {
    const { rt } = boot(APPROVER, { approval: { type: 'expression', expression: '${initiator}' } })
    expect(targetTask(rt).assignee).toBe('1')
  })

  it('${变量} → 流程变量用户列表（countersign 展开多任务）', () => {
    const { rt } = boot(
      APPROVER,
      { approval: { type: 'expression', expression: '${approvers}', multiMode: 'countersign' } },
      { variables: { approvers: ['3', '4'] } },
    )
    const open = rt.openTasks()
    expect(open.map((t) => t.assignee).sort()).toEqual(['3', '4'])
  })

  it('${initiator.deptManager} → 上下文部门负责人', () => {
    const { rt } = boot(
      APPROVER,
      { approval: { type: 'expression', expression: '${initiator.deptManager}' } },
      { resolution: { initiatorSupervisor: '8' } },
    )
    expect(targetTask(rt).assignee).toBe('8')
  })

  it('表达式解析为空 → 建候选人任务（assignee null）', () => {
    const { rt } = boot(APPROVER, { approval: { type: 'expression', expression: '${nobody}' } })
    expect(targetTask(rt).assignee).toBeNull()
  })
})

describe('办理节点（wf:nodeRole=handler）', () => {
  it('编译产物 taskRole=handler（旧数据无属性仍为 approver）', () => {
    const model = compileProcess({
      bpmnXml: DEFS(FLOW(HANDLER)),
      nodeConfigs: { T: JSON.stringify({ basic: { name: '办理' } }) },
    })
    expect(model.nodes['T']?.taskRole).toBe('handler')
    const legacy = compileProcess({
      bpmnXml: DEFS(FLOW(APPROVER)),
      nodeConfigs: { T: JSON.stringify({ basic: { name: '审批' } }) },
    })
    expect(legacy.nodes['T']?.taskRole).toBe('approver')
  })

  it('办理节点按 userIds 解析办理人（与审批节点同链路）', () => {
    const { rt } = boot(HANDLER, { approval: { type: 'user', userIds: ['2'] } })
    expect(targetTask(rt).assignee).toBe('2')
  })
})

describe('审批人类型化解析：form_user（表单内用户）', () => {
  it('表单字段值为字符串用户 ID → 解析为 assignee', () => {
    const { rt } = boot(
      APPROVER,
      { approval: { type: 'form_user', formUserField: 'next_approver' } },
      { variables: { next_approver: '6' } },
    )
    expect(targetTask(rt).assignee).toBe('6')
  })

  it('表单字段值为数组/逗号分隔 → 多用户 countersign 展开', () => {
    const { rt } = boot(
      APPROVER,
      { approval: { type: 'form_user', formUserField: 'auditors', multiMode: 'countersign' } },
      { variables: { auditors: ['3', '4'] } },
    )
    const open = rt.openTasks()
    expect(open.map((t) => t.assignee).sort()).toEqual(['3', '4'])

    const { rt: rt2 } = boot(
      APPROVER,
      { approval: { type: 'form_user', formUserField: 'auditors', multiMode: 'countersign' } },
      { variables: { auditors: '3,4' } },
    )
    expect(rt2.openTasks().map((t) => t.assignee).sort()).toEqual(['3', '4'])
  })

  it('未配置字段/变量缺失 → 解析为空 → 建候选人任务', () => {
    const { rt } = boot(APPROVER, { approval: { type: 'form_user' } })
    expect(targetTask(rt).assignee).toBeNull()

    const { rt: rt2 } = boot(
      APPROVER,
      { approval: { type: 'form_user', formUserField: 'nope' } },
      { variables: { other: '5' } },
    )
    expect(targetTask(rt2).assignee).toBeNull()
  })
})

describe('审批人类型化解析：external（业务系统注册选人函数）', () => {
  it('注册的选人函数返回用户 → 解析为 assignee（上下文含 initiator/variables）', () => {
    const received: { initiator: string | null; variables: Record<string, unknown> }[] = []
    const resolver: AssigneeResolveFn = (ctx) => {
      received.push({ initiator: ctx.initiator, variables: ctx.variables })
      expect(ctx.nodeId).toBe('T')
      return [String(ctx.variables['owner_id'])]
    }
    const { rt } = boot(
      APPROVER,
      { approval: { type: 'external', external: { resolver: 'crm_owner_resolver' } } },
      { variables: { owner_id: 7 }, assigneeResolvers: { crm_owner_resolver: resolver } },
    )
    expect(targetTask(rt).assignee).toBe('7')
    expect(received).toHaveLength(1)
    expect(received[0].initiator).toBe('1')
    expect(received[0].variables['owner_id']).toBe(7)
  })

  it('选人函数返回多用户(single 模式) → 候选人任务；抛错 → 变量兜底 assignee_ext_<nodeId>', () => {
    const { rt } = boot(
      APPROVER,
      { approval: { type: 'external', external: { resolver: 'multi' } } },
      {
        assigneeResolvers: {
          multi: () => ['3', '4'],
        },
      },
    )
    // single 模式多用户 → 候选人任务（assignee null，与 userIds 多人行为一致）
    expect(targetTask(rt).assignee).toBeNull()

    const { rt: rt2 } = boot(
      APPROVER,
      { approval: { type: 'external', external: { resolver: 'boom' } } },
      {
        variables: { [`assignee_ext_T`]: '9' },
        assigneeResolvers: {
          boom: () => {
            throw new Error('resolver crashed')
          },
        },
      },
    )
    expect(targetTask(rt2).assignee).toBe('9')
  })

  it('未注册的 resolver → 变量兑底；兑底也空 → 建候选人任务', () => {
    const { rt } = boot(
      APPROVER,
      { approval: { type: 'external', external: { resolver: 'not_registered' } } },
      { variables: { [`assignee_ext_T`]: '5' } },
    )
    expect(targetTask(rt).assignee).toBe('5')

    const { rt: rt2 } = boot(
      APPROVER,
      { approval: { type: 'external', external: { resolver: 'not_registered' } } },
      {},
    )
    expect(targetTask(rt2).assignee).toBeNull()
  })

  it('编译透传：formUserField / external.resolver 进 CompiledApproval', () => {
    const model = compileProcess({
      bpmnXml: DEFS(FLOW(APPROVER)),
      nodeConfigs: {
        T: JSON.stringify({
          basic: { name: '目标' },
          approval: {
            type: 'external',
            external: { resolver: 'my_resolver' },
            formUserField: 'u_field',
          },
        }),
      },
    })
    expect(model.nodes['T']?.approval?.external?.resolver).toBe('my_resolver')
    expect(model.nodes['T']?.approval?.formUserField).toBe('u_field')
  })
})

describe('选人函数注册表（assignee-resolver-registry）', () => {
  it('register/list/snapshot/unregister 生命周期 + 同名覆盖', async () => {
    const mod = await import(
      '../../../src/engine/runtime/assignee-resolver-registry'
    )
    mod.clearAssigneeResolvers()
    const fnA: AssigneeResolveFn = () => ['1']
    const fnB: AssigneeResolveFn = () => ['2']

    expect(mod.registerAssigneeResolver('r1', fnA)).toBe(false)
    expect(mod.registerAssigneeResolver('r1', fnB)).toBe(true) // 覆盖
    expect(mod.listAssigneeResolvers()).toEqual(['r1'])
    expect(mod.snapshotAssigneeResolvers()['r1']).toBe(fnB)
    expect(mod.getAssigneeResolver('r1')).toBe(fnB)

    mod.unregisterAssigneeResolver('r1')
    expect(mod.listAssigneeResolvers()).toEqual([])
  })

  it('空名/非函数注册抛错', async () => {
    const mod = await import(
      '../../../src/engine/runtime/assignee-resolver-registry'
    )
    mod.clearAssigneeResolvers()
    expect(() => mod.registerAssigneeResolver('', () => [])).toThrow()
    expect(() =>
      mod.registerAssigneeResolver('bad', undefined as unknown as AssigneeResolveFn),
    ).toThrow()
  })
})
