import type Modeler from 'bpmn-js/lib/BaseModeler'

export async function importXml(modeler: Modeler, xml: string): Promise<void> {
  try {
    await modeler.importXML(xml)
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
