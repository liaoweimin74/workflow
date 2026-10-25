import { describe, expect, it } from 'vitest'
import {
  assertMenuPlacement,
  assertZoneRootEditable,
  isZoneRootComponent,
  type MenuPlacementInput,
} from '../../src/system/service/menu-shape'

/**
 * Task 3 单测：端形态校验器纯函数。
 *
 * WEB 区沿用现状三层规则（逐条抄 MenuServiceImpl.validatePlacement 行为）；
 * 移动端 TAB 2~5 / GRID ≤2 层 / 按钮挂菜单；mzone 根目录 locked。
 */

function placement(patch: Partial<MenuPlacementInput>): MenuPlacementInput {
  return {
    zone: 'WEB',
    nodeType: 1,
    depth: 1,
    parentType: null,
    tabSiblingCount: 0,
    mobile: false,
    ...patch,
  }
}

describe('WEB 区（现状三层规则，抄 MenuServiceImpl.validatePlacement）', () => {
  it('目录可放根级或其他目录下', () => {
    expect(() => assertMenuPlacement(placement({ nodeType: 0, parentType: null }))).not.toThrow()
    expect(() => assertMenuPlacement(placement({ nodeType: 0, parentType: 0 }))).not.toThrow()
  })
  it('目录放进菜单/按钮下被拒', () => {
    expect(() => assertMenuPlacement(placement({ nodeType: 0, parentType: 1 }))).toThrow(/目录/)
    expect(() => assertMenuPlacement(placement({ nodeType: 0, parentType: 2 }))).toThrow(/目录/)
  })
  it('菜单必须放在目录下', () => {
    expect(() => assertMenuPlacement(placement({ nodeType: 1, parentType: 0 }))).not.toThrow()
    expect(() => assertMenuPlacement(placement({ nodeType: 1, parentType: null }))).toThrow(/菜单必须/)
    expect(() => assertMenuPlacement(placement({ nodeType: 1, parentType: 1 }))).toThrow(/菜单必须/)
  })
  it('按钮必须放在菜单下', () => {
    expect(() => assertMenuPlacement(placement({ nodeType: 2, parentType: 1 }))).not.toThrow()
    expect(() => assertMenuPlacement(placement({ nodeType: 2, parentType: 0 }))).toThrow(/按钮必须/)
    expect(() => assertMenuPlacement(placement({ nodeType: 2, parentType: null }))).toThrow(/按钮必须/)
  })
  it('非法 nodeType 被拒', () => {
    expect(() => assertMenuPlacement(placement({ nodeType: 3 as never, parentType: 0 }))).toThrow(/类型/)
  })
})

describe('TAB 区（移动端底部 Tab，子节点=菜单且总数 2~5）', () => {
  it('非菜单节点不得进 Tab 区', () => {
    expect(() =>
      assertMenuPlacement(placement({ zone: 'TAB', nodeType: 0, parentType: null, mobile: true })),
    ).toThrow(/Tab/)
    expect(() =>
      assertMenuPlacement(placement({ zone: 'TAB', nodeType: 2, parentType: 1, mobile: true })),
    ).toThrow(/Tab/)
  })
  it('第 2~5 个通过', () => {
    for (const existing of [1, 2, 3, 4]) {
      expect(() =>
        assertMenuPlacement(placement({ zone: 'TAB', nodeType: 1, parentType: null, tabSiblingCount: existing, mobile: true })),
      ).not.toThrow()
    }
  })
  it('新增第 6 个被拒', () => {
    expect(() =>
      assertMenuPlacement(placement({ zone: 'TAB', nodeType: 1, parentType: null, tabSiblingCount: 5, mobile: true })),
    ).toThrow(/Tab|2~5|5/)
  })
  it('Tab 区只认一级：depth>1 被拒', () => {
    expect(() =>
      assertMenuPlacement(placement({ zone: 'TAB', nodeType: 1, depth: 2, parentType: null, mobile: true })),
    ).toThrow(/Tab|一级/)
  })
})

describe('GRID 区（工作台宫格，深度 ≤2）', () => {
  it('第 3 层被拒，第 1/2 层通过', () => {
    expect(() =>
      assertMenuPlacement(placement({ zone: 'GRID', nodeType: 0, depth: 3, parentType: 0, mobile: true })),
    ).toThrow(/宫格|2 层|≤2/)
    expect(() =>
      assertMenuPlacement(placement({ zone: 'GRID', nodeType: 1, depth: 2, parentType: 0, mobile: true })),
    ).not.toThrow()
    expect(() =>
      assertMenuPlacement(placement({ zone: 'GRID', nodeType: 0, depth: 1, parentType: null, mobile: true })),
    ).not.toThrow()
  })
})

describe('BUTTON 区（按钮跟随菜单，现状规则）', () => {
  it('按钮必须挂菜单之下', () => {
    expect(() =>
      assertMenuPlacement(placement({ zone: 'BUTTON', nodeType: 2, parentType: 1, mobile: true })),
    ).not.toThrow()
    expect(() =>
      assertMenuPlacement(placement({ zone: 'BUTTON', nodeType: 2, parentType: 0, mobile: true })),
    ).toThrow(/按钮必须/)
  })
})

describe('mzone 根目录锁定', () => {
  it('识别两个 zone 根', () => {
    expect(isZoneRootComponent('mzone:tabs')).toBe(true)
    expect(isZoneRootComponent('mzone:grid')).toBe(true)
    expect(isZoneRootComponent('system/menu/index')).toBe(false)
    expect(isZoneRootComponent(null)).toBe(false)
  })
  it('删除/移动/改名被拒，其他节点不受影响', () => {
    for (const action of ['delete', 'move', 'rename'] as const) {
      expect(() => assertZoneRootEditable('mzone:tabs', action)).toThrow(/锁定|不允许/)
      expect(() => assertZoneRootEditable('mzone:grid', action)).toThrow(/锁定|不允许/)
      expect(() => assertZoneRootEditable('system/menu/index', action)).not.toThrow()
    }
  })
})
