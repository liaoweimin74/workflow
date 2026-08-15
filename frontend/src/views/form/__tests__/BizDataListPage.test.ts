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
  bizDataApi: { referencedCount: vi.fn() },
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

  it('signaturePad/fcEditor/elTransfer/tree/cascader 隐藏列不出现在表格列', async () => {
    const wrapper = createWrapper(JSON.stringify([
      { key: 'sign', label: '签名', columnType: 'TEXT', length: null, scale: null, required: false, unique: false, indexed: false, componentType: 'signaturePad', hidden: true },
      { key: 'content', label: '内容', columnType: 'TEXT', length: null, scale: null, required: false, unique: false, indexed: false, componentType: 'fcEditor', hidden: true },
      { key: 'users', label: '穿梭', columnType: 'JSON', length: null, scale: null, required: false, unique: false, indexed: false, componentType: 'elTransfer', hidden: true },
      { key: 'tree', label: '树', columnType: 'JSON', length: null, scale: null, required: false, unique: false, indexed: false, componentType: 'tree', hidden: true },
      { key: 'region', label: '级联', columnType: 'JSON', length: null, scale: null, required: false, unique: false, indexed: false, componentType: 'cascader', hidden: true },
      { key: 'name', label: '姓名', columnType: 'VARCHAR', length: 64, scale: null, required: false, unique: false, indexed: true },
    ]))
    await nextTick()
    await flushPromises()
    const columns = wrapper.findComponent(SearchTableStub).props('columns') as any[]
    const props = columns.map((c: any) => c.prop)
    expect(props).not.toContain('sign')
    expect(props).not.toContain('content')
    expect(props).not.toContain('users')
    expect(props).not.toContain('tree')
    expect(props).not.toContain('region')
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
})
