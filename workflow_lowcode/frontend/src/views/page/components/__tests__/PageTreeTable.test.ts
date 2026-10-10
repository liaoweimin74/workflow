/**
 * 树表格 PageTreeTable 单测（Task 3-h）。
 *
 * 覆盖：
 *   - 纯函数层：平铺组树 / 孤儿挂根 / 环引用防护（自指、多节点环、环上悬挂）/ 空数据 / 空 children 剔除
 *   - 组件层：取数参数（全量 vs 设计态 10 条）、树渲染 DOM（层级行/展开）、set-filter 联动重查、row-click 事件
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import PageTreeTable from '../PageTreeTable.vue'
import { buildTreeRows } from '../treeTableShared'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    queryData: vi.fn(),
  },
}))

vi.mock('@/utils/formDsBindingsStore', () => ({
  activeDsBindings: { value: [] },
}))

import { dataSourceApi } from '@/api/data-source'

/** 模拟后端 records：{ id, data, version }（biz-data 平铺形态，不保证树形） */
function record(id: string, data: Record<string, unknown>) {
  return { id, data, version: 1 }
}

const DEPT_RECORDS = [
  record('1', { name: '总公司', parentId: null }),
  record('2', { name: '研发部', parentId: '1' }),
  record('3', { name: '前端组', parentId: '2' }),
  record('4', { name: '孤儿部门', parentId: '999' }), // 父 id 不存在
  record('5', { name: '自环节点', parentId: '5' }), // 自指
]

beforeEach(() => {
  ;(dataSourceApi.queryData as any).mockReset()
})

describe('buildTreeRows（平铺组树纯函数）', () => {
  it('平铺组树：parentKey→idKey 命中挂 children，孤儿/自环挂根，根序=输入序', () => {
    const rows = DEPT_RECORDS.map((r) => ({ ...(r.data as any), id: r.id }))
    const tree = buildTreeRows(rows)
    expect(tree.map((n) => n.id)).toEqual(['1', '4', '5'])
    const root1 = tree[0]
    expect(root1.children.map((c: any) => c.id)).toEqual(['2'])
    expect(root1.children[0].children.map((c: any) => c.id)).toEqual(['3'])
    // 命中链上的节点不应重复出现在根
    expect(tree.find((n) => n.id === '2')).toBeUndefined()
  })

  it('孤儿挂根：父 id 不在集合内 → 根节点', () => {
    const rows = [
      { id: 'a', parentId: 'nope', name: '孤儿' },
      { id: 'b', parentId: null, name: '根' },
    ]
    const tree = buildTreeRows(rows)
    expect(tree.map((n) => n.id).sort()).toEqual(['a', 'b'])
    expect(tree.find((n) => n.id === 'a')?.children).toBeUndefined()
  })

  it('环引用防护：多节点环 + 环上悬挂节点全部断链挂根，不丢行不死循环', () => {
    const rows = [
      { id: 'x', parentId: 'y', name: '环A' },
      { id: 'y', parentId: 'x', name: '环B' },
      { id: 'z', parentId: 'x', name: '挂在环上' },
      { id: 'ok', parentId: null, name: '正常根' },
    ]
    const tree = buildTreeRows(rows)
    // 环成员 x/y 与悬挂者 z 全部成为根；正常根 ok 保留
    expect(tree.map((n) => n.id).sort()).toEqual(['ok', 'x', 'y', 'z'])
    // 断链后不再有 children 引用
    expect(tree.every((n) => !n.children || n.children.length === 0)).toBe(true)
  })

  it('空数据与空 children 剔除：[] → []；叶子节点无 children 字段（避免幽灵展开图标）', () => {
    expect(buildTreeRows([])).toEqual([])
    expect(buildTreeRows(undefined as any)).toEqual([])
    const tree = buildTreeRows([{ id: 1, parentId: null, name: '唯一根' }])
    expect(tree.length).toBe(1)
    expect(tree[0]).not.toHaveProperty('children')
  })

  it('自定义键名与数字 id 归一：idKey/parentKey 可配，数字/字符串键按 String 比较', () => {
    const rows = [
      { uid: 1, up: null, name: '根' },
      { uid: 2, up: 1, name: '子' },
      { uid: 3, up: '2', name: '孙' }, // 字符串父引用命中数字 id
    ]
    const tree = buildTreeRows(rows, { idKey: 'uid', parentKey: 'up' })
    expect(tree.length).toBe(1)
    expect(tree[0].children[0].children[0].name).toBe('孙')
  })
})

