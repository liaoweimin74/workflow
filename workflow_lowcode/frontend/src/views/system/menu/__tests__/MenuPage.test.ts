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
  moveMenu: vi.fn(),
}))

vi.mock('@/api/page', () => ({
  pageApi: { getPages: vi.fn(() => Promise.resolve({ data: { content: [] } })) },
}))

// Task 8：端 Tab 数据源 + 路由（?clientId= 保持 / 去新建端跳转）
const routerPush = vi.fn()
const routerReplace = vi.fn()
const mockRoute = { path: '/system/menu', query: {} as Record<string, string> }
vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
}))

vi.mock('@/api/client', () => ({
  clientOptions: vi.fn(),
}))

import MenuPage from '../MenuPage.vue'
import { createMenu, getMenuTree, moveMenu, updateMenu } from '@/api/menu'
import { clientOptions } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { MenuTree } from '@/types/menu'

/** SearchTable 桩：捕获 props/slots 与 openFormDialog 预填值 */
let capturedProps: any = null
let capturedSlots: Record<string, (params: any) => any> = {}
let openFormPayload: any = null
const stubFetchList = vi.fn()
const SearchTableStub = defineComponent({
  name: 'SearchTableStub',
  props: ['searchFields', 'columns', 'actionButtons', 'fetchApi', 'formConfig', 'treeProps', 'showSearch'],
  setup(props, { expose, slots }) {
    capturedProps = props
    capturedSlots = slots as any
    expose({
      fetchList: stubFetchList,
      openFormDialog: (values: any) => {
        openFormPayload = values
      },
    })
    return () => h('div', { class: 'search-table-stub' })
  },
})

/** 单独渲染某列插槽（zone 根行等需要看真实 DOM）。 */
function renderColumnSlot(slotName: string, row: Record<string, unknown>) {
  return mount(
    defineComponent({ setup: () => () => h('div', capturedSlots[slotName]?.({ row }) as any) }),
    { global: { plugins: [ElementPlus] } },
  )
}

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
    const fApi = { updateRule: vi.fn(), hidden: vi.fn(), hiddenStatus: vi.fn(() => false) }
    // 初始化阶段字段还没挂载，只改规则，避免在创建过程中触发重渲染
    ruleOf('menuType').update(2, {}, fApi, { origin: 'init' })
    expect(fApi.updateRule).toHaveBeenCalledWith('status', { hidden: true })
    expect(fApi.hidden).not.toHaveBeenCalled()
    // 运行期切换类型必须走 hidden()，否则 updateRule 改了规则但视图不刷新
    fApi.updateRule.mockClear()
    ruleOf('menuType').update(2, {}, fApi, { origin: 'change' })
    expect(fApi.hidden).toHaveBeenCalledWith(true, 'status')
    expect(fApi.updateRule).not.toHaveBeenCalled()
  })

  it('新增子菜单预填启用态（status 1）', async () => {
    await createWrapper()
    const addChild = capturedProps.actionButtons.find((b: any) => b.label === '新增子菜单')
    addChild.onClick({ id: 9, menuType: 0 })
    await flushPromises()
    expect(openFormPayload).toMatchObject({ parentId: 9, menuType: 1, status: 1 })
    expect(openFormPayload.visible).toBeUndefined()
    // 排序号留空由后端追加到同级末尾，预填 0 会让新项插到列表最前
    expect(openFormPayload.sortOrder).toBeUndefined()
  })

  it('父类型决定子类型：菜单行下只能建按钮', async () => {
    await createWrapper()
    const addChild = capturedProps.actionButtons.find((b: any) => b.label === '新增子菜单')
    addChild.onClick({ id: 10, menuType: 1 })
    await flushPromises()
    expect(openFormPayload).toMatchObject({ parentId: 10, menuType: 2 })
  })

  it('按钮行不提供新增子菜单入口', async () => {
    await createWrapper()
    const addChild = capturedProps.actionButtons.find((b: any) => b.label === '新增子菜单')
    expect(addChild.show({ menuType: 2 })).toBe(false)
    expect(addChild.show({ menuType: 0 })).toBe(true)
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
    // 新增仍要带 parentId，否则挂不到所选父级
    expect(sent.parentId).toBe(1)
  })
})

