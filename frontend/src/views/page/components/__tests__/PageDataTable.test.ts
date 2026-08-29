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
})
