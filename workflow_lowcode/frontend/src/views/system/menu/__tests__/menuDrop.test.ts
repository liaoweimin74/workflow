// ----- TDD: 菜单拖动落点判定（层级规则 + 排序插入位置）-----
// npx vitest run src/views/system/menu/__tests__/menuDrop.test.ts

import { describe, it, expect } from 'vitest'
import type { MenuTree } from '@/types/menu'
import {
  normalizeParentId,
  placementError,
  resolveDrop,
  defaultChildType,
} from '../menuDrop'

function node(id: number, parentId: number | null, menuType: number, children: MenuTree[] = []): MenuTree {
  return {
    id, parentId, menuType, menuName: `n${id}`, path: '', component: '',
    permission: '', icon: '', sortOrder: children.length, status: 1,
    children: children.length ? children : (null as any),
  }
}

/**
 * 系统管理(1,目录)
 *   用户(10,菜单)
 *     新增用户(100,按钮)
 *   角色(11,菜单)
 * 开发管理(2,目录)
 *   字典(20,菜单)
 * 表单目录(3,目录)
 *   子目录(30,目录)
 */
const tree: MenuTree[] = [
  node(1, null, 0, [
    node(10, 1, 1, [node(100, 10, 2)]),
    node(11, 1, 1),
  ]),
  node(2, null, 0, [node(20, 2, 1)]),
  node(3, null, 0, [node(30, 3, 0)]),
]

function targetOf(id: number, hoverId: number, band: any) {
  const res = resolveDrop(tree, id, hoverId, band)
  return res.ok ? res : res
}

describe('placementError 层级规则', () => {
  it('目录可挂在根级或目录下，不能挂菜单/按钮下', () => {
    expect(placementError(0, null)).toBeNull()
    expect(placementError(0, 0)).toBeNull()
    expect(placementError(0, 1)).toBe('目录只能放在根级或其他目录下')
    expect(placementError(0, 2)).toBe('目录只能放在根级或其他目录下')
  })

  it('菜单必须在目录下', () => {
    expect(placementError(1, 0)).toBeNull()
    expect(placementError(1, null)).toBe('菜单必须放在目录下')
    expect(placementError(1, 1)).toBe('菜单必须放在目录下')
  })

  it('按钮必须在菜单下', () => {
    expect(placementError(2, 1)).toBeNull()
    expect(placementError(2, 0)).toBe('按钮必须放在菜单下')
    expect(placementError(2, null)).toBe('按钮必须放在菜单下')
  })
})

describe('resolveDrop 位置带语义', () => {
  it('中间带=成为该节点的子节点，追加到末尾', () => {
    const r = targetOf(20, 1, 'into')
    expect(r).toEqual({ ok: true, target: { parentId: 1, index: 2 }, noop: false })
  })

  it('空目录也能拖入（index=0），这是纯下标语义表达不出来的', () => {
    const emptyDir: MenuTree[] = [node(1, null, 0), node(40, null, 1)]
    const res = resolveDrop(emptyDir, 40, 1, 'into')
    expect(res).toEqual({ ok: true, target: { parentId: 1, index: 0 }, noop: false })
  })

  it('下边缘=排在该行之后，同父级插入', () => {
    expect(targetOf(20, 11, 'after')).toEqual({ ok: true, target: { parentId: 1, index: 2 }, noop: false })
  })

  it('上边缘=排在该行之前，同父级插入', () => {
    expect(targetOf(20, 10, 'before')).toEqual({ ok: true, target: { parentId: 1, index: 0 }, noop: false })
  })

  it('上边缘落在根级首行=目录移到根级头部', () => {
    expect(targetOf(3, 1, 'before')).toEqual({ ok: true, target: { parentId: null, index: 0 }, noop: false })
  })

  it('原位放置判定为 noop，不发多余请求', () => {
    expect(targetOf(11, 10, 'after')).toMatchObject({ ok: true, noop: true })
    expect(targetOf(10, 11, 'before')).toMatchObject({ ok: true, noop: true })
  })

  it('跨父级同位置不算 noop', () => {
    expect(targetOf(10, 20, 'after')).toMatchObject({ ok: true, noop: false, target: { parentId: 2, index: 1 } })
  })
})

describe('resolveDrop 非法落点', () => {
  it('按钮拖到目录行中间：按钮必须在菜单下', () => {
    expect(targetOf(100, 2, 'into')).toEqual({ ok: false, message: '按钮必须放在菜单下' })
  })

  it('菜单拖到按钮行旁边：按钮之下不合法', () => {
    expect(targetOf(20, 100, 'after')).toEqual({ ok: false, message: '菜单必须放在目录下' })
  })

  it('菜单不能拖到自身', () => {
    expect(targetOf(10, 10, 'into')).toMatchObject({ ok: false })
  })

  it('目录不能拖进自己的子孙', () => {
    expect(targetOf(1, 100, 'into')).toEqual({ ok: false, message: '不能把菜单移动到自己的子节点之下' })
  })

  it('目录可以拖进另一个目录（子树一起走）', () => {
    expect(targetOf(1, 30, 'into')).toMatchObject({ ok: true, target: { parentId: 30, index: 0 } })
  })

  it('数据已变化（行找不到）时给出刷新提示', () => {
    expect(targetOf(999, 1, 'into')).toMatchObject({ ok: false, message: '菜单数据已变化，请刷新后重试' })
  })
})

describe('辅助函数', () => {
  it('parentId 为 0 视为根级', () => {
    expect(normalizeParentId(0)).toBeNull()
    expect(normalizeParentId(undefined)).toBeNull()
    expect(normalizeParentId(5)).toBe(5)
  })

  it('新增子菜单按父类型预置子类型', () => {
    expect(defaultChildType(0)).toBe(1)
    expect(defaultChildType(1)).toBe(2)
    expect(defaultChildType(2)).toBeNull()
  })
})
