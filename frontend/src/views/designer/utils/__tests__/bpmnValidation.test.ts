import { describe, it, expect } from 'vitest'
import { isInitiatorTaskElement } from '../bpmnValidation'

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
