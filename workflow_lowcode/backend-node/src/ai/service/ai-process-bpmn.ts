/**
 * AI 流程 BPMN XML 拼装（纯函数）。
 *
 * LLM 产出的是 ProcessPlan（中间表示），本文件按确定性模板拼装线性流程：
 *   startEvent → 发起 UserTask(wf:nodeRole=initiator) → 审批 UserTask×N → endEvent
 *
 * 契约要点（对齐 empty-bpmn.ts 与 bpmn-parser.ts）：
 *   - 发起节点必须带 `wf:nodeRole="initiator"`（bpmn-parser 依此识别 isInitiator）
 *     与 `flowable:assignee="${initiator}"`（与设计器拖拽发起节点的行为一致）。
 *   - 因此 definitions 需要声明 wf 命名空间：http://workflow.com/schema/bpmn/wf
 *     （见前端 wf-moddle.json 的 uri）。
 *   - DI 使用 dc:Bounds（bpmn-js 标准导出格式；empty-bpmn 的 dc:Rect 不被
 *     bpmn-js 解析 —— 空流程画布本就空白、用户从零拖起，而 AI 生成的流程
 *     必须「打开即见图」，故此处必须用 Bounds）。
 *   - XML 属性全部转义；流程 key 只含 [a-z0-9_]，可直接用作 id。
 */

import type { ProcessPlan } from './ai-process-plan'

export const WF_NAMESPACE = 'http://workflow.com/schema/bpmn/wf'

/** XML 属性值转义。 */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

interface Shape {
  id: string
  bpmnTag: string
  name: string
  x: number
  y: number
  width: number
  height: number
  extraAttrs: string
}

/**
 * 拼装线性流程 BPMN XML。
 *
 * 布局：x 固定 240 垂直排列；事件 36×36、任务 100×80；间隔 40。
 * waypoints 取上一个元素底边中点 → 下一个元素顶边中点（直线）。
 */
export function buildLinearProcessBpmnXml(plan: ProcessPlan, targetNamespace: string): string {
  const key = plan.key
  const shapes: Shape[] = []

  // 开始事件
  shapes.push({
    id: 'startEvent_1',
    bpmnTag: 'startEvent',
    name: '',
    x: 272,
    y: 160,
    width: 36,
    height: 36,
    extraAttrs: '',
  })

  let y = 236
  const taskIds: string[] = []
  plan.nodes.forEach((node, index) => {
    const id = `ai_task_${index + 1}`
    taskIds.push(id)
    const extra =
      node.type === 'initiator'
        ? ' flowable:assignee="${initiator}" wf:nodeRole="initiator"'
        : node.type === 'handler'
          ? ' wf:nodeRole="handler"'
          : ' wf:nodeRole="approver"'
    shapes.push({
      id,
      bpmnTag: 'userTask',
      name: node.name,
      x: 240,
      y,
      width: 100,
      height: 80,
      extraAttrs: extra,
    })
    y += 120
  })

  // 结束事件
  const endId = 'endEvent_1'
  shapes.push({
    id: endId,
    bpmnTag: 'endEvent',
    name: '',
    x: 272,
    y,
    width: 36,
    height: 36,
    extraAttrs: '',
  })

  // 节点连线：start → ai_task_1 → ... → end
  const elementIds = ['startEvent_1', ...taskIds, endId]
  const flowCount = elementIds.length - 1
  // 每个节点的入/出边编号（BPMN 标准序列化：拓扑表达依赖节点的
  // incoming/outgoing 子元素 —— 编译器拓扑校验以此为源，不反推 flows）
  const flows = elementIds
    .slice(0, -1)
    .map((sourceId, index) => {
      const targetId = elementIds[index + 1]
      return `    <bpmn:sequenceFlow id="flow_${index + 1}" sourceRef="${sourceId}" targetRef="${targetId}"/>`
    })
    .join('\n')

  const shapeXml = shapes
    .map(
      (s) =>
        `      <bpmndi:BPMNShape id="${s.id}_di" bpmnElement="${s.id}">\n` +
        `        <dc:Bounds x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}"/>\n` +
        '      </bpmndi:BPMNShape>',
    )
    .join('\n')

  // waypoint：source 底边中点 → target 顶边中点
  const flowXml = elementIds
    .slice(0, -1)
    .map((sourceId, index) => {
      const source = shapes[index]
      const target = shapes[index + 1]
      const sx = source.x + Number(source.width) / 2
      const sy = source.y + Number(source.height)
      const tx = target.x + Number(target.width) / 2
      return (
        `      <bpmndi:BPMNEdge id="flow_${index + 1}_di" bpmnElement="flow_${index + 1}">\n` +
        `        <di:waypoint x="${sx}" y="${sy}"/>\n` +
        `        <di:waypoint x="${tx}" y="${target.y}"/>\n` +
        '      </bpmndi:BPMNEdge>'
      )
    })
    .join('\n')

  const processBody = shapes
    .map((s, index) => {
      const nameAttr = s.name !== '' ? ` name="${esc(s.name)}"` : ''
      const inFlow = index > 0 ? `flow_${index}` : null
      const outFlow = index < flowCount ? `flow_${index + 1}` : null
      const children = [
        inFlow !== null ? `      <bpmn:incoming>${inFlow}</bpmn:incoming>` : null,
        outFlow !== null ? `      <bpmn:outgoing>${outFlow}</bpmn:outgoing>` : null,
      ]
        .filter((v): v is string => v !== null)
        .join('\n')
      if (children === '') {
        return `    <bpmn:${s.bpmnTag} id="${s.id}"${nameAttr}${s.extraAttrs}/>`
      }
      return (
        `    <bpmn:${s.bpmnTag} id="${s.id}"${nameAttr}${s.extraAttrs}>\n` +
        `${children}\n` +
        `    </bpmn:${s.bpmnTag}>`
      )
    })
    .join('\n')

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ' +
    'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" ' +
    'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" ' +
    'xmlns:di="http://www.omg.org/spec/DD/20100524/DI" ' +
    'xmlns:flowable="http://flowable.org/bpmn" ' +
    `xmlns:wf="${WF_NAMESPACE}" ` +
    `targetNamespace="${esc(targetNamespace)}">\n` +
    `  <bpmn:process id="${key}" name="${esc(plan.name)}" isExecutable="true">\n` +
    `${processBody}\n` +
    `${flows}\n` +
    '  </bpmn:process>\n' +
    '  <bpmndi:BPMNDiagram id="BPMNDiagram_1">\n' +
    `    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${key}">\n` +
    `${shapeXml}\n` +
    `${flowXml}\n` +
    '    </bpmndi:BPMNPlane>\n' +
    '  </bpmndi:BPMNDiagram>\n' +
    '</bpmn:definitions>'
  )
}
