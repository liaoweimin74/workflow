// ----- TDD: MenuPage 可见性开关必须落在后端真实字段 status（sys_menu 无 visible 列）-----
// npx vitest run src/views/system/menu/__tests__/MenuPage.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'

vi.mock('@/api/menu', () => ({
  getMenuTree: vi.fn(),
  createMenu: vi.fn(),
  updateMenu: vi.fn(),
  deleteMenu: vi.fn(),
}))

vi.mock('@/api/page', () => ({
  pageApi: { getPages: vi.fn(() => Promise.resolve({ data: { content: [] } })) },
}))

import MenuPage from '../MenuPage.vue'
import { createMenu, getMenuTree } from '@/api/menu'

/** SearchTable 桩：捕获 props 与 openFormDialog 预填值 */
let capturedProps: any = null
let openFormPayload: any = null
const SearchTableStub = defineComponent({
  name: 'SearchTableStub',
  props: ['searchFields', 'columns', 'actionButtons', 'fetchApi', 'formConfig', 'treeProps', 'showSearch'],
  setup(props, { expose }) {
    capturedProps = props
    expose({
      fetchList: vi.fn(),
      openFormDialog: (values: any) => {
        openFormPayload = values
      },
    })
    return () => h('div', { class: 'search-table-stub' })
  },
})

function ruleOf(field: string) {
  return capturedProps.formConfig.rule.find((r: any) => r.field === field)
}

async function createWrapper() {
  capturedProps = null
  openFormPayload = null
  const wrapper = mount(MenuPage, {
    global: {
      plugins: [ElementPlus, createPinia()],
      stubs: { SearchTable: SearchTableStub },
      directives: { permission: { mounted() {} } },
    },
  })
  await flushPromises()
  return wrapper
}

describe('MenuPage 可见性开关', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(getMenuTree as any).mockResolvedValue({
      data: [
        {
          id: 1,
          parentId: 0,
          menuName: '用户管理',
          menuType: 1,
          path: '/system/user',
          component: 'system/user/UserPage',
          permission: 'system:user:read',
          icon: 'User',
          sortOrder: 0,
          status: 0,
          children: [],
        },
      ],
    })
  })

  it('表单用 status 字段承载可见性，不再出现幽灵字段 visible', async () => {
    await createWrapper()
    const fields = capturedProps.formConfig.rule.map((r: any) => r.field)
    expect(fields).toContain('status')
    expect(fields).not.toContain('visible')
  })

  it('status 选项语义：1 显示 / 0 隐藏', async () => {
    await createWrapper()
    expect(ruleOf('status').options).toEqual([
      { label: '显示', value: 1 },
      { label: '隐藏', value: 0 },
    ])
  })

  it('菜单类型为按钮时隐藏 status 开关', async () => {
    await createWrapper()
    const fApi = { updateRule: vi.fn() }
    ruleOf('menuType').update(2, {}, fApi)
    expect(fApi.updateRule).toHaveBeenCalledWith('status', { hidden: true })
  })

  it('新增子菜单预填启用态（status 1）', async () => {
    await createWrapper()
    const addChild = capturedProps.actionButtons.find((b: any) => b.label === '新增子菜单')
    addChild.onClick({ id: 9, menuType: 0 })
    await flushPromises()
    expect(openFormPayload).toMatchObject({ parentId: 9, menuType: 1, status: 1 })
    expect(openFormPayload.visible).toBeUndefined()
  })

  it('提交载荷携带 status，剔除前端辅助字段 linkedPage', async () => {
    await createWrapper()
    ;(createMenu as any).mockResolvedValue({ data: {} })
    capturedProps.formConfig.createApi({
      parentId: 1,
      menuName: '新菜单',
      menuType: 1,
      path: '/new',
      status: 0,
      linkedPage: 'somePageKey',
    })
    const sent = (createMenu as any).mock.calls[0][0]
    expect(sent.status).toBe(0)
    expect(sent.visible).toBeUndefined()
    expect(sent.linkedPage).toBeUndefined()
  })
})
