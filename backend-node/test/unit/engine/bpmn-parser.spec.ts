import { describe, expect, it } from 'vitest'
import { parseBpmnXml } from '../../../src/engine/process/compiler/bpmn-parser'

/** 最小可用的 BPMN：start → 发起人 → 审批 → end（与契约场景里用的那份同构）。 */
const SIMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:wf="http://workflow.com/schema/bpmn/wf" xmlns:flowable="http://flowable.org/bpmn" targetNamespace="t">
  <bpmn:process id="leave_apply" name="请假流程" isExecutable="true">
    <bpmn:startEvent id="Start_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Initiator_1" />
    <bpmn:userTask id="Initiator_1" name="发起节点" wf:nodeRole="initiator" flowable:assignee="\${initiator}">
      <bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Initiator_1" targetRef="Approve_1" />
    <bpmn:userTask id="Approve_1" name="审批节点" flowable:assignee="1">
      <bpmn:incoming>Flow_2</bpmn:incoming><bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Approve_1" targetRef="End_1" />
    <bpmn:endEvent id="End_1"><bpmn:incoming>Flow_3</bpmn:incoming></bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`

describe('parseBpmnXml — 基础结构', () => {
  const parsed = parseBpmnXml(SIMPLE)

  it('取到 processKey 与 processName', () => {
    expect(parsed.processKey).toBe('leave_apply')
    expect(parsed.processName).toBe('请假流程')
  })

  it('识别全部节点并归一化类型（去掉命名空间前缀）', () => {
    expect(parsed.nodes.map((n) => `${n.nodeId}:${n.nodeType}`).sort()).toEqual([
      'Approve_1:userTask',
      'End_1:endEvent',
      'Initiator_1:userTask',
      'Start_1:startEvent',
    ])
  })

  it('识别全部连线', () => {
    expect(parsed.flows.map((f) => f.flowId).sort()).toEqual(['Flow_1', 'Flow_2', 'Flow_3'])
    expect(parsed.flows.find((f) => f.flowId === 'Flow_2')).toEqual({
      flowId: 'Flow_2',
      sourceId: 'Initiator_1',
      targetId: 'Approve_1',
      condition: null,
      isDefault: false,
    })
  })

  it('识别发起人节点（wf:nodeRole="initiator"，去前缀后为 nodeRole）', () => {
    const initiator = parsed.nodes.find((n) => n.nodeId === 'Initiator_1')!
    expect(initiator.isInitiator).toBe(true)
    expect(parsed.nodes.find((n) => n.nodeId === 'Approve_1')!.isInitiator).toBe(false)
  })

  it('取到 assignee（flowable:assignee，去前缀后为 assignee）', () => {
    expect(parsed.nodes.find((n) => n.nodeId === 'Approve_1')!.assignee).toBe('1')
    expect(parsed.nodes.find((n) => n.nodeId === 'Initiator_1')!.assignee).toBe('${initiator}')
  })

  it('取到 incoming / outgoing 列表', () => {
    const approve = parsed.nodes.find((n) => n.nodeId === 'Approve_1')!
    expect(approve.incoming).toEqual(['Flow_2'])
    expect(approve.outgoing).toEqual(['Flow_3'])
  })

  it('顶层节点的 containerId 为 null', () => {
    expect(parsed.nodes.every((n) => n.containerId === null)).toBe(true)
  })

  it('保留原始属性供后续使用', () => {
    expect(parsed.nodes.find((n) => n.nodeId === 'Initiator_1')!.attributes.nodeRole).toBe(
      'initiator',
    )
  })
})

describe('parseBpmnXml — 网关与条件', () => {
  const XML = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="p" name="n">
    <bpmn:exclusiveGateway id="Gw_1" default="Flow_default">
      <bpmn:incoming>Flow_in</bpmn:incoming>
      <bpmn:outgoing>Flow_hi</bpmn:outgoing>
      <bpmn:outgoing>Flow_default</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:sequenceFlow id="Flow_hi" sourceRef="Gw_1" targetRef="T1">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\${amount > 100}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_default" sourceRef="Gw_1" targetRef="T2" />
    <bpmn:parallelGateway id="Gw_2" />
    <bpmn:inclusiveGateway id="Gw_3" />
  </bpmn:process>
</bpmn:definitions>`

  const parsed = parseBpmnXml(XML)

  it('识别三种网关', () => {
    expect(parsed.nodes.find((n) => n.nodeId === 'Gw_1')!.nodeType).toBe('exclusiveGateway')
    expect(parsed.nodes.find((n) => n.nodeId === 'Gw_2')!.nodeType).toBe('parallelGateway')
    expect(parsed.nodes.find((n) => n.nodeId === 'Gw_3')!.nodeType).toBe('inclusiveGateway')
  })

  it('解析条件表达式原文', () => {
    expect(parsed.flows.find((f) => f.flowId === 'Flow_hi')!.condition).toBe('${amount > 100}')
  })

  it('无条件分支的 condition 为 null', () => {
    expect(parsed.flows.find((f) => f.flowId === 'Flow_default')!.condition).toBeNull()
  })

  it('网关上的 default="Flow_x" 标记出默认分支', () => {
    expect(parsed.flows.find((f) => f.flowId === 'Flow_default')!.isDefault).toBe(true)
    expect(parsed.flows.find((f) => f.flowId === 'Flow_hi')!.isDefault).toBe(false)
  })

  it('多条 outgoing 保持 XML 声明顺序（排他网关按序求值）', () => {
    expect(parsed.nodes.find((n) => n.nodeId === 'Gw_1')!.outgoing).toEqual([
      'Flow_hi',
      'Flow_default',
    ])
  })
})

