// ----- TDD: ListCards 类型合同测试 -----
// npx vitest run src/components/business/__tests__/ListCards.test.ts

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import type { CardColumn, ListQueryParams, ListPageResult, SearchField } from '../types'
import type { CardStyle } from '../ListCards.types'
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
  it('将卡片内容放在查询栏与分页栏之间的独立可滚动数据区', () => {
    const source = readFileSync(resolve(__dirname, '../ListCards.vue'), 'utf8')

    expect(source).toContain('<div class="card-data-area">')
    expect(source).toContain('.card-data-area { flex: 1; min-height: 0; overflow-y: auto; }')
    expect(source).toContain('.card-pagination { align-self: flex-end; flex-shrink: 0;')
    expect(source).toContain('.list-cards { width: 100%; height: 100%; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }')
    expect(source).not.toContain('.card-groups { flex: 1; min-height: 0; overflow-y: auto;')
  })

  it('渲染 toolbarButtons 到查询栏上方的工具栏', async () => {
    const wrapper = createWrapper({
      toolbarButtons: [{ key: 'create', label: '新增', type: 'primary' }],
    } as any)
    await flushPromises()

    expect(wrapper.find('.card-toolbar').exists()).toBe(true)
    expect(wrapper.find('.card-toolbar-create').text()).toContain('新增')
    wrapper.unmount()
  })

  it('工具栏样式与数据表格一致：固定高度、左对齐、8px 间距和 12px 底部间距', () => {
    const source = readFileSync(resolve(__dirname, '../ListCards.vue'), 'utf8')

    expect(source).toMatch(/\.card-toolbar\s*\{[^}]*flex-shrink:\s*0;[^}]*margin:\s*20px 16px 12px;[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*gap:\s*8px;/s)
    expect(source).toContain(':size="action.size || \'default\'"')
    expect(source).toContain(':link="action.link"')
    expect(source).toContain('circle')
  })

  it('工具栏间距对齐 SearchTable 的 table-card body', () => {
    const source = readFileSync(resolve(__dirname, '../ListCards.vue'), 'utf8')

    expect(source).toMatch(/\.card-toolbar\s*\{[^}]*flex-shrink:\s*0;[^}]*margin:\s*20px 16px 12px;/s)
    expect(source).toMatch(/\.search-card\s*\{[^}]*flex-shrink:\s*0;[^}]*margin-bottom:\s*16px\s*!important;/s)
  })

  it('工具栏按钮重置外边距避免与 el-button 默认间距叠加', () => {
    const source = readFileSync(resolve(__dirname, '../ListCards.vue'), 'utf8')

    expect(source).toContain('.card-toolbar .el-button { margin: 0; }')
  })

  it('查询栏与操作栏相邻时不叠加顶部外边距（对齐 SearchTable 16px 间距）', () => {
    const source = readFileSync(resolve(__dirname, '../ListCards.vue'), 'utf8')

    // 查询栏在上、操作栏在下：查询栏 margin-bottom(16px) 与操作栏 margin-top(20px) 会叠加成 36px；
    // 须用兄弟选择器在相邻时取消操作栏顶部外边距，保持与 SearchTable 一致的单边 16px 间距
    expect(source).toMatch(/\.search-card\s*\+\s*\.card-toolbar\s*\{[^}]*margin-top:\s*0;/s)
  })

  it('查询栏查询和重置按钮默认使用圆形图标按钮', () => {
    const source = readFileSync(resolve(__dirname, '../ListCards.vue'), 'utf8')

    expect(source).toContain('<el-button type="primary" :icon="Search" circle size="small"')
    expect(source).toContain('<el-button :icon="Refresh" circle size="small"')
    expect(source).not.toContain('<el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>')
    expect(source).not.toContain('<el-button :icon="Refresh" @click="handleReset">重置</el-button>')
  })

  function createWrapper(props: {
    columns?: CardColumn[]
    fetchApi?: (params: ListQueryParams) => Promise<ListPageResult>
    defaultPageSize?: number
    showPagination?: boolean
    actions?: Array<{ key: string; label: string; style?: string; icon?: string; type?: string }>
    groupBy?: string
    collapsibleGroups?: boolean
    actionsPlacement?: 'top' | 'bottom' | 'right'
    searchFields?: SearchField[]
    showSearch?: boolean
    pageSizes?: number[]
    formStyle?: Record<string, string>
    style?: CardStyle
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
             template: '<div class="stub-pagination" :data-current-page="currentPage" :data-page-size="pageSize" :data-total="total"><button class="next-page" @click="$emit(\'current-change\', currentPage + 1)">next</button><button class="change-size" @click="$emit(\'size-change\', 20)">size</button></div>',
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

  it('collapsibleGroups=false（默认）时分组标题为纯文本无折叠按钮', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, team: '研发', name: '甲' }], total: 1 })
    const wrapper = createWrapper({ fetchApi: mockFetch, groupBy: 'team' })
    await flushPromises()

    expect(wrapper.find('.card-group-title').text()).toBe('研发')
    expect(wrapper.find('.card-group-toggle').exists()).toBe(false)
    wrapper.unmount()
  })

  it('collapsibleGroups=true 时分组标题渲染折叠按钮，点击后折叠该组卡片网格', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      rows: [{ id: 1, team: '研发', name: '甲' }, { id: 2, team: '设计', name: '乙' }],
      total: 2,
    })
    const wrapper = createWrapper({ fetchApi: mockFetch, groupBy: 'team', collapsibleGroups: true })
    await flushPromises()

    // 每个分组标题都有折叠按钮；默认展开（分组网格可见）
    expect(wrapper.findAll('.card-group-toggle').length).toBe(2)
    expect(wrapper.findAll('.card-grid')).toHaveLength(2)

    // 点击第一个分组折叠按钮 → 该分组网格隐藏（v-show 置 display:none），另一组仍展开
    await wrapper.findAll('.card-group-toggle')[0].trigger('click')
    await flushPromises()
    const grids = wrapper.findAll('.card-grid')
    const displayed = grids.filter((el) => (el.element as HTMLElement).style.display !== 'none')
    expect(displayed.length).toBe(1)
    // 被折叠分组标题带 is-collapsed 标记
    wrapper.findAll('.card-group-title').forEach((title, i) => {
      if (i === 0) expect(title.classes()).toContain('is-collapsed')
      else expect(title.classes()).not.toContain('is-collapsed')
    })
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

  it('actionsPlacement 默认 bottom：卡片带 bottom 位置类，含内容与操作区', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: '订单' }], total: 1 })
    const wrapper = createWrapper({
      fetchApi: mockFetch,
      actions: [{ key: 'edit', label: '编辑', style: 'text' }],
    })
    await flushPromises()

    const card = wrapper.find('.card-item')
    expect(card.classes()).toContain('actions-placement-bottom')
    expect(card.find('.card-content').exists()).toBe(true)
    expect(card.find('.card-actions').exists()).toBe(true)
    wrapper.unmount()
  })

  it('actionsPlacement=top 时卡片带 top 位置类，操作区渲染', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: '订单' }], total: 1 })
    const wrapper = createWrapper({
      fetchApi: mockFetch,
      actions: [{ key: 'edit', label: '编辑', style: 'text' }],
      actionsPlacement: 'top',
    })
    await flushPromises()

    const card = wrapper.find('.card-item')
    expect(card.classes()).toContain('actions-placement-top')
    // 内容与操作区均渲染，卡片为 flex column（order 视觉排序交由样式控制）
    expect(card.find('.card-content').exists()).toBe(true)
    expect(card.find('.card-actions').exists()).toBe(true)
    expect(card.classes()).not.toContain('actions-placement-right')
    wrapper.unmount()
  })

  it('actionsPlacement=right 时卡片为横向布局，操作区在右侧纵向排列', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: '订单' }], total: 1 })
    const wrapper = createWrapper({
      fetchApi: mockFetch,
      actions: [
        { key: 'edit', label: '编辑', style: 'text' },
        { key: 'delete', label: '删除', style: 'text' },
      ],
      actionsPlacement: 'right',
    })
    await flushPromises()

    const card = wrapper.find('.card-item')
    expect(card.classes()).toContain('actions-placement-right')
    const actionsEl = card.find('.card-actions')
    expect(actionsEl.attributes('style')).toContain('flex-direction: column')
    wrapper.unmount()
  })

  // ===== RED→GREEN: 无 formatter 的列应内置解析 contentType 模板（对齐 PageRenderer 的 renderCellContent）=====
  describe('contentType 模板渲染（无 formatter 调用方，如 PageDataCards 页面卡片）', () => {
    it('contentType=template 的列渲染 ${ name }(${ dept }) 插值', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: '张三', dept: '设备部' }], total: 1 })
      const columns: CardColumn[] = [{
        prop: 'name',
        label: '人员',
        contentType: 'template',
        contentValue: '${name}(${dept})',
      } as CardColumn]
      const wrapper = createWrapper({ fetchApi: mockFetch, columns })
      await flushPromises()

      expect(wrapper.find('.field-value').text()).toContain('张三(设备部)')
      wrapper.unmount()
    })

    it('contentType=template 按 title 角色渲染时同样插值', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: '李四', dept: '设计部' }], total: 1 })
      const columns: CardColumn[] = [{
        prop: 'name',
        role: 'title',
        contentType: 'template',
        contentValue: '${name}(${dept})',
      } as CardColumn]
      const wrapper = createWrapper({ fetchApi: mockFetch, columns })
      await flushPromises()

      expect(wrapper.find('.card-title').text()).toContain('李四(设计部)')
      wrapper.unmount()
    })

    it('无 contentType 的普通字段仍显示原始值（不受影响）', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: '商品' }], total: 1 })
      const columns: CardColumn[] = [{ prop: 'name', label: '名称' }]
      const wrapper = createWrapper({ fetchApi: mockFetch, columns })
      await flushPromises()

      expect(wrapper.find('.field-value').text()).toContain('商品')
      wrapper.unmount()
    })
  })
  // ===== RED→GREEN: 查询栏与 page-size 变化 (Task 1) =====
  describe('查询栏与分页', () => {
    const inputFields: SearchField[] = [
      { type: 'input', label: '名称', prop: 'name' },
    ]

    it('showSearch=true 且 searchFields 存在时渲染查询输入框和查询/重置按钮', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: 'A' }], total: 1 })
      const wrapper = createWrapper({
        fetchApi: mockFetch,
        columns: [{ prop: 'name' }],
        showSearch: true,
        searchFields: inputFields,
      })
      await flushPromises()

      // 查询栏可见
      expect(wrapper.find('.search-card').exists()).toBe(true)
      // 输入框存在（el-input 渲染为 .el-input__inner）
      const inputs = wrapper.findAll('.search-card input')
      expect(inputs.length).toBeGreaterThanOrEqual(1)
      // 查询按钮（primary）和重置按钮存在
      const buttons = wrapper.findAll('.search-card .el-button')
      expect(buttons.length).toBeGreaterThanOrEqual(2)
      wrapper.unmount()
    })

    it('showSearch=false 时不渲染查询栏', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1 }], total: 1 })
      const wrapper = createWrapper({
        fetchApi: mockFetch,
        columns: [{ prop: 'name' }],
        showSearch: false,
        searchFields: inputFields,
      })
      await flushPromises()
      expect(wrapper.find('.search-card').exists()).toBe(false)
      wrapper.unmount()
    })

    it('showSearch=true 但 searchFields 为空时不渲染查询栏', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1 }], total: 1 })
      const wrapper = createWrapper({
        fetchApi: mockFetch,
        columns: [{ prop: 'name' }],
        showSearch: true,
        searchFields: [],
      })
      await flushPromises()
      expect(wrapper.find('.search-card').exists()).toBe(false)
      wrapper.unmount()
    })

    it('点击查询按钮时携带字段值、page 重置为 1，且 fetchApi 收到当前 page/size/字段值', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: 1 }], total: 25 })
        .mockResolvedValueOnce({ rows: [{ id: 1 }], total: 25 })
      const wrapper = createWrapper({
        fetchApi: mockFetch,
        columns: [{ prop: 'name' }],
        showSearch: true,
        searchFields: inputFields,
        defaultPageSize: 10,
        pageSizes: [10, 20],
      })
      await flushPromises()

      // 模拟进入第 2 页
      await wrapper.find('.next-page').trigger('click')
      await flushPromises()
      expect(mockFetch).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, size: 10 }))

      // 填入搜索字段并点击查询按钮（第一个 primary 按钮）
      const input = wrapper.find('.search-card input')
      await input.setValue('订单')
      const searchBtn = wrapper.find('.search-card .el-button--primary')
      await searchBtn.trigger('click')
      await flushPromises()

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: '订单', page: 1, size: 10 })
      )
      wrapper.unmount()
    })

    it('点击重置按钮时清空字段值、page 重置为 1', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({ rows: [{ id: 1 }], total: 25 })
        .mockResolvedValue({ rows: [{ id: 1 }], total: 25 })
      const wrapper = createWrapper({
        fetchApi: mockFetch,
        columns: [{ prop: 'name' }],
        showSearch: true,
        searchFields: inputFields,
        defaultPageSize: 10,
      })
      await flushPromises()

      // 填入搜索字段并点击查询
      const input = wrapper.find('.search-card input')
      await input.setValue('订单')
      const searchBtn = wrapper.find('.search-card .el-button--primary')
      await searchBtn.trigger('click')
      await flushPromises()

      // 点击重置按钮（非 primary 的第二个按钮）
      const buttons = wrapper.findAll('.search-card .el-button')
      const resetBtn = buttons[buttons.length - 1]
      await resetBtn.trigger('click')
      await flushPromises()

      // 重置后输入框应清空（el-input modelValue 被清空）
      expect((wrapper.find('.search-card input').element as HTMLInputElement).value).toBe('')
      // fetchApi 最后调用应包含 page=1
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, size: 10 })
      )
      wrapper.unmount()
    })

    it('分页切换到新页码时 fetchApi 收到对应 page', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: 1 }], total: 50 })
        .mockResolvedValueOnce({ rows: [{ id: 11 }], total: 50 })
        .mockResolvedValueOnce({ rows: [{ id: 21 }], total: 50 })
      const wrapper = createWrapper({
        fetchApi: mockFetch,
        columns: [{ prop: 'name' }],
        defaultPageSize: 10,
      })
      await flushPromises()

      // 初始加载后切到第 2 页
      await wrapper.find('.next-page').trigger('click')
      await flushPromises()
      expect(mockFetch).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, size: 10 }))
      wrapper.unmount()
    })

    it('分页切换 page size 时回到第一页并传递新 size', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: 1 }], total: 50 })
        .mockResolvedValueOnce({ rows: [{ id: 11 }], total: 50 })
        .mockResolvedValueOnce({ rows: [{ id: 1 }], total: 50 })
      const wrapper = createWrapper({
        fetchApi: mockFetch,
        columns: [{ prop: 'name' }],
        defaultPageSize: 10,
        pageSizes: [10, 20],
      })
      await flushPromises()
      await wrapper.find('.next-page').trigger('click')
      await flushPromises()
      await wrapper.find('.change-size').trigger('click')
      await flushPromises()

      expect(mockFetch).toHaveBeenLastCalledWith({ page: 1, size: 20 })
      wrapper.unmount()
    })

    it('分页栏位于卡片列表右下角', () => {
      const source = readFileSync(resolve(__dirname, '../ListCards.vue'), 'utf8')
      expect(source).toContain('.card-pagination { align-self: flex-end;')
    })
  })

  // ===== RED→GREEN: form-create 组件级 CSS 样式应用到每张卡片（.card-item）=====
  describe('formStyle（form-create 组件级样式透传）', () => {
    it('formStyle 内联样式应用到每张 card-item 元素', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: '甲' }, { id: 2, name: '乙' }], total: 2 })
      const wrapper = createWrapper({
        fetchApi: mockFetch,
        columns: [{ prop: 'name', label: '名称' }],
        formStyle: { color: 'red', backgroundColor: '#f5f5f5' },
      })
      await flushPromises()

      const cards = wrapper.findAll('.card-item')
      expect(cards.length).toBe(2)
      for (const card of cards) {
        const style = card.attributes('style') || ''
        expect(style).toContain('color: red')
        expect(style).toContain('background-color: rgb(245, 245, 245)')
      }
      wrapper.unmount()
    })

    it('未传 formStyle 时不注入额外内联样式', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: '甲' }], total: 1 })
      const wrapper = createWrapper({ fetchApi: mockFetch, columns: [{ prop: 'name', label: '名称' }] })
      await flushPromises()

      const card = wrapper.find('.card-item')
      expect(card.attributes('style') || '').not.toContain('color: red')
      wrapper.unmount()
    })

    it('通过 PageDataCards.style prop 透传：style 接收 form-create CSS 对象并绑为 formStyle', () => {
      // 源码契约：PageDataCards 将 form-create 传入的 style（CSS 对象）透传给 ListCards.formStyle
      const listCardsSource = readFileSync(resolve(__dirname, '../../../views/page/components/PageDataCards.vue'), 'utf8')
      expect(listCardsSource).toContain(':form-style="style"')
      expect(listCardsSource).toMatch(/style\??:\s*Record<string, string>/)
    })
  })

  // ===== RED→GREEN: CardStyle.css 逃生舱作用于每张卡片 =====
  describe('CardStyle.css 逃生舱（结构化样式）', () => {
    it('CardStyle.css 字符串解析后应用到每张 card-item 内联样式', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: '甲' }], total: 1 })
      const wrapper = createWrapper({
        fetchApi: mockFetch,
        columns: [{ prop: 'name', label: '名称' }],
        style: { css: 'opacity: 0.9; border: 2px dashed red' },
      })
      await flushPromises()

      const card = wrapper.find('.card-item')
      const style = card.attributes('style') || ''
      expect(style).toContain('opacity: 0.9')
      expect(style).toContain('border: 2px dashed red')
      wrapper.unmount()
    })

    it('未配置 CardStyle.css 时不注入逃生舱样式', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: '甲' }], total: 1 })
      const wrapper = createWrapper({ fetchApi: mockFetch, columns: [{ prop: 'name', label: '名称' }] })
      await flushPromises()

      const style = wrapper.find('.card-item').attributes('style') || ''
      expect(style).not.toContain('opacity')
      wrapper.unmount()
    })
  })

  // ===== RED→GREEN: CardStyle.fields 字段区域布局生效 =====
  describe('CardStyle.fields 字段区域布局', () => {
    it('grid 布局与列数注入 .card-fields 容器的 data-layout 与 --fields-columns 变量', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: '甲', dept: '研发' }], total: 1 })
      const wrapper = createWrapper({
        fetchApi: mockFetch,
        columns: [{ prop: 'name', label: '名称' }, { prop: 'dept', label: '部门' }],
        style: { fields: { layout: 'grid', columns: 2, gap: 12 } },
      })
      await flushPromises()

      const fields = wrapper.find('.card-fields')
      expect(fields.attributes('data-layout')).toBe('grid')
      expect(fields.attributes('style') || '').toContain('--fields-columns: 2')
      expect(fields.attributes('style') || '').toContain('--fields-gap: 12px')
      wrapper.unmount()
    })

    it('默认布局为 list（单列堆叠）', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: '甲' }], total: 1 })
      const wrapper = createWrapper({ fetchApi: mockFetch, columns: [{ prop: 'name', label: '名称' }] })
      await flushPromises()

      expect(wrapper.find('.card-fields').attributes('data-layout')).toBe('list')
      wrapper.unmount()
    })
  })

  // ===== RED→GREEN: PageDataCards 透传结构化 cardStyle 到 ListCards :style =====
  describe('PageDataCards cardStyle 透传（结构化 CardStyle）', () => {
    it('PageDataCards 将 cardStyle prop 透传给 ListCards :style（覆盖主题）', () => {
      const source = readFileSync(resolve(__dirname, '../../../views/page/components/PageDataCards.vue'), 'utf8')
      expect(source).toContain(':style="cardStyle"')
      expect(source).toMatch(/cardStyle\??:\s*CardStyle/)
    })
  })
})
