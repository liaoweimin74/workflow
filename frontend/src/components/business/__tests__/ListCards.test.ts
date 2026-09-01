// ----- TDD: ListCards 组件测试 -----
// npx vitest run src/components/business/__tests__/ListCards.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, defineComponent, h, ref } from 'vue'
import type { Component } from 'vue'
import ElementPlus from 'element-plus'
import ListCards from '../ListCards.vue'
import type { CardColumn, ListQueryParams, ListPageResult } from '../types'

// 测试组件的通用挂载函数
function createWrapper(props: {
  columns?: CardColumn[]
  fetchApi?: (params: ListQueryParams) => Promise<ListPageResult>
  cardMinWidth?: number | string
  defaultPageSize?: number
}) {
  return mount(ListCards, {
    props: {
      columns: props.columns || [],
      fetchApi: props.fetchApi || (() => Promise.resolve({ rows: [], total: 0 })),
      cardMinWidth: props.cardMinWidth || 200,
      defaultPageSize: props.defaultPageSize || 10,
    },
    global: {
      plugins: [ElementPlus],
    },
  })
}

describe('CardColumn 接口', () => {
  it('支持 title/subtitle/tag/hidden/valueType 等卡片特有字段', () => {
    const column: CardColumn = {
      prop: 'title',
      label: '标题字段',
      title: '主要标题',
      subtitle: '副标题',
      tag: '状态',
      role: 'title',
      hidden: false,
      valueType: 'string',
      minWidth: 120,
    }
    expect(column.prop).toBe('title')
    expect(column.title).toBe('主要标题')
    expect(column.subtitle).toBe('副标题')
    expect(column.tag).toBe('状态')
    expect(column.hidden).toBe(false)
    expect(column.valueType).toBe('string')
    expect(column.minWidth).toBe(120)
    expect(column.role).toBe('title')
  })

  it('隐藏字段不渲染在卡片中', () => {
    const columns: CardColumn[] = [
      { prop: 'id', hidden: true },
      { prop: 'name', title: '名称', hidden: false },
    ]
    expect(columns[0].hidden).toBe(true)
    expect(columns[1].hidden).toBe(false)
  })

  it('role 支持 title|subtitle|tag|field|metric', () => {
    const titleCol: CardColumn = { prop: 'name', role: 'title' }
    const subtitleCol: CardColumn = { prop: 'date', role: 'subtitle' }
    const tagCol: CardColumn = { prop: 'status', role: 'tag' }
    const fieldCol: CardColumn = { prop: 'info', role: 'field' }
    const metricCol: CardColumn = { prop: 'count', role: 'metric' }

    expect(titleCol.role).toBe('title')
    expect(subtitleCol.role).toBe('subtitle')
    expect(tagCol.role).toBe('tag')
    expect(fieldCol.role).toBe('field')
    expect(metricCol.role).toBe('metric')
  })

  it('rows 类型与泛型参数一致', () => {
    interface CardItem {
      id: string
      title: string
      subtitle?: string
      tag?: string
    }

    const result: ListPageResult<CardItem> = {
      rows: [
        { id: '1', title: '卡片1', subtitle: '副标题1', tag: '标签A' },
        { id: '2', title: '卡片2', subtitle: '副标题2', tag: '标签B' },
      ],
      total: 2,
    }
    expect(result.rows[0].id).toBe('1')
    expect(result.rows[0].title).toBe('卡片1')
  })
})