describe('parseBpmnXml — 内嵌子流程', () => {
  const XML = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="p" name="n">
    <bpmn:subProcess id="Sub_1" name="子流程">
      <bpmn:startEvent id="Sub_Start" />
      <bpmn:userTask id="Sub_Task" />
      <bpmn:endEvent id="Sub_End" />
    </bpmn:subProcess>
    <bpmn:userTask id="Outer_Task" />
  </bpmn:process>
</bpmn:definitions>`

  const parsed = parseBpmnXml(XML)

  it('子流程自身与其内部节点都被收集', () => {
    expect(parsed.nodes.map((n) => n.nodeId).sort()).toEqual([
      'Outer_Task',
      'Sub_1',
      'Sub_End',
      'Sub_Start',
      'Sub_Task',
    ])
  })

  it('内部节点的 containerId 指向子流程', () => {
    expect(parsed.nodes.find((n) => n.nodeId === 'Sub_Task')!.containerId).toBe('Sub_1')
    expect(parsed.nodes.find((n) => n.nodeId === 'Sub_Start')!.containerId).toBe('Sub_1')
  })

  it('外部节点与子流程自身的 containerId 仍为 null', () => {
    expect(parsed.nodes.find((n) => n.nodeId === 'Outer_Task')!.containerId).toBeNull()
    expect(parsed.nodes.find((n) => n.nodeId === 'Sub_1')!.containerId).toBeNull()
  })
})

describe('parseBpmnXml — 多实例与候选人', () => {
  const XML = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:flowable="http://flowable.org/bpmn">
  <bpmn:process id="p" name="n">
    <bpmn:userTask id="Mi_1" flowable:assignee="\${approver}">
      <bpmn:multiInstanceLoopCharacteristics isSequential="false" flowable:collection="\${approverList}" flowable:elementVariable="approver">
        <bpmn:completionCondition>\${nrOfCompletedInstances == nrOfInstances}</bpmn:completionCondition>
      </bpmn:multiInstanceLoopCharacteristics>
    </bpmn:userTask>
    <bpmn:userTask id="Cand_1" flowable:candidateUsers="5,6,7" />
  </bpmn:process>
</bpmn:definitions>`

  const parsed = parseBpmnXml(XML)

  it('识别多实例声明', () => {
    expect(parsed.nodes.find((n) => n.nodeId === 'Mi_1')!.isMultiInstance).toBe(true)
    expect(parsed.nodes.find((n) => n.nodeId === 'Cand_1')!.isMultiInstance).toBe(false)
  })

  it('解析候选人列表', () => {
    expect(parsed.nodes.find((n) => n.nodeId === 'Cand_1')!.candidateUsers).toEqual(['5', '6', '7'])
  })

  it('无候选人时为空数组', () => {
    expect(parsed.nodes.find((n) => n.nodeId === 'Mi_1')!.candidateUsers).toEqual([])
  })
})

describe('parseBpmnXml — 服务任务与调用活动', () => {
  const XML = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:flowable="http://flowable.org/bpmn">
  <bpmn:process id="p" name="n">
    <bpmn:serviceTask id="Svc_1" name="自动任务" />
    <bpmn:callActivity id="Call_1" name="调用子流程" calledElement="other_flow" />
  </bpmn:process>
</bpmn:definitions>`

  const parsed = parseBpmnXml(XML)

  it('识别 serviceTask 与 callActivity', () => {
    expect(parsed.nodes.find((n) => n.nodeId === 'Svc_1')!.nodeType).toBe('serviceTask')
    expect(parsed.nodes.find((n) => n.nodeId === 'Call_1')!.nodeType).toBe('callActivity')
  })

  it('保留 calledElement 等自定义属性', () => {
    expect(parsed.nodes.find((n) => n.nodeId === 'Call_1')!.attributes.calledElement).toBe(
      'other_flow',
    )
  })
})

describe('parseBpmnXml — 错误与边界', () => {
  it('缺少 process 元素时报错', () => {
    expect(() => parseBpmnXml('<definitions></definitions>')).toThrow(/没有找到 <process>/)
  })

  it('无条件表达式的连线 condition 为 null 而非空串', () => {
    const parsed = parseBpmnXml(`<definitions><process id="p">
      <sequenceFlow id="F" sourceRef="a" targetRef="b" />
    </process></definitions>`)
    expect(parsed.flows[0].condition).toBeNull()
  })

  it('缺 sourceRef/targetRef 的连线被忽略，不产生半个对象', () => {
    const parsed = parseBpmnXml(`<definitions><process id="p">
      <sequenceFlow id="Bad" sourceRef="a" />
    </process></definitions>`)
    expect(parsed.flows).toEqual([])
  })
})
