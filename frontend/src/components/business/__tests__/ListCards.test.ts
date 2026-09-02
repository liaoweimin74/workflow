// ----- TDD: ListCards 类型合同测试 -----
// npx vitest run src/components/business/__tests__/ListCards.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import type { CardColumn, ListQueryParams, ListPageResult } from '../types'
import ListCards from '../ListCards.vue'

// ===== 类型测试 =====
describe('CardColumn 类型定义 - 行字段配置', () => {
  it('应该支持 title 字段（卡片标题）', () => {
    const column: CardColumn = {
      title: '名称',
      prop: 'name',
    }
    expect(column.title).toBe('名称')
    expect(column.prop).toBe('name')
  })

  it('应该支持 subtitle 字段（卡片副标题）', () => {
    const column: CardColumn = {
      subtitle: '创建时间',
      prop: 'createdAt',
    }
    expect(column.subtitle).toBe('创建时间')
  })

  it('应该支持 tag 字段（卡片标签）', () => {
    const column: CardColumn = {
      tag: 'status',
      prop: 'status',
    }
    expect(column.tag).toBe('status')
  })

  it('应该支持 role 字段控制渲染角色', () => {
    const titleCol: CardColumn = { prop: 'name', role: 'title' }
    const tagCol: CardColumn = { prop: 'status', role: 'tag' }
    expect(titleCol.role).toBe('title')
    expect(tagCol.role).toBe('tag')
  })

  it('应该支持 hidden 字段控制隐藏', () => {
    const column: CardColumn = { prop: 'secret', hidden: true }
    expect(column.hidden).toBe(true)
  })
})

describe('ListQueryParams 类型', () => {
  it('应该包含 page 和 size 字段', () => {
    const params: ListQueryParams = {
      page: 1,
      size: 10,
    }
    expect(params.page).toBe(1)
    expect(params.size).toBe(10)
  })
})

describe('ListPageResult 类型', () => {
  interface Order {
    id: number
    orderNo: string
    amount: number
  }

  it('应该包含 rows 和 total 字段', () => {
    const result: ListPageResult<Order> = {
      rows: [
        { id: 1, orderNo: 'ORD001', amount: 100 },
        { id: 2, orderNo: 'ORD002', amount: 200 },
      ],
      total: 100,
    }
    expect(result.rows[0].orderNo).toBe('ORD001')
    expect(result.rows[1].amount).toBe(200)
  })

  it('当 rows 为空时应该正确工作', () => {
    const result: ListPageResult = {
      rows: [],
      total: 0,
    }
    expect(result.rows).toEqual([])
    expect(result.total).toBe(0)
  })
})

