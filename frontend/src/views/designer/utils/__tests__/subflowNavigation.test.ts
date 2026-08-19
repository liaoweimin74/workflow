import { describe, it, expect } from 'vitest'
import { isDescendantOf, collectExternalElements, computeFocusViewbox } from '../subflowNavigation'
import type { Element } from 'bpmn-js/lib/model/Types'

function el(id: string, parent?: Element): Element {
  return { id, type: 'shape', parent: parent as any } as any
}

describe('isDescendantOf', () => {
  it('跟随 parent 链命中祖先', () => {
    const root = el('root')
    const sub = el('sub', root)
    const inner = el('inner', sub)
    expect(isDescendantOf(inner, sub)).toBe(true)
    expect(isDescendantOf(inner, root)).toBe(true)
  })

  it('非后代返回 false, null/undefined 输入返回 false', () => {
    const root = el('root')
    const other = el('other', root)
    expect(isDescendantOf(other, el('sub2'))).toBe(false)
    expect(isDescendantOf(null, root)).toBe(false)
  })
})

describe('collectExternalElements', () => {
  const root = el('root')
  const sub = el('sub', root)
  const inside1 = el('in1', sub)
  const inside2 = el('in2', sub)
  const outside = el('out', root)
  const label = { id: 'label_1', type: 'label', parent: root, labelTarget: inside1 } as any
  const registry = { getAll: () => [root, sub, inside1, inside2, outside, label] }

  it('排除子流程自身与 label，隐藏其外全部元素', () => {
    const result = collectExternalElements(sub, registry)
    expect(result.map(e => e.id).sort()).toEqual(['out', 'root'])
  })
})

describe('computeFocusViewbox', () => {
  it('围绕 bounds 加边距', () => {
    expect(computeFocusViewbox({ x: 100, y: 80, width: 200, height: 150 })).toEqual({
      x: 60, y: 40, width: 280, height: 230,
    })
  })
})