// ----- TDD: PageListPage 发布/删除交互 -----
// npx vitest run src/views/page/__tests__/PageListPage.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick, defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'
import PageListPage from '../PageListPage.vue'

vi.mock('@/api/page', () => ({
  pageApi: {
    getPages: vi.fn(),
    createPage: vi.fn(),
    publishPage: vi.fn(),
    deletePage: vi.fn(),
  },
}))

vi.mock('@/api/form', () => ({
  formApi: { getFormDefinitions: vi.fn() },
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ElMessageBox: { confirm: vi.fn() },
    ElMessage: { success: vi.fn() },
  }
})

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { pageApi } from '@/api/page'
import { formApi } from '@/api/form'
import { ElMessageBox, ElMessage } from 'element-plus'

beforeEach(() => {
  vi.clearAllMocks()
})

/** SearchTable 桩：透传 actionButtons/formConfig，供测试触发操作按钮 */
const SearchTableStub = defineComponent({
  props: ['searchFields', 'columns', 'actionButtons', 'fetchApi', 'formConfig', 'defaultPageSize', 'maxVisibleButtons'],
  setup(props) {
    return () => h('div', { class: 'search-table-stub' })
  },
})

function createWrapper() {
  return mount(PageListPage, {
    global: {
        plugins: [ElementPlus, createPinia()],
      stubs: { SearchTable: SearchTableStub },
    },
  })
}

describe('PageListPage — 发布/删除交互', () => {
  it('onMounted 加载已发布表单（formKey 下拉候选）；fetchApi 正确透传分页参数', async () => {
    ;(pageApi.getPages as any).mockResolvedValue({
      data: { content: [{ id: 'p1', name: '员工视图', key: 'emp_view', type: 'VIEW', status: 'DRAFT', version: 1 }], totalElements: 1 },
    })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({
      data: { content: [{ id: 'f1', name: '员工档案', key: 'emp_profile', type: 'BUSINESS', status: 'PUBLISHED' }] },
    })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    expect(formApi.getFormDefinitions).toHaveBeenCalledWith({
      type: 'BUSINESS',
      status: 'PUBLISHED',
      size: 100,
    })
    const stub = wrapper.findComponent(SearchTableStub)
    // formKey 下拉候选注入到 type control 的 VIEW 分支
    const formConfig = stub.props('formConfig') as any
    const typeRule = formConfig.rule.find((r: any) => r.field === 'type')
    const viewCtl = typeRule.control.find((c: any) => c.value === 'VIEW')
    const formKeyRule = viewCtl.rule.find((r: any) => r.field === 'formKey')
    expect(formKeyRule.options).toHaveLength(1)
    expect(formKeyRule.options[0]).toEqual({ label: '员工档案', value: 'emp_profile' })
    // PAGE 分支 formKey 也可选（非必填）
    const pageCtl = typeRule.control.find((c: any) => c.value === 'PAGE')
    const pageFormKeyRule = pageCtl.rule.find((r: any) => r.field === 'formKey')
    expect(pageFormKeyRule.options).toHaveLength(1)
    // fetchApi：SearchTable 透传的查询参数 → pageApi.getPages（page 按 1 基）
    const fetchApi = stub.props('fetchApi') as (params: any) => Promise<any>
    const res = await fetchApi({ page: 2, size: 20, name: '视图', status: 'DRAFT', type: 'VIEW' })
    expect(pageApi.getPages).toHaveBeenCalledWith({
      page: 2,
      size: 20,
      name: '视图',
      status: 'DRAFT',
      type: 'VIEW',
    })
    expect(res).toEqual({
      rows: [{ id: 'p1', name: '员工视图', key: 'emp_view', type: 'VIEW', status: 'DRAFT', version: 1 }],
      total: 1,
    })
    wrapper.unmount()
  })

  it('发布草稿页：确认后调用 publishPage 并提示成功', async () => {
    ;(pageApi.getPages as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    ;(ElMessageBox.confirm as any).mockResolvedValue(undefined)
    ;(pageApi.publishPage as any).mockResolvedValue({ data: {} })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const pubBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '发布')
    expect(pubBtn.show({ status: 'DRAFT' })).toBe(true)
    expect(pubBtn.show({ status: 'PUBLISHED' })).toBe(false)
    await pubBtn.onClick({ id: 'p1', status: 'DRAFT' })
    await flushPromises()
    expect(ElMessageBox.confirm).toHaveBeenCalledWith('确定要发布此页面吗？', '发布确认', { type: 'warning' })
    expect(pageApi.publishPage).toHaveBeenCalledWith('p1')
    expect(ElMessage.success).toHaveBeenCalledWith('发布成功')
    wrapper.unmount()
  })

  it('取消发布：确认被拒时不下发 publishPage', async () => {
    ;(pageApi.getPages as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    ;(ElMessageBox.confirm as any).mockRejectedValue(new Error('cancel'))
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const pubBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '发布')
    await pubBtn.onClick({ id: 'p1', status: 'DRAFT' })
    await flushPromises()
    expect(pageApi.publishPage).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('删除草稿页：确认后调用 deletePage 并提示成功', async () => {
    ;(pageApi.getPages as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    ;(ElMessageBox.confirm as any).mockResolvedValue(undefined)
    ;(pageApi.deletePage as any).mockResolvedValue({ data: {} })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const delBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '删除')
    expect(delBtn.show({ status: 'DRAFT' })).toBe(true)
    expect(delBtn.show({ status: 'PUBLISHED' })).toBe(false)
    await delBtn.onClick({ id: 'p1', status: 'DRAFT' })
    await flushPromises()
    expect(ElMessageBox.confirm).toHaveBeenCalledWith('确定要删除此页面吗？', '删除确认', { type: 'warning' })
    expect(pageApi.deletePage).toHaveBeenCalledWith('p1')
    expect(ElMessage.success).toHaveBeenCalledWith('删除成功')
    wrapper.unmount()
  })

  it('删除被 400 拦截（已发布页）：不弹删除成功提示', async () => {
    ;(pageApi.getPages as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    ;(ElMessageBox.confirm as any).mockResolvedValue(undefined)
    ;(pageApi.deletePage as any).mockRejectedValue(new Error('400: 仅草稿状态页面可删除'))
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const delBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '删除')
    await delBtn.onClick({ id: 'p1', status: 'DRAFT' })
    await flushPromises()
    expect(pageApi.deletePage).toHaveBeenCalledWith('p1')
    expect(ElMessage.success).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
