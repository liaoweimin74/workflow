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

/** 默认 columnConfig：name(VARCHAR 可筛选) + tags(JSON 不可筛选) + sub_items(subForm, hidden) */
function defaultColumnConfig() {
  return JSON.stringify([
    { key: 'name', label: '姓名', columnType: 'VARCHAR', length: 64, scale: null, required: false, unique: false, indexed: true },
    { key: 'tags', label: '标签', columnType: 'JSON', length: null, scale: null, required: false, unique: false, indexed: false },
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

  it('JSON 数组值展示为可读文本（数组 JSON.stringify、旧逗号串原样）', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const columns = wrapper.findComponent(SearchTableStub).props('columns') as any[]
    const tags = columns.find((c: any) => c.prop === 'tags')
    expect(tags?.formatter?.({ data: { tags: ['a', 'b'] } })).toBe('["a","b"]')
    expect(tags?.formatter?.({ data: { tags: 'a,b' } })).toBe('a,b')
    wrapper.unmount()
  })
})