describe('MenuPage 层级由拖动负责', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(getMenuTree as any).mockResolvedValue({
      data: [
        {
          id: 10,
          parentId: 0,
          menuName: '用户管理',
          menuType: 1,
          path: '/system/user',
          component: 'system/user/UserPage',
          permission: 'system:user:read',
          icon: 'User',
          sortOrder: 0,
          status: 1,
          children: [],
        },
      ],
    })
  })

  it('编辑态把「上级菜单」换成只读展示字段，并回显父级名称', async () => {
    const wrapper = await createWrapper()
    // SearchTable 桩不会调用 fetchApi，这里手动取一次数以填充页面里的菜单树
    await capturedProps.fetchApi({})
    const loaded = await capturedProps.formConfig.getApi(10)
    expect(loaded.parentName).toBe('（根级）')
    await wrapper.vm.$nextTick()
    await flushPromises()
    expect(ruleOf('parentId')).toBeUndefined()
    expect(ruleOf('parentName').props.disabled).toBe(true)
  })

  it('新增态仍提供可选择的「上级菜单」', async () => {
    await createWrapper()
    expect(ruleOf('parentId').type).toBe('treeSelect')
    expect(ruleOf('parentName')).toBeUndefined()
  })

  it('更新载荷剔除 parentId/parentName（后端 update 不改层级）', async () => {
    await createWrapper()
    await capturedProps.formConfig.getApi(10)
    ;(updateMenu as any).mockResolvedValue({ data: {} })
    await capturedProps.formConfig.updateApi(10, {
      parentId: 3,
      parentName: '（根级）',
      menuName: '改名',
      linkedPage: 'k',
    })
    const sent = (updateMenu as any).mock.calls[0][1]
    expect(sent.parentId).toBeUndefined()
    expect(sent.parentName).toBeUndefined()
    expect(sent.linkedPage).toBeUndefined()
    expect(sent.menuName).toBe('改名')
  })
})

describe('MenuPage 表单校验', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(getMenuTree as any).mockResolvedValue({
      data: [
        {
          id: 20,
          parentId: null,
          menuName: '系统管理',
          menuType: 0,
          path: '/system',
          sortOrder: 0,
          status: 1,
          children: [
            {
              id: 10,
              parentId: 20,
              menuName: '用户管理',
              menuType: 1,
              path: '/system/user',
              component: 'system/user/UserPage',
              sortOrder: 0,
              status: 1,
              children: [],
            },
          ],
        },
      ],
    })
  })

  /** 以指定菜单类型执行字段校验，返回错误文案 */
  function checkField(field: string, menuType: number, value: unknown): string | undefined {
    let error: Error | undefined
    ruleOf(field).validate[0].validator.call(
      { api: { getValue: () => menuType } },
      {},
      value,
      (e?: Error) => { error = e },
    )
    return error?.message
  }

  it('菜单类型必填提示指明字段', async () => {
    await createWrapper()
    expect(ruleOf('menuType').validate[0]).toMatchObject({
      required: true,
      message: '请选择菜单类型',
    })
    expect(ruleOf('menuName').validate[0]).toMatchObject({
      required: true,
      whitespace: true,
      message: '请输入菜单名称',
    })
  })

  it('按菜单类型要求路由路径/组件路径/权限标识', async () => {
    await createWrapper()
    expect(checkField('path', 0, '')).toBe('请输入路由路径')
    expect(checkField('path', 1, '  ')).toBe('请输入路由路径')
    expect(checkField('path', 2, '')).toBeUndefined()
    expect(checkField('component', 1, '')).toBe('请输入组件路径')
    expect(checkField('component', 0, '')).toBeUndefined()
    expect(checkField('permission', 2, '')).toBe('请输入权限标识')
    expect(checkField('permission', 1, '')).toBeUndefined()
  })

  it('上级菜单层级校验提前指出该类型能挂在哪里', async () => {
    await createWrapper()
    await capturedProps.fetchApi({})

    const parentValidator = ruleOf('parentId').validate[0].validator
    const run = (menuType: number, parentId: number | null) => {
      let error: Error | undefined
      parentValidator.call(
        { api: { getValue: () => menuType } },
        {},
        parentId,
        (e?: Error) => { error = e },
      )
      return error?.message
    }

    expect(run(1, null)).toContain('菜单必须放在目录下')
    expect(run(1, null)).toContain('请选择目录作为上级菜单')
    expect(run(1, 20)).toBeUndefined()
    expect(run(2, 10)).toBeUndefined()
    expect(run(2, 20)).toContain('按钮必须放在菜单下')
    expect(run(0, null)).toBeUndefined()
    expect(run(0, 20)).toBeUndefined()
    expect(run(0, 10)).toContain('目录只能放在根级或其他目录下')
  })
})

