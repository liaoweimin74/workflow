// ----- TDD: DataSourceListPage 列表/新建编辑弹窗/启用禁用/删除交互 -----
// npx vitest run src/views/dataSource/__tests__/DataSourceListPage.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'
import DataSourceListPage from '../DataSourceListPage.vue'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getDataSources: vi.fn(),
    createDataSource: vi.fn(),
    getDataSource: vi.fn(),
    updateDataSource: vi.fn(),
    deleteDataSource: vi.fn(),
    enableDataSource: vi.fn(),
    disableDataSource: vi.fn(),
    getMetadata: vi.fn(),
  },
}))

vi.mock('@/api/form', () => ({
  formApi: {
    getFormDefinitions: vi.fn(),
  },
}))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return { ...actual, ElMessage: { success: vi.fn(), error: vi.fn() }, ElMessageBox: { confirm: vi.fn() } }
})
vi.mock('@element-plus/icons-vue', () => ({
  Plus: { name: 'Plus', render: () => h('span', '+') },
  Delete: { name: 'Delete', render: () => h('span', '×') },
}))

const ElMessage = (await import('element-plus')).ElMessage as any
const ElMessageBox = (await import('element-plus')).ElMessageBox as any
const { dataSourceApi } = await import('@/api/data-source') as any
const { formApi } = await import('@/api/form') as any

const SearchTableStub = defineComponent({
  name: 'SearchTableStub',
  props: ['searchFields', 'columns', 'actionButtons', 'fetchApi', 'formConfig', 'defaultPageSize', 'maxVisibleButtons'],
  emits: ['update:modelValue'],
  setup(props, { expose }) {
    expose({ fetchList: vi.fn() })
    return () => h('div', 'search-table-stub')
  },
})

