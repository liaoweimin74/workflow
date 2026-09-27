import { describe, expect, it } from 'vitest'
import {
  buildLinearProcessBpmnXml,
  WF_NAMESPACE,
} from '../../../src/ai/service/ai-process-bpmn'
import { normalizePlan } from '../../../src/ai/service/ai-process-plan'

/** AI 流程 BPMN 拼装：结构 / 发起节点标记 / 连线与 DI 完整性（node 环境，正则断言）。 */

const DEFAULT_NS = 'http://flowable.org/bpmn'

function samplePlan() {
  return normalizePlan({
    name: '请假审批流程',
    key: 'leave_flow',
    processForm: { formName: '员工请假单' },
    nodes: [
      { type: 'initiator', name: '提交请假申请' },
      { type: 'userTask', name: '主管审批', approval: { type: 'dept_head' } },
      { type: 'userTask', name: 'HR 备案', approval: { type: 'dept_head' } },
    ],
  }).plan
}

describe('buildLinearProcessBpmnXml', () => {
  it('包含 definitions 命名空间（含 wf）与 process 元素', () => {
    const xml = buildLinearProcessBpmnXml(samplePlan(), DEFAULT_NS)
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain(`<xmlns:wf="${WF_NAMESPACE}"`.replace('<xmlns:', 'xmlns:'))
    expect(xml).toContain('xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"')
    expect(xml).toContain(`<bpmn:process id="leave_flow" name="请假审批流程" isExecutable="true">`)
    expect(xml).toContain('<bpmndi:BPMNDiagram')
  })

  it('发起节点带 nodeRole=initiator 与 assignee=${initiator}；审批节点带 nodeRole=approver', () => {
    const xml = buildLinearProcessBpmnXml(samplePlan(), DEFAULT_NS)
    expect(xml).toContain(
      '<bpmn:userTask id="ai_task_1" name="提交请假申请" flowable:assignee="${initiator}" wf:nodeRole="initiator">',
    )
    expect(xml).toContain('<bpmn:userTask id="ai_task_2" name="主管审批" wf:nodeRole="approver">')
    expect(xml).toContain('<bpmn:userTask id="ai_task_3" name="HR 备案" wf:nodeRole="approver">')
    expect(xml.match(/wf:nodeRole="initiator"/g)).toHaveLength(1)
    expect(xml.match(/wf:nodeRole="approver"/g)).toHaveLength(2)
  })

  it('每个节点带 incoming/outgoing 子元素（编译器拓扑校验依赖）', () => {
    const xml = buildLinearProcessBpmnXml(samplePlan(), DEFAULT_NS)
    // start：仅 outgoing=flow_1
    expect(xml).toContain(
      '<bpmn:startEvent id="startEvent_1">\n      <bpmn:outgoing>flow_1</bpmn:outgoing>\n    </bpmn:startEvent>',
    )
    // 中间节点 ai_task_2：incoming=flow_2 + outgoing=flow_3
    expect(xml).toContain('<bpmn:incoming>flow_2</bpmn:incoming>')
    expect(xml).toContain('<bpmn:outgoing>flow_3</bpmn:outgoing>')
    // end：仅 incoming=flow_4（4 节点 + 2 事件 = 5 元素 → 4 边）
    expect(xml).toContain(
      '<bpmn:endEvent id="endEvent_1">\n      <bpmn:incoming>flow_4</bpmn:incoming>\n    </bpmn:endEvent>',
    )
    expect(xml.match(/<bpmn:incoming>/g)?.length).toBe(4)
    expect(xml.match(/<bpmn:outgoing>/g)?.length).toBe(4)
  })

  it('连线链 start → 发起 → 审批×N → end，边数 = 元素数 - 1', () => {
    const plan = samplePlan()
    const xml = buildLinearProcessBpmnXml(plan, DEFAULT_NS)
    const flows = [...xml.matchAll(/<bpmn:sequenceFlow id="flow_\d+" sourceRef="([^"]+)" targetRef="([^"]+)"\/>/g)]
    // start + 3 task + end = 5 元素 → 4 边
    expect(flows).toHaveLength(plan.nodes.length + 1)
    expect(flows[0][1]).toBe('startEvent_1')
    expect(flows[0][2]).toBe('ai_task_1')
    expect(flows[1][1]).toBe('ai_task_1')
    expect(flows[1][2]).toBe('ai_task_2')
    expect(flows[2][1]).toBe('ai_task_2')
    expect(flows[2][2]).toBe('ai_task_3')
    expect(flows[3][1]).toBe('ai_task_3')
    expect(flows[3][2]).toBe('endEvent_1')
  })

  it('每个元素与连线都有 DI（shape/edge 成对，坐标为正）', () => {
    const xml = buildLinearProcessBpmnXml(samplePlan(), DEFAULT_NS)
    const shapeCount = xml.match(/<bpmndi:BPMNShape /g)?.length ?? 0
    const edgeCount = xml.match(/<bpmndi:BPMNEdge /g)?.length ?? 0
    // 5 元素（start+3task+end）→ 5 shape；4 连线 → 4 edge
    expect(shapeCount).toBe(5)
    expect(edgeCount).toBe(4)
    for (const m of xml.matchAll(/<dc:Bounds x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"\/>/g)) {
      expect(Number(m[1])).toBeGreaterThan(0)
      expect(Number(m[2])).toBeGreaterThan(0)
      expect(Number(m[3])).toBeGreaterThan(0)
      expect(Number(m[4])).toBeGreaterThan(0)
    }
    // waypoint：edge 内两个点，y 递增（垂直向下布局）
    for (const m of xml.matchAll(/<di:waypoint x="(\d+)" y="(\d+)"\/>\s*<di:waypoint x="(\d+)" y="(\d+)"\/>/g)) {
      expect(Number(m[4])).toBeGreaterThan(Number(m[2]))
    }
  })

  it('XML 属性转义（name 含特殊字符）', () => {
    const plan = normalizePlan({
      name: '流程<">&测试',
      key: 'escape_flow',
      nodes: [
        { type: 'initiator', name: '提交' },
        { type: 'userTask', name: '审批&<>"节点' },
      ],
    }).plan
    const xml = buildLinearProcessBpmnXml(plan, DEFAULT_NS)
    expect(xml).toContain('name="流程&lt;&quot;&gt;&amp;测试"')
    expect(xml).toContain('name="审批&amp;&lt;&gt;&quot;节点"')
  })

  it('无发起输入自动补发起节点（最小流程 2 task）', () => {
    const plan = normalizePlan({
      name: '最小',
      key: 'min_flow',
      nodes: [{ type: 'userTask', name: '审批' }],
    }).plan
    const xml = buildLinearProcessBpmnXml(plan, DEFAULT_NS)
    expect(xml.match(/<bpmn:userTask /g)?.length).toBe(2)
    expect(xml).toContain('wf:nodeRole="initiator"')
    expect(xml).toContain('name="提交申请"')
  })
})
