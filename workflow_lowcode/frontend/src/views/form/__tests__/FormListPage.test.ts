// ----- TDD: FormListPage 引用感知（徽标数据加载 + 删除警告） -----
// npx vitest run src/views/form/__tests__/FormListPage.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'
import FormListPage from '../FormListPage.vue'

vi.mock('@/api/form', () => ({
  formApi: {
    getFormDefinitions: vi.fn(),
    createForm: vi.fn(),
    publishFormDefinition: vi.fn(),
    deleteFormDefinition: vi.fn(),
    getFormVersions: vi.fn(),
  },
}))

vi.mock('@/api/bizData', () => ({
  bizDataApi: { referencedCount: vi.fn() },
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ElMessageBox: { confirm: vi.fn() },
    ElMessage: { success: vi.fn() },
  }
})

import { bizDataApi } from '@/api/bizData'
import { ElMessageBox } from 'element-plus'

/** SearchTable 桩：透传 actionButtons，供测试触发操作按钮 */
const SearchTableStub = defineComponent({
  props: ['searchFields', 'columns', 'actionButtons', 'fetchApi', 'formConfig', 'defaultPageSize', 'maxVisibleButtons'],
  setup(props) {
    return () => h('div', { class: 'search-table-stub' })
  },
})

function createWrapper() {
  return mount(FormListPage, {
    global: {
      plugins: [ElementPlus],
      stubs: { SearchTable: SearchTableStub },
    },
  })
}

describe('FormListPage — 引用感知', () => {
  it('onMounted 加载引用统计', async () => {
    ;(bizDataApi.referencedCount as any).mockResolvedValue({
      data: { emp_profile: { count: 2, referencedBy: ['a', 'b'] } },
    })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    expect(bizDataApi.referencedCount).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('删除被引用表单时确认文案提示影响范围', async () => {
    ;(bizDataApi.referencedCount as any).mockResolvedValue({
      data: { emp_profile: { count: 2, referencedBy: ['a', 'b'] } },
    })
    ;(ElMessageBox.confirm as any).mockResolvedValue(undefined)
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const delBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '删除')
    await delBtn.onClick({ id: 'f1', key: 'emp_profile', status: 'DRAFT' })
    await flushPromises()
    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      '该表单被 2 个表单引用，删除后引用将无法解析。确定删除吗？',
      '删除确认',
      { type: 'warning' },
    )
    wrapper.unmount()
  })

  it('删除未被引用表单时使用默认确认文案', async () => {
    ;(bizDataApi.referencedCount as any).mockResolvedValue({ data: {} })
    ;(ElMessageBox.confirm as any).mockResolvedValue(undefined)
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const delBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '删除')
    await delBtn.onClick({ id: 'f2', key: 'plain_form', status: 'DRAFT' })
    await flushPromises()
    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      '确定要删除此表单吗？',
      '删除确认',
      { type: 'warning' },
    )
    wrapper.unmount()
  })
})
