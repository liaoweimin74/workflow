// ----- Task 9: 角色管理端维度（tasks.md 3.4）-----
// npx vitest run src/views/system/role/__tests__/RolePage.test.ts
//
// 简报钉点：
//   1. 列表「所属端」列（clientOptions 映射名称）+ 搜索区「所属端」筛选下拉；
//   2. 新建表单所属端缺省 = 当前端上下文（URL ?clientId=）或 portal(1)；
//   3. portal 内置角色（ROLE_ADMIN/ROLE_USER）编辑时所属端项 disabled；
//   4. create/update payload 透传 clientId；列表查询透传 clientId 筛选；
//   5. 「分配菜单」的树按角色所属端拉（tree?clientId=角色端）——跨端授权防线；
//   6. 权限码不加端前缀（Review Focus 1：formConfig/create/edit/delete 权限码原样）。
//
// npx vitest run src/views/system/role/__tests__/RolePage.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'

vi.mock('@/api/role', () => ({
  getRoleList: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  getRoleMenus: vi.fn(),
  assignRoleMenus: vi.fn(),
}))

vi.mock('@/api/menu', () => ({
  getMenuTree: vi.fn(),
}))

vi.mock('@/api/client', () => ({
  clientOptions: vi.fn(),
}))

// AI 注册层与本测试无关：桩掉避免真实注册副作用
vi.mock('@/utils/aiPageExecutor', () => ({
  registerPageActions: vi.fn(() => vi.fn()),
}))

const mockRoute = { path: '/system/role', query: {} as Record<string, string> }
vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

import RolePage from '../RolePage.vue'
import { createRole, getRoleList, getRoleMenus, updateRole } from '@/api/role'
import { getMenuTree } from '@/api/menu'
import { clientOptions } from '@/api/client'

/** SearchTable 桩：捕获 props（searchFields/columns/formConfig/fetchApi/actionButtons） */
let capturedProps: any = null
let capturedActionButtons: any[] = []
const SearchTableStub = defineComponent({
  name: 'SearchTableStub',
  props: ['searchFields', 'columns', 'actionButtons', 'fetchApi', 'formConfig'],
  setup(props, { expose }) {
    capturedProps = props
    expose({ fetchList: vi.fn(), openFormDialog: vi.fn(), openEdit: vi.fn(), getList: () => [] })
    return () => h('div', { class: 'search-table-stub' })
  },
})

function roleRow(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    roleName: '超级管理员',
    roleCode: 'ROLE_ADMIN',
    description: '',
    status: 1,
    createdAt: '2026-01-01 00:00:00',
    clientId: 1,
    ...over,
  }
}

async function mountPage() {
  const wrapper = mount(RolePage, {
    global: { plugins: [ElementPlus], stubs: { SearchTable: SearchTableStub, RoleDataPermissionDialog: true } },
  })
  await flushPromises()
  capturedActionButtons = capturedProps.actionButtons as any[]
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRoute.query = {}
  ;(getRoleList as any).mockResolvedValue({
    data: {
      rows: [roleRow(), roleRow({ id: 2, roleName: '司机端管理员', roleCode: 'DRIVER_ADMIN', clientId: 7 })],
      total: 2,
      page: 1,
      size: 20,
    },
  })
  ;(clientOptions as any).mockResolvedValue({
    data: [
      { id: 1, code: 'portal', name: '平台端', channelTypes: ['WEB'], status: 1 },
      { id: 7, code: 'driver', name: '司机端', channelTypes: ['H5', 'MP'], status: 1 },
    ],
  })
  ;(getMenuTree as any).mockResolvedValue({ data: [] })
  ;(getRoleMenus as any).mockResolvedValue({ data: [] })
  ;(createRole as any).mockResolvedValue({ data: roleRow() })
  ;(updateRole as any).mockResolvedValue({ data: roleRow() })
})