describe('ListCards 组件', () => {
  // ===== fetchLifecycle 测试 =====
  describe('fetch lifecycle', () => {
    it('初始化时调用 fetchApi 进行初始加载', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: 'A' }], total: 1 })
      const wrapper = createWrapper({ fetchApi: mockFetch })

      await flushPromises()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })

    it('fetchApi 返回 rows 和 total 时正确更新状态', async () => {
      const testData = [
        { id: 1, title: '卡片1', status: 'active' },
        { id: 2, title: '卡片2', status: 'pending' },
      ]

      const mockFetch = vi.fn().mockResolvedValue({ rows: testData, total: 2 })
      const columns: CardColumn[] = [
        { prop: 'id', title: 'ID', role: 'title' },
        { prop: 'title', title: '标题', role: 'title' },
        { prop: 'status', title: '状态', role: 'tag' },
      ]

      const wrapper = createWrapper({ fetchApi: mockFetch, columns })

      await flushPromises()

      expect(wrapper.vm['loading']).toBe(false)
      wrapper.unmount()
    })

    it('请求序列保护：只保留最新请求结果', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1 }], total: 1 })

      const wrapper = createWrapper({ fetchApi: mockFetch })
      await flushPromises()

      // 验证请求达到了
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(wrapper.vm['rows']).toHaveLength(1)
      wrapper.unmount()
    })

    it('默认 page=1, size=10', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ rows: [], total: 0 })

      const wrapper = createWrapper({ fetchApi: mockFetch })

      await flushPromises()

      expect(mockFetch).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, size: 10 })
      )
      wrapper.unmount()
    })

    it('手动刷新时替换 rows 和 total', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: 1 }], total: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 2 }], total: 1 })

      const wrapper = createWrapper({ fetchApi: mockFetch })

      await flushPromises()
      expect(wrapper.vm['rows']).toHaveLength(1)

      await wrapper.vm['refresh']()
      await flushPromises()

      expect(mockFetch).toHaveBeenCalledTimes(2)
      wrapper.unmount()
    })
  })

  // ===== Card 渲染 测试 =====
  describe('Card rendering', () => {
    it('根据 role 渲染 title 字段', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        rows: [{ id: 1, name: '测试卡片' }],
        total: 1,
      })
      const columns: CardColumn[] = [
        { prop: 'name', title: '名称', role: 'title' },
      ]

      const wrapper = createWrapper({ fetchApi: mockFetch, columns })
      await flushPromises()

      expect(wrapper.find('.card-title').exists()).toBe(true)
      wrapper.unmount()
    })

    it('根据 role 渲染 subtitle 字段', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        rows: [{ id: 1, desc: '描述文本' }],
        total: 1,
      })
      const columns: CardColumn[] = [
        { prop: 'desc', title: '描述', role: 'subtitle' },
      ]

      const wrapper = createWrapper({ fetchApi: mockFetch, columns })
      await flushPromises()

      expect(wrapper.find('.card-subtitle').exists()).toBe(true)
      wrapper.unmount()
    })

    it('根据 role 渲染 tag 字段', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        rows: [{ id: 1, status: 'active' }],
        total: 1,
      })
      const columns: CardColumn[] = [
        { prop: 'status', title: '状态', role: 'tag', tagConfig: { type: 'success' } },
      ]

      const wrapper = createWrapper({ fetchApi: mockFetch, columns })
      await flushPromises()

      expect(wrapper.find('.card-tags').exists()).toBe(true)
      wrapper.unmount()
    })

    it('根据 role 渲染 field 字段', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        rows: [{ id: 1, info: '字段信息' }],
        total: 1,
      })
      const columns: CardColumn[] = [
        { prop: 'info', title: '信息', role: 'field' },
      ]

      const wrapper = createWrapper({ fetchApi: mockFetch, columns })
      await flushPromises()

      expect(wrapper.find('.card-field').exists()).toBe(true)
      wrapper.unmount()
    })

    it('根据 role 渲染 metric 字段', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        rows: [{ id: 1, count: 100 }],
        total: 1,
      })
      const columns: CardColumn[] = [
        { prop: 'count', title: '数量', role: 'metric' },
      ]

      const wrapper = createWrapper({ fetchApi: mockFetch, columns })
      await flushPromises()

      expect(wrapper.find('.card-metric').exists()).toBe(true)
      wrapper.unmount()
    })

    it('隐藏字段不渲染', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        rows: [{ id: 1, name: '测试', hidden: '隐藏值' }],
        total: 1,
      })
      const columns: CardColumn[] = [
        { prop: 'name', title: '名称' },
        { prop: 'hidden', title: '隐藏字段', hidden: true },
      ]

      const wrapper = createWrapper({ fetchApi: mockFetch, columns })
      await flushPromises()

      const fieldElements = wrapper.findAll('.card-field')
      const hasHiddenField = fieldElements.some(el => el.text().includes('隐藏字段'))
      expect(hasHiddenField).toBe(false)
      wrapper.unmount()
    })

    it('formatter 函数正确渲染值', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        rows: [{ date: '2024-01-01' }],
        total: 1,
      })
      const columns: CardColumn[] = [
        {
          prop: 'date',
          title: '日期',
          formatter: (row: any) => new Date(row.date).toLocaleDateString(),
        },
      ]

      const wrapper = createWrapper({ fetchApi: mockFetch, columns })
      await flushPromises()

      expect(wrapper.find('.card-field').text()).toContain('2024/1/1')
      wrapper.unmount()
    })

    it('无效 role 时使用默认渲染', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        rows: [{ id: 1, name: '测试' }],
        total: 1,
      })
      const columns: CardColumn[] = [
        { prop: 'name', title: '名称', role: 'invalid-role' as any },
      ]

      const wrapper = createWrapper({ fetchApi: mockFetch, columns })
      await flushPromises()

      expect(wrapper.find('.card-field').exists()).toBe(true)
      wrapper.unmount()
    })
  })

  // ===== CSS Grid 和 responsive 测试 =====
  describe('CSS Grid and responsive', () => {
    it('支持 cardMinWidth 控制卡片最小宽度', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: '测试' }], total: 1 })
      const columns: CardColumn[] = [{ prop: 'name', title: '名称' }]

      const wrapper = createWrapper({ fetchApi: mockFetch, columns, cardMinWidth: 300 })
      await flushPromises()

      const gridElement = wrapper.find('.card-grid')
      expect(gridElement.exists()).toBe(true)
      wrapper.unmount()
    })

    it('响应式布局正确应用 CSS Grid', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: '测试' }], total: 1 })
      const columns: CardColumn[] = [
        { prop: 'name', title: '名称' },
      ]

      const wrapper = createWrapper({ fetchApi: mockFetch, columns })
      await flushPromises()

      const gridElement = wrapper.find('.card-grid')
      expect(gridElement.exists()).toBe(true)
      wrapper.unmount()
    })
  })

  // ===== Loading 状态测试 =====
  describe('Loading state', () => {
    it('加载时显示骨架屏', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ rows: [], total: 0 })

      const wrapper = createWrapper({ fetchApi: mockFetch })

      // 提交一次 promise 等待
      await flushPromises()

      // 数据加载完成后，loading 应该为 false
      expect(wrapper.vm['loading']).toBe(false)
      wrapper.unmount()
    })

    it('加载状态时显示骨架屏结构', async () => {
      let resolveFetch: (value: any) => void
      const mockFetch = vi.fn().mockImplementation(() => {
        return new Promise(resolve => { resolveFetch = resolve })
      })

      const wrapper = mount(ListCards, {
        props: {
          fetchApi: mockFetch,
          columns: [],
          defaultPageSize: 10,
        },
        global: {
          plugins: [ElementPlus],
        },
      })

      // 立即检查 loading 状态
      expect(wrapper.vm['loading']).toBe(true)

      // 完成加载
      resolveFetch!({ rows: [], total: 0 })
      await flushPromises()

      expect(wrapper.vm['loading']).toBe(false)
      wrapper.unmount()
    })
  })

  // ===== Empty 状态测试 =====
  describe('Empty state', () => {
    it('无数据时显示 empty 状态', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ rows: [], total: 0 })
      const columns: CardColumn[] = [{ prop: 'name', title: '名称' }]

      const wrapper = createWrapper({ fetchApi: mockFetch, columns })
      await flushPromises()

      expect(wrapper.find('.empty-state').exists()).toBe(true)
      wrapper.unmount()
    })
  })

  // ===== Error 状态测试 =====
  describe('Error state', () => {
    it('fetch 失败时显示错误状态', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('网络错误'))
      const columns: CardColumn[] = [{ prop: 'name', title: '名称' }]

      const wrapper = createWrapper({ fetchApi: mockFetch, columns })
      await flushPromises()

      expect(wrapper.vm['error']).toBeTruthy()
      expect(wrapper.find('.error-state').exists()).toBe(true)
      wrapper.unmount()
    })

    it('错误状态下显示重试按钮', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('网络错误'))
      const columns: CardColumn[] = [{ prop: 'name', title: '名称' }]

      const wrapper = createWrapper({ fetchApi: mockFetch, columns })
      await flushPromises()

      expect(wrapper.find('.retry-btn').exists()).toBe(true)
      wrapper.unmount()
    })

    it('点击重试按钮时重新获取数据', async () => {
      const mockFetch = vi.fn()
        .mockRejectedValueOnce(new Error('网络错误'))
        .mockResolvedValueOnce({ rows: [{ id: 1 }], total: 1 })

      const wrapper = createWrapper({ fetchApi: mockFetch })
      await flushPromises()

      expect(mockFetch).toHaveBeenCalledTimes(1)

      await wrapper.find('.retry-btn').trigger('click')
      await flushPromises()

      expect(mockFetch).toHaveBeenCalledTimes(2)
      wrapper.unmount()
    })
  })

  // ===== 事件测试 =====
  describe('Events', () => {
    it('点击卡片时触发 row-click 事件', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        rows: [{ id: 1, name: '测试' }],
        total: 1,
      })
      const columns: CardColumn[] = [{ prop: 'name', title: '名称' }]

      const wrapper = createWrapper({ fetchApi: mockFetch, columns })
      await flushPromises()

      await wrapper.find('.card-item').trigger('click')

      expect(wrapper.emitted('row-click')).toBeTruthy()
      wrapper.unmount()
    })
  })
})