// ----- Task 8: A3 菜单管理端作用域切换与移动端分区（tasks.md 2.3/2.4）-----
describe('MenuPage 端作用域 Tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRoute.query = {}
    ;(getMenuTree as any).mockResolvedValue({ data: [] })
    ;(clientOptions as any).mockResolvedValue({
      data: [
        { id: 1, code: 'portal', name: '平台端', channelTypes: ['WEB'], status: 1 },
        { id: 7, code: 'driver', name: '司机端', channelTypes: ['H5', 'MP'], status: 1 },
      ],
    })
  })

  it('端 Tab 来自 clientOptions，含「去新建端」入口并跳 A1', async () => {
    const wrapper = await createWrapper()
    expect(clientOptions).toHaveBeenCalled()
    expect(wrapper.text()).toContain('平台端')
    expect(wrapper.text()).toContain('司机端')
    const goBtn = wrapper.findAll('button').find((b) => b.text().includes('去新建端'))
    expect(goBtn).toBeDefined()
    await goBtn!.trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/system/client')
    wrapper.unmount()
  })

  it('缺省按 portal(1) 拉树；URL ?clientId= 优先（消费 A1 的 ☰菜单 跳转）', async () => {
    const w1 = await createWrapper()
    await capturedProps.fetchApi({})
    expect(getMenuTree).toHaveBeenLastCalledWith(1)
    w1.unmount()

    mockRoute.query = { clientId: '7' }
    const w2 = await createWrapper()
    await capturedProps.fetchApi({})
    expect(getMenuTree).toHaveBeenLastCalledWith(7)
    w2.unmount()
  })

  it('切换端：带 clientId 重拉树（二次请求）并写回 URL query', async () => {
    stubFetchList.mockClear()
    const wrapper = await createWrapper()
    await capturedProps.fetchApi({})
    const vm = wrapper.vm as any
    await vm.switchClient(7)
    expect(routerReplace).toHaveBeenCalledWith({ query: { clientId: '7' } })
    expect(stubFetchList).toHaveBeenCalled()
    await capturedProps.fetchApi({})
    expect(getMenuTree).toHaveBeenLastCalledWith(7)
    wrapper.unmount()
  })
})

describe('MenuPage 移动端分区带与 move 回滚', () => {
  const zoneRoot: MenuTree = {
    id: 900, parentId: null, menuName: '底部Tab区', menuType: 0,
    path: '', component: 'mzone:tabs', permission: '', icon: '', sortOrder: 1, status: 1, children: [],
  } as MenuTree

  beforeEach(() => {
    vi.clearAllMocks()
    mockRoute.query = {}
    ;(getMenuTree as any).mockResolvedValue({ data: [] })
    ;(clientOptions as any).mockResolvedValue({ data: [] })
  })

  it('zone 根行渲染分区带标题且不渲染拖拽把手；普通行仍有把手（需 update 权限）', async () => {
    const wrapper = await createWrapper()
    useAuthStore().permissions = ['system:menu:update']
    await wrapper.vm.$nextTick()

    const zoneCell = renderColumnSlot('menuName', zoneRoot)
    expect(zoneCell.text()).toContain('底部Tab区')
    expect(zoneCell.find('.menu-drag-handle').exists()).toBe(false)

    const normalCell = renderColumnSlot('menuName', {
      ...zoneRoot, id: 901, menuName: '工作台', menuType: 1, component: 'page/PageRenderer',
    })
    expect(normalCell.find('.menu-drag-handle').exists()).toBe(true)
    wrapper.unmount()
  })

  it('move 被服务端拒绝：不抛出（后端消息由 http 拦截器 toast），以服务端重取回滚', async () => {
    stubFetchList.mockClear()
    const wrapper = await createWrapper()
    const vm = wrapper.vm as any
    ;(moveMenu as any).mockRejectedValue(Object.assign(new Error('底部 Tab 区只能放菜单'), { code: 500 }))
    await expect(vm.handleMoveDrop(901, { parentId: 900, index: 0 })).resolves.toBeUndefined()
    expect(stubFetchList).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
