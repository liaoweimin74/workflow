// ----- TDD: BizDataListPage 新列类型展示适配（subForm hidden 列不进表格/筛选、JSON 列不可筛选、JSON 数组可读展示）-----
// npx vitest run src/views/form/__tests__/BizDataListPage.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'
import BizDataListPage from '../BizDataListPage.vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { formKey: 'emp_profile' }, query: {} }),
  useRouter: () => ({ back: vi.fn() }),
}))

vi.mock('@/api/form', () => ({
  formApi: { getFormDefinitionByKey: vi.fn() },
}))

vi.mock('@/api/bizData', () => ({
  bizDataApi: { referencedCount: vi.fn(), create: vi.fn(), update: vi.fn() },
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, ElMessage: { error: vi.fn() } }
})

import { formApi } from '@/api/form'
import { bizDataApi } from '@/api/bizData'

/** SearchTable 桩：透传 searchFields/columns/fetchApi/formConfig，供测试读取 */
const SearchTableStub = defineComponent({
  props: ['searchFields', 'columns', 'fetchApi', 'formConfig'],
  setup() {
    return () => h('div', { class: 'search-table-stub' })
  },
})

/** 默认 columnConfig：name(VARCHAR 可筛选) + tags(checkbox, JSON) + sub_items(subForm, hidden) */
function defaultColumnConfig() {
  return JSON.stringify([
    { key: 'name', label: '姓名', columnType: 'VARCHAR', length: 64, scale: null, required: false, unique: false, indexed: true },
    { key: 'tags', label: '标签', columnType: 'JSON', length: null, scale: null, required: false, unique: false, indexed: false, componentType: 'checkbox' },
    { key: 'sub_items', label: '子表单', columnType: 'JSON', length: null, scale: null, required: false, unique: false, indexed: false, hidden: true },
  ])
}

function createWrapper(columnConfigStr: string = defaultColumnConfig()) {
  ;(formApi.getFormDefinitionByKey as any).mockResolvedValue({
    data: { name: '员工档案', columnConfig: columnConfigStr, schema: '[]' },
  })
  ;(bizDataApi.referencedCount as any).mockResolvedValue({ data: {} })
  return mount(BizDataListPage, {
    global: {
      plugins: [ElementPlus],
      stubs: { SearchTable: SearchTableStub },
    },
  })
}

