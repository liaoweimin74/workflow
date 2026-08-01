import type Modeler from 'bpmn-js/lib/BaseModeler'

export async function importXml(modeler: Modeler, xml: string): Promise<void> {
  try {
    await modeler.importXML(xml)
  } catch (err: any) {
    throw new Error(`Failed to import BPMN XML: ${err?.message || err}`)
  }
}

export async function exportXml(modeler: Modeler): Promise<string> {
  try {
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
