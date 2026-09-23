import { describe, expect, it } from 'vitest'
import { compileProcess } from '../../../src/engine/process/compiler/process-compiler'
import { EngineRuntime, createEngineState } from '../../../src/engine/runtime/engine-runtime'

/**
 * 引擎运行时的确定性单元测试 —— 全部在**纯内存模型**上跑，不碰数据库。
 * 这是 spec §4.7 要求的对策：网关 join 与多实例的交互是自研引擎最高风险区。
 */

const DEFS = (body: string): string =>
  `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:wf="http://workflow.com/schema/bpmn/wf" xmlns:flowable="http://flowable.org/bpmn">
  <bpmn:process id="p" name="测试流程">${body}</bpmn:process>
</bpmn:definitions>`

/** 建一个引擎实例：BPMN + 可选 NodeConfig。 */
function engine(
  body: string,
  nodeConfigs?: Record<string, string>,
): { rt: EngineRuntime; state: ReturnType<typeof createEngineState> } {
  const model = compileProcess({ bpmnXml: DEFS(body), nodeConfigs })
  const state = createEngineState()
  return { rt: new EngineRuntime(model, state), state }
}

/** start → 发起人 → 审批 → end 的骨架，可替换审批段。 */
const SIMPLE_FLOW = `
  <bpmn:startEvent id="S"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
  <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="Init" />
  <bpmn:userTask id="Init" name="发起" wf:nodeRole="initiator">
    <bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>F2</bpmn:outgoing></bpmn:userTask>
  <bpmn:sequenceFlow id="F2" sourceRef="Init" targetRef="Approve" />
  <bpmn:userTask id="Approve" name="审批">
    <bpmn:incoming>F2</bpmn:incoming><bpmn:outgoing>F3</bpmn:outgoing></bpmn:userTask>
  <bpmn:sequenceFlow id="F3" sourceRef="Approve" targetRef="E" />
  <bpmn:endEvent id="E"><bpmn:incoming>F3</bpmn:incoming></bpmn:endEvent>`

const APPROVE_CFG = (extra = ''): Record<string, string> => ({
  Approve: JSON.stringify({ basic: { name: '审批' }, approval: { userIds: ['7'], ...JSON.parse(extra || '{}') } }),
})

describe('基础流转', () => {
  it('启动后自动完成发起人节点，停在审批节点', () => {
    const { rt, state } = engine(SIMPLE_FLOW, APPROVE_CFG())
    rt.start({ initiator: '1' })

    expect(state.status).toBe('RUNNING')
    const open = rt.openTasks()
    expect(open).toHaveLength(1)
    expect(open[0].nodeId).toBe('Approve')
    expect(open[0].assignee).toBe('7')
  })

  it('发起人节点的任务被自动完成（activity 记录为 COMPLETED）', () => {
    const { rt, state } = engine(SIMPLE_FLOW, APPROVE_CFG())
    rt.start({ initiator: '1' })

    const initActivity = state.activities.find((a) => a.nodeId === 'Init')
    expect(initActivity?.status).toBe('COMPLETED')
    const initTask = state.tasks.find((t) => t.nodeId === 'Init')
    expect(initTask?.status).toBe('COMPLETED')
    expect(initTask?.assignee).toBe('1')
  })

  it('发起人节点未完成时不产生审批任务（顺序正确）', () => {
    const { rt } = engine(SIMPLE_FLOW, APPROVE_CFG())
    rt.start({ initiator: '1' })
    expect(rt.openTasks().map((t) => t.nodeId)).toEqual(['Approve'])
  })

  it('完成审批任务后实例结束', () => {
    const { rt, state } = engine(SIMPLE_FLOW, APPROVE_CFG())
    rt.start({ initiator: '1' })
    rt.completeTask(rt.openTasks()[0].id, { approved: true })

    expect(rt.openTasks()).toHaveLength(0)
    expect(state.status).toBe('COMPLETED')
    expect(state.activities.find((a) => a.nodeId === 'E')?.status).toBe('COMPLETED')
  })

  it('重复完成同一任务报错（乐观锁语义）', () => {
    const { rt } = engine(SIMPLE_FLOW, APPROVE_CFG())
    rt.start({ initiator: '1' })
    const taskId = rt.openTasks()[0].id
    rt.completeTask(taskId)
    expect(() => rt.completeTask(taskId)).toThrow(/任务已处理/)
  })

  it('完成不存在的任务报错', () => {
    const { rt } = engine(SIMPLE_FLOW, APPROVE_CFG())
    rt.start({ initiator: '1' })
    expect(() => rt.completeTask('nope')).toThrow(/Task not found/)
  })

  it('单实例多人审批 → 任务无 assignee，候选人为全部人', () => {
    const { rt } = engine(SIMPLE_FLOW, {
      Approve: JSON.stringify({ approval: { userIds: ['5', '6'] } }),
    })
    rt.start({ initiator: '1' })
    const task = rt.openTasks()[0]
    expect(task.assignee).toBeNull()
    expect(task.candidateUsers).toEqual(['5', '6'])
  })

  it('无 NodeConfig 审批人时回退到 BPMN 上的 assignee', () => {
    const body = SIMPLE_FLOW.replace(
      '<bpmn:userTask id="Approve" name="审批">',
      '<bpmn:userTask id="Approve" name="审批" flowable:assignee="9">',
    )
    const { rt } = engine(body)
    rt.start({ initiator: '1' })
    expect(rt.openTasks()[0].assignee).toBe('9')
  })
})