describe('BizDataListPage — 新列类型展示适配', () => {
  it('subForm 列（hidden=true）不出现在表格列', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const props = wrapper.findComponent(SearchTableStub).props('columns') as any[]
    expect(props.map((c: any) => c.prop)).not.toContain('sub_items')
    expect(props.map((c: any) => c.prop)).toContain('name')
    wrapper.unmount()
  })

  it('JSON 列不出现在可筛选列（searchFields）', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const props = wrapper.findComponent(SearchTableStub).props('searchFields') as any[]
    expect(props.map((s: any) => s.prop)).not.toContain('tags')
    expect(props.map((s: any) => s.prop)).toContain('name')
    wrapper.unmount()
  })

  it('colorPicker 不出现在搜索栏（searchFields）', async () => {
    const wrapper = createWrapper(JSON.stringify([
      { key: 'name', label: '姓名', columnType: 'VARCHAR', length: 64, scale: null, required: false, unique: false, indexed: true },
      { key: 'color', label: '颜色', columnType: 'VARCHAR', length: 16, scale: null, required: false, unique: false, indexed: false, componentType: 'colorPicker' },
    ]))
    await nextTick()
    await flushPromises()
    const props = wrapper.findComponent(SearchTableStub).props('searchFields') as any[]
    expect(props.map((s: any) => s.prop)).not.toContain('color')
    expect(props.map((s: any) => s.prop)).toContain('name')
    wrapper.unmount()
  })

  it('checkbox JSON 数组值逗号拼接、旧逗号串原样', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const columns = wrapper.findComponent(SearchTableStub).props('columns') as any[]
    const tags = columns.find((c: any) => c.prop === 'tags')
    expect(tags?.render?.({ data: { tags: ['a', 'b'] } })).toBe('a, b')
    expect(tags?.render?.({ data: { tags: 'a,b' } })).toBe('a,b')
    wrapper.unmount()
  })

  it('colorPicker 渲染色块 VNode', async () => {
    const wrapper = createWrapper(JSON.stringify([
      { key: 'color', label: '颜色', columnType: 'VARCHAR', length: 16, scale: null, required: false, unique: false, indexed: false, componentType: 'colorPicker' },
    ]))
    await nextTick()
    await flushPromises()
    const columns = wrapper.findComponent(SearchTableStub).props('columns') as any[]
    const color = columns.find((c: any) => c.prop === 'color')
    const vnode = color?.render?.({ data: { color: '#2E73FF' } })
    expect((vnode as any)?.type).toBe('div')
    wrapper.unmount()
  })

  it('signaturePad/fcEditor 隐藏列不出现在表格列；穿梭框/树/级联/树形选择非隐藏且数组值可读展示', async () => {
    const wrapper = createWrapper(JSON.stringify([
      { key: 'sign', label: '签名', columnType: 'TEXT', length: null, scale: null, required: false, unique: false, indexed: false, componentType: 'signaturePad', hidden: true },
      { key: 'content', label: '内容', columnType: 'TEXT', length: null, scale: null, required: false, unique: false, indexed: false, componentType: 'fcEditor', hidden: true },
      { key: 'users', label: '穿梭', columnType: 'JSON', length: null, scale: null, required: false, unique: false, indexed: false, componentType: 'elTransfer' },
      { key: 'tree', label: '树', columnType: 'JSON', length: null, scale: null, required: false, unique: false, indexed: false, componentType: 'tree' },
      { key: 'orgTree', label: '树形选择', columnType: 'JSON', length: null, scale: null, required: false, unique: false, indexed: false, componentType: 'elTreeSelect' },
      { key: 'region', label: '级联', columnType: 'JSON', length: null, scale: null, required: false, unique: false, indexed: false, componentType: 'cascader' },
      { key: 'name', label: '姓名', columnType: 'VARCHAR', length: 64, scale: null, required: false, unique: false, indexed: true },
    ]))
    await nextTick()
    await flushPromises()
    const columns = wrapper.findComponent(SearchTableStub).props('columns') as any[]
    const props = columns.map((c: any) => c.prop)
    expect(props).not.toContain('sign')
    expect(props).not.toContain('content')
    // 穿梭/树/树形选择/级联不再隐藏，出现在表格列
    expect(props).toContain('users')
    expect(props).toContain('tree')
    expect(props).toContain('orgTree')
    expect(props).toContain('region')
    // 数组值渲染为逗号拼接（可读展示，而非 JSON 数组字面量）
    expect(columns.find((c: any) => c.prop === 'users')?.render?.({ data: { users: ['u1', 'u2'] } })).toBe('u1, u2')
    expect(columns.find((c: any) => c.prop === 'tree')?.render?.({ data: { tree: ['a', 'b'] } })).toBe('a, b')
    expect(columns.find((c: any) => c.prop === 'orgTree')?.render?.({ data: { orgTree: ['o1'] } })).toBe('o1')
    expect(columns.find((c: any) => c.prop === 'region')?.render?.({ data: { region: ['cn', 'sh'] } })).toBe('cn, sh')
    expect(props).toContain('name')
    wrapper.unmount()
  })

  it('slider 双滑块渲染区间文本', async () => {
    const wrapper = createWrapper(JSON.stringify([
      { key: 'range', label: '区间', columnType: 'JSON', length: null, scale: null, required: false, unique: false, indexed: false, componentType: 'slider' },
    ]))
    await nextTick()
    await flushPromises()
    const columns = wrapper.findComponent(SearchTableStub).props('columns') as any[]
    const range = columns.find((c: any) => c.prop === 'range')
    expect(range?.render?.({ data: { range: [10, 50] } })).toBe('10 ~ 50')
    wrapper.unmount()
  })

  it('数组组件列优先显示 <key>_text 冗余显示列（缺失回退 value join）', async () => {
    const wrapper = createWrapper(JSON.stringify([
      { key: 'dept', label: '部门', columnType: 'JSON', length: null, scale: null, required: false, unique: false, indexed: false, componentType: 'select' },
      { key: 'region', label: '区域', columnType: 'JSON', length: null, scale: null, required: false, unique: false, indexed: false, componentType: 'cascader' },
    ]))
    await nextTick()
    await flushPromises()
    const columns = wrapper.findComponent(SearchTableStub).props('columns') as any[]
    const dept = columns.find((c: any) => c.prop === 'dept')
    const region = columns.find((c: any) => c.prop === 'region')
    // 有 <key>_text → 显示文本
    expect(dept?.render?.({ data: { dept: ['r'], dept_text: '研发部' } })).toBe('研发部')
    expect(region?.render?.({ data: { region: ['leaf'], region_text: '/省级/市级/叶子区' } })).toBe('叶子区')
    // 缺失 <key>_text → 回退 value join
    expect(dept?.render?.({ data: { dept: ['r', 'm'] } })).toBe('r, m')
    wrapper.unmount()
  })

  it('数组组件搜索字段使用 <key>_text 列（VARCHAR 可筛选）', async () => {
    const wrapper = createWrapper(JSON.stringify([
      { key: 'dept', label: '部门', columnType: 'JSON', length: null, scale: null, required: false, unique: false, indexed: false, componentType: 'select' },
      { key: 'dept_text', label: '部门（显示）', columnType: 'VARCHAR', length: 255, scale: null, required: false, unique: false, indexed: false, hidden: true },
      { key: 'name', label: '姓名', columnType: 'VARCHAR', length: 64, scale: null, required: false, unique: false, indexed: true },
    ]))
    await nextTick()
    await flushPromises()
    const searchFields = wrapper.findComponent(SearchTableStub).props('searchFields') as any[]
    // 数组组件主列 JSON 不可筛选 → 搜索字段用 <key>_text
    expect(searchFields.map((s: any) => s.prop)).toContain('dept_text')
    expect(searchFields.map((s: any) => s.prop)).not.toContain('dept')
    expect(searchFields.map((s: any) => s.prop)).toContain('name')
    wrapper.unmount()
  })
})

