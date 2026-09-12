import { describe, it, expect } from 'vitest'
import { flattenMenuPages } from '../menuIndex'
import type { MenuTree } from '@/types/menu'

function node(partial: Partial<MenuTree>): MenuTree {
  return {
    id: 0,
    parentId: 0,
    menuName: '',
    menuType: 2,
    path: '',
    component: '',
    permission: '',
    icon: '',
    sortOrder: 0,
    visible: 1,
    status: 1,
    children: [],
    ...partial,
  }
}

describe('flattenMenuPages', () => {
  it('展平嵌套菜单，仅保留带路由 path 的项', () => {
    const menus: MenuTree[] = [
      node({
        id: 1,
        menuName: '系统管理',
        menuType: 1,
        path: '',
        children: [node({ id: 2, menuName: '用户管理', path: '/system/user' })],
      }),
      node({ id: 3, menuName: '首页', path: '/dashboard' }),
    ]

    expect(flattenMenuPages(menus)).toEqual([
      { path: '/system/user', label: '用户管理' },
      { path: '/dashboard', label: '首页' },
    ])
  })

  it('空输入返回空数组', () => {
    expect(flattenMenuPages(null)).toEqual([])
    expect(flattenMenuPages(undefined)).toEqual([])
  })
})
