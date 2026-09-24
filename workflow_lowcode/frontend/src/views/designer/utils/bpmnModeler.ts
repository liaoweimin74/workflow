import BpmnModeler from 'bpmn-js/lib/Modeler'
import type Modeler from 'bpmn-js/lib/BaseModeler'
import type { Element } from 'bpmn-js/lib/model/Types'
/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-ignore - diagram-js-minimap has no type declarations
import minimapModule from 'diagram-js-minimap'
import { customContextPadModule } from './customContextPad'
import { customRendererModule } from './customRenderer'
import { customRulesModule } from './customRules'
import wfModdle from './wf-moddle.json'

export interface ModelerOptions {
  container: HTMLElement
}

let modelerInstance: Modeler | null = null

/** 只读模式：禁用建模/拖拽/删除/编辑动作/画布上下文菜单 */
function buildReadOnlyModule() {
  return {
    modeling: ['value', null],
    editorActions: ['value', null],
    dragging: ['value', null],
    contextPadProvider: ['type', function (this: any) {
      this.getContextPadEntries = function () { return {} }
    }],
    paletteProvider: ['type', function (this: any) {
      this.getPaletteEntries = function () { return {} }
    }],
  }
}

export function initModeler(options: ModelerOptions, readOnly = false): Modeler {
  if (modelerInstance) {
    destroyModeler()
  }

  // 覆盖内置 palette provider 为空，禁用画布悬浮工具栏
  const disablePaletteModule = {
    paletteProvider: ['type', function (this: any) {
      this.getPaletteEntries = function () { return {} }
    }]
  }

  const additionalModules = [
    minimapModule as any,
    disablePaletteModule as any,
    customContextPadModule as any,
    customRendererModule as any,
    customRulesModule as any,
  ]
  if (readOnly) {
    additionalModules.push(buildReadOnlyModule() as any)
  }

  modelerInstance = new BpmnModeler({
    container: options.container,
    additionalModules,
    moddleExtensions: {
      wf: wfModdle
    },
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
