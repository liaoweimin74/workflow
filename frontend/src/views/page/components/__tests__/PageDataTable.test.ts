// ----- TDD: PageDataTable 排序能力（数据源 metadata 驱动） -----
// npx vitest run src/views/page/components/__tests__/PageDataTable.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import PageDataTable from '../PageDataTable.vue'
import SearchTable from '@/components/business/SearchTable.vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/utils/formDsBindingsStore', () => ({
  activeDsBindings: { value: [] },
}))

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getMetadata: vi.fn(),
    queryData: vi.fn(),
  },
}))

import { dataSourceApi } from '@/api/data-source'

const FormRendererStub = {
  name: 'FormRenderer',
  props: ['rule', 'initialValues', 'readonly'],
  template: '<div class="form-renderer-stub" />',
}

const ElDialogStub = {
  name: 'ElDialog',
  props: ['modelValue'],
  template: '<div class="dialog-stub"><slot v-if="modelValue" /></div>',
}

function createWrapper(props: any = {}) {
  return mount(PageDataTable, {
    props: {
      pageKey: 'emp-page',
      dsRefId: 'ds-emp',
      ...props,
    },
    global: {
      plugins: [ElementPlus],
      provide: {
        pageActionBus: { dispatch: vi.fn(() => false) },
      },
      stubs: {
        'el-dialog': ElDialogStub,
        FormRenderer: FormRendererStub,
      },
    },
  })
}

describe('PageDataTable — 排序能力（数据源 metadata 驱动）', () => {
  it('列 sortable 来自 metadata 声明的排序能力', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({
      data: {
        writable: false,
        columns: [
          { key: 'name', label: '姓名', columnType: 'VARCHAR', sortable: true },
          { key: 'bio', label: '简介', columnType: 'TEXT', sortable: false },
        ],
      },
    })
    ;(dataSourceApi.queryData as any).mockResolvedValue({
      data: { records: [], total: 0 },
    })

    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    const st = wrapper.findComponent(SearchTable)
    expect(st.exists()).toBe(true)
    const cols = st.props('columns') as any[]
    expect(cols.length).toBeGreaterThan(0)
    // 数据源声明可排（VARCHAR）→ 渲染排序入口
    expect(cols.find((c) => c.prop === 'name').sortable).toBe(true)
    // 数据源声明不可排（TEXT）→ 无排序入口
    expect(cols.find((c) => c.prop === 'bio').sortable).toBe(false)
    wrapper.unmount()
  })

  it('sortableFields 收窄：未声明字段即使数据源可排也不显示排序入口', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({
      data: {
        writable: false,
        columns: [
          { key: 'name', label: '姓名', columnType: 'VARCHAR', sortable: true },
          { key: 'age', label: '年龄', columnType: 'INT', sortable: true },
        ],
      },
    })
    ;(dataSourceApi.queryData as any).mockResolvedValue({
      data: { records: [], total: 0 },
    })

    const wrapper = createWrapper({
      sortableFields: ['name'], // 组件级收窄：仅 name 可排序
    })
    await nextTick()
    await flushPromises()

    const st = wrapper.findComponent(SearchTable)
    const cols = st.props('columns') as any[]
    // 视图声明 + 数据源可排 → 可排
    expect(cols.find((c) => c.prop === 'name').sortable).toBe(true)
    // 数据源可排但未在 sortableFields 中 → 不可排
    expect(cols.find((c) => c.prop === 'age').sortable).toBe(false)
    wrapper.unmount()
  })

  it('sortableFields 未声明时跟随数据源全部可排字段', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({
      data: {
        writable: false,
        columns: [
          { key: 'name', label: '姓名', columnType: 'VARCHAR', sortable: true },
          { key: 'age', label: '年龄', columnType: 'INT', sortable: true },
        ],
      },
    })
    ;(dataSourceApi.queryData as any).mockResolvedValue({
      data: { records: [], total: 0 },
    })

    const wrapper = createWrapper() // 无 sortableFields
    await nextTick()
    await flushPromises()

    const st = wrapper.findComponent(SearchTable)
    const cols = st.props('columns') as any[]
    expect(cols.find((c) => c.prop === 'name').sortable).toBe(true)
    expect(cols.find((c) => c.prop === 'age').sortable).toBe(true)
    wrapper.unmount()
  })
})

describe('PageDataTable — 分页配置透传', () => {
  it('pageSize/pageSizes/pagination 透传到 SearchTable', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({
      data: { writable: false, columns: [{ key: 'name', label: '姓名', columnType: 'VARCHAR', sortable: true }] },
    })
    ;(dataSourceApi.queryData as any).mockResolvedValue({ data: { records: [], total: 0 } })

    const wrapper = createWrapper({
      pagination: true,
      pageSize: 50,
      pageSizes: [10, 50, 100],
    })
    await nextTick()
    await flushPromises()

    const st = wrapper.findComponent(SearchTable)
    expect(st.props('showPagination')).toBe(true)
    expect(st.props('defaultPageSize')).toBe(50)
    expect(st.props('pageSizes')).toEqual([10, 50, 100])
    wrapper.unmount()
  })

  it('pageSize/pageSizes 未传时回退默认（20 / [10,20,50]）', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({
      data: { writable: false, columns: [{ key: 'name', label: '姓名', columnType: 'VARCHAR', sortable: true }] },
    })
    ;(dataSourceApi.queryData as any).mockResolvedValue({ data: { records: [], total: 0 } })

    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    const st = wrapper.findComponent(SearchTable)
    expect(st.props('defaultPageSize')).toBe(20)
    expect(st.props('pageSizes')).toEqual([10, 20, 50])
    expect(st.props('showPagination')).toBe(true)
    wrapper.unmount()
  })
})
