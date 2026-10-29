// ----- TDD: PageRenderer 强制刷新（keep-alive 场景） -----
// 背景：AdminLayout 用 keep-alive 缓存页签组件；菜单重击当前页签时携带 query._t
// 强制导航。缓存的所有实例都会收到全局 route 变化，仅 path 匹配自身的实例刷新。
// npx vitest run src/views/page/__tests__/PageRenderer.keepalive.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import ElementPlus from 'element-plus'
import PageRenderer from '../PageRenderer.vue'
import SearchTable from '@/components/business/SearchTable.vue'

vi.mock('@/api/page', () => ({
  pageApi: {
    getPageByKey: vi.fn(),
    queryPageData: vi.fn(),
  },
}))

vi.mock('@/api/form', () => ({
  formApi: { getFormDefinitionByKey: vi.fn() },
}))

vi.mock('@/api/data-source', () => ({
  dataSourceApi: { getMetadata: vi.fn(() => Promise.resolve({ data: null })) },
}))

// 响应式 route：query 变化可触发组件内 watch（模拟 keep-alive 下真实 useRoute 行为）
// 状态对象（hoisted，测试可改）→ 工厂内包 reactive；routeHolder 暴露代理供测试经代理赋值
const mockRouteState = vi.hoisted(() => ({
  params: { pageKey: 'emp_view' },
  query: {} as Record<string, string>,
  path: '/page/emp_view',
}))
const routeHolder = vi.hoisted(() => ({ route: null as any }))

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  const route = reactive(mockRouteState)
  routeHolder.route = route
  return {
    useRoute: () => route,
    useRouter: () => ({ push: vi.fn() }),
  }
})

import { pageApi } from '@/api/page'

/** 已发布 VIEW 页面编译产物（含一个输入搜索字段 + 一个 table） */
const compiledSchema = JSON.stringify({
  rule: [
    { type: 'input', field: 'name', title: '姓名', value: '', props: { placeholder: '姓名' }, matchType: 'like' },
    {
      type: 'table',
      field: '__page_table',
      title: '数据列表',
      props: { columns: [{ prop: 'name', label: '姓名', minWidth: 130 }] },
    },
  ],
  option: {},
})

const pageDef = {
  id: 'p1',
  name: '员工视图',
  key: 'emp_view',
  type: 'VIEW',
  formKey: 'emp_profile',
  version: 1,
  status: 'PUBLISHED',
  publishedVersion: 1,
  schema: compiledSchema,
}

function createWrapper() {
  return mount(PageRenderer, {
    global: { plugins: [ElementPlus] },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  routeHolder.route.query = {}
  routeHolder.route.path = '/page/emp_view'
  routeHolder.route.params = { pageKey: 'emp_view' }
  ;(pageApi.getPageByKey as any).mockResolvedValue({ data: pageDef })
  ;(pageApi.queryPageData as any).mockResolvedValue({
  data: { records: [], total: 0, page: 1, size: 20 },
  })
})

describe('PageRenderer — keep-alive 强制刷新', () => {
  it('缓存实例 pageKey 为挂载快照：全局 route.params 变化（其他页签导航）不重新 load', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    expect(pageApi.getPageByKey).toHaveBeenCalledTimes(1)

    // 模拟切换其他页签：全局 route.params.pageKey 变为其他值（keep-alive 缓存实例共享全局 route）
    routeHolder.route.params = { pageKey: 'test_view_2' }
    routeHolder.route.path = '/page/test_view_2'
    await nextTick()
    await flushPromises()

    // 缓存实例不应因其他页签导航而重新加载（否则页签切换丢失状态、重复请求）
    expect(pageApi.getPageByKey).toHaveBeenCalledTimes(1)
    expect(pageApi.queryPageData).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('菜单重击（query._t 变化）且 path 匹配自身时，重新拉取列表数据', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    expect(pageApi.queryPageData).toHaveBeenCalledTimes(1)

    // 模拟菜单重击：AdminLayout 携带递增 _t 强制导航（path 不变）
    routeHolder.route.query = { _t: String(Date.now()) }
    await nextTick()
    await flushPromises()

    expect(pageApi.queryPageData).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('path 不匹配自身（其他页签实例收到全局 route 变化）时不刷新', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    expect(pageApi.queryPageData).toHaveBeenCalledTimes(1)

    // 另一个页签触发刷新：全局 route 变为 /page/other，本实例 path 不匹配 → 不应响应
    routeHolder.route.path = '/page/other'
    routeHolder.route.query = { _t: String(Date.now()) }
    await nextTick()
    await flushPromises()

    expect(pageApi.queryPageData).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('强制刷新保留搜索条件（仅重新拉取，不重置 query）', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    // 通过 SearchTable.setQuery 注入搜索条件（模拟用户在搜索框输入后提交）
    ;(pageApi.queryPageData as any).mockResolvedValue({
  data: { records: [{ id: 'r1', data: { name: '张三' }, version: 1 }], total: 1, page: 1, size: 20 },
    })
    const searchTable = wrapper.findComponent(SearchTable)
    ;(searchTable.vm as any).setQuery({ name: '张' })
    await flushPromises()
    // setQuery 本身触发一次请求（带 filter）
    expect(pageApi.queryPageData).toHaveBeenCalledTimes(2)

    // 强制刷新：不重置 query，仍带当前 filter
    routeHolder.route.query = { _t: String(Date.now()) }
    await nextTick()
    await flushPromises()

    expect(pageApi.queryPageData).toHaveBeenCalledTimes(3)
    const lastCall = (pageApi.queryPageData as any).mock.calls.at(-1)
    expect(lastCall[0]).toBe('emp_view')
    expect(lastCall[1].filter).toContain('张')
    wrapper.unmount()
  })
})
