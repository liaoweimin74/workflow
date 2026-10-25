import { describe, expect, it } from 'vitest'
import { BusinessException } from '../../src/common/exception/business-exception'
import { SystemService } from '../../src/system/service/system.service'

/**
 * Task 4 单元测试：菜单按端作用域 + 端形态服务端校验。
 *
 * stub SystemRepository + stub ClientService，不连数据库。
 * 钉住简报规则：clientId 透传、WEB 现状规则拒绝、移动端 TAB/GRID/根区规则、
 * zone 根锁定（delete/move/rename）、跨端 move 拒绝、自身子树拒绝。
 */

interface FakeRow {
  id: number
  client_id: number
  parent_id: number | null
  menu_name: string
  menu_type: number
  path: string | null
  component: string | null
  permission: string | null
  icon: string | null
  sort_order: number | null
  status: number
  is_deleted: number
}

function row(patch: Partial<FakeRow>): FakeRow {
  return {
    id: 100,
    client_id: 1,
    parent_id: null,
    menu_name: '节点',
    menu_type: 1,
    path: null,
    component: null,
    permission: null,
    icon: null,
    sort_order: 1,
    status: 1,
    is_deleted: 0,
    ...patch,
  }
}

/** rows 为全部菜单行；clientRow 为 ClientService.options 的返回（含 channelTypes）。 */
function makeService(
  rows: FakeRow[],
  clientRow: { id: number; channelTypes: string[] } | null,
): { svc: SystemService; inserts: Array<Record<string, unknown>>; updates: Array<{ id: number; patch: Record<string, unknown> }> } {
  const inserts: Array<Record<string, unknown>> = []
  const updates: Array<{ id: number; patch: Record<string, unknown> }> = []
  const repo = {
    listAllMenus: async (clientId: number) =>
      rows.filter((r) => r.client_id === clientId && r.is_deleted === 0).map((r) => ({ ...r })),
    findMenuById: async (id: number) => {
      const r = rows.find((x) => x.id === id && x.is_deleted === 0)
      return r ? { ...r } : null
    },
    insertMenu: async (data: Record<string, unknown>) => {
      inserts.push(data)
      // 塞回 rows：createMenu 成功后 menuTreeOf(999) 要能查到（测试桩闭环）
      rows.push(
        row({
          id: 999,
          client_id: Number(data.client_id),
          parent_id: (data.parent_id as number | null) ?? null,
          menu_name: String(data.menu_name),
          menu_type: Number(data.menu_type),
        }),
      )
      return 999
    },
    updateMenu: async (id: number, patch: Record<string, unknown>) => {
      updates.push({ id, patch })
    },
    countMenusByParentId: async (parentId: number) =>
      rows.filter((r) => r.parent_id === parentId).length,
    softDeleteMenu: async () => undefined,
  }
  const clientService = {
    options: async () =>
      clientRow === null
        ? []
        : [{ id: clientRow.id, code: 'x', name: 'x', channelTypes: clientRow.channelTypes, status: 1 }],
  }
  const svc = new SystemService(repo as never, clientService as never)
  return { svc, inserts, updates }
}

describe('menuTree 按端过滤', () => {
  it('缺省查 portal(1)，VO 携带 clientId', async () => {
    const rows = [row({ id: 1, client_id: 1, menu_name: 'portal根' }), row({ id: 2, client_id: 7, menu_name: '别的端' })]
    const { svc } = makeService(rows, { id: 1, channelTypes: ['WEB'] })
    const tree = await svc.menuTree()
    expect(tree.map((n) => n.menuName)).toEqual(['portal根'])
    expect(tree[0].clientId).toBe(1)
  })

  it('传 clientId=7 只返回该端树', async () => {
    const rows = [row({ id: 1, client_id: 1, menu_name: 'portal根' }), row({ id: 2, client_id: 7, menu_name: '别的端' })]
    const { svc } = makeService(rows, { id: 7, channelTypes: [] })
    const tree = await svc.menuTree(7)
    expect(tree.map((n) => n.menuName)).toEqual(['别的端'])
    expect(tree[0].clientId).toBe(7)
  })
})

describe('createMenu 落点校验（WEB 现状规则）', () => {
  it('根级目录放行且 client_id 透传', async () => {
    const { svc, inserts } = makeService([], { id: 1, channelTypes: ['WEB'] })
    await svc.createMenu({ parentId: null, menuName: '新目录', menuType: 0, clientId: 1 })
    expect(inserts[0].client_id).toBe(1)
  })

  it('菜单放根级被拒（现状文案）', async () => {
    const { svc } = makeService([], { id: 1, channelTypes: ['WEB'] })
    await expect(
      svc.createMenu({ parentId: null, menuName: '坏菜单', menuType: 1 }),
    ).rejects.toThrow(BusinessException)
  })

  it('未知 menuType 被拒', async () => {
    const { svc } = makeService([], { id: 1, channelTypes: ['WEB'] })
    await expect(
      svc.createMenu({ parentId: null, menuName: 'x', menuType: 5 }),
    ).rejects.toThrow(/类型/)
  })

  it('移动端菜单挂根级（不在形态区域内）被拒', async () => {
    const { svc } = makeService([], { id: 7, channelTypes: ['H5'] })
    await expect(
      svc.createMenu({ parentId: null, menuName: 'x', menuType: 1, clientId: 7 }),
    ).rejects.toThrow(/区|区域/)
  })

  it('移动端 Tab 区第 6 个子菜单被拒', async () => {
    const tabsRoot = row({ id: 10, client_id: 7, menu_type: 0, component: 'mzone:tabs' })
    const kids = [1, 2, 3, 4, 5].map((i) => row({ id: 20 + i, client_id: 7, parent_id: 10, menu_type: 1 }))
    const { svc } = makeService([tabsRoot, ...kids], { id: 7, channelTypes: ['H5'] })
    await expect(
      svc.createMenu({ parentId: 10, menuName: '第6个', menuType: 1, clientId: 7 }),
    ).rejects.toThrow(/Tab/)
  })
})