describe('RolePage 所属端列与筛选（tasks 3.4）', () => {
  it('搜索区含「所属端」select，选项来自 clientOptions（含「全部」）', async () => {
    const wrapper = await mountPage()
    const field = capturedProps.searchFields.find((f: any) => f.prop === 'clientId')
    expect(field).toBeDefined()
    expect(field.type).toBe('select')
    expect(field.options).toEqual([
      { label: '全部', value: undefined },
      { label: '平台端', value: 1 },
      { label: '司机端', value: 7 },
    ])
    wrapper.unmount()
  })

  it('列表含「所属端」列：clientId 映射端名，未知/缺失显示「—」', async () => {
    const wrapper = await mountPage()
    const col = capturedProps.columns.find((c: any) => c.label === '所属端')
    expect(col).toBeDefined()
    expect(col.prop).toBe('clientId')
    expect(col.formatter(null, null, 1)).toBe('平台端')
    expect(col.formatter(null, null, 7)).toBe('司机端')
    expect(col.formatter(null, null, 99)).toBe('—')
    expect(col.formatter(null, null, undefined)).toBe('—')
    wrapper.unmount()
  })

  it('fetchApi 透传 clientId 筛选参数到 GET /roles', async () => {
    const wrapper = await mountPage()
    await capturedProps.fetchApi({ page: 1, size: 20, clientId: 7 })
    expect(getRoleList).toHaveBeenCalledWith({ page: 1, size: 20, clientId: 7 })
    wrapper.unmount()
  })
})

describe('RolePage 表单挂端（tasks 3.4）', () => {
  it('新建表单所属端缺省当前端上下文：URL ?clientId= 优先，缺省 portal(1)', async () => {
    const w1 = await mountPage()
    expect(capturedProps.formConfig.initialValues).toMatchObject({ clientId: 1 })
    w1.unmount()

    mockRoute.query = { clientId: '7' }
    const w2 = await mountPage()
    expect(capturedProps.formConfig.initialValues).toMatchObject({ clientId: 7 })
    w2.unmount()
  })

  it('表单含所属端 select（clientOptions 选项）；内置角色编辑 disabled，自定义角色可改', async () => {
    const wrapper = await mountPage()
    // editingRole 变化 → formConfig computed 重算 → 子组件 props 下一拍更新，
    // 所以每次断言前重新读取并 nextTick
    const ruleOf = () =>
      (capturedProps.formConfig.rule as any[]).find((r: any) => r.field === 'clientId')
    expect(ruleOf()).toBeDefined()
    expect(ruleOf().options).toEqual([
      { label: '平台端', value: 1 },
      { label: '司机端', value: 7 },
    ])

    // 新建（打开表单未编辑）→ 可操作
    await capturedProps.formConfig.onFormOpen()
    await wrapper.vm.$nextTick()
    expect(ruleOf().props.disabled).toBe(false)

    // 编辑内置角色 → 所属端锁定（改端被服务端 500 拒，前端预禁）
    await capturedProps.formConfig.onFormOpen()
    const row = await capturedProps.formConfig.getApi(1)
    expect(row).toMatchObject({ roleCode: 'ROLE_ADMIN' })
    await wrapper.vm.$nextTick()
    expect(ruleOf().props.disabled).toBe(true)

    // 编辑自定义角色 → 可改端
    await capturedProps.formConfig.onFormOpen()
    await capturedProps.formConfig.getApi(2)
    await wrapper.vm.$nextTick()
    expect(ruleOf().props.disabled).toBe(false)
    wrapper.unmount()
  })

  it('保存 payload 透传 clientId（create/update 均带）；权限码不加端前缀（RF1）', async () => {
    const wrapper = await mountPage()
    const fc = capturedProps.formConfig
    await fc.updateApi(2, { roleName: '司机端管理员', description: 'd', clientId: 7 })
    expect(updateRole).toHaveBeenCalledWith(2, { roleName: '司机端管理员', description: 'd', clientId: 7 })

    await fc.createApi({ roleName: 'x', roleCode: 'X', description: '', clientId: 7 })
    expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ clientId: 7 }))

    // 权限码保持原样（无端前缀 = 端内授权语义不变的界面证据）
    expect(fc.createPermission).toBe('system:role:create')
    expect(fc.editPermission).toBe('system:role:update')
    expect(fc.deletePermission).toBe('system:role:delete')
    wrapper.unmount()
  })
})

describe('RolePage 分配菜单按角色所属端取树', () => {
  it('司机端角色 → getMenuTree(7)（跨端菜单不可见防线）', async () => {
    const wrapper = await mountPage()
    const assignBtn = capturedActionButtons.find((b: any) => b.label === '分配菜单')
    await assignBtn.onClick(roleRow({ id: 2, roleCode: 'DRIVER_ADMIN', clientId: 7 }))
    expect(getMenuTree).toHaveBeenCalledWith(7)
    expect(getRoleMenus).toHaveBeenCalledWith(2)

    // portal 角色（无 clientId 的历史行防御）→ 缺省 1
    ;(getMenuTree as any).mockClear()
    await assignBtn.onClick(roleRow())
    expect(getMenuTree).toHaveBeenCalledWith(1)
    wrapper.unmount()
  })
})
