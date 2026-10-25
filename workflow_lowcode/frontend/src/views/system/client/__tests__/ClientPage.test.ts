// ----- Task 6: A1 客户端管理页（ClientPage）-----
// npx vitest run src/views/system/client/__tests__/ClientPage.test.ts
//
// 覆盖简报四钉：
//   1. 列表配置：名称/编码列、已开通渠道徽标（仅 enabled=1）、用户数列占位（后端暂无字段 →「—」）；
//   2. 搜索过滤触发 api 参数透传（fetchApi → listClients，keyword/status/page/size）；
//   3. 无 system:client:create 权限时「新建」按钮不渲染（真实 v-permission 指令 + 真实 auth store）；
//   4. 点击「新建」打开抽屉（drawerVisible=true）；
//   5. 「☰菜单」跳转 A3（/system/menu）并携带该端 clientId（tasks 1.4 原文）。
//
// SearchTable 为重型业务组件：本页用 stub 承接 props/slot，只测页面接线逻辑。

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/system/client' }),
  useRouter: () => ({ push: pushMock }),
}))

import ClientPage from '../ClientPage.vue'
import { permission } from '@/directives/permission'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/api/client', () => ({
  listClients: vi.fn(),
  clientOptions: vi.fn(),
  createClient: vi.fn(),
  updateClient: vi.fn(),
  setClientStatus: vi.fn(),
  upsertChannel: vi.fn(),
  testChannel: vi.fn(),
}))

const api = (await import('@/api/client')) as any

function clientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 2,
    code: 'driver_app',
    name: '司机端',
    icon: null,
    status: 1,
    defaultRoleId: null,
    defaultMemberGroupId: null,
    channels: [
      { channelType: 'H5', enabled: 1, config: {} },
      { channelType: 'APP', enabled: 0, config: {} },
    ],
    ...overrides,
  }
}

/** SearchTable 桩：渲染默认 slot（页面自定义工具栏入口落点），props 暴露给断言。 */
const SearchTableStub = {
  name: 'SearchTableStub',
  props: ['searchFields', 'columns', 'actionButtons', 'fetchApi', 'formConfig'],
  expose: ['fetchList'],
  template: '<div class="search-table-stub"><slot /></div>',
}

async function mountPage(permissions: string[] = ['system:client:list']) {
  setActivePinia(createPinia())
  useAuthStore().permissions = permissions
  const wrapper = mount(ClientPage, {
    global: {
      plugins: [ElementPlus],
      directives: { permission },
      stubs: { SearchTable: SearchTableStub },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(api.listClients as any).mockResolvedValue({
    data: { rows: [clientRow()], total: 1, page: 1, size: 20 },
  })
})

describe('ClientPage 列表配置', () => {
  it('列包含 名称/编码/已开通渠道/用户数/状态', async () => {
    const wrapper = await mountPage()
    const cols = (wrapper.findComponent(SearchTableStub as any).props('columns') ?? []) as any[]
    const labels = cols.map((c) => c.label)
    expect(labels).toContain('名称')
    expect(labels).toContain('编码')
    expect(labels).toContain('已开通渠道')
    expect(labels).toContain('用户数')
    expect(labels).toContain('状态')
    wrapper.unmount()
  })

  it('渠道徽标列只展示已开通（enabled=1）渠道', async () => {
    const wrapper = await mountPage()
    const cols = wrapper.findComponent(SearchTableStub as any).props('columns') as any[]
    const chCol = cols.find((c) => c.label === '已开通渠道')
    expect(chCol).toBeDefined()
    expect(chCol.formatter(clientRow(), chCol, undefined, 0)).toBe('H5')
    const both = clientRow({
      channels: [
        { channelType: 'WEB', enabled: 1, config: {} },
        { channelType: 'H5', enabled: 1, config: {} },
      ],
    })
    expect(chCol.formatter(both, chCol, undefined, 0)).toBe('WEB/H5')
    wrapper.unmount()
  })

  it('用户数列为占位（后端暂无字段 →「—」）', async () => {
    const wrapper = await mountPage()
    const cols = wrapper.findComponent(SearchTableStub as any).props('columns') as any[]
    const userCol = cols.find((c) => c.label === '用户数')
    expect(userCol).toBeDefined()
    expect(userCol.formatter!(clientRow(), userCol, undefined, 0)).toBe('—')
    wrapper.unmount()
  })

  it('fetchApi 将查询参数原样透传 listClients 并整形 rows/total', async () => {
    const wrapper = await mountPage()
    const fetchApi = wrapper.findComponent(SearchTableStub as any).props('fetchApi') as (
      params: any,
    ) => Promise<{ rows: any[]; total: number }>
    const out = await fetchApi({ page: 1, size: 20, keyword: '司机', status: 1 })
    expect(api.listClients).toHaveBeenCalledWith({ page: 1, size: 20, keyword: '司机', status: 1 })
    expect(out).toEqual({ rows: [clientRow()], total: 1 })
    wrapper.unmount()
  })

  it('搜索字段含关键字与状态', async () => {
    const wrapper = await mountPage()
    const fields = wrapper.findComponent(SearchTableStub as any).props('searchFields') as any[]
    const props = fields.map((f) => f.prop)
    expect(props).toContain('keyword')
    expect(props).toContain('status')
    wrapper.unmount()
  })
})

describe('ClientPage 新建入口与权限', () => {
  it('有 system:client:create 权限时渲染「新建」按钮，点击进入抽屉', async () => {
    const wrapper = await mountPage(['system:client:list', 'system:client:create'])
    const btn = wrapper.findAll('button').find((b) => b.text().includes('新建'))
    expect(btn).toBeDefined()
    await btn!.trigger('click')
    expect((wrapper.vm as any).drawerVisible).toBe(true)
    wrapper.unmount()
  })

  it('无 system:client:create 权限时「新建」按钮不渲染（真实 v-permission 移除 DOM）', async () => {
    const wrapper = await mountPage(['system:client:list'])
    const btn = wrapper.findAll('button').find((b) => b.text().includes('新建'))
    expect(btn).toBeUndefined()
    wrapper.unmount()
  })
})

describe('ClientPage ☰菜单跳转（tasks 1.4）', () => {
  it('操作列含「☰菜单」，点击跳 /system/menu 并携带该端 clientId', async () => {
    const wrapper = await mountPage()
    const actions = wrapper.findComponent(SearchTableStub as any).props('actionButtons') as any[]
    const menuBtn = actions.find((b) => b.label.includes('菜单'))
    expect(menuBtn).toBeDefined()
    await menuBtn.onClick(clientRow({ id: 7 }))
    expect(pushMock).toHaveBeenCalledWith({ path: '/system/menu', query: { clientId: '7' } })
    wrapper.unmount()
  })
})
