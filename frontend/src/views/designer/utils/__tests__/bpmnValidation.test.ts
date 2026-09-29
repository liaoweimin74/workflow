import { describe, it, expect } from 'vitest'
import {
  isInitiatorTaskElement,
  validateSubProcessBoundaries,
  validateFlowConnectivity,
  validateProcessXml,
} from '../bpmnValidation'

/** 用 DOMParser 将 XML 片段解析为 Element，模拟 validateBpmnXml 中的 DOM 查询结果 */
function elementFromXml(xml: string): Element {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  const el = doc.querySelector('*:not(definitions)') as Element | null
  if (!el) throw new Error('test xml produced no element')
  return el
}

describe('isInitiatorTaskElement', () => {
  it('should return true for userTask with wf:nodeRole="initiator"', () => {
    const el = elementFromXml(
      `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:wf="http://workflow.com/schema/bpmn/wf">
         <userTask id="Activity_init" wf:nodeRole="initiator" name="发起人填报" />
       </definitions>`
    )
    expect(isInitiatorTaskElement(el)).toBe(true)
  })

  it('should return true for userTask with unprefixed nodeRole="initiator"', () => {
    // 兼容后端 InitiatorNodeResolver 对 key 为 "nodeRole" 的容错
    const el = elementFromXml(
      `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
         <userTask id="Activity_init" nodeRole="initiator" name="发起人填报" />
       </definitions>`
    )
    expect(isInitiatorTaskElement(el)).toBe(true)
  })

  it('should return false for plain userTask without nodeRole', () => {
    const el = elementFromXml(
      `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
         <userTask id="Activity_approve" name="部门经理审批" />
       </definitions>`
    )
    expect(isInitiatorTaskElement(el)).toBe(false)
  })

  it('should return false for userTask with nodeRole other than initiator', () => {
    const el = elementFromXml(
      `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:wf="http://workflow.com/schema/bpmn/wf">
         <userTask id="Activity_x" wf:nodeRole="manager" name="经理审批" />
       </definitions>`
    )
    expect(isInitiatorTaskElement(el)).toBe(false)
  })

  it('should return false for non-userTask elements', () => {
    const el = elementFromXml(
      `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
         <startEvent id="StartEvent_1" />
       </definitions>`
    )
    expect(isInitiatorTaskElement(el)).toBe(false)
  })
})

const NS = 'xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"'

describe('validateSubProcessBoundaries', () => {
  it('子流程含开始与结束事件时通过', () => {
    const xml = `<definitions ${NS}><process id="p">
      <subProcess id="sub_1" name="入职">
        <startEvent id="s" /><endEvent id="e" />
      </subProcess>
    </process></definitions>`
    expect(validateSubProcessBoundaries(xml)).toEqual([])
  })

  it('子流程缺开始事件时报错并带名称', () => {
    const xml = `<definitions ${NS}><process id="p">
      <subProcess id="sub_1" name="入职"><endEvent id="e" /></subProcess>
    </process></definitions>`
    expect(validateSubProcessBoundaries(xml)).toEqual(['内嵌子流程「入职」缺少开始事件'])
  })

  it('子流程缺结束事件时（未命名用 id 兜底）', () => {
    const xml = `<definitions ${NS}><process id="p">
      <subProcess id="sub_9"><startEvent id="s" /></subProcess>
    </process></definitions>`
    expect(validateSubProcessBoundaries(xml)).toEqual(['内嵌子流程「sub_9」缺少结束事件'])
  })

  it('嵌套子流程不互相误判', () => {
    const xml = `<definitions ${NS}><process id="p">
      <subProcess id="outer">
        <startEvent id="s" />
        <subProcess id="inner">
          <startEvent id="si" /><endEvent id="ei" />
        </subProcess>
        <endEvent id="e" />
      </subProcess>
    </process></definitions>`
    // outer 的直属子元素含 s 与 e；inner 直属含 si 与 ei → 均通过
    expect(validateSubProcessBoundaries(xml)).toEqual([])
  })

  it('无子流程的流程通过', () => {
    expect(validateSubProcessBoundaries(`<definitions ${NS}><process id="p"><startEvent id="s" /></process></definitions>`)).toEqual([])
  })

  it('XML 解析失败返回空数组', () => {
    expect(validateSubProcessBoundaries('<broken')).toEqual([])
  })
})

