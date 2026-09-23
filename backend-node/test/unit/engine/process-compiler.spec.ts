import { describe, expect, it } from 'vitest'
import { EngineException } from '../../../src/common/exception/engine-exception'
import {
  PROCESS_LEVEL_CONFIG_KEY,
  compileProcess,
} from '../../../src/engine/process/compiler/process-compiler'

/** 等价于契约场景里那份 BPMN：start → 发起人 → 审批 → end。 */
const SIMPLE = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:wf="http://workflow.com/schema/bpmn/wf" xmlns:flowable="http://flowable.org/bpmn">
  <bpmn:process id="leave_apply" name="请假流程">
    <bpmn:startEvent id="Start_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Initiator_1" />
    <bpmn:userTask id="Initiator_1" name="发起节点" wf:nodeRole="initiator">
      <bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Initiator_1" targetRef="Approve_1" />
    <bpmn:userTask id="Approve_1" name="审批节点">
      <bpmn:incoming>Flow_2</bpmn:incoming><bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Approve_1" targetRef="End_1" />
    <bpmn:endEvent id="End_1"><bpmn:incoming>Flow_3</bpmn:incoming></bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`

describe('compileProcess — 基础编译', () => {
  const model = compileProcess({ bpmnXml: SIMPLE })

  it('产出 processKey / processName', () => {
    expect(model.processKey).toBe('leave_apply')
    expect(model.processName).toBe('请假流程')
  })

  it('识别 startNodeId 与 initiatorNodeId', () => {
    expect(model.startNodeId).toBe('Start_1')
    expect(model.initiatorNodeId).toBe('Initiator_1')
  })

  it('节点与连线索引齐全', () => {
    expect(Object.keys(model.nodes).sort()).toEqual([
      'Approve_1',
      'End_1',
      'Initiator_1',
      'Start_1',
    ])
    expect(Object.keys(model.flows).sort()).toEqual(['Flow_1', 'Flow_2', 'Flow_3'])
  })

  it('连线保留了 source/target，供运行时推进 token', () => {
    expect(model.flows.Flow_2).toEqual({
      flowId: 'Flow_2',
      sourceId: 'Initiator_1',
      targetId: 'Approve_1',
      condition: null,
      isDefault: false,
    })
  })

  it('userTask 带上 approval 结构（multiMode 默认 single）', () => {
    expect(model.nodes.Approve_1.approval).toEqual({
      userIds: [],
      roleCodes: [],
      multiMode: 'single',
    })
  })

  it('并发容器映射为空对象（没有子流程时）', () => {
    expect(model.containers).toEqual({})
  })
})

describe('compileProcess — 合并 NodeConfig', () => {
  it('把 approval.userIds 与 multiMode 并进节点', () => {
    const model = compileProcess({
      bpmnXml: SIMPLE,
      nodeConfigs: {
        Approve_1: JSON.stringify({
          basic: { name: '经理审批' },
          approval: { userIds: [5, 6], multiMode: 'countersign' },
        }),
      },
    })
    expect(model.nodes.Approve_1.approval).toEqual({
      userIds: ['5', '6'],
      roleCodes: [],
      multiMode: 'countersign',
    })
    expect(model.nodes.Approve_1.name).toBe('审批节点')
  })

  it('BPMN 上没写 name 时回退到 NodeConfig.basic.name', () => {
    const xml = SIMPLE.replace(' name="审批节点"', '')
    const model = compileProcess({
      bpmnXml: xml,
      nodeConfigs: { Approve_1: JSON.stringify({ basic: { name: '经理审批' } }) },
    })
    expect(model.nodes.Approve_1.name).toBe('经理审批')
  })

  it('三种多实例模式都能识别', () => {
    for (const mode of ['countersign', 'or_sign', 'sequential'] as const) {
      const model = compileProcess({
        bpmnXml: SIMPLE,
        nodeConfigs: { Approve_1: JSON.stringify({ approval: { multiMode: mode } }) },
      })
      expect(model.nodes.Approve_1.approval?.multiMode).toBe(mode)
    }
  })

  it('multiMode 为空串 / 未知取值 / 缺失 → single（对齐 Java 侧只看三种有效值）', () => {
    for (const raw of ['', '  ', 'bogus', undefined, 123, null]) {
      const model = compileProcess({
        bpmnXml: SIMPLE,
        nodeConfigs: { Approve_1: JSON.stringify({ approval: { multiMode: raw } }) },
      })
      expect(model.nodes.Approve_1.approval?.multiMode, `raw=${String(raw)}`).toBe('single')
    }
  })

  it('roleCodes 也能解析', () => {
    const model = compileProcess({
      bpmnXml: SIMPLE,
      nodeConfigs: { Approve_1: JSON.stringify({ approval: { roleCodes: ['ROLE_ADMIN'] } }) },
    })
    expect(model.nodes.Approve_1.approval?.roleCodes).toEqual(['ROLE_ADMIN'])
  })

  it('配置 JSON 损坏时不让部署崩掉，退化为默认值', () => {
    const model = compileProcess({ bpmnXml: SIMPLE, nodeConfigs: { Approve_1: '{不是合法 JSON' } })
    expect(model.nodes.Approve_1.approval?.multiMode).toBe('single')
  })

  it('processName 为空时回退到流程级配置 __PROCESS__.basic.name', () => {
    const xml = SIMPLE.replace(' name="请假流程"', '')
    const model = compileProcess({
      bpmnXml: xml,
      nodeConfigs: { [PROCESS_LEVEL_CONFIG_KEY]: JSON.stringify({ basic: { name: '流程级名' } }) },
    })
    expect(model.processName).toBe('流程级名')
  })

  it('保留 BPMN 上写死的 assignee 与 candidateUsers', () => {
    const xml = SIMPLE.replace(
      '<bpmn:userTask id="Approve_1" name="审批节点">',
      '<bpmn:userTask id="Approve_1" name="审批节点" flowable:assignee="9" flowable:candidateUsers="1,2">',
    )
    const model = compileProcess({ bpmnXml: xml })
    expect(model.nodes.Approve_1.assignee).toBe('9')
    expect(model.nodes.Approve_1.candidateUsers).toEqual(['1', '2'])
  })

  it('非 userTask 不产生 approval 字段', () => {
    const model = compileProcess({ bpmnXml: SIMPLE })
    expect(model.nodes.Start_1.approval).toBeUndefined()
    expect(model.nodes.End_1.approval).toBeUndefined()
  })
})

describe('compileProcess — 部署期校验', () => {
  const expectError = (xml: string, pattern: RegExp, key?: string): void => {
    try {
      compileProcess({ bpmnXml: xml, expectedProcessKey: key })
      throw new Error('本应抛出 EngineException')
    } catch (err) {
      expect(err).toBeInstanceOf(EngineException)
      expect((err as Error).message).toMatch(pattern)
    }
  }

  it('缺少顶层 startEvent', () => {
    const xml = `<definitions><process id="p">
      <endEvent id="E" />
    </process></definitions>`
    expectError(xml, /顶层缺少 startEvent/)
  })

  it('多个顶层 startEvent', () => {
    const xml = `<definitions><process id="p">
      <startEvent id="S1"><outgoing>F1</outgoing></startEvent>
      <startEvent id="S2"><outgoing>F2</outgoing></startEvent>
      <endEvent id="E1"><incoming>F1</incoming></endEvent>
      <endEvent id="E2"><incoming>F2</incoming></endEvent>
      <sequenceFlow id="F1" sourceRef="S1" targetRef="E1" />
      <sequenceFlow id="F2" sourceRef="S2" targetRef="E2" />
    </process></definitions>`
    expectError(xml, /只允许一个/)
  })

  it('内嵌子流程缺少 start/end', () => {
    const xml = `<definitions><process id="p">
      <startEvent id="S"><outgoing>F1</outgoing></startEvent>
      <sequenceFlow id="F1" sourceRef="S" targetRef="Sub" />
      <subProcess id="Sub"><incoming>F1</incoming><outgoing>F2</outgoing>
        <userTask id="Inner" />
      </subProcess>
      <sequenceFlow id="F2" sourceRef="Sub" targetRef="E" />
      <endEvent id="E"><incoming>F2</incoming></endEvent>
    </process></definitions>`
    expectError(xml, /内嵌子流程 "Sub" 缺少 startEvent/)
    expectError(xml, /内嵌子流程 "Sub" 缺少 endEvent/)
  })

  it('连线两端不存在', () => {
    const xml = `<definitions><process id="p">
      <startEvent id="S"><outgoing>F1</outgoing></startEvent>
      <sequenceFlow id="F1" sourceRef="S" targetRef="Ghost" />
    </process></definitions>`
    expectError(xml, /targetRef "Ghost" 不存在/)
  })

  it('节点没有出边（走死）', () => {
    const xml = `<definitions><process id="p">
      <startEvent id="S"><outgoing>F1</outgoing></startEvent>
      <userTask id="T"><incoming>F1</incoming></userTask>
      <sequenceFlow id="F1" sourceRef="S" targetRef="T" />
    </process></definitions>`
    expectError(xml, /没有出边/)
  })

  it('节点没有入边（永远不可达）', () => {
    const xml = `<definitions><process id="p">
      <startEvent id="S"><outgoing>F1</outgoing></startEvent>
      <endEvent id="E"><incoming>F1</incoming></endEvent>
      <userTask id="Orphan"><outgoing>F2</outgoing></userTask>
      <sequenceFlow id="F1" sourceRef="S" targetRef="E" />
      <sequenceFlow id="F2" sourceRef="Orphan" targetRef="E" />
    </process></definitions>`
    expectError(xml, /没有入边/)
  })

  it('排他网关多条无条件分支', () => {
    const xml = `<definitions><process id="p">
      <startEvent id="S"><outgoing>F0</outgoing></startEvent>
      <exclusiveGateway id="Gw"><incoming>F0</incoming><outgoing>F1</outgoing><outgoing>F2</outgoing></exclusiveGateway>
      <endEvent id="E1"><incoming>F1</incoming></endEvent>
      <endEvent id="E2"><incoming>F2</incoming></endEvent>
      <sequenceFlow id="F0" sourceRef="S" targetRef="Gw" />
      <sequenceFlow id="F1" sourceRef="Gw" targetRef="E1" />
      <sequenceFlow id="F2" sourceRef="Gw" targetRef="E2" />
    </process></definitions>`
    expectError(xml, /无条件分支/)
  })

  it('排他网关全部分支都带条件且无默认分支（条件全不命中会卡死）', () => {
    const xml = `<definitions><process id="p">
      <startEvent id="S"><outgoing>F0</outgoing></startEvent>
      <exclusiveGateway id="Gw"><incoming>F0</incoming><outgoing>F1</outgoing><outgoing>F2</outgoing></exclusiveGateway>
      <endEvent id="E1"><incoming>F1</incoming></endEvent>
      <endEvent id="E2"><incoming>F2</incoming></endEvent>
      <sequenceFlow id="F0" sourceRef="S" targetRef="Gw" />
      <sequenceFlow id="F1" sourceRef="Gw" targetRef="E1">
        <conditionExpression>\${x > 1}</conditionExpression>
      </sequenceFlow>
      <sequenceFlow id="F2" sourceRef="Gw" targetRef="E2">
        <conditionExpression>\${x <= 1}</conditionExpression>
      </sequenceFlow>
    </process></definitions>`
    expectError(xml, /没有默认分支/)
  })

  it('只有一条出边的排他网关不算分支，不要求默认分支', () => {
    const xml = `<definitions><process id="p">
      <startEvent id="S"><outgoing>F0</outgoing></startEvent>
      <exclusiveGateway id="Gw"><incoming>F0</incoming><outgoing>F1</outgoing></exclusiveGateway>
      <endEvent id="E1"><incoming>F1</incoming></endEvent>
      <sequenceFlow id="F0" sourceRef="S" targetRef="Gw" />
      <sequenceFlow id="F1" sourceRef="Gw" targetRef="E1">
        <conditionExpression>\${x > 1}</conditionExpression>
      </sequenceFlow>
    </process></definitions>`
    expect(() => compileProcess({ bpmnXml: xml })).not.toThrow()
  })

  it('带默认分支的排他网关合法', () => {
    const xml = `<definitions><process id="p">
      <startEvent id="S"><outgoing>F0</outgoing></startEvent>
      <exclusiveGateway id="Gw" default="F1"><incoming>F0</incoming><outgoing>F1</outgoing></exclusiveGateway>
      <endEvent id="E1"><incoming>F1</incoming></endEvent>
      <sequenceFlow id="F0" sourceRef="S" targetRef="Gw" />
      <sequenceFlow id="F1" sourceRef="Gw" targetRef="E1" />
    </process></definitions>`
    expect(() => compileProcess({ bpmnXml: xml })).not.toThrow()
  })

  it('process id 与流程定义的 key 不一致', () => {
    expectError(SIMPLE, /与流程定义的 key "other_key" 不一致/, 'other_key')
  })

  it('一次报出全部问题而不是只报第一个', () => {
    const xml = `<definitions><process id="p">
      <userTask id="T1"><outgoing>F9</outgoing></userTask>
    </process></definitions>`
    try {
      compileProcess({ bpmnXml: xml })
      throw new Error('本应抛出')
    } catch (err) {
      const message = (err as Error).message
      expect(message).toMatch(/共 \d+ 处问题/)
      expect(message).toMatch(/顶层缺少 startEvent/)
      expect(message).toMatch(/不存在的连线 "F9"/)
    }
  })
})

describe('compileProcess — 子流程容器映射', () => {
  const XML = `<definitions><process id="p" name="n">
    <startEvent id="S"><outgoing>F0</outgoing></startEvent>
    <sequenceFlow id="F0" sourceRef="S" targetRef="Sub" />
    <subProcess id="Sub"><incoming>F0</incoming><outgoing>F1</outgoing>
      <startEvent id="SubS"><outgoing>SF1</outgoing></startEvent>
      <sequenceFlow id="SF1" sourceRef="SubS" targetRef="SubT" />
      <userTask id="SubT"><incoming>SF1</incoming><outgoing>SF2</outgoing></userTask>
      <sequenceFlow id="SF2" sourceRef="SubT" targetRef="SubE" />
      <endEvent id="SubE"><incoming>SF2</incoming></endEvent>
    </subProcess>
    <sequenceFlow id="F1" sourceRef="Sub" targetRef="E" />
    <endEvent id="E"><incoming>F1</incoming></endEvent>
  </process></definitions>`

  const model = compileProcess({ bpmnXml: XML })

  it('容器映射列出子流程的直接子节点', () => {
    expect(model.containers.Sub.sort()).toEqual(['SubE', 'SubS', 'SubT'])
  })

  it('内部节点的 containerId 指向子流程', () => {
    expect(model.nodes.SubT.containerId).toBe('Sub')
  })

  it('initiatorNodeId 只认顶层节点（子流程内部的不算）', () => {
    expect(model.initiatorNodeId).toBeNull()
  })
})