describe('排他网关', () => {
  const GW_FLOW = `
    <bpmn:startEvent id="S"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="Init" />
    <bpmn:userTask id="Init" wf:nodeRole="initiator"><bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>F2</bpmn:outgoing></bpmn:userTask>
    <bpmn:sequenceFlow id="F2" sourceRef="Init" targetRef="Gw" />
    <bpmn:exclusiveGateway id="Gw" default="F_low"><bpmn:incoming>F2</bpmn:incoming><bpmn:outgoing>F_high</bpmn:outgoing><bpmn:outgoing>F_low</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:sequenceFlow id="F_high" sourceRef="Gw" targetRef="High">
      <bpmn:conditionExpression>\${amount > 100}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="F_low" sourceRef="Gw" targetRef="Low" />
    <bpmn:userTask id="High" name="大额审批"><bpmn:incoming>F_high</bpmn:incoming><bpmn:outgoing>FH</bpmn:outgoing></bpmn:userTask>
    <bpmn:userTask id="Low" name="小额审批"><bpmn:incoming>F_low</bpmn:incoming><bpmn:outgoing>FL</bpmn:outgoing></bpmn:userTask>
    <bpmn:sequenceFlow id="FH" sourceRef="High" targetRef="E" />
    <bpmn:sequenceFlow id="FL" sourceRef="Low" targetRef="E" />
    <bpmn:endEvent id="E"><bpmn:incoming>FH</bpmn:incoming><bpmn:incoming>FL</bpmn:incoming></bpmn:endEvent>`

  const cfg = {
    High: JSON.stringify({ approval: { userIds: ['1'] } }),
    Low: JSON.stringify({ approval: { userIds: ['2'] } }),
  }

  it('条件命中走对应分支（amount > 100 → 大额）', () => {
    const { rt } = engine(GW_FLOW, cfg)
    rt.start({ initiator: '1', variables: { amount: 500 } })
    expect(rt.openTasks().map((t) => t.nodeId)).toEqual(['High'])
  })

  it('条件不命中走默认分支', () => {
    const { rt } = engine(GW_FLOW, cfg)
    rt.start({ initiator: '1', variables: { amount: 50 } })
    expect(rt.openTasks().map((t) => t.nodeId)).toEqual(['Low'])
  })

  it('两条分支都完成后实例结束', () => {
    const { rt, state } = engine(GW_FLOW, cfg)
    rt.start({ initiator: '1', variables: { amount: 500 } })
    rt.completeTask(rt.openTasks()[0].id)
    expect(state.status).toBe('COMPLETED')
  })
})