describe('DataSourceListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createWrapper() {
    return mount(DataSourceListPage, {
      global: {
        plugins: [ElementPlus],
        stubs: { SearchTable: SearchTableStub },
      },
    })
  }

  it('列表渲染：actionButtons 包含新建/编辑/启用/禁用/删除', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const actionButtons = stub.props('actionButtons') as any[]
    const labels = actionButtons.map((b: any) => b.label)
    expect(labels).toContain('新建')
    expect(labels).toContain('编辑')
    expect(labels).toContain('启用')
    expect(labels).toContain('禁用')
    expect(labels).toContain('删除')
    wrapper.unmount()
  })

  it('新建：点击新建按钮显示弹窗（dialogVisible = true）', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const actionButtons = stub.props('actionButtons') as any[]
    const createBtn = actionButtons.find((b: any) => b.label === '新建')
    expect(createBtn).toBeDefined()
    // 点击新建 → 弹窗应出现（dialogVisible 变为 true）
    createBtn.onClick()
    await nextTick()
    await flushPromises()
    // 弹窗内应有 el-dialog（destroy-on-close）
    expect(wrapper.html()).toContain('新建数据源')
    wrapper.unmount()
  })

  it('启用：非 ENABLED 状态显示，点击调用 enableDataSource 并提示成功', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    ;(dataSourceApi.enableDataSource as any).mockResolvedValue({ data: { id: 'ds1', status: 'ENABLED' } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const enableBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '启用')
    expect(enableBtn.show({ status: 'DRAFT' })).toBe(true)
    expect(enableBtn.show({ status: 'DISABLED' })).toBe(true)
    expect(enableBtn.show({ status: 'ENABLED' })).toBe(false)
    await enableBtn.onClick({ id: 'ds1', status: 'DRAFT' })
    await flushPromises()
    expect(dataSourceApi.enableDataSource).toHaveBeenCalledWith('ds1')
    expect(ElMessage.success).toHaveBeenCalledWith('启用成功')
    wrapper.unmount()
  })

  it('禁用：仅 ENABLED 状态显示，点击调用 disableDataSource 并提示成功', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    ;(dataSourceApi.disableDataSource as any).mockResolvedValue({ data: { id: 'ds1', status: 'DISABLED' } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const disableBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '禁用')
    expect(disableBtn.show({ status: 'ENABLED' })).toBe(true)
    expect(disableBtn.show({ status: 'DRAFT' })).toBe(false)
    expect(disableBtn.show({ status: 'DISABLED' })).toBe(false)
    await disableBtn.onClick({ id: 'ds1', status: 'ENABLED' })
    await flushPromises()
    expect(dataSourceApi.disableDataSource).toHaveBeenCalledWith('ds1')
    expect(ElMessage.success).toHaveBeenCalledWith('禁用成功')
    wrapper.unmount()
  })

  it('删除：确认后调用 deleteDataSource 并提示成功', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    ;(ElMessageBox.confirm as any).mockResolvedValue(undefined)
    ;(dataSourceApi.deleteDataSource as any).mockResolvedValue({ data: {} })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const delBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '删除')
    await delBtn.onClick({ id: 'ds1', status: 'DRAFT' })
    await flushPromises()
    expect(ElMessageBox.confirm).toHaveBeenCalledWith('确定要删除此数据源吗？', '删除确认', { type: 'warning' })
    expect(dataSourceApi.deleteDataSource).toHaveBeenCalledWith('ds1')
    expect(ElMessage.success).toHaveBeenCalledWith('删除成功')
    wrapper.unmount()
  })

  it('删除非 DRAFT 被 400 拦截：不下发删除成功提示', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    ;(ElMessageBox.confirm as any).mockResolvedValue(undefined)
    ;(dataSourceApi.deleteDataSource as any).mockRejectedValue(new Error('400: 请先禁用数据源'))
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const delBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '删除')
    await delBtn.onClick({ id: 'ds1', status: 'ENABLED' })
    await flushPromises()
    expect(dataSourceApi.deleteDataSource).toHaveBeenCalledWith('ds1')
    expect(ElMessage.success).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('取消删除：确认被拒时不下发 deleteDataSource', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    ;(ElMessageBox.confirm as any).mockRejectedValue(new Error('cancel'))
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const delBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '删除')
    await delBtn.onClick({ id: 'ds1', status: 'DRAFT' })
    await flushPromises()
    expect(dataSourceApi.deleteDataSource).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('新建 FORM：选择表单后自动填充 API 操作接口', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [{ key: 'user', name: '用户表' }] } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    // 触发新建 → 默认类型 FORM
    const stub = wrapper.findComponent(SearchTableStub)
    const createBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '新建')
    createBtn.onClick()
    await nextTick()
    await flushPromises()
    // 弹窗应已出现
    expect(wrapper.html()).toContain('新建数据源')
    // 选择表单 key 后，自动填充 API 操作
    const component: any = wrapper.vm as any
    component.form.formKey = 'user'
    await nextTick()
    await flushPromises()
    component.onSourceSelected()
    await nextTick()
    const listAction = component.apiOps.list.action
    const createAction = component.apiOps.create.action
    const updateAction = component.apiOps.update.action
    const deleteAction = component.apiOps.delete.action
    expect(listAction).toBe('/api/v1/biz-data/user')
    expect(createAction).toBe('/api/v1/biz-data/user')
    expect(updateAction).toBe('/api/v1/biz-data/user/{id}')
    expect(deleteAction).toBe('/api/v1/biz-data/user/{id}')
    // 验证 list 操作包含 parse 和 totalParse
    expect(component.apiOps.list.parse).toBe('records')
    expect(component.apiOps.list.totalParse).toBe('total')
    wrapper.unmount()
  })

  it('新建 SYSTEM：选择结构后自动填充 API 操作接口', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const createBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '新建')
    createBtn.onClick()
    await nextTick()
    await flushPromises()
    const component: any = wrapper.vm as any
    component.form.type = 'SYSTEM'
    component.form.sourceKey = 'user-tree'
    await nextTick()
    await flushPromises()
    component.onSourceSelected()
    await nextTick()
    expect(component.apiOps.list.action).toBe('/api/v1/internal/system/users')
    wrapper.unmount()
  })
})
