import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Vant, { List as VanList } from 'vant'

import { pageApi } from '@/api/page'
import { dataSourceApi } from '@/api/data-source'
import MobileCardList from '@/render/mobile/blocks/MobileCardList.vue'
import MobilePageRenderer from '@/render/mobile/MobilePageRenderer.vue'
import { makePreviewSchema } from '@/render/mobile/mobilePreviewBridge'

import MobilePreviewPage from '../MobilePreviewPage.vue'

vi.mock('@/api/page', () => ({
  pageApi: { getPageByKey: vi.fn() },
}))
vi.mock('@/api/data-source', () => ({
  dataSourceApi: { queryData: vi.fn() },
}))

const getPageByKey = vi.mocked(pageApi.getPageByKey)
const queryData = vi.mocked(dataSourceApi.queryData)

/**
 * iframe 移动预览宿主（§5.2：设计预览与 H5 运行时共用同一 Vant 渲染器）：
 * 就绪回 ready 握手；消费设计器推来的 schema 帧实时重渲；
 * 带 pageKey 时自加载 DRAFT 兜首帧（postMessage 到达前不空白）。
 */
function mountPage(props: Record<string, unknown> = {}) {
  return mount(MobilePreviewPage, { props, global: { plugins: [Vant] } })
}

function dispatchMessage(data: unknown) {
  window.dispatchEvent(new MessageEvent('message', { data, origin: window.location.origin }))
}

beforeEach(() => {
  vi.clearAllMocks()
  queryData.mockResolvedValue({
    data: { records: [{ id: 'r0', data: { code: 'C001', name: '张三' }, version: 1 }], total: 1, page: 1, size: 20 },
  } as never)
})

describe('MobilePreviewPage（移动预览 iframe 宿主）', () => {
  it('announces ready to the parent window on mount', async () => {
    const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {})
    mountPage()
    await flushPromises()
    const call = post.mock.calls.find((c) => (c[0] as { type?: string })?.type === 'ready')
    expect(call).toBeTruthy()
    expect((call![0] as { source?: string }).source).toBe('lc-mobile-preview')
    post.mockRestore()
  })

  it('renders the schema pushed by the designer without any fetch', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.findComponent(MobileCardList).exists()).toBe(false)
    dispatchMessage(
      makePreviewSchema({
        rule: [
          {
            type: 'page-table',
            field: 'tbl',
            props: {
              dataSourceId: 'ds-1',
              columns: [
                { key: 'code', label: '编号' },
                { key: 'name', label: '名称' },
              ],
            },
          },
        ],
        dataSources: [{ id: 'ds-1', refId: 'ref-9' }],
        channelProfiles: { H5: { tbl: { card: { title: 'name' } } } },
      }),
    )
    await flushPromises()
    // 走的是与生产同一注入链：H5 覆盖生效（标题槽=name），数据按 dsRefId 查询
    wrapper.findComponent(MobileCardList).findComponent(VanList).vm.$emit('load')
    await flushPromises()
    expect(wrapper.find('.m-card__title').text()).toBe('张三')
    expect(getPageByKey).not.toHaveBeenCalled()
  })

  it('ignores foreign messages (dev-server HMR etc.)', async () => {
    const wrapper = mountPage()
    await flushPromises()
    dispatchMessage({ source: 'webpack-dev-server', type: 'static', data: {} })
    dispatchMessage('ping')
    dispatchMessage({ source: 'lc-designer-preview', type: 'schema' })
    await flushPromises()
    expect(wrapper.findComponent(MobileCardList).exists()).toBe(false)
  })

  it('self-loads the DRAFT definition when pageKey is given', async () => {
    getPageByKey.mockResolvedValue({
      data: {
        type: 'PAGE',
        schema: JSON.stringify({
          rule: [{ type: 'page-tree-table', field: 'tt' }],
          option: {},
          dataSources: [],
          channelProfiles: {},
        }),
      },
    } as never)
    const wrapper = mountPage({ pageKey: 'demo' })
    await flushPromises()
    expect(getPageByKey).toHaveBeenCalledWith('demo', true)
    expect(wrapper.text()).toContain('page-tree-table')
  })

  it('a later designer frame wins over the self-loaded draft', async () => {
    getPageByKey.mockResolvedValue({
      data: { type: 'PAGE', schema: JSON.stringify({ rule: [{ type: 'page-tree-table', field: 'tt' }] }) },
    } as never)
    const wrapper = mountPage({ pageKey: 'demo' })
    await flushPromises()
    dispatchMessage(
      makePreviewSchema({
        rule: [{ type: 'page-form', field: 'f1', props: {}, children: [] }],
      }),
    )
    await flushPromises()
    expect(wrapper.findComponent(MobilePageRenderer).exists()).toBe(true)
    expect(wrapper.text()).not.toContain('page-tree-table')
  })
})
