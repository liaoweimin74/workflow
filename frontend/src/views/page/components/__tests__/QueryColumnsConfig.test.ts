// ----- TDD: QueryColumnsConfig 查询条件 + 展示列 合并单表配置 -----
// npx vitest run src/views/page/components/__tests__/QueryColumnsConfig.test.ts

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import QueryColumnsConfig from '../QueryColumnsConfig.vue'

const candidates = [
  { key: 'name', label: '姓名', columnType: 'VARCHAR', length: 50, indexed: true, hidden: false },
  { key: 'age', label: '年龄', columnType: 'INT', length: null, indexed: true, hidden: false },
  { key: 'content', label: '内容', columnType: 'TEXT', length: null, indexed: false, hidden: false },
  { key: 'remark_hidden', label: '隐藏备注', columnType: 'VARCHAR', length: 50, indexed: false, hidden: true },
]

// 父组件（ViewDesigner）已过滤隐藏列/不可筛选列，此处模拟过滤后的候选
const visibleCandidates = candidates.filter((c) => !c.hidden)

function createWrapper(searchFields: any[] = [], columns: any[] = []) {
  return mount(QueryColumnsConfig, {
    props: { candidates: visibleCandidates, searchFields, columns },
    global: { plugins: [ElementPlus] },
  })
}

describe('QueryColumnsConfig — 单表同时配置查询条件与展示列', () => {
  it('表格渲染所有候选列（每行一个字段）', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const rows = wrapper.findAll('.el-table__row')
    expect(rows.length).toBe(visibleCandidates.length)
    // 表格含查询/展示列头
    expect(wrapper.find('.el-table').exists()).toBe(true)
    wrapper.unmount()
  })

  it('勾选查询条件 → update:searchFields 收到 {key,label,matchType}', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const vm = wrapper.vm as any
    vm.toggleSearch(candidates[0], true)
    await nextTick()
    const emitted = wrapper.emitted('update:searchFields') as any[]
    expect(emitted).toBeTruthy()
    expect(emitted[emitted.length - 1][0]).toEqual([
      { key: 'name', label: '姓名', matchType: 'eq' },
    ])
    wrapper.unmount()
  })

  it('勾选展示列 → update:columns 收到 {key,label,width,align}', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const vm = wrapper.vm as any
    vm.toggleColumn(candidates[0], true)
    await nextTick()
    const emitted = wrapper.emitted('update:columns') as any[]
    expect(emitted).toBeTruthy()
    expect(emitted[emitted.length - 1][0]).toEqual([
      { key: 'name', label: '姓名', width: 130, align: 'left' },
    ])
    wrapper.unmount()
  })

  it('查询条件修改匹配方式 → 更新 searchFields 对应项', async () => {
    const wrapper = createWrapper([{ key: 'name', label: '姓名', matchType: 'eq' }], [])
    await nextTick()
    const vm = wrapper.vm as any
    vm.setSearchMatchType('name', 'like')
    await nextTick()
    const emitted = wrapper.emitted('update:searchFields') as any[]
    expect(emitted[emitted.length - 1][0]).toEqual([
      { key: 'name', label: '姓名', matchType: 'like' },
    ])
    wrapper.unmount()
  })

  it('展示列修改宽度/对齐 → 更新 columns 对应项（逐次 emit）', async () => {
    const wrapper = createWrapper(
      [],
      [{ key: 'name', label: '姓名', width: 130, align: 'left' }],
    )
    await nextTick()
    const vm = wrapper.vm as any
    vm.setColumnProp('name', 'width', 200)
    await nextTick()
    let emitted = wrapper.emitted('update:columns') as any[]
    expect(emitted[emitted.length - 1][0]).toEqual([
      { key: 'name', label: '姓名', width: 200, align: 'left' },
    ])

    vm.setColumnProp('name', 'align', 'center')
    await nextTick()
    emitted = wrapper.emitted('update:columns') as any[]
    expect(emitted[emitted.length - 1][0][0].align).toBe('center')
    expect(emitted[emitted.length - 1][0][0].width).toBe(130)
    wrapper.unmount()
  })

  it('取消查询勾选 → 从 searchFields 移除', async () => {
    const wrapper = createWrapper([{ key: 'name', label: '姓名', matchType: 'eq' }], [])
    await nextTick()
    const vm = wrapper.vm as any
    vm.toggleSearch(candidates[0], false)
    await nextTick()
    const emitted = wrapper.emitted('update:searchFields') as any[]
    expect(emitted[emitted.length - 1][0]).toEqual([])
    wrapper.unmount()
  })

  it('同字段可同时勾选查询与展示（互不干扰）', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const vm = wrapper.vm as any
    vm.toggleSearch(candidates[0], true)
    vm.toggleColumn(candidates[0], true)
    await nextTick()
    const searchEmit = (wrapper.emitted('update:searchFields') as any[]).slice(-1)[0][0]
    const colEmit = (wrapper.emitted('update:columns') as any[]).slice(-1)[0][0]
    expect(searchEmit).toHaveLength(1)
    expect(colEmit).toHaveLength(1)
    expect(searchEmit[0].key).toBe('name')
    expect(colEmit[0].key).toBe('name')
    wrapper.unmount()
  })

  it('filterableKeys 之外的列：查询勾选禁用（isFilterable=false），展示不受限', async () => {
    const wrapper = mount(QueryColumnsConfig, {
      props: {
        candidates: visibleCandidates,
        searchFields: [],
        columns: [],
        filterableKeys: new Set(['name']),
      },
      global: { plugins: [ElementPlus] },
    })
    await nextTick()
    const vm = wrapper.vm as any
    // name 可筛选；content（TEXT）不可筛选
    expect(vm.isFilterable('name')).toBe(true)
    expect(vm.isFilterable('content')).toBe(false)
    // 不可筛选字段即使调用 toggleSearch 也不加入 searchFields
    vm.toggleSearch(candidates[2], true) // content
    await nextTick()
    expect(wrapper.emitted('update:searchFields')).toBeUndefined()
    // 但展示列不受限制
    vm.toggleColumn(candidates[2], true)
    await nextTick()
    const colEmit = (wrapper.emitted('update:columns') as any[]).slice(-1)[0][0]
    expect(colEmit[0].key).toBe('content')
    wrapper.unmount()
  })

  it('filterableKeys 未配置时全部可筛选（默认行为）', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.isFilterable('content')).toBe(true)
    wrapper.unmount()
  })
})