describe('并行网关 fork / join', () => {
  /** 发起 → 并行 fork → A、B 两个审批 → 并行 join → end */
  const PARALLEL = `
    <bpmn:startEvent id="S"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="Init" />
    <bpmn:userTask id="Init" wf:nodeRole="initiator"><bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>F2</bpmn:outgoing></bpmn:userTask>
    <bpmn:sequenceFlow id="F2" sourceRef="Init" targetRef="Fork" />
    <bpmn:parallelGateway id="Fork"><bpmn:incoming>F2</bpmn:incoming><bpmn:outgoing>FA</bpmn:outgoing><bpmn:outgoing>FB</bpmn:outgoing></bpmn:parallelGateway>
    <bpmn:sequenceFlow id="FA" sourceRef="Fork" targetRef="A" />
    <bpmn:sequenceFlow id="FB" sourceRef="Fork" targetRef="B" />
    <bpmn:userTask id="A" name="A审批"><bpmn:incoming>FA</bpmn:incoming><bpmn:outgoing>FA2</bpmn:outgoing></bpmn:userTask>
    <bpmn:userTask id="B" name="B审批"><bpmn:incoming>FB</bpmn:incoming><bpmn:outgoing>FB2</bpmn:outgoing></bpmn:userTask>
    <bpmn:sequenceFlow id="FA2" sourceRef="A" targetRef="Join" />
    <bpmn:sequenceFlow id="FB2" sourceRef="B" targetRef="Join" />
    <bpmn:parallelGateway id="Join"><bpmn:incoming>FA2</bpmn:incoming><bpmn:incoming>FB2</bpmn:incoming><bpmn:outgoing>FJ</bpmn:outgoing></bpmn:parallelGateway>
    <bpmn:sequenceFlow id="FJ" sourceRef="Join" targetRef="E" />
    <bpmn:endEvent id="E"><bpmn:incoming>FJ</bpmn:incoming></bpmn:endEvent>`

  const cfg = {
    A: JSON.stringify({ approval: { userIds: ['1'] } }),
    B: JSON.stringify({ approval: { userIds: ['2'] } }),
  }

  it('fork 产生两个并行待办', () => {
    const { rt } = engine(PARALLEL, cfg)
    rt.start({ initiator: '1' })
    expect(rt.openTasks().map((t) => t.nodeId).sort()).toEqual(['A', 'B'])
  })

  it('只完成一个分支时流程不前进（join 必须等齐）', () => {
    const { rt, state } = engine(PARALLEL, cfg)
    rt.start({ initiator: '1' })
    const tasks = rt.openTasks()
    rt.completeTask(tasks.find((t) => t.nodeId === 'A')!.id)

    expect(state.status).toBe('RUNNING')
    expect(state.activities.find((a) => a.nodeId === 'E')).toBeUndefined()
    // B 仍待办
    expect(rt.openTasks().map((t) => t.nodeId)).toEqual(['B'])
  })

  it('两个分支都完成后 join 放行并结束', () => {
    const { rt, state } = engine(PARALLEL, cfg)
    rt.start({ initiator: '1' })
    const tasks = rt.openTasks()
    rt.completeTask(tasks.find((t) => t.nodeId === 'A')!.id)
    rt.completeTask(rt.openTasks().find((t) => t.nodeId === 'B')!.id)

    expect(state.status).toBe('COMPLETED')
    expect(state.activities.find((a) => a.nodeId === 'E')?.status).toBe('COMPLETED')
  })

  it('join 后只剩一个 token 继续（不会重复走 end）', () => {
    const { rt, state } = engine(PARALLEL, cfg)
    rt.start({ initiator: '1' })
    const tasks = rt.openTasks()
    rt.completeTask(tasks.find((t) => t.nodeId === 'A')!.id)
    rt.completeTask(rt.openTasks().find((t) => t.nodeId === 'B')!.id)

    expect(state.activities.filter((a) => a.nodeId === 'E')).toHaveLength(1)
  })

  it('join 处挂起的 token 被合并（不残留 WAITING）', () => {
    const { rt, state } = engine(PARALLEL, cfg)
    rt.start({ initiator: '1' })
    const tasks = rt.openTasks()
    rt.completeTask(tasks.find((t) => t.nodeId === 'A')!.id)
    expect(state.executions.some((e) => e.nodeId === 'Join' && e.status === 'WAITING')).toBe(true)

    rt.completeTask(rt.openTasks().find((t) => t.nodeId === 'B')!.id)
    expect(state.executions.filter((e) => e.nodeId === 'Join' && e.status === 'WAITING')).toHaveLength(
      0,
    )
  })
})