describe('PageTreeTable 组件', () => {
  const columns = [
    { key: 'name', label: '名称' },
    { key: 'owner', label: '负责人' },
  ]

  it('运行态全量取数 + 组树渲染 DOM：一级行存在，默认展开第一层后子级行出现', async () => {
    ;(dataSourceApi.queryData as any).mockResolvedValue({ data: { records: DEPT_RECORDS, total: 5 } })
    const wrapper = mount(PageTreeTable, {
      props: { pageKey: 'dept-page', dsRefId: 'ds-dept', columns },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    await nextTick()
    await flushPromises()

    // 运行态查询：size=-1（树需全量），无分页参数
    const query = (dataSourceApi.queryData as any).mock.calls[0][1]
    expect(query.size).toBe(-1)

    // 平铺 5 行 → 树 3 根（1 / 孤儿4 / 自环5）
    expect(((wrapper.vm as any).treeRows as any[]).length).toBe(3)
    // DOM：全部 5 行渲染（1/2/3/4/5；EP 语义：叶子根行不带 --level-0 类，故按总数断言）
    expect(wrapper.findAll('tr.el-table__row').length).toBe(5)
    // 带子节点的根行呈展开图标展开态（默认展开第一层）
    expect(wrapper.findAll('.el-table__expand-icon--expanded').length).toBeGreaterThanOrEqual(1)
    // 展开后子级行（level-1）出现
    expect(wrapper.findAll('.el-table__row--level-1').length).toBeGreaterThanOrEqual(1)
    wrapper.unmount()
  })

  it('default-expand-all：全部层级一次展开', async () => {
    ;(dataSourceApi.queryData as any).mockResolvedValue({
      data: { records: DEPT_RECORDS.filter((r) => r.id !== '4' && r.id !== '5'), total: 3 },
    })
    const wrapper = mount(PageTreeTable, {
      props: { pageKey: 'dept-page', dsRefId: 'ds-dept', columns, defaultExpandAll: true },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    await nextTick()
    await flushPromises()
    // 1 → 2 → 3 三级全部渲染
    expect(wrapper.findAll('.el-table__row--level-0').length).toBe(1)
    expect(wrapper.findAll('.el-table__row--level-1').length).toBe(1)
    expect(wrapper.findAll('.el-table__row--level-2').length).toBe(1)
    wrapper.unmount()
  })

  it('空数据：渲染空态不白屏', async () => {
    ;(dataSourceApi.queryData as any).mockResolvedValue({ data: { records: [], total: 0 } })
    const wrapper = mount(PageTreeTable, {
      props: { pageKey: 'dept-page', dsRefId: 'ds-dept', columns },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('暂无数据')
    expect(wrapper.find('.el-table__empty-block').exists()).toBe(true)
    wrapper.unmount()
  })

  it('设计态取数固定首页 10 条；row-click 事件抛出业务行', async () => {
    ;(dataSourceApi.queryData as any).mockResolvedValue({ data: { records: DEPT_RECORDS, total: 5 } })
    const wrapper = mount(PageTreeTable, {
      props: { pageKey: 'dept-page', dsRefId: 'ds-dept', columns, designMode: true },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    const query = (dataSourceApi.queryData as any).mock.calls[0][1]
    expect(query).toEqual({ page: 1, size: 10 })

    const firstRow = wrapper.find('.el-table__row')
    await firstRow.trigger('click')
    expect(wrapper.emitted('row-click')?.length).toBe(1)
    expect(wrapper.emitted('row-click')?.[0]?.[0]).toMatchObject({ id: '1', name: '总公司' })
    wrapper.unmount()
  })

  it('set-filter 动作：等值条件并入 filter 重查（左树右表联动入口）', async () => {
    ;(dataSourceApi.queryData as any).mockResolvedValue({ data: { records: [], total: 0 } })
    const wrapper = mount(PageTreeTable, {
      props: { pageKey: 'dept-page', dsRefId: 'ds-dept', columns, filter: '{"logic":"AND","conditions":[{"column":"status","op":"eq","value":1}]}' },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    ;(dataSourceApi.queryData as any).mockClear()
    ;(wrapper.vm as any).setFilter({ parentId: '1' })
    await flushPromises()
    expect((dataSourceApi.queryData as any).mock.calls.length).toBe(1)
    const filter = JSON.parse((dataSourceApi.queryData as any).mock.calls[0][1].filter)
    expect(filter.logic).toBe('AND')
    // 静态 filter 条件 + set-filter 条件合并
    expect(filter.conditions).toEqual([
      { column: 'status', op: 'eq', value: 1 },
      { column: 'parentId', op: 'eq', value: '1' },
    ])
    // 清除条件（null）后重查不再带该字段
    ;(dataSourceApi.queryData as any).mockClear()
    ;(wrapper.vm as any).setFilter({ parentId: null })
    await flushPromises()
    const filter2 = JSON.parse((dataSourceApi.queryData as any).mock.calls[0][1].filter)
    expect(filter2.conditions).toEqual([{ column: 'status', op: 'eq', value: 1 }])
    wrapper.unmount()
  })
})
