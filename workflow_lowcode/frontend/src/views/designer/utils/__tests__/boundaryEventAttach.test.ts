import { describe, it, expect } from 'vitest'
import BpmnModeler from 'bpmn-js/lib/Modeler'
import wfModdle from '../wf-moddle.json'
import { customRendererModule } from '../customRenderer'
import { customRulesModule } from '../customRules'
import { customContextPadModule } from '../customContextPad'
import { snapToHostBorder } from '../subflowNavigation'

// jsdom 缺失的 SVG 几何 API（bpmn-js 渲染链路依赖）
;(globalThis as any).CSS = (globalThis as any).CSS || { escape: (s: string) => s }
;(SVGElement.prototype as any).getBBox = () => ({ x: 0, y: 0, width: 800, height: 600 })
const createMatrix = () => ({
  a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
  multiply: createMatrix, inverse: createMatrix,
  translate: createMatrix, scale: createMatrix, rotate: createMatrix
})
Object.defineProperty(SVGElement.prototype, 'transform', {
  configurable: true,
  get() {
    const list = {
      numberOfItems: 0,
      clear() {},
      appendItem() {},
      consolidate: () => ({ matrix: createMatrix() })
    }
    return { baseVal: list, animatedVal: list }
  }
})
;(SVGElement.prototype as any).createSVGTransform = () => ({
  type: 0, matrix: createMatrix(),
  setMatrix() {}, setTranslate() {}, setScale() {}, setRotate() {}
})
;(SVGElement.prototype as any).createSVGMatrix = createMatrix
;(globalThis as any).SVGMatrix = function SVGMatrix() {}
;(globalThis as any).SVGTransform = function SVGTransform() {}

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="defs" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="p1" isExecutable="true">
    <bpmn:serviceTask id="task1" name="服务" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="d1">
    <bpmndi:BPMNPlane id="plane" bpmnElement="p1">
      <bpmndi:BPMNShape id="task1_di" bpmnElement="task1"><dc:Bounds x="200" y="100" width="100" height="80" /></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

const HOST = { x: 200, y: 100, width: 100, height: 80 }

function createModeler() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const modeler: any = new BpmnModeler({
    container,
    additionalModules: [customContextPadModule as any, customRendererModule as any, customRulesModule as any],
    moddleExtensions: { wf: wfModdle as any }
  })
  return { container, modeler }
}

describe('snapToHostBorder — 边界事件落点吸附到活动边框', () => {
  it('取最近的一条边，另一轴夹在边的范围内', () => {
    expect(snapToHostBorder(HOST, { x: 250, y: 145 })).toEqual({ x: 250, y: 180 })   // 底边
    expect(snapToHostBorder(HOST, { x: 205, y: 140 })).toEqual({ x: 200, y: 140 })   // 左边
    expect(snapToHostBorder(HOST, { x: 300, y: 60 })).toEqual({ x: 300, y: 100 })    // 右上 → 顶边右端
  })

  it('吸附后的点满足 bpmn-js 的附着规则，正中落点不满足', async () => {
    const { container, modeler } = createModeler()
    await modeler.importXML(XML)
    const rules = modeler.get('rules')
    const elementFactory = modeler.get('elementFactory')
    const host = modeler.get('elementRegistry').get('task1')
    const boundary = elementFactory.createShape({
      type: 'bpmn:BoundaryEvent',
      eventDefinitionType: 'bpmn:TimerEventDefinition'
    })

    expect(rules.allowed('shape.attach', { shape: boundary, target: host, position: { x: 250, y: 140 } }))
      .toBeFalsy()
    expect(rules.allowed('shape.attach', {
      shape: boundary, target: host, position: snapToHostBorder(host, { x: 250, y: 140 })
    })).toBeTruthy()

    modeler.destroy()
    container.remove()
  })
})

describe('边界事件附着创建', () => {
  it('attach hints 让边界事件附着到活动并写入 attachedToRef', async () => {
    const { container, modeler } = createModeler()
    await modeler.importXML(XML)
    const modeling = modeler.get('modeling')
    const elementFactory = modeler.get('elementFactory')
    const host = modeler.get('elementRegistry').get('task1')

    const boundary = elementFactory.createShape({
      type: 'bpmn:BoundaryEvent',
      eventDefinitionType: 'bpmn:ErrorEventDefinition'
    })
    const created = modeling.createShape(
      boundary,
      snapToHostBorder(host, { x: 250, y: 145 }),
      host,
      { attach: true }
    )

    expect(created.host).toBe(host)
    expect(created.parent.id).toBe('p1')
    expect(created.businessObject.attachedToRef.id).toBe('task1')
    expect((await modeler.saveXML()).xml).toContain('attachedToRef="task1"')

    modeler.destroy()
    container.remove()
  })

  it('把 true 当作第 4 参传入不会附着（会半创建残留在画布上）', async () => {
    const { container, modeler } = createModeler()
    await modeler.importXML(XML)
    const modeling = modeler.get('modeling')
    const elementFactory = modeler.get('elementFactory')
    const host = modeler.get('elementRegistry').get('task1')

    const boundary = elementFactory.createShape({
      type: 'bpmn:BoundaryEvent',
      eventDefinitionType: 'bpmn:TimerEventDefinition'
    })
    expect(() => modeling.createShape(boundary, { x: 250, y: 140 }, host, true as any))
      .toThrow()

    modeler.destroy()
    container.remove()
  })
})