describe('包含网关 fork / join（只等被激活的分支）', () => {
  /** fork 按条件激活 A、B；join 只等被激活的那些 */
  const INCLUSIVE = `
    <bpmn:startEvent id="S"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="Init" />
    <bpmn:userTask id="Init" wf:nodeRole="initiator"><bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>F2</bpmn:outgoing></bpmn:userTask>
    <bpmn:sequenceFlow id="F2" sourceRef="Init" targetRef="Fork" />
    <bpmn:inclusiveGateway id="Fork"><bpmn:incoming>F2</bpmn:incoming><bpmn:outgoing>FA</bpmn:outgoing><bpmn:outgoing>FB</bpmn:outgoing></bpmn:inclusiveGateway>
    <bpmn:sequenceFlow id="FA" sourceRef="Fork" targetRef="A">
      <bpmn:conditionExpression>\${needA}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="FB" sourceRef="Fork" targetRef="B">
      <bpmn:conditionExpression>\${needB}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:userTask id="A" name="A审批"><bpmn:incoming>FA</bpmn:incoming><bpmn:outgoing>FA2</bpmn:outgoing></bpmn:userTask>
    <bpmn:userTask id="B" name="B审批"><bpmn:incoming>FB</bpmn:incoming><bpmn:outgoing>FB2</bpmn:outgoing></bpmn:userTask>
    <bpmn:sequenceFlow id="FA2" sourceRef="A" targetRef="Join" />
    <bpmn:sequenceFlow id="FB2" sourceRef="B" targetRef="Join" />
    <bpmn:inclusiveGateway id="Join"><bpmn:incoming>FA2</bpmn:incoming><bpmn:incoming>FB2</bpmn:incoming><bpmn:outgoing>FJ</bpmn:outgoing></bpmn:inclusiveGateway>
    <bpmn:sequenceFlow id="FJ" sourceRef="Join" targetRef="E" />
    <bpmn:endEvent id="E"><bpmn:incoming>FJ</bpmn:incoming></bpmn:endEvent>`

  const cfg = {
    A: JSON.stringify({ approval: { userIds: ['1'] } }),
    B: JSON.stringify({ approval: { userIds: ['2'] } }),
  }

  it('只激活 A 时只有一个待办', () => {
    const { rt } = engine(INCLUSIVE, cfg)
    rt.start({ initiator: '1', variables: { needA: true, needB: false } })
    expect(rt.openTasks().map((t) => t.nodeId)).toEqual(['A'])
  })

  it('只激活 A 时，完成 A 即可穿过 join（**不等从未激活的 B**）', () => {
    const { rt, state } = engine(INCLUSIVE, cfg)
    rt.start({ initiator: '1', variables: { needA: true, needB: false } })
    rt.completeTask(rt.openTasks()[0].id)
    expect(state.status).toBe('COMPLETED')
  })

  it('全部激活时两个都要完成', () => {
    const { rt, state } = engine(INCLUSIVE, cfg)
    rt.start({ initiator: '1', variables: { needA: true, needB: true } })
    expect(rt.openTasks().map((t) => t.nodeId).sort()).toEqual(['A', 'B'])
    rt.completeTask(rt.openTasks().find((t) => t.nodeId === 'A')!.id)
    expect(state.status).toBe('RUNNING')
    rt.completeTask(rt.openTasks().find((t) => t.nodeId === 'B')!.id)
    expect(state.status).toBe('COMPLETED')
  })

  it('都未激活时报错（包含网关至少要激活一条）', () => {
    const { rt } = engine(INCLUSIVE, cfg)
    expect(() => rt.start({ initiator: '1', variables: { needA: false, needB: false } })).toThrow(
      /没有任何分支被激活/,
    )
  })
})

describe('多实例：会签 / 或签 / 依次', () => {
  const MI_FLOW = `
    <bpmn:startEvent id="S"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="Init" />
    <bpmn:userTask id="Init" wf:nodeRole="initiator"><bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>F2</bpmn:outgoing></bpmn:userTask>
    <bpmn:sequenceFlow id="F2" sourceRef="Init" targetRef="Mi" />
    <bpmn:userTask id="Mi" name="会签节点"><bpmn:incoming>F2</bpmn:incoming><bpmn:outgoing>F3</bpmn:outgoing></bpmn:userTask>
    <bpmn:sequenceFlow id="F3" sourceRef="Mi" targetRef="E" />
    <bpmn:endEvent id="E"><bpmn:incoming>F3</bpmn:incoming></bpmn:endEvent>`

  const miCfg = (mode: string): Record<string, string> => ({
    Mi: JSON.stringify({ approval: { userIds: ['1', '2', '3'], multiMode: mode } }),
  })

  it('会签：一次展开全部三个待办', () => {
    const { rt } = engine(MI_FLOW, miCfg('countersign'))
    rt.start({ initiator: '1' })
    expect(rt.openTasks().map((t) => t.assignee).sort()).toEqual(['1', '2', '3'])
  })

  it('会签：必须全部完成才前进', () => {
    const { rt, state } = engine(MI_FLOW, miCfg('countersign'))
    rt.start({ initiator: '1' })
    rt.completeTask(rt.openTasks()[0].id)
    expect(state.status).toBe('RUNNING')
    rt.completeTask(rt.openTasks()[0].id)
    expect(state.status).toBe('RUNNING')
    rt.completeTask(rt.openTasks()[0].id)
    expect(state.status).toBe('COMPLETED')
  })

  it('或签：任一完成即前进，其余任务被取消', () => {
    const { rt, state } = engine(MI_FLOW, miCfg('or_sign'))
    rt.start({ initiator: '1' })
    expect(rt.openTasks()).toHaveLength(3)

    rt.completeTask(rt.openTasks()[0].id)
    expect(state.status).toBe('COMPLETED')
    // 其余两个任务必须被取消，不能留成幽灵待办
    expect(rt.openTasks()).toHaveLength(0)
    expect(state.tasks.filter((t) => t.status === 'CANCELLED')).toHaveLength(2)
  })

  it('依次审批：一次只建一个待办，完成后再建下一个', () => {
    const { rt } = engine(MI_FLOW, miCfg('sequential'))
    rt.start({ initiator: '1' })
    expect(rt.openTasks()).toHaveLength(1)
    expect(rt.openTasks()[0].assignee).toBe('1')

    rt.completeTask(rt.openTasks()[0].id)
    expect(rt.openTasks()).toHaveLength(1)
    expect(rt.openTasks()[0].assignee).toBe('2')

    rt.completeTask(rt.openTasks()[0].id)
    expect(rt.openTasks()).toHaveLength(1)
    expect(rt.openTasks()[0].assignee).toBe('3')

    rt.completeTask(rt.openTasks()[0].id)
    expect(rt.openTasks()).toHaveLength(0)
  })
})

