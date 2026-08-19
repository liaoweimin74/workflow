import { describe, it, expect } from 'vitest'
import { isInitiatorTaskElement, validateSubProcessBoundaries } from '../bpmnValidation'

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