describe('validateFlowConnectivity', () => {
  const NS = 'xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"'

  it('无 endEvent 时末端任务报没有出边（用户实测场景：办理节点未连线）', () => {
    const xml = `<definitions ${NS} xmlns:wf="http://workflow.com/schema/bpmn/wf"><process id="leave">
      <startEvent id="startEvent_1"><outgoing>F1</outgoing></startEvent>
      <userTask id="Activity_16tdl33" name="发起节点" wf:nodeRole="initiator"><incoming>F1</incoming><outgoing>F2</outgoing></userTask>
      <sequenceFlow id="F1" sourceRef="startEvent_1" targetRef="Activity_16tdl33" />
      <userTask id="Activity_12aok35" wf:nodeRole="handler"><incoming>F2</incoming></userTask>
      <sequenceFlow id="F2" sourceRef="Activity_16tdl33" targetRef="Activity_12aok35" />
    </process></definitions>`
    const errors = validateFlowConnectivity(xml)
    expect(errors).toHaveLength(1)
    // 未命名 userTask 用角色标签展示，附 ID 便于画布定位
    expect(errors[0]).toContain('办理节点(Activity_12aok35)')
    expect(errors[0]).toContain('没有出边')
  })

  it('有 name 的节点报错时用名称(ID) 展示', () => {
    const xml = `<definitions ${NS}><process id="p">
      <startEvent id="s1" />
      <userTask id="t1" name="经理审批" />
    </process></definitions>`
    const errors = validateFlowConnectivity(xml)
    expect(errors.join('\n')).toContain('经理审批(t1)')
    expect(errors.join('\n')).toContain('没有出边')
  })

  it('孤立的中间节点同时报出边与入边问题', () => {
    const xml = `<definitions ${NS}><process id="p">
      <startEvent id="s1" />
      <endEvent id="e1" />
      <userTask id="t1" name="孤儿节点" />
      <sequenceFlow id="F1" sourceRef="s1" targetRef="e1" />
    </process></definitions>`
    const errors = validateFlowConnectivity(xml)
    const joined = errors.join('\n')
    expect(joined).toContain('孤儿节点(t1)')
    expect(joined).toContain('没有出边')
    expect(joined).toContain('没有入边')
  })

  it('完整连线 start→task→end 通过', () => {
    const xml = `<definitions ${NS}><process id="p">
      <startEvent id="s1" />
      <userTask id="t1" name="审批" />
      <endEvent id="e1" />
      <sequenceFlow id="F1" sourceRef="s1" targetRef="t1" />
      <sequenceFlow id="F2" sourceRef="t1" targetRef="e1" />
    </process></definitions>`
    expect(validateFlowConnectivity(xml)).toEqual([])
  })

  it('排他网关多条无条件分支报错（default 分支不算无条件）', () => {
    const xml = `<definitions ${NS}><process id="p">
      <startEvent id="s1" />
      <exclusiveGateway id="g1" default="F1" />
      <userTask id="t1" name="A" />
      <userTask id="t2" name="B" />
      <endEvent id="e1" />
      <sequenceFlow id="F1" sourceRef="g1" targetRef="t1" />
      <sequenceFlow id="F2" sourceRef="g1" targetRef="t2" />
      <sequenceFlow id="F3" sourceRef="t1" targetRef="e1" />
      <sequenceFlow id="F4" sourceRef="t2" targetRef="e1" />
      <sequenceFlow id="F0" sourceRef="s1" targetRef="g1" />
    </process></definitions>`
    const errors = validateFlowConnectivity(xml)
    expect(errors.join('\n')).not.toContain('无条件分支')
    // 补一条无条件分支后（F2/F3 均无条件且非 default）应报错
    const xml2 = xml.replace('<sequenceFlow id="F4" sourceRef="t2" targetRef="e1" />',
      '<sequenceFlow id="F4" sourceRef="t2" targetRef="e1" />\n      <sequenceFlow id="F5" sourceRef="g1" targetRef="t2" />')
    const errors2 = validateFlowConnectivity(xml2)
    expect(errors2.join('\n')).toContain('排他网关')
    expect(errors2.join('\n')).toContain('无条件分支')
  })

  it('XML 解析失败返回空数组', () => {
    expect(validateFlowConnectivity('<broken')).toEqual([])
  })
})