describe('驳回', () => {
  it('驳回到发起人节点后 token 停在发起人，等待重新提交', () => {
    const { rt, state } = engine(SIMPLE_FLOW, APPROVE_CFG())
    rt.start({ initiator: '1' })
    rt.reject(rt.openTasks()[0].id, '金额不对')

    expect(state.status).toBe('RUNNING')
    // 关键语义：驳回后**不再**自动完成发起人节点（Java 的 autoCompleteInitiatorTask
    // 只在 startProcess 调用一次），而是等发起人重新填报提交
    expect(rt.openTasks().map((t) => t.nodeId)).toEqual(['Init'])
    expect(rt.openTasks()[0].assignee).toBe('1')
  })

  it('驳回后原审批任务被取消，不留幽灵待办', () => {
    const { rt, state } = engine(SIMPLE_FLOW, APPROVE_CFG())
    rt.start({ initiator: '1' })
    const approveTaskId = rt.openTasks()[0].id
    rt.reject(approveTaskId)

    expect(state.tasks.find((t) => t.id === approveTaskId)?.status).toBe('CANCELLED')
  })

  it('驳回后重新提交可再次进入审批', () => {
    const { rt } = engine(SIMPLE_FLOW, APPROVE_CFG())
    rt.start({ initiator: '1' })
    rt.reject(rt.openTasks()[0].id, '重填')

    const initTask = rt.openTasks().find((t) => t.nodeId === 'Init')!
    rt.completeTask(initTask.id, { amount: 200 })
    expect(rt.openTasks().map((t) => t.nodeId)).toEqual(['Approve'])
  })

  it('只设置 rejected = true，**不写入驳回原因**', () => {
    const { rt } = engine(SIMPLE_FLOW, APPROVE_CFG())
    rt.start({ initiator: '1' })
    rt.reject(rt.openTasks()[0].id, '不行')
    expect(rt.getVariables().rejected).toBe(true)
    // ⚠️ 驳回原因**不进流程变量**：契约场景「任务驳回」实测 Java 侧的变量集是
    //    {amount, rejected, initiator}。原先这里多写了一个 rejectReason，
    //    导致流程变量接口与任务详情的 variables 都多出一个 Java 没有的字段
    //    （契约比对当场抓到）。原因是写在审批意见 wf_task_comment.comment 里的。
    expect(rt.getVariables()).not.toHaveProperty('rejectReason')
  })

  it('当前节点已是发起人节点时报错，消息与 Java 逐字一致', () => {
    const { rt } = engine(SIMPLE_FLOW, APPROVE_CFG())
    rt.start({ initiator: '1' })
    // 先驳回到发起人节点 → token 停在 Init
    rt.reject(rt.openTasks()[0].id)
    const initTask = rt.openTasks().find((t) => t.nodeId === 'Init')!
    expect(initTask).toBeDefined()
    // 再对发起人节点上的任务驳回 → 必须报错
    expect(() => rt.reject(initTask.id)).toThrow(
      'Cannot reject: current node is already the initiator node',
    )
  })

  it('没有发起人节点时报错，消息与 Java 逐字一致', () => {
    const body = SIMPLE_FLOW.replace(' wf:nodeRole="initiator"', '')
    const { rt } = engine(body, { Approve: JSON.stringify({ approval: { userIds: ['1'] } }) })
    rt.start({ initiator: '1' })
    expect(() => rt.reject(rt.openTasks()[0].id)).toThrow(
      /Initiator node not found for process definition/,
    )
  })
})

