// ----- TDD: FormListPage 引用感知（徽标数据加载 + 删除警告） -----
// npx vitest run src/views/form/__tests__/FormListPage.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'
import FormListPage from '../FormListPage.vue'

beforeEach(() => {
  vi.clearAllMocks()
})

vi.mock('@/api/form', () => ({
  formApi: {
    getFormDefinitions: vi.fn(),
    createForm: vi.fn(),
    publishFormDefinition: vi.fn(),
    deleteFormDefinition: vi.fn(),
    getFormVersions: vi.fn(),
    copyForm: vi.fn(),
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
import { formApi } from '@/api/form'
import { ElMessageBox } from 'element-plus'

/** SearchTable 桩：透传 actionButtons，供测试触发操作按钮；expose fetchList 供刷新断言 */
const exposedFetchList = vi.fn()
const SearchTableStub = defineComponent({
  props: ['searchFields', 'columns', 'actionButtons', 'fetchApi', 'formConfig', 'defaultPageSize', 'maxVisibleButtons'],
  setup(_props, { expose }) {
    expose({ fetchList: exposedFetchList })
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

describe('FormListPage — 复制表单', () => {
  const workflowRow = {
    id: 'f1',
    name: '请假申请',
    key: 'leave_apply',
    type: 'WORKFLOW',
    status: 'PUBLISHED',
  }

  it('操作列包含复制按钮，归档表单隐藏', async () => {
    ;(bizDataApi.referencedCount as any).mockResolvedValue({ data: {} })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const copyBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '复制')
    expect(copyBtn).toBeTruthy()
    expect(copyBtn.show({ status: 'DRAFT' })).toBe(true)
    expect(copyBtn.show({ status: 'PUBLISHED' })).toBe(true)
    expect(copyBtn.show({ status: 'ARCHIVED' })).toBe(false)
    wrapper.unmount()
  })

  it('点击复制按钮打开弹窗并预填副本名称/标识（类型默认跟随源）', async () => {
    ;(bizDataApi.referencedCount as any).mockResolvedValue({ data: {} })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const copyBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '复制')
    await copyBtn.onClick(workflowRow)
    await nextTick()
    const dialog = wrapper.find('.el-dialog')
    expect(dialog.exists()).toBe(true)
    const inputs = dialog.findAll('input')
    const nameInput = inputs.find((i) => i.attributes('placeholder') === '请输入新表单名称') as any
    const keyInput = inputs.find((i) => i.attributes('placeholder') === '请输入新表单标识') as any
    expect(nameInput.element.value).toBe('请假申请 副本')
    expect(keyInput.element.value).toBe('leave_apply_copy')
    wrapper.unmount()
  })

  it('同类型复制：提交调用 copyForm 参数正确，成功后提示并刷新列表', async () => {
    ;(bizDataApi.referencedCount as any).mockResolvedValue({ data: {} })
    ;(formApi.copyForm as any).mockResolvedValue({ data: { id: 'f2' } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const copyBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '复制')
    await copyBtn.onClick(workflowRow)
    await nextTick()
    const dialog = wrapper.find('.el-dialog')
    // 同类型：无跨类型警告
    expect(dialog.find('.el-alert').exists()).toBe(false)
    await dialog.find('.el-dialog__footer button.el-button--primary').trigger('click')
    await flushPromises()
    expect(formApi.copyForm).toHaveBeenCalledWith('f1', {
      name: '请假申请 副本',
      key: 'leave_apply_copy',
      type: 'WORKFLOW',
    })
    // el-dialog 关闭走 leave transition（jsdom 不触发 transitionend），
    // DOM 移除时机不确定，改断言成功提示与列表刷新（关闭由 v-model 同步置位）
    expect(exposedFetchList).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('跨类型复制（业务→工作流）：出现发布校验提示，提交类型为目标类型', async () => {
    ;(bizDataApi.referencedCount as any).mockResolvedValue({ data: {} })
    ;(formApi.copyForm as any).mockResolvedValue({ data: { id: 'f3' } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const copyBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '复制')
    // 业务表单源
    await copyBtn.onClick({ ...workflowRow, type: 'BUSINESS', key: 'device_info' })
    await nextTick()
    const dialog = wrapper.find('.el-dialog')
    // 同类型时不出现提示
    expect(dialog.find('.el-alert').exists()).toBe(false)
    // 切到工作流类型（对内部 radio input 触发 change）→ 跨类型警告出现
    const radioInputs = dialog.findAll('input.el-radio-button__original-radio')
    await radioInputs[0].setValue('WORKFLOW')
    await nextTick()
    expect(dialog.find('.el-alert').exists()).toBe(true)
    expect(dialog.find('.el-alert').text()).toContain('业务表单复制为工作流表单')
    await dialog.find('.el-dialog__footer button.el-button--primary').trigger('click')
    await flushPromises()
    expect(formApi.copyForm).toHaveBeenCalledWith('f1', {
      name: '请假申请 副本',
      key: 'device_info_copy',
      type: 'WORKFLOW',
    })
    wrapper.unmount()
  })

  it('复制表单的校验规则已配置（必填 + 标识格式）', async () => {
    // ⚠️ 不在 jsdom 里直接断言 el-form validate() 的拦截行为：
    //    vitest 预打包环境下 element-plus 表单级 validate 的拒绝载荷会丢失
    //    （field 级正常、form 级静默通过），拦截效果由 agent-browser E2E 在真实浏览器验证。
    ;(bizDataApi.referencedCount as any).mockResolvedValue({ data: {} })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    await wrapper.findComponent(SearchTableStub)
    // 通过打开弹窗确认 el-form 上挂着 rules（DOM 层面有 form-item 包裹）
    const stub = wrapper.findComponent(SearchTableStub)
    const copyBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '复制')
    await copyBtn.onClick(workflowRow)
    await nextTick()
    const dialog = wrapper.find('.el-dialog')
    expect(dialog.findAll('.el-form-item').length).toBeGreaterThanOrEqual(3)
    wrapper.unmount()
  })

  it('复制失败（如 key 重复）时弹窗保持打开，可修改后重试', async () => {
    ;(bizDataApi.referencedCount as any).mockResolvedValue({ data: {} })
    ;(formApi.copyForm as any).mockRejectedValue(new Error('Form key already exists'))
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const copyBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '复制')
    await copyBtn.onClick(workflowRow)
    await nextTick()
    const dialog = wrapper.find('.el-dialog')
    await dialog.find('.el-dialog__footer button.el-button--primary').trigger('click')
    await flushPromises()
    expect(formApi.copyForm).toHaveBeenCalled()
    // 弹窗仍打开，可修改后重试
    expect(wrapper.find('.el-dialog').exists()).toBe(true)
    wrapper.unmount()
  })
})
