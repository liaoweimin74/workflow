import BpmnModeler from 'bpmn-js/lib/Modeler'
import type Modeler from 'bpmn-js/lib/BaseModeler'
import type { Element } from 'bpmn-js/lib/model/Types'
/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-ignore - diagram-js-minimap has no type declarations
import minimapModule from 'diagram-js-minimap'

export interface ModelerOptions {
  container: HTMLElement
}

let modelerInstance: Modeler | null = null

export function initModeler(options: ModelerOptions): Modeler {
  if (modelerInstance) {
    destroyModeler()
  }

  modelerInstance = new BpmnModeler({
    container: options.container,
    additionalModules: [minimapModule as any],
    keyboard: {
      bindTo: window
    }
  })

  return modelerInstance
}

export function getModeler(): Modeler {
  if (!modelerInstance) {
    throw new Error('Modeler not initialized. Call initModeler() first.')
  }
  return modelerInstance
}

export function destroyModeler(): void {
  if (modelerInstance) {
    modelerInstance.destroy()
    modelerInstance = null
  }
}

export interface NodeSelectionInfo {
  id: string
  type: string
  name: string
}

export function getSelectedNode(): NodeSelectionInfo | null {
  if (!modelerInstance) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selection: any = (modelerInstance as any).get('selection')
  const selected: Element[] = selection.get()
  if (selected.length === 0) return null

  const element = selected[0]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bo: any = element.businessObject
  return {
    id: element.id,
    type: (element.type || 'unknown') as string,
    name: (bo?.name || '') as string
  }
}

export function selectNodeById(nodeId: string): void {
  if (!modelerInstance) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canvas: any = (modelerInstance as any).get('canvas')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elementRegistry: any = (modelerInstance as any).get('elementRegistry')
  const element = elementRegistry.get(nodeId)
  if (element) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const selection: any = (modelerInstance as any).get('selection')
    selection.select(element)
    canvas.scrollToElement(element)
  }
}

export type { Modeler, Element }