describe('加签 / 转签', () => {
  const MI_FLOW = `
    <bpmn:startEvent id="S"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="Init" />
    <bpmn:userTask id="Init" wf:nodeRole="initiator"><bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>F2</bpmn:outgoing></bpmn:userTask>
    <bpmn:sequenceFlow id="F2" sourceRef="Init" targetRef="Mi" />
    <bpmn:userTask id="Mi"><bpmn:incoming>F2</bpmn:incoming><bpmn:outgoing>F3</bpmn:outgoing></bpmn:userTask>
    <bpmn:sequenceFlow id="F3" sourceRef="Mi" targetRef="E" />
    <bpmn:endEvent id="E"><bpmn:incoming>F3</bpmn:incoming></bpmn:endEvent>`
  const cfg = {
    Mi: JSON.stringify({ approval: { userIds: ['1', '2'], multiMode: 'countersign' } }),
  }

  it('加签：追加审批人且需其完成才能前进', () => {
    const { rt, state } = engine(MI_FLOW, cfg)
    rt.start({ initiator: '1' })
    expect(rt.openTasks()).toHaveLength(2)

    rt.addSign(rt.openTasks()[0].id, ['9'])
    expect(rt.openTasks()).toHaveLength(3)

    rt.completeTask(rt.openTasks()[0].id)
    rt.completeTask(rt.openTasks()[0].id)
    expect(state.status).toBe('RUNNING')
    rt.completeTask(rt.openTasks()[0].id)
    expect(state.status).toBe('COMPLETED')
  })

  it('加签仅适用于多实例节点', () => {
    const { rt } = engine(SIMPLE_FLOW, APPROVE_CFG())
    rt.start({ initiator: '1' })
    expect(() => rt.addSign(rt.openTasks()[0].id, ['9'])).toThrow(/仅适用于多实例/)
  })

  it('转签：当前实例换人，且总数不变', () => {
    const { rt } = engine(MI_FLOW, cfg)
    rt.start({ initiator: '1' })
    const task = rt.openTasks().find((t) => t.assignee === '1')!
    rt.forwardSign(task.id, '8')

    // 原实例被删除（不计完成），新实例加入 → 仍是 2 个待办
    expect(rt.openTasks()).toHaveLength(2)
    expect(rt.openTasks().map((t) => t.assignee).sort()).toEqual(['2', '8'])
  })

  it('转签后总数不变 → 会签仍能正常结束', () => {
    const { rt, state } = engine(MI_FLOW, cfg)
    rt.start({ initiator: '1' })
    const task = rt.openTasks().find((t) => t.assignee === '1')!
    rt.forwardSign(task.id, '8')

    rt.completeTask(rt.openTasks()[0].id)
    expect(state.status).toBe('RUNNING')
    rt.completeTask(rt.openTasks()[0].id)
    expect(state.status).toBe('COMPLETED')
  })
})