describe('BizDataListPage — 提交时数组组件附加显示文本', () => {
  it('createApi 提交 data 附加 <key>_text（value→label 映射）', async () => {
    ;(formApi.getFormDefinitionByKey as any).mockResolvedValue({
      data: {
        name: '员工档案',
        columnConfig: JSON.stringify([
          { key: 'dept', label: '部门', columnType: 'JSON', length: null, scale: null, required: false, unique: false, indexed: false, componentType: 'select' },
          { key: 'dept_text', label: '部门（显示）', columnType: 'VARCHAR', length: 255, scale: null, required: false, unique: false, indexed: false, hidden: true },
        ]),
        schema: JSON.stringify({
          rule: [{
            type: 'select', field: 'dept', props: { multiple: true },
            options: [{ label: '研发部', value: 'r' }, { label: '市场部', value: 'm' }],
          }],
          option: {}, dataSources: [], actions: [],
        }),
      },
    })
    ;(bizDataApi.create as any).mockResolvedValue({ data: {} })
    const wrapper = mount(BizDataListPage, {
      global: { plugins: [ElementPlus], stubs: { SearchTable: SearchTableStub } },
    })
    await nextTick()
    await flushPromises()
    const fc = wrapper.findComponent(SearchTableStub).props('formConfig')
    await fc.createApi({ dept: ['r', 'm'] })
    expect(bizDataApi.create).toHaveBeenCalledWith('emp_profile', expect.objectContaining({ dept: ['r', 'm'], dept_text: '研发部, 市场部' }))
    wrapper.unmount()
  })

  it('updateApi 提交 data 附加 <key>_text 且保留版本号', async () => {
    ;(formApi.getFormDefinitionByKey as any).mockResolvedValue({
      data: {
        name: '员工档案',
        columnConfig: JSON.stringify([
          { key: 'tags', label: '标签', columnType: 'JSON', length: null, scale: null, required: false, unique: false, indexed: false, componentType: 'checkbox' },
          { key: 'tags_text', label: '标签（显示）', columnType: 'VARCHAR', length: 255, scale: null, required: false, unique: false, indexed: false, hidden: true },
        ]),
        schema: JSON.stringify({
          rule: [{ type: 'checkbox', field: 'tags', options: [{ label: '标签1', value: 't1' }] }],
          option: {}, dataSources: [], actions: [],
        }),
      },
    })
    ;(bizDataApi.update as any).mockResolvedValue({ data: {} })
    const wrapper = mount(BizDataListPage, {
      global: { plugins: [ElementPlus], stubs: { SearchTable: SearchTableStub } },
    })
    await nextTick()
    await flushPromises()
    const fc = wrapper.findComponent(SearchTableStub).props('formConfig')
    await fc.updateApi('rec-1', { tags: ['t1'] }, { version: 3 })
    expect(bizDataApi.update).toHaveBeenCalledWith('emp_profile', 'rec-1', expect.objectContaining({ tags_text: '标签1' }), 3)
    wrapper.unmount()
  })
})