// ===== 组件测试 =====
describe('ListCards 组件', () => {
  function createWrapper(props: {
    columns?: CardColumn[]
    fetchApi?: (params: ListQueryParams) => Promise<ListPageResult>
    defaultPageSize?: number
    showPagination?: boolean
    actions?: Array<{ key: string; label: string; style?: string; icon?: string; type?: string }>
    groupBy?: string
  }) {
    return mount(ListCards, {
      props: {
        columns: props.columns || [],
        fetchApi: props.fetchApi || (() => Promise.resolve({ rows: [], total: 0 })),
        ...props,
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          'el-pagination': {
            props: ['currentPage', 'pageSize', 'total', 'pageSizes'],
            emits: ['update:currentPage', 'update:pageSize', 'current-change', 'size-change'],
            template: '<div class="stub-pagination" :data-current-page="currentPage" :data-page-size="pageSize" :data-total="total"><button class="next-page" @click="$emit(\'current-change\', currentPage + 1)">next</button></div>',
          },
        },
      },
    })
  }

  it('初始化时调用 fetchApi', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: 'A' }], total: 1 })
    const wrapper = createWrapper({ fetchApi: mockFetch })
    await flushPromises()
    expect(mockFetch).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('渲染卡片数据', async () => {
    const testData = [{ id: 1, name: '测试' }]
    const mockFetch = vi.fn().mockResolvedValue({ rows: testData, total: 1 })
    const columns: CardColumn[] = [{ prop: 'name', title: '名称' }]
    const wrapper = createWrapper({ fetchApi: mockFetch, columns })
    await flushPromises()
    expect(wrapper.vm['rows']).toHaveLength(1)
    wrapper.unmount()
  })

  it('支持 title 角色渲染卡片标题', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: '测试卡片' }], total: 1 })
    const columns: CardColumn[] = [{ prop: 'name', role: 'title' }]
    const wrapper = createWrapper({ fetchApi: mockFetch, columns })
    await flushPromises()
    expect(wrapper.find('.card-title').exists()).toBe(true)
    wrapper.unmount()
  })

  it('支持 tag 角色渲染标签', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, status: 'active' }], total: 1 })
    const columns: CardColumn[] = [{ prop: 'status', role: 'tag' }]
    const wrapper = createWrapper({ fetchApi: mockFetch, columns })
    await flushPromises()
    expect(wrapper.find('.card-tags').exists()).toBe(true)
    wrapper.unmount()
  })

  it('隐藏字段不渲染', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      rows: [{ id: 1, name: '测试', secret: '隐藏值' }],
      total: 1
    })
    const columns: CardColumn[] = [
      { prop: 'name', title: '名称' },
      { prop: 'secret', title: '密钥', hidden: true },
    ]
    const wrapper = createWrapper({ fetchApi: mockFetch, columns })
    await flushPromises()
    const fieldElements = wrapper.findAll('.card-field')
    const names = fieldElements.map(el => el.text())
    expect(names.some(t => !t.includes('密钥'))).toBe(true)
    wrapper.unmount()
  })

  it('支持 formatter 渲染', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      rows: [{ date: '2024-01-01' }],
      total: 1
    })
    const columns: CardColumn[] = [{
      prop: 'date',
      formatter: (row: any) => new Date(row.date).toLocaleDateString(),
    }]
    const wrapper = createWrapper({ fetchApi: mockFetch, columns })
    await flushPromises()
    expect(wrapper.find('.card-field').text()).toContain('2024')
    wrapper.unmount()
  })

  it('点击卡片触发 row-click 事件', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1 }], total: 1 })
    const wrapper = createWrapper({ fetchApi: mockFetch })
    await flushPromises()
    await wrapper.find('.card-item').trigger('click')
    expect(wrapper.emitted('row-click')).toBeTruthy()
    wrapper.unmount()
  })

  it('空数据时显示空状态', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ rows: [], total: 0 })
    const wrapper = createWrapper({ fetchApi: mockFetch })
    await flushPromises()
    expect(wrapper.find('.empty-state').exists()).toBe(true)
    wrapper.unmount()
  })

  it('错误时显示错误状态', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('网络错误'))
    const wrapper = createWrapper({ fetchApi: mockFetch })
    await flushPromises()
    expect(wrapper.vm['error']).toBeTruthy()
    expect(wrapper.find('.error-state').exists()).toBe(true)
    wrapper.unmount()
  })

  it('支持 cardMinWidth 控制宽度', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1 }], total: 1 })
    const wrapper = createWrapper({ fetchApi: mockFetch, cardMinWidth: 300 })
    await flushPromises()
    expect(wrapper.find('.card-grid').exists()).toBe(true)
    wrapper.unmount()
  })

  it('显示分页并在切换页码时携带 page 和 size 查询', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 1 }], total: 25 })
      .mockResolvedValueOnce({ rows: [{ id: 11 }], total: 25 })
    const wrapper = createWrapper({ fetchApi: mockFetch, defaultPageSize: 10 })
    await flushPromises()

    expect(wrapper.find('.stub-pagination').exists()).toBe(true)
    expect(wrapper.find('.stub-pagination').attributes('data-current-page')).toBe('1')
    await wrapper.find('.next-page').trigger('click')
    await flushPromises()
    expect(mockFetch).toHaveBeenLastCalledWith({ page: 2, size: 10 })
    wrapper.unmount()
  })

  it('showPagination=false 时不渲染分页控件', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1 }], total: 25 })
    const wrapper = createWrapper({ fetchApi: mockFetch, showPagination: false })
    await flushPromises()

    expect(wrapper.find('.stub-pagination').exists()).toBe(false)
    wrapper.unmount()
  })

  it('渲染卡片操作区并在点击操作时阻止卡片点击', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: '订单' }], total: 1 })
    const wrapper = createWrapper({
      fetchApi: mockFetch,
      actions: [{ key: 'edit', label: '编辑' }],
    })
    await flushPromises()

    await wrapper.find('.card-action-edit').trigger('click')
    expect(wrapper.emitted('action-click')?.[0]).toEqual([{ key: 'edit', label: '编辑' }, { id: 1, name: '订单' }])
    expect(wrapper.emitted('row-click')).toBeUndefined()
    wrapper.unmount()
  })

  it('style=button 时渲染为带图标+文字的普通按钮', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: '订单' }], total: 1 })
    const wrapper = createWrapper({
      fetchApi: mockFetch,
      actions: [{ key: 'edit', label: '编辑', style: 'button', icon: 'Edit' }],
    })
    await flushPromises()

    const btn = wrapper.find('.card-action-edit')
    expect(btn.exists()).toBe(true)
    // 普通按钮（非圆形、非文字链接）
    expect(btn.classes()).not.toContain('is-circle')
    expect(btn.classes()).not.toContain('is-link')
    // 渲染图标 + 文字
    expect(btn.find('.el-icon').exists()).toBe(true)
    expect(btn.text()).toContain('编辑')
    wrapper.unmount()
  })

  it('style=icon 时渲染为仅图标的圆形按钮', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: '订单' }], total: 1 })
    const wrapper = createWrapper({
      fetchApi: mockFetch,
      actions: [{ key: 'delete', label: '删除', style: 'icon', icon: 'Delete' }],
    })
    await flushPromises()

    const btn = wrapper.find('.card-action-delete')
    expect(btn.exists()).toBe(true)
    // 圆形仅图标按钮
    expect(btn.classes()).toContain('is-circle')
    expect(btn.find('.el-icon').exists()).toBe(true)
    expect(btn.text()).not.toContain('删除') // 无文字，仅图标
    wrapper.unmount()
  })

  it('style=text 时渲染为文字链接按钮（带可选图标）', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: '订单' }], total: 1 })
    const wrapper = createWrapper({
      fetchApi: mockFetch,
      actions: [{ key: 'view', label: '查看', style: 'text' }],
    })
    await flushPromises()

    const btn = wrapper.find('.card-action-view')
    expect(btn.exists()).toBe(true)
    // 文字链接按钮
    expect(btn.classes()).toContain('is-link')
    expect(btn.text()).toContain('查看')
    wrapper.unmount()
  })

  it('action-click 仍携带完整 action（含 style/icon）', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 7, name: '订单' }], total: 1 })
    const wrapper = createWrapper({
      fetchApi: mockFetch,
      actions: [{ key: 'edit', label: '编辑', style: 'text', icon: 'Edit' }],
    })
    await flushPromises()
    await wrapper.find('.card-action-edit').trigger('click')
    expect(wrapper.emitted('action-click')?.[0]).toEqual([{ key: 'edit', label: '编辑', style: 'text', icon: 'Edit' }, { id: 7, name: '订单' }])
    wrapper.unmount()
  })

  it('按 groupBy 分组渲染卡片，并保持每组横向自动换行网格', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      rows: [{ id: 1, team: '研发', name: '甲' }, { id: 2, team: '设计', name: '乙' }, { id: 3, team: '研发', name: '丙' }],
      total: 3,
    })
    const wrapper = createWrapper({ fetchApi: mockFetch, groupBy: 'team' })
    await flushPromises()

    expect(wrapper.findAll('.card-group')).toHaveLength(2)
    expect(wrapper.findAll('.card-grid').length).toBe(2)
    expect(wrapper.find('.card-grid').attributes('style')).toContain('repeat(auto-fill')
    wrapper.unmount()
  })

  it('按列配置渲染字体样式', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: '订单' }], total: 1 })
    const wrapper = createWrapper({
      fetchApi: mockFetch,
      columns: [{ prop: 'name', label: '名称', fontFamily: 'Microsoft YaHei', fontSize: 18, fontWeight: 700, fontColor: '#123456' }],
    })
    await flushPromises()

    const fieldValue = wrapper.find('.field-value')
    expect(fieldValue.attributes('style')).toMatch(/font-family:\s*["']?Microsoft YaHei["']?/)
    expect(fieldValue.attributes('style')).toContain('font-size: 18px')
    expect(fieldValue.attributes('style')).toContain('font-weight: 700')
    expect(fieldValue.attributes('style')).toContain('color: rgb(18, 52, 86)')
    wrapper.unmount()
  })

  it('支持隐藏字段标签并按标签位置和样式语法渲染', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: '订单' }], total: 1 })
    const wrapper = createWrapper({
      fetchApi: mockFetch,
      columns: [{
        prop: 'name', label: '名称', showLabel: false, labelPosition: 'top', align: 'right',
        style: 'border: 1px solid red; background: rgb(1, 2, 3);',
      }],
    })
    await flushPromises()

    expect(wrapper.find('.field-label').exists()).toBe(false)
    expect(wrapper.find('.card-field').attributes('style')).toContain('text-align: right')
    expect(wrapper.find('.field-value').attributes('style')).toContain('border: 1px solid red')
    wrapper.unmount()
  })
})