describe('§4.7 网关 join 与多实例的交互（最高风险区）', () => {
  /**
   * 场景 1：多实例节点位于并行分支内，其中一条分支驳回。
   * 期望：该分支的 MI 全部取消，token 移回发起人；另一分支的 token 也必须被取消，
   *       否则会出现「幽灵待办」。
   */
  it('场景1：并行分支内的 MI 被驳回后不留下幽灵待办', () => {
    const xml = `
      <bpmn:startEvent id="S"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
      <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="Init" />
      <bpmn:userTask id="Init" wf:nodeRole="initiator"><bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>F2</bpmn:outgoing></bpmn:userTask>
      <bpmn:sequenceFlow id="F2" sourceRef="Init" targetRef="Fork" />
      <bpmn:parallelGateway id="Fork"><bpmn:incoming>F2</bpmn:incoming><bpmn:outgoing>FA</bpmn:outgoing><bpmn:outgoing>FB</bpmn:outgoing></bpmn:parallelGateway>
      <bpmn:sequenceFlow id="FA" sourceRef="Fork" targetRef="MiA" />
      <bpmn:sequenceFlow id="FB" sourceRef="Fork" targetRef="B" />
      <bpmn:userTask id="MiA"><bpmn:incoming>FA</bpmn:incoming><bpmn:outgoing>FA2</bpmn:outgoing></bpmn:userTask>
      <bpmn:userTask id="B"><bpmn:incoming>FB</bpmn:incoming><bpmn:outgoing>FB2</bpmn:outgoing></bpmn:userTask>
      <bpmn:sequenceFlow id="FA2" sourceRef="MiA" targetRef="Join" />
      <bpmn:sequenceFlow id="FB2" sourceRef="B" targetRef="Join" />
      <bpmn:parallelGateway id="Join"><bpmn:incoming>FA2</bpmn:incoming><bpmn:incoming>FB2</bpmn:incoming><bpmn:outgoing>FJ</bpmn:outgoing></bpmn:parallelGateway>
      <bpmn:sequenceFlow id="FJ" sourceRef="Join" targetRef="E" />
      <bpmn:endEvent id="E"><bpmn:incoming>FJ</bpmn:incoming></bpmn:endEvent>`

    const { rt } = engine(xml, {
      MiA: JSON.stringify({ approval: { userIds: ['1', '2'], multiMode: 'countersign' } }),
      B: JSON.stringify({ approval: { userIds: ['3'] } }),
    })
    rt.start({ initiator: '1' })

    const miTask = rt.openTasks().find((t) => t.nodeId === 'MiA')!
    rt.reject(miTask.id, '不同意')

    // 驳回后只剩发起人节点的待办：
    // 并行另一分支（B）与 MI 的全部子实例都必须被取消，否则就是「幽灵待办」
    const openNodes = rt.openTasks().map((t) => t.nodeId)
    expect(openNodes).toEqual(['Init'])
  })

  /**
   * 场景 2：MI 节点是 join 的前驱。
   * 期望：MI 根活动必须在**所有**子实例结束后才完成，否则 join 提前放行。
   */
  it('场景2：MI 作为 join 前驱时，未全部完成不放行', () => {
    const xml = `
      <bpmn:startEvent id="S"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
      <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="Init" />
      <bpmn:userTask id="Init" wf:nodeRole="initiator"><bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>F2</bpmn:outgoing></bpmn:userTask>
      <bpmn:sequenceFlow id="F2" sourceRef="Init" targetRef="Fork" />
      <bpmn:parallelGateway id="Fork"><bpmn:incoming>F2</bpmn:incoming><bpmn:outgoing>FA</bpmn:outgoing><bpmn:outgoing>FB</bpmn:outgoing></bpmn:parallelGateway>
      <bpmn:sequenceFlow id="FA" sourceRef="Fork" targetRef="Mi" />
      <bpmn:sequenceFlow id="FB" sourceRef="Fork" targetRef="B" />
      <bpmn:userTask id="Mi"><bpmn:incoming>FA</bpmn:incoming><bpmn:outgoing>FA2</bpmn:outgoing></bpmn:userTask>
      <bpmn:userTask id="B"><bpmn:incoming>FB</bpmn:incoming><bpmn:outgoing>FB2</bpmn:outgoing></bpmn:userTask>
      <bpmn:sequenceFlow id="FA2" sourceRef="Mi" targetRef="Join" />
      <bpmn:sequenceFlow id="FB2" sourceRef="B" targetRef="Join" />
      <bpmn:parallelGateway id="Join"><bpmn:incoming>FA2</bpmn:incoming><bpmn:incoming>FB2</bpmn:incoming><bpmn:outgoing>FJ</bpmn:outgoing></bpmn:parallelGateway>
      <bpmn:sequenceFlow id="FJ" sourceRef="Join" targetRef="E" />
      <bpmn:endEvent id="E"><bpmn:incoming>FJ</bpmn:incoming></bpmn:endEvent>`

    const { rt, state } = engine(xml, {
      Mi: JSON.stringify({ approval: { userIds: ['1', '2'], multiMode: 'countersign' } }),
      B: JSON.stringify({ approval: { userIds: ['3'] } }),
    })
    rt.start({ initiator: '1' })

    // 完成 B 分支
    rt.completeTask(rt.openTasks().find((t) => t.nodeId === 'B')!.id)
    // MI 只完成一个 → join 不能放行
    rt.completeTask(rt.openTasks().find((t) => t.nodeId === 'Mi')!.id)
    expect(state.activities.find((a) => a.nodeId === 'E')).toBeUndefined()

    // MI 全部完成 → 才能穿过 join
    rt.completeTask(rt.openTasks().find((t) => t.nodeId === 'Mi')!.id)
    expect(state.status).toBe('COMPLETED')
  })

  /**
   * 场景 3：or_sign 取消其余子实例时，若该 MI 位于并行分支内，
   * 取消动作不得影响其他分支的到达计数。
   */
  it('场景3：并行分支内的或签取消其余实例，不影响其它分支到达 join', () => {
    const xml = `
      <bpmn:startEvent id="S"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
      <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="Init" />
      <bpmn:userTask id="Init" wf:nodeRole="initiator"><bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>F2</bpmn:outgoing></bpmn:userTask>
      <bpmn:sequenceFlow id="F2" sourceRef="Init" targetRef="Fork" />
      <bpmn:parallelGateway id="Fork"><bpmn:incoming>F2</bpmn:incoming><bpmn:outgoing>FA</bpmn:outgoing><bpmn:outgoing>FB</bpmn:outgoing></bpmn:parallelGateway>
      <bpmn:sequenceFlow id="FA" sourceRef="Fork" targetRef="Mi" />
      <bpmn:sequenceFlow id="FB" sourceRef="Fork" targetRef="B" />
      <bpmn:userTask id="Mi"><bpmn:incoming>FA</bpmn:incoming><bpmn:outgoing>FA2</bpmn:outgoing></bpmn:userTask>
      <bpmn:userTask id="B"><bpmn:incoming>FB</bpmn:incoming><bpmn:outgoing>FB2</bpmn:outgoing></bpmn:userTask>
      <bpmn:sequenceFlow id="FA2" sourceRef="Mi" targetRef="Join" />
      <bpmn:sequenceFlow id="FB2" sourceRef="B" targetRef="Join" />
      <bpmn:parallelGateway id="Join"><bpmn:incoming>FA2</bpmn:incoming><bpmn:incoming>FB2</bpmn:incoming><bpmn:outgoing>FJ</bpmn:outgoing></bpmn:parallelGateway>
      <bpmn:sequenceFlow id="FJ" sourceRef="Join" targetRef="E" />
      <bpmn:endEvent id="E"><bpmn:incoming>FJ</bpmn:incoming></bpmn:endEvent>`

    const { rt, state } = engine(xml, {
      Mi: JSON.stringify({ approval: { userIds: ['1', '2', '3'], multiMode: 'or_sign' } }),
      B: JSON.stringify({ approval: { userIds: ['9'] } }),
    })
    rt.start({ initiator: '1' })

    // 或签：任一完成即 MI 整体完成 → 该分支到达 join
    rt.completeTask(rt.openTasks().find((t) => t.nodeId === 'Mi')!.id)
    // 此时 B 分支尚未完成，join 不应放行
    expect(state.activities.find((a) => a.nodeId === 'E')).toBeUndefined()

    // B 完成后 join 放行（说明或签的取消动作没有破坏 B 分支的到达）
    rt.completeTask(rt.openTasks().find((t) => t.nodeId === 'B')!.id)
    expect(state.status).toBe('COMPLETED')
  })

  /**
   * 场景 4（嵌套的简化版）：MI 位于内嵌子流程内、子流程位于并行分支内。
   * 这里验证「子流程内的 MI 完成后，子流程能正确结束并让并行分支到达 join」。
   */
  it('场景4：子流程内的多实例完成后，子流程结束且分支能到达 join', () => {
    const xml = `
      <bpmn:startEvent id="S"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
      <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="Init" />
      <bpmn:userTask id="Init" wf:nodeRole="initiator"><bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>F2</bpmn:outgoing></bpmn:userTask>
      <bpmn:sequenceFlow id="F2" sourceRef="Init" targetRef="Fork" />
      <bpmn:parallelGateway id="Fork"><bpmn:incoming>F2</bpmn:incoming><bpmn:outgoing>FA</bpmn:outgoing><bpmn:outgoing>FB</bpmn:outgoing></bpmn:parallelGateway>
      <bpmn:sequenceFlow id="FA" sourceRef="Fork" targetRef="Sub" />
      <bpmn:sequenceFlow id="FB" sourceRef="Fork" targetRef="B" />
      <bpmn:subProcess id="Sub"><bpmn:incoming>FA</bpmn:incoming><bpmn:outgoing>FA2</bpmn:outgoing>
        <bpmn:startEvent id="SubS"><bpmn:outgoing>SF1</bpmn:outgoing></bpmn:startEvent>
        <bpmn:sequenceFlow id="SF1" sourceRef="SubS" targetRef="SubMi" />
        <bpmn:userTask id="SubMi"><bpmn:incoming>SF1</bpmn:incoming><bpmn:outgoing>SF2</bpmn:outgoing></bpmn:userTask>
        <bpmn:sequenceFlow id="SF2" sourceRef="SubMi" targetRef="SubE" />
        <bpmn:endEvent id="SubE"><bpmn:incoming>SF2</bpmn:incoming></bpmn:endEvent>
      </bpmn:subProcess>
      <bpmn:userTask id="B"><bpmn:incoming>FB</bpmn:incoming><bpmn:outgoing>FB2</bpmn:outgoing></bpmn:userTask>
      <bpmn:sequenceFlow id="FA2" sourceRef="Sub" targetRef="Join" />
      <bpmn:sequenceFlow id="FB2" sourceRef="B" targetRef="Join" />
      <bpmn:parallelGateway id="Join"><bpmn:incoming>FA2</bpmn:incoming><bpmn:incoming>FB2</bpmn:incoming><bpmn:outgoing>FJ</bpmn:outgoing></bpmn:parallelGateway>
      <bpmn:sequenceFlow id="FJ" sourceRef="Join" targetRef="E" />
      <bpmn:endEvent id="E"><bpmn:incoming>FJ</bpmn:incoming></bpmn:endEvent>`

    const { rt, state } = engine(xml, {
      SubMi: JSON.stringify({ approval: { userIds: ['1', '2'], multiMode: 'countersign' } }),
      B: JSON.stringify({ approval: { userIds: ['9'] } }),
    })
    rt.start({ initiator: '1' })

    // 完成子流程内的两个 MI 实例
    rt.completeTask(rt.openTasks().find((t) => t.nodeId === 'SubMi')!.id)
    rt.completeTask(rt.openTasks().find((t) => t.nodeId === 'SubMi')!.id)

    // 子流程结束后，该分支应已到达 join；此时 B 未完成 → 实例仍在运行
    expect(state.status).toBe('RUNNING')
    rt.completeTask(rt.openTasks().find((t) => t.nodeId === 'B')!.id)
    expect(state.status).toBe('COMPLETED')
  })
})