describe('updateMenu', () => {
  it('改类型与现有父级重新校验（目录下的菜单改成按钮被拒）', async () => {
    const dir = row({ id: 1, client_id: 1, menu_type: 0 })
    const menu = row({ id: 2, client_id: 1, parent_id: 1, menu_type: 1 })
    const { svc } = makeService([dir, menu], { id: 1, channelTypes: ['WEB'] })
    await expect(svc.updateMenu(2, { menuType: 2 })).rejects.toThrow(/按钮必须/)
  })

  it('zone 根改名被拒（locked）', async () => {
    const tabs = row({ id: 3, client_id: 7, menu_type: 0, component: 'mzone:tabs' })
    const { svc } = makeService([tabs], { id: 7, channelTypes: ['H5'] })
    await expect(svc.updateMenu(3, { menuName: '想改名' })).rejects.toThrow(/锁定/)
  })

  it('普通节点改名放行', async () => {
    const menu = row({ id: 4, client_id: 1, parent_id: 1, menu_type: 1 })
    const dir = row({ id: 1, client_id: 1, menu_type: 0 })
    const { svc, updates } = makeService([dir, menu], { id: 1, channelTypes: ['WEB'] })
    await svc.updateMenu(4, { menuName: '正改名' })
    expect(updates[0].patch.menu_name).toBe('正改名')
  })
})

describe('moveMenu', () => {
  const dirA = row({ id: 1, client_id: 1, menu_type: 0, menu_name: '目录A' })
  const dirB = row({ id: 2, client_id: 1, parent_id: 1, menu_type: 0, menu_name: '目录B' })

  it('WEB 端菜单移到根级被拒（菜单必须放在目录下）', async () => {
    const menu = row({ id: 3, client_id: 1, parent_id: 1, menu_type: 1 })
    const { svc } = makeService([dirA, menu], { id: 1, channelTypes: ['WEB'] })
    await expect(svc.moveMenu(3, { parentId: null })).rejects.toThrow(/菜单必须/)
  })

  it('移到自己/自己子树之下被拒（现状文案）', async () => {
    const menu = row({ id: 3, client_id: 1, parent_id: 1, menu_type: 1 })
    const child = row({ id: 4, client_id: 1, parent_id: 3, menu_type: 1 })
    const { svc } = makeService([dirA, menu, child], { id: 1, channelTypes: ['WEB'] })
    await expect(svc.moveMenu(3, { parentId: 3 })).rejects.toThrow(/自己/)
    await expect(svc.moveMenu(3, { parentId: 4 })).rejects.toThrow(/自己/)
  })

  it('跨端移动被拒', async () => {
    const other = row({ id: 9, client_id: 7, menu_type: 0 })
    const menu = row({ id: 3, client_id: 1, parent_id: 1, menu_type: 1 })
    const { svc } = makeService([dirA, menu, other], { id: 1, channelTypes: ['WEB'] })
    await expect(svc.moveMenu(3, { parentId: 9 })).rejects.toThrow(/客户端/)
  })

  it('zone 根移动被拒（locked）', async () => {
    const tabs = row({ id: 10, client_id: 7, menu_type: 0, component: 'mzone:tabs' })
    const grid = row({ id: 11, client_id: 7, menu_type: 0, component: 'mzone:grid' })
    const { svc } = makeService([tabs, grid], { id: 7, channelTypes: ['H5'] })
    await expect(svc.moveMenu(10, { parentId: 11 })).rejects.toThrow(/锁定/)
  })

  it('WEB 合法移动：菜单从目录A 移到目录B 成功', async () => {
    const menu = row({ id: 3, client_id: 1, parent_id: 1, menu_type: 1 })
    const { svc, updates } = makeService([dirA, dirB, menu], { id: 1, channelTypes: ['WEB'] })
    await svc.moveMenu(3, { parentId: 2 })
    expect(updates.some((u) => u.id === 3 && u.patch.parent_id === 2)).toBe(true)
  })

  it('目标父节点不存在被拒（菜单不存在）', async () => {
    const menu = row({ id: 3, client_id: 1, parent_id: 1, menu_type: 1 })
    const { svc } = makeService([dirA, menu], { id: 1, channelTypes: ['WEB'] })
    await expect(svc.moveMenu(3, { parentId: 404 })).rejects.toThrow(/不存在/)
  })
})

describe('deleteMenu', () => {
  it('zone 根删除被拒（locked）', async () => {
    const tabs = row({ id: 10, client_id: 7, menu_type: 0, component: 'mzone:tabs' })
    const { svc } = makeService([tabs], { id: 7, channelTypes: ['H5'] })
    await expect(svc.deleteMenu(10)).rejects.toThrow(/锁定/)
  })

  it('有子菜单拒绝（现状文案保留）', async () => {
    const dir = row({ id: 1, client_id: 1, menu_type: 0 })
    const menu = row({ id: 2, client_id: 1, parent_id: 1, menu_type: 1 })
    const { svc } = makeService([dir, menu], { id: 1, channelTypes: ['WEB'] })
    await expect(svc.deleteMenu(1)).rejects.toThrow(/存在子菜单/)
  })
})
