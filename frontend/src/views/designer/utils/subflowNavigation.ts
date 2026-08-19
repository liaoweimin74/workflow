import type { Element } from 'bpmn-js/lib/model/Types'

export interface Viewbox { x: number; y: number; width: number; height: number }

/** 沿 parent 链判断 el 是否为 ancestor 的（真）后代 */
export function isDescendantOf(el: Element | null | undefined, ancestor: Element): boolean {
  let cur: Element | null | undefined = el
  while (cur) {
    if (cur === ancestor) return true
    cur = cur.parent as Element | undefined
  }
  return false
}

/** 收集进入子流程后需要隐藏的外部元素（不含子流程自身、不含 label） */
export function collectExternalElements(
  subprocess: Element,
  registry: { getAll(): Element[] }
): Element[] {
  return registry.getAll().filter((el) => {
    if (el.type === 'label') return false
    if (el === subprocess) return false
    return !isDescendantOf(el, subprocess)
  })
}

/** 计算聚焦子流程的 viewbox（bounds 取自 element.getBoundingBox()） */
export function computeFocusViewbox(
  bounds: { x: number; y: number; width: number; height: number },
  margin = 40
): Viewbox {
  return {
    x: bounds.x - margin,
    y: bounds.y - margin,
    width: bounds.width + margin * 2,
    height: bounds.height + margin * 2,
  }
}