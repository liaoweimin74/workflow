import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Empty as VanEmpty, List as VanList, PullRefresh as VanPullRefresh, Search as VanSearch } from 'vant'

import { dataSourceApi } from '@/api/data-source'
import MobileCardList from '../blocks/MobileCardList.vue'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: { queryData: vi.fn() },
}))

const queryData = vi.mocked(dataSourceApi.queryData)

/**
 * 移动端卡片列表块（page-table / page-list-cards 的移动实现）。
 * 取数协议对齐桌面 PageDataCards：dataSourceApi.queryData(refId, {page,size,keyword})，
 * records[].data 展平 + id/version 附带；total 决定 finished。槽位=deriveCardSlots 缺省映射。
 * 数据源解析走宿主 prepare 注入的 dsRefId（桌面同款协议）。
 */

function pageResponse(rows: Array<Record<string, unknown>>, total = rows.length) {
  return {
    data: {
      records: rows.map((data, index) => ({ id: `r${index}`, data, version: 1 })),
      total,
      page: 1,
      size: 20,
    },
  }
}

const COLUMNS = [
  { key: 'code', label: '客户编号' },
  { key: 'name', label: '客户名称' },
  { key: 'phone', label: '手机号' },
  { key: 'addr', label: '联系地址' },
  { key: 'status', label: '状态' },
  { key: 'type', label: '类型' },
]

function mountList(props: Record<string, unknown> = {}) {
  return mount(MobileCardList, { props: { dsRefId: 'ref-1', columns: COLUMNS, ...props } })
}

async function fireLoad(wrapper: ReturnType<typeof mountList>) {
  wrapper.findComponent(VanList).vm.$emit('load')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MobileCardList（Vant 卡片列表块）', () => {
  it('renders cards with default slot mapping: title/subtitle/kv, overflow columns excluded', async () => {
    queryData.mockResolvedValue(
      pageResponse([
        { code: 'C001', name: '张三', phone: '13900000001', addr: '北京市朝阳区', status: '活跃', type: '企业' },
      ]) as never,
    )
    const wrapper = mountList()
    // 缺省不显示搜索条（对齐桌面 showSearch 开关）
    expect(wrapper.findComponent(VanSearch).exists()).toBe(false)
    await fireLoad(wrapper)

    expect(queryData).toHaveBeenCalledWith('ref-1', { page: 1, size: 20 })
    expect(wrapper.findAll('.m-card')).toHaveLength(1)
    const text = wrapper.text()
    expect(text).toContain('C001') // 第1列=标题
    expect(text).toContain('张三') // 第2列=副标题
    expect(text).toContain('手机号') // 第3~5列=键值区（label 渲染）
    expect(text).toContain('13900000001')
    expect(text).toContain('活跃')
    // 第 6 列起进 more，缺省不渲染
    expect(text).not.toContain('企业')
    expect(text).not.toContain('类型')
  })

  it('shows search bar when enabled and reloads first page with keyword', async () => {
    queryData.mockResolvedValue(pageResponse([{ code: 'C001', name: '张三' }]) as never)
    const wrapper = mountList({
      showSearch: true,
      searchFields: [{ key: 'name', label: '名称', matchType: 'like' }],
    })
    expect(wrapper.findComponent(VanSearch).exists()).toBe(true)
    await fireLoad(wrapper)
    expect(queryData).toHaveBeenCalledTimes(1)

    await wrapper.find('input.van-field__control').setValue('张三')
    wrapper.findComponent(VanSearch).vm.$emit('search')
    await flushPromises()

    expect(queryData).toHaveBeenCalledTimes(2)
    expect(queryData).toHaveBeenLastCalledWith('ref-1', { page: 1, size: 20, keyword: '张三' })
    // 搜索后重新加载不叠加旧页
    expect(wrapper.findAll('.m-card')).toHaveLength(1)
  })

  it('appends next page on load and finishes when total reached', async () => {
    queryData
      .mockResolvedValueOnce(
        pageResponse(
          [
            { code: 'C001' },
            { code: 'C002' },
          ],
          3,
        ) as never,
      )
      .mockResolvedValueOnce(pageResponse([{ code: 'C003' }], 3) as never)
    const wrapper = mountList({ pageSize: 2 })
    await fireLoad(wrapper)
    expect(wrapper.findAll('.m-card')).toHaveLength(2)

    await fireLoad(wrapper)
    expect(queryData).toHaveBeenLastCalledWith('ref-1', { page: 2, size: 2 })
    expect(wrapper.findAll('.m-card')).toHaveLength(3)
    expect(wrapper.findComponent(VanList).props('finished')).toBe(true)

    // finished 后不再请求
    await fireLoad(wrapper)
    expect(queryData).toHaveBeenCalledTimes(2)
  })

  it('renders empty state when no rows returned', async () => {
    queryData.mockResolvedValue(pageResponse([]) as never)
    const wrapper = mountList()
    await fireLoad(wrapper)
    expect(wrapper.findComponent(VanEmpty).exists()).toBe(true)
    expect(wrapper.findAll('.m-card')).toHaveLength(0)
  })

  it('pull refresh resets rows and reloads first page', async () => {
    queryData.mockResolvedValue(pageResponse([{ code: 'C001', name: '张三' }]) as never)
    const wrapper = mountList()
    await fireLoad(wrapper)
    expect(queryData).toHaveBeenCalledTimes(1)

    wrapper.findComponent(VanPullRefresh).vm.$emit('refresh')
    await flushPromises()

    expect(queryData).toHaveBeenCalledTimes(2)
    expect(queryData).toHaveBeenLastCalledWith('ref-1', { page: 1, size: 20 })
    expect(wrapper.findAll('.m-card')).toHaveLength(1)
  })

  it('skips request and finishes immediately without a bound data source', async () => {
    const wrapper = mountList({ dsRefId: undefined })
    await fireLoad(wrapper)
    expect(queryData).not.toHaveBeenCalled()
    expect(wrapper.findComponent(VanList).props('finished')).toBe(true)
  })

  it('emits row-click with the flattened row', async () => {
    queryData.mockResolvedValue(pageResponse([{ code: 'C001', name: '张三' }]) as never)
    const wrapper = mountList()
    await fireLoad(wrapper)
    await wrapper.find('.m-card').trigger('click')
    const payload = wrapper.emitted('row-click')?.[0]?.[0] as Record<string, unknown>
    expect(payload).toMatchObject({ id: 'r0', code: 'C001', name: '张三' })
  })
})
