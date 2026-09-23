/**
 * 新建流程草稿时的空 BPMN，逐字对齐 Java `ProcessDesignService.buildEmptyBpmnXml`。
 *
 * ⚠️ 这段字符串**是契约的一部分**：`createDraft` 的响应里直接回显它，
 *    契约比对会逐字符比。因此不能「顺手美化」缩进或换标签 ——
 *    连 `<dc:Rect>`（不是 `dc:Bounds`）和自闭合标签的写法都要一致。
 *
 * `targetNamespace` 会被 Flowable 用作流程定义的 category 字段：
 * 有分类 ID 时用它，否则用默认命名空间。
 */

export const DEFAULT_TARGET_NAMESPACE = 'http://flowable.org/bpmn'

export function buildEmptyBpmnXml(
  processKey: string,
  processName: string,
  categoryId?: string | null,
): string {
  const targetNamespace =
    categoryId !== null && categoryId !== undefined && categoryId.trim() !== ''
      ? categoryId
      : DEFAULT_TARGET_NAMESPACE

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ' +
    'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" ' +
    'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" ' +
    'xmlns:di="http://www.omg.org/spec/DD/20100524/DI" ' +
    'xmlns:flowable="http://flowable.org/bpmn" ' +
    `targetNamespace="${targetNamespace}">\n` +
    `  <bpmn:process id="${processKey}" name="${processName}" isExecutable="true">\n` +
    '    <bpmn:startEvent id="startEvent_1"/>\n' +
    '  </bpmn:process>\n' +
    '  <bpmndi:BPMNDiagram id="BPMNDiagram_1">\n' +
    `    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processKey}">\n` +
    '      <bpmndi:BPMNShape id="startEvent_1_di" bpmnElement="startEvent_1">\n' +
    '        <dc:Rect x="160" y="160" width="36" height="36"/>\n' +
    '      </bpmndi:BPMNShape>\n' +
    '    </bpmndi:BPMNPlane>\n' +
    '  </bpmndi:BPMNDiagram>\n' +
    '</bpmn:definitions>'
  )
}
