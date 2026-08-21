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
  Edit: { name: 'Edit', render: () => h('span', '✎') },
  CircleCheck: { name: 'CircleCheck', render: () => h('span', '✓') },
  CircleClose: { name: 'CircleClose', render: () => h('span', '✕') },
}))

const ElMessage = (await import('element-plus')).ElMessage as any
const ElMessageBox = (await import('element-plus')).ElMessageBox as any
const { dataSourceApi } = await import('@/api/data-source') as any
const { formApi } = await import('@/api/form') as any

const SearchTableStub = defineComponent({
  name: 'SearchTableStub',
  props: ['searchFields', 'columns', 'actionButtons', 'fetchApi', 'formConfig', 'defaultPageSize', 'maxVisibleButtons'],
  emits: ['update:modelValue'],
  setup(props, { expose, slots }) {
    expose({ fetchList: vi.fn() })
    // 渲染默认 slot（工具栏新建按钮），其余 slot 忽略
    return () => (slots.default ? slots.default() : h('div', 'search-table-stub'))
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
        directives: { permission: { mounted() {} } },
      },
    })
  }

  it('列表渲染：actionButtons 包含编辑/启用/禁用/删除（不含新建），均为图标按钮', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const actionButtons = stub.props('actionButtons') as any[]
    const labels = actionButtons.map((b: any) => b.label)
    // 新建按钮在工具栏，不在行操作列
    expect(labels).not.toContain('新建')
    expect(labels).toContain('编辑')
    expect(labels).toContain('启用')
    expect(labels).toContain('禁用')
    expect(labels).toContain('删除')
    // Fix 4：所有行操作按钮均为图标按钮（icon 已配置）
    for (const b of actionButtons) {
      expect(b.icon, `${b.label} 应配置 icon`).toBeDefined()
    }
    // 工具栏默认 slot 渲染新建按钮（图标 + 文字）
    expect(wrapper.find('.search-table-toolbar-btn').exists() || wrapper.html().includes('新建')).toBe(true)
    wrapper.unmount()
  })

  it('新建：工具栏新建按钮显示弹窗（dialogVisible = true）', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    // 点击工具栏默认 slot 中的新建按钮 → 弹窗应出现
    const toolbarBtn = wrapper.findAll('button').find((b) => b.text().includes('新建'))
    expect(toolbarBtn).toBeDefined()
    await toolbarBtn!.trigger('click')
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

  it('新建 FORM：选择表单后显示只读端点展示', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [{ key: 'user', name: '用户表' }] } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    expect(wrapper.html()).toContain('新建数据源')
    const component: any = wrapper.vm as any
    component.form.formKey = 'user'
    await nextTick()
    await flushPromises()
    // 只读端点展示应出现
    const html = wrapper.html()
    expect(html).toContain('/api/v1/biz-data/user')
    expect(html).toContain('GET')
    expect(html).toContain('POST')
    expect(html).toContain('PUT')
    expect(html).toContain('DELETE')
    expect(html).toContain('list')
    expect(html).toContain('create')
    wrapper.unmount()
  })

  it('新建 SYSTEM：选择结构后显示只读端点展示', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    const component: any = wrapper.vm as any
    component.form.type = 'SYSTEM'
    component.form.sourceKey = 'user-tree'
    await nextTick()
    await flushPromises()
    const html = wrapper.html()
    expect(html).toContain('/api/v1/internal/system/users')
    expect(html).toContain('list')
    wrapper.unmount()
  })

  it('API 类型：显示可编辑表单，FORM/SYSTEM 显示只读展示', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    const component: any = wrapper.vm as any
    // 默认 FORM → 应显示只读展示（auto-params-display），不显示可编辑表单
    expect(wrapper.find('.auto-params-display').exists()).toBe(false) // 未选 formKey，不显示
    // 切换到 API → 应显示可编辑表单
    component.form.type = 'API'
    await nextTick()
    expect(wrapper.find('.op-editor').exists()).toBe(true)
    expect(wrapper.find('.column-editor').exists()).toBe(true)
    wrapper.unmount()
  })

  it('Fix 2：FORM/SYSTEM 未选择标识时，接口操作区域不显示任何内容', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    // FORM 未选 formKey → 接口操作区不渲染任何内容
    expect(wrapper.find('.auto-params-display').exists()).toBe(false)
    expect(wrapper.find('.op-editor').exists()).toBe(false)
    // SYSTEM 未选 sourceKey → 同样不显示
    ;(wrapper.vm as any).form.type = 'SYSTEM'
    await nextTick()
    expect(wrapper.find('.auto-params-display').exists()).toBe(false)
    expect(wrapper.find('.op-editor').exists()).toBe(false)
    wrapper.unmount()
  })

  it('Fix 3：编辑 FORM 数据源能打开编辑弹窗', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [{ key: 'user', name: '用户表' }] } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const editBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '编辑')
    // 编辑 FORM 数据源：应正常打开弹窗（不因调用已删除函数而崩溃）
    await editBtn.onClick({ id: 'ds-form', name: '用户数据', type: 'FORM', formKey: 'user', sourceKey: null, status: 'ENABLED', params: null })
    await nextTick()
    await flushPromises()
    expect(wrapper.html()).toContain('编辑数据源')
    // formKey 已回填，只读端点展示渲染
    expect((wrapper.vm as any).form.formKey).toBe('user')
    expect(wrapper.find('.auto-params-display').exists()).toBe(true)
    wrapper.unmount()
  })

  it('Fix 3：编辑 SYSTEM 数据源能打开编辑弹窗', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const editBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '编辑')
    await editBtn.onClick({ id: 'ds-sys', name: '部门数据', type: 'SYSTEM', formKey: null, sourceKey: 'dept-tree', status: 'ENABLED', params: null })
    await nextTick()
    await flushPromises()
    expect(wrapper.html()).toContain('编辑数据源')
    expect((wrapper.vm as any).form.sourceKey).toBe('dept-tree')
    expect(wrapper.find('.auto-params-display').exists()).toBe(true)
    wrapper.unmount()
  })
})
