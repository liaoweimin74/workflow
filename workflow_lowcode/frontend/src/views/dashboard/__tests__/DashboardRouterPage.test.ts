// ----- TDD: DashboardRouterPage 按租户首页配置加载，失败回退 dashboard / 静态首页 -----

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

vi.mock('@/api/page', () => ({
  pageApi: {
    getHomePage: vi.fn(),
    getPageByKey: vi.fn(),
  },
}))

vi.mock('@/views/page/PageRendererPage.vue', () => ({
  default: defineComponent({
    name: 'PageRendererPage',
    props: ['definition'],
    setup: () => () => h('div', { class: 'page-renderer-stub' }),
  }),
}))

vi.mock('@/views/dashboard/DashboardPage.vue', () => ({
  default: defineComponent({
    name: 'StaticDashboard',
    setup: () => () => h('div', { class: 'static-dashboard-stub' }),
  }),
}))

import DashboardRouterPage from '../DashboardRouterPage.vue'
import { pageApi } from '@/api/page'

function publishedPage(id: string) {
  return { id, type: 'PAGE', status: 'PUBLISHED', schema: '{"rule":[]}', key: id }
}

function createWrapper() {
  return mount(DashboardRouterPage, {
    global: { directives: { loading: {} } },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DashboardRouterPage', () => {
  it('按首页配置的 key 加载页面，而不是固定 dashboard', async () => {
    ;(pageApi.getHomePage as any).mockResolvedValue({ data: 'leave_board' })
    ;(pageApi.getPageByKey as any).mockResolvedValue({ data: publishedPage('leave_board') })

    const wrapper = createWrapper()
    await flushPromises()

    expect(pageApi.getPageByKey).toHaveBeenCalledTimes(1)
    expect(pageApi.getPageByKey).toHaveBeenCalledWith('leave_board', false)
    expect(wrapper.find('.page-renderer-stub').exists()).toBe(true)
    expect(wrapper.find('.static-dashboard-stub').exists()).toBe(false)
  })

  it('配置页面不可用时回退 dashboard 页面', async () => {
    ;(pageApi.getHomePage as any).mockResolvedValue({ data: 'leave_board' })
    ;(pageApi.getPageByKey as any)
      .mockRejectedValueOnce(new Error('403'))
      .mockResolvedValueOnce({ data: publishedPage('dashboard') })

    const wrapper = createWrapper()
    await flushPromises()

    expect(pageApi.getPageByKey).toHaveBeenNthCalledWith(1, 'leave_board', false)
    expect(pageApi.getPageByKey).toHaveBeenNthCalledWith(2, 'dashboard', false)
    expect(wrapper.find('.page-renderer-stub').exists()).toBe(true)
  })

  it('配置与 dashboard 页面都不可用时回退静态首页', async () => {
    ;(pageApi.getHomePage as any).mockResolvedValue({ data: 'leave_board' })
    ;(pageApi.getPageByKey as any).mockRejectedValue(new Error('404'))

    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.static-dashboard-stub').exists()).toBe(true)
  })

  it('首页配置接口不可用时仍尝试默认 dashboard 页面', async () => {
    ;(pageApi.getHomePage as any).mockRejectedValue(new Error('500'))
    ;(pageApi.getPageByKey as any).mockResolvedValue({ data: publishedPage('dashboard') })

    const wrapper = createWrapper()
    await flushPromises()

    expect(pageApi.getPageByKey).toHaveBeenCalledWith('dashboard', false)
    expect(wrapper.find('.page-renderer-stub').exists()).toBe(true)
  })
})