describe('BizDataListPage — 搜索栏组件化（精确查询用显示值）', () => {
  function mountWith(schemaRule: any[]) {
    ;(formApi.getFormDefinitionByKey as any).mockResolvedValue({
      data: {
        name: '员工档案',
        columnConfig: JSON.stringify([
          { key: 'dept', label: '部门', columnType: 'JSON', length: null, scale: null, required: false, unique: false, indexed: false, componentType: 'select' },
          { key: 'dept_text', label: '部门（显示）', columnType: 'VARCHAR', length: 255, scale: null, required: false, unique: false, indexed: false, hidden: true },
          { key: 'tags', label: '标签', columnType: 'JSON', length: null, scale: null, required: false, unique: false, indexed: false, componentType: 'checkbox' },
          { key: 'tags_text', label: '标签（显示）', columnType: 'VARCHAR', length: 255, scale: null, required: false, unique: false, indexed: false, hidden: true },
          { key: 'name', label: '姓名', columnType: 'VARCHAR', length: 64, scale: null, required: false, unique: false, indexed: true },
        ]),
        schema: JSON.stringify({ rule: schemaRule, option: {}, dataSources: [], actions: [] }),
      },
    })
    ;(bizDataApi.referencedCount as any).mockResolvedValue({ data: {} })
    return mount(BizDataListPage, {
      global: { plugins: [ElementPlus], stubs: { SearchTable: SearchTableStub } },
    })
  }

  it('单选选项字段生成 select 查询组件（prop=_text、options 为显示值 label 精确查询）', async () => {
    const wrapper = mountWith([
      { type: 'select', field: 'dept', props: { multiple: false }, options: [{ label: '研发部', value: 'r' }, { label: '市场部', value: 'm' }] },
    ])
    await nextTick()
    await flushPromises()
    const searchFields = wrapper.findComponent(SearchTableStub).props('searchFields') as any[]
    const dept = searchFields.find((s: any) => s.prop === 'dept_text')
    expect(dept?.type).toBe('select')
    // 查询值 = 显示值（label），后端 _text 列精确等值匹配
    expect(dept?.options).toEqual([{ label: '研发部', value: '研发部' }, { label: '市场部', value: '市场部' }])
    wrapper.unmount()
  })

  it('多选选项字段保持 input（模糊查询 _text）', async () => {
    const wrapper = mountWith([
      { type: 'select', field: 'dept', props: { multiple: false }, options: [{ label: '研发部', value: 'r' }] },
      { type: 'checkbox', field: 'tags', options: [{ label: '标签1', value: 't1' }] },
    ])
    await nextTick()
    await flushPromises()
    const searchFields = wrapper.findComponent(SearchTableStub).props('searchFields') as any[]
    const tags = searchFields.find((s: any) => s.prop === 'tags_text')
    expect(tags?.type).toBe('input')
    wrapper.unmount()
  })

  it('文本字段 input 模糊查询', async () => {
    const wrapper = mountWith([
      { type: 'select', field: 'dept', props: { multiple: false }, options: [{ label: '研发部', value: 'r' }] },
    ])
    await nextTick()
    await flushPromises()
    const searchFields = wrapper.findComponent(SearchTableStub).props('searchFields') as any[]
    const name = searchFields.find((s: any) => s.prop === 'name')
    expect(name?.type).toBe('input')
    wrapper.unmount()
  })
})