describe('validateProcessXml', () => {
  const NS = 'xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:wf="http://workflow.com/schema/bpmn/wf"'

  it('有 endEvent 但末端任务未连线 → 连通性错误阻断', () => {
    const xml = `<definitions ${NS}><process id="leave">
      <startEvent id="startEvent_1" />
      <userTask id="A1" wf:nodeRole="initiator" />
      <userTask id="A2" wf:nodeRole="handler" />
      <endEvent id="e1" />
      <sequenceFlow id="F1" sourceRef="startEvent_1" targetRef="A1" />
      <sequenceFlow id="F2" sourceRef="A1" targetRef="A2" />
      <sequenceFlow id="F5" sourceRef="startEvent_1" targetRef="e1" />
    </process></definitions>`
    const { error, warnings } = validateProcessXml(xml, {})
    expect(error).not.toBeNull()
    expect(error).toContain('办理节点(A2)')
    expect(error).toContain('没有出边')
    expect(warnings).toEqual([])
  })

  it('缺少结束事件优先报「流程缺少结束事件」', () => {
    const xml = `<definitions ${NS}><process id="p">
      <startEvent id="s1" />
    </process></definitions>`
    const { error } = validateProcessXml(xml, {})
    expect(error).toContain('缺少结束事件')
  })

  it('完整合法流程通过（发起节点无需配置审批人）', () => {
    const xml = `<definitions ${NS}><process id="p">
      <startEvent id="s1" />
      <userTask id="A1" name="发起" wf:nodeRole="initiator" />
      <userTask id="A2" name="审批" wf:nodeRole="approver" />
      <endEvent id="e1" />
      <sequenceFlow id="F1" sourceRef="s1" targetRef="A1" />
      <sequenceFlow id="F2" sourceRef="A1" targetRef="A2" />
      <sequenceFlow id="F3" sourceRef="A2" targetRef="e1" />
    </process></definitions>`
    const configs = { A2: JSON.stringify({ approval: { type: 'user', userIds: ['u1'] } }) }
    const { error } = validateProcessXml(xml, configs)
    expect(error).toBeNull()
  })

  it('指定用户但未选人且有兜底策略 → 降级为警告不阻断', () => {
    const xml = `<definitions ${NS}><process id="p">
      <startEvent id="s1" />
      <userTask id="A2" name="审批" wf:nodeRole="approver" />
      <endEvent id="e1" />
      <sequenceFlow id="F1" sourceRef="s1" targetRef="A2" />
      <sequenceFlow id="F2" sourceRef="A2" targetRef="e1" />
    </process></definitions>`
    const configs = {
      A2: JSON.stringify({
        approval: { type: 'user', userIds: [] },
        assigneeOptions: { noAssigneePolicy: 'to_admin' },
      }),
    }
    const { error, warnings } = validateProcessXml(xml, configs)
    expect(error).toBeNull()
    expect(warnings.join('\n')).toContain('未指定具体人员')
  })

  it('XML 解析失败返回解析错误', () => {
    const { error } = validateProcessXml('<broken', {})
    expect(error).toContain('解析失败')
  })
})
