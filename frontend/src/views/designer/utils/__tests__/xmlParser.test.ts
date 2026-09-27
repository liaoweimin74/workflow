import { describe, it, expect } from 'vitest'
import { normalizeBpmnXmlForRender } from '../xmlParser'

/** 与 backend-node empty-bpmn 模板同构的最小样本（dc:Rect 契约格式） */
const EMPTY_TEMPLATE_LIKE = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" targetNamespace="http://flowable.org/bpmn">
  <bpmn:process id="leave" name="请假" isExecutable="true">
    <bpmn:startEvent id="startEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="leave">
      <bpmndi:BPMNShape id="startEvent_1_di" bpmnElement="startEvent_1">
        <dc:Rect x="160" y="160" width="36" height="36"/>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

describe('normalizeBpmnXmlForRender — dc:Rect 渲染前归一为 dc:Bounds', () => {
  it('开标签 dc:Rect 改写为 dc:Bounds（属性原样保留）', () => {
    const out = normalizeBpmnXmlForRender(EMPTY_TEMPLATE_LIKE)
    expect(out).toContain('<dc:Bounds x="160" y="160" width="36" height="36"/>')
    expect(out).not.toContain('<dc:Rect')
    expect(out).not.toContain('dc:Rect')
  })

  it('闭标签 </dc:Rect> 同步改写（防御性）', () => {
    const out = normalizeBpmnXmlForRender('<a><dc:Rect x="1" y="1" width="2" height="2"></dc:Rect></a>')
    expect(out).toContain('<dc:Bounds x="1" y="1" width="2" height="2"></dc:Bounds>')
    expect(out).not.toContain('dc:Rect')
  })

  it('已是 dc:Bounds 的标准 XML 原样返回', () => {
    const standard = '<bpmndi:BPMNShape><dc:Bounds x="1" y="2" width="3" height="3" /></bpmndi:BPMNShape>'
    expect(normalizeBpmnXmlForRender(standard)).toBe(standard)
  })

  it('空串/undefined 语义安全（原样返回，不抛错）', () => {
    expect(normalizeBpmnXmlForRender('')).toBe('')
  })

  it('归一后 XML 可被 bpmn moddle 解析出 DI bounds（代表性断言：标签名合法）', () => {
    const out = normalizeBpmnXmlForRender(EMPTY_TEMPLATE_LIKE)
    // bpmn-js 的 DI 解析只认 dc:Bounds；改写后不应再有未知标签
    expect(out).toContain('<bpmndi:BPMNShape id="startEvent_1_di" bpmnElement="startEvent_1">')
    expect((out.match(/dc:Bounds/g) || []).length).toBe(1)
  })
})
