import type Modeler from 'bpmn-js/lib/BaseModeler'

/**
 * 渲染前归一：empty-bpmn 新建流程模板的 DI 用 `<dc:Rect>`（Java 契约格式），
 * 而 bpmn-js 只认标准 `<dc:Bounds>`，直接导入会因 bounds 缺失解析失败
 * （Cannot read properties of undefined (reading 'x')，表现为画布空白、
 * 默认开始节点不可见）。
 *
 * 在渲染入口做等价改写（仅标签名不同，属性完全一致）：
 * - 不动后端 Node/Java 契约与 golden fixtures（避免契约链路震荡）
 * - 存量草稿（DB 中已存 dc:Rect）也一并修复，无需数据迁移
 */
export function normalizeBpmnXmlForRender(xml: string): string {
  if (!xml || xml.indexOf('dc:Rect') === -1) return xml
  return xml
    .replace(/<dc:Rect/g, '<dc:Bounds')
    .replace(/<\/dc:Rect/g, '</dc:Bounds')
}

export async function importXml(modeler: Modeler, xml: string): Promise<void> {
  try {
    await modeler.importXML(normalizeBpmnXmlForRender(xml))
  } catch (err: any) {
    throw new Error(`Failed to import BPMN XML: ${err?.message || err}`)
  }
}

/**
 * 清理孤立的 businessObject：有 flowElement 数据但无 DI 图形信息
 * （elementRegistry 中找不到对应元素），导出 XML 时会产生残留。
 */
function cleanupOrphanElements(modeler: Modeler): void {
  const elementRegistry = (modeler as any).get('elementRegistry')
  const canvas = (modeler as any).get('canvas')
  const rootElement = canvas.getRootElement()
  const bo = rootElement?.businessObject

  if (!bo || !bo.flowElements) return

  const toRemove: any[] = []
  for (const flowEl of bo.flowElements) {
    // elementRegistry 里找不到 = 画布上不存在 = 孤立元素
    const registered = elementRegistry.get(flowEl.id)
    if (!registered) {
      toRemove.push(flowEl)
    }
  }

  if (toRemove.length > 0) {
    for (const el of toRemove) {
      const idx = bo.flowElements.indexOf(el)
      if (idx !== -1) {
        bo.flowElements.splice(idx, 1)
      }
    }
  }
}

export async function exportXml(modeler: Modeler): Promise<string> {
  try {
    cleanupOrphanElements(modeler)
    const result = await modeler.saveXML({ format: true })
    return result.xml || ''
  } catch (err: any) {
    throw new Error(`Failed to export BPMN XML: ${err?.message || err}`)
  }
}

export async function exportSvg(modeler: Modeler): Promise<string> {
  try {
    const result = await modeler.saveSVG()
    return result.svg || ''
  } catch (err: any) {
    throw new Error(`Failed to export SVG: ${err?.message || err}`)
  }
}
