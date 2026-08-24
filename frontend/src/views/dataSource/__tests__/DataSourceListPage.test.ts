// ----- TDD: DataSourceListPage 列表/新建/编辑/删除交互 -----
// 数据源管理模式：FORM/WORKFLOW/SYSTEM 由系统自动管理（只读）；第三方 API 支持手动增删改
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
    queryData: vi.fn(),
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
  View: { name: 'View', render: () => h('span', '👁') },
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

  function stubList() {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
  }

  // ==================== 操作按钮可见性 ====================

  it('行操作按钮：查看（全部）+ 编辑/删除（仅 API 类型）', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const actionButtons = stub.props('actionButtons') as any[]

    const viewBtn = actionButtons.find((b: any) => b.label === '查看')
    const editBtn = actionButtons.find((b: any) => b.label === '编辑')
    const delBtn = actionButtons.find((b: any) => b.label === '删除')

    expect(viewBtn).toBeDefined()
    expect(editBtn).toBeDefined()
    expect(delBtn).toBeDefined()
    // 启用/禁用入口已移除（系统管理类型不可手动启停）
    expect(actionButtons.find((b: any) => b.label === '启用')).toBeUndefined()
    expect(actionButtons.find((b: any) => b.label === '禁用')).toBeUndefined()

    // 编辑/删除仅对 API 类型显示
    expect(editBtn.show({ type: 'API' })).toBe(true)
    expect(editBtn.show({ type: 'FORM' })).toBe(false)
    expect(editBtn.show({ type: 'WORKFLOW' })).toBe(false)
    expect(editBtn.show({ type: 'SYSTEM' })).toBe(false)
    expect(delBtn.show({ type: 'API' })).toBe(true)
    expect(delBtn.show({ type: 'FORM' })).toBe(false)
    // 查看对所有类型显示
    expect(viewBtn.show).toBeUndefined()
    wrapper.unmount()
  })

  it('新建：工具栏按钮打开弹窗且类型强制 API', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    const toolbarBtn = wrapper.findAll('button').find((b) => b.text().includes('新建'))
    expect(toolbarBtn).toBeDefined()
    await toolbarBtn!.trigger('click')
    await nextTick()
    await flushPromises()

    expect(wrapper.html()).toContain('新建数据源')
    expect((wrapper.vm as any).form.type).toBe('API')
    wrapper.unmount()
  })

  // ==================== API 数据源增删改 ====================

  it('新建 API：可编辑表单可见，保存调用 createDataSource', async () => {
    stubList()
    ;(dataSourceApi.createDataSource as any).mockResolvedValue({ data: {} })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()

    const component: any = wrapper.vm as any
    expect(component.form.type).toBe('API')
    // API 可编辑：接口操作区（op-editor）可见
    expect(wrapper.find('.op-editor').exists()).toBe(true)
    // 列定义可编辑：添加列按钮可见且可新增
    expect(wrapper.find('.column-editor').exists()).toBe(true)
    expect(wrapper.html()).toContain('添加列')
    const before = component.apiColumns.length
    await component.addColumn()
    await nextTick()
    expect(component.apiColumns.length).toBe(before + 1)
    // 删除列按钮可见
    expect(wrapper.html()).toContain('删除')
    // 填写必填项并保存
    component.form.name = '库存接口'
    component.form.sourceKey = 'external-stock'
    component.apiOps.list.action = '/v1/products'
    await nextTick()
    await component.handleSave()
    await flushPromises()
    expect(dataSourceApi.createDataSource).toHaveBeenCalled()
    expect(ElMessage.success).toHaveBeenCalledWith('创建成功')
    wrapper.unmount()
  })

  it('编辑 API：回填并保存调用 updateDataSource', async () => {
    stubList()
    ;(dataSourceApi.updateDataSource as any).mockResolvedValue({ data: {} })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    await (wrapper.vm as any).openEdit({
      id: 'ds-api', name: '库存接口', type: 'API', formKey: null, sourceKey: 'external-stock',
      status: 'ENABLED', params: JSON.stringify({ list: { action: '/v1/products', method: 'GET' } }),
    })
    await nextTick()
    await flushPromises()

    const component: any = wrapper.vm as any
    expect(wrapper.html()).toContain('编辑数据源')
    expect(component.form.sourceKey).toBe('external-stock')
    expect(component.apiOps.list.action).toBe('/v1/products')
    // API 编辑模式下表单可编辑（非只读）
    expect(component.isReadonlyForm).toBe(false)
    // 保存
    await component.handleSave()
    await flushPromises()
    expect(dataSourceApi.updateDataSource).toHaveBeenCalled()
    expect(ElMessage.success).toHaveBeenCalledWith('保存成功')
    wrapper.unmount()
  })

  it('删除 API：确认后调用 deleteDataSource 并提示成功', async () => {
    stubList()
    ;(ElMessageBox.confirm as any).mockResolvedValue(undefined)
    ;(dataSourceApi.deleteDataSource as any).mockResolvedValue({ data: {} })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    const stub = wrapper.findComponent(SearchTableStub)
    const delBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '删除')
    await delBtn.onClick({ id: 'ds-api', type: 'API', status: 'DRAFT' })
    await flushPromises()

    expect(ElMessageBox.confirm).toHaveBeenCalledWith('确定要删除此数据源吗？', '删除确认', { type: 'warning' })
    expect(dataSourceApi.deleteDataSource).toHaveBeenCalledWith('ds-api')
    expect(ElMessage.success).toHaveBeenCalledWith('删除成功')
    wrapper.unmount()
  })

  it('删除 API 失败：不提示成功', async () => {
    stubList()
    ;(ElMessageBox.confirm as any).mockResolvedValue(undefined)
    ;(dataSourceApi.deleteDataSource as any).mockRejectedValue(new Error('400: 请先禁用数据源'))
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    const stub = wrapper.findComponent(SearchTableStub)
    const delBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '删除')
    await delBtn.onClick({ id: 'ds-api', type: 'API', status: 'ENABLED' })
    await flushPromises()

    expect(dataSourceApi.deleteDataSource).toHaveBeenCalledWith('ds-api')
    expect(ElMessage.success).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('取消删除：确认被拒时不下发 deleteDataSource', async () => {
    stubList()
    ;(ElMessageBox.confirm as any).mockRejectedValue(new Error('cancel'))
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    const stub = wrapper.findComponent(SearchTableStub)
    const delBtn = (stub.props('actionButtons') as any[]).find((b: any) => b.label === '删除')
    await delBtn.onClick({ id: 'ds-api', type: 'API', status: 'DRAFT' })
    await flushPromises()
    expect(dataSourceApi.deleteDataSource).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  // ==================== 系统管理类型只读 ====================

  it('查看 FORM 数据源：弹窗为只读视图模式', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openView({
      id: 'ds-form', name: '用户数据', type: 'FORM', formKey: 'user', sourceKey: null,
      status: 'ENABLED', params: null,
    })
    await nextTick()
    await flushPromises()

    const component: any = wrapper.vm as any
    expect(wrapper.html()).toContain('查看数据源')
    expect(component.isViewMode).toBe(true)
    expect(component.isReadonlyForm).toBe(true)
    expect(wrapper.find('.auto-params-display').exists()).toBe(true)
    wrapper.unmount()
  })

  it('查看 WORKFLOW 数据源：只读视图模式且 formKey 回填', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openView({
      id: 'ds-wf', name: '请假流程数据源', type: 'WORKFLOW', formKey: 'leave_flow', sourceKey: null,
      status: 'ENABLED', params: null,
    })
    await nextTick()
    await flushPromises()

    const component: any = wrapper.vm as any
    expect(component.isReadonlyForm).toBe(true)
    expect(component.form.formKey).toBe('leave_flow')
    wrapper.unmount()
  })

  it('查看 WORKFLOW 数据源：接口区显示 SPI 端点与只读标记', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openView({
      id: 'ds-wf', name: '请假流程数据源', type: 'WORKFLOW', formKey: 'leave_flow', sourceKey: null,
      status: 'ENABLED', params: null,
    })
    await nextTick()
    await flushPromises()

    const component: any = wrapper.vm as any
    const endpoints = component.generateEndpoints()
    expect(endpoints).not.toBeNull()
    // 经统一 SPI 按数据源 ID 访问
    expect(endpoints.metadata.action).toBe('/api/v1/data-sources/ds-wf/metadata')
    expect(endpoints.list.action).toBe('/api/v1/data-sources/ds-wf/data')
    expect(endpoints.get.action).toBe('/api/v1/data-sources/ds-wf/data/{id}')
    // 写操作标注只读
    expect(endpoints.create.readonly).toBe(true)
    expect(endpoints.update.readonly).toBe(true)
    expect(endpoints.delete.readonly).toBe(true)
    // 弹窗接口区渲染端点与「只读」标记
    const html = wrapper.html()
    expect(html).toContain('/api/v1/data-sources/ds-wf/metadata')
    expect(html).toContain('只读')
    wrapper.unmount()
  })

  it('查看 API 数据源：只读视图模式（查看入口可查看任何类型）', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openView({
      id: 'ds-api', name: '库存接口', type: 'API', formKey: null, sourceKey: 'external-stock',
      status: 'ENABLED', params: JSON.stringify({ list: { action: '/v1/products', method: 'GET' } }),
    })
    await nextTick()
    await flushPromises()

    const component: any = wrapper.vm as any
    expect(component.isViewMode).toBe(true)
    expect(component.isReadonlyForm).toBe(true)
    // 查看模式下列表仍渲染
    expect(component.apiOps.list.action).toBe('/v1/products')
    wrapper.unmount()
  })

  it('查看 API 数据源：列定义只读（添加列按钮禁用）', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openView({
      id: 'ds-api', name: '库存接口', type: 'API', formKey: null, sourceKey: 'external-stock',
      status: 'ENABLED', params: JSON.stringify({
        list: { action: '/v1/products', method: 'GET' },
        columns: [{ key: 'name', label: '名称', columnType: 'VARCHAR' }],
      }),
    })
    await nextTick()
    await flushPromises()

    const component: any = wrapper.vm as any
    expect(component.isReadonlyForm).toBe(true)
    expect(component.apiColumns.length).toBe(1)
    // 查看模式下「添加列」按钮处于禁用态
    const addBtn = wrapper.findAll('button').find((b) => b.text().includes('添加列'))
    expect(addBtn).toBeDefined()
    expect(addBtn!.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  // ==================== 类型固定（无切换选择器） ====================

  it('弹窗类型为静态标签：新建/编辑固定 API，查看展示实际类型', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    // 弹窗内不渲染类型 radio 选择器
    expect(wrapper.find('.el-radio-group').exists()).toBe(false)

    // 新建：类型标签显示「第三方 API」
    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    expect((wrapper.vm as any).form.type).toBe('API')
    expect(wrapper.html()).toContain('第三方 API')

    // 查看 FORM：类型标签显示「业务表单」
    ;(wrapper.vm as any).openView({
      id: 'ds-form', name: '用户数据', type: 'FORM', formKey: 'user', sourceKey: null,
      status: 'ENABLED', params: null,
    })
    await nextTick()
    await flushPromises()
    expect(wrapper.html()).toContain('业务表单')
    expect(wrapper.html()).not.toContain('el-radio-group')
    wrapper.unmount()
  })

  // ==================== 字段元数据 + 数据预览标签页 ====================

  const mockMetadata = {
    columns: [
      { key: 'id', label: 'ID', columnType: 'VARCHAR', length: 64, required: true, unique: true, indexed: false },
      { key: 'name', label: '名称', columnType: 'VARCHAR', length: 128, required: true, unique: false, indexed: false },
    ],
    writable: true,
  }

  it('详情弹窗有三个标签：接口配置、字段元数据、数据预览', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openView({
      id: 'ds-api', name: '库存接口', type: 'API', formKey: null, sourceKey: 'external-stock',
      status: 'ENABLED', params: JSON.stringify({ list: { action: '/v1/products', method: 'GET' } }),
    })
    await nextTick()
    await flushPromises()

    expect(wrapper.html()).toContain('接口配置')
    expect(wrapper.html()).toContain('字段元数据')
    expect(wrapper.html()).toContain('数据预览')
    wrapper.unmount()
  })

  it('切换到字段元数据标签后调用 getMetadata 接口', async () => {
    stubList()
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({ data: mockMetadata })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openView({
      id: 'ds-api', name: '库存接口', type: 'API', formKey: null, sourceKey: 'external-stock',
      status: 'ENABLED', params: JSON.stringify({ list: { action: '/v1/products', method: 'GET' } }),
    })
    await nextTick()
    await flushPromises()

    // 模拟切换到字段元数据标签
    await (wrapper.vm as any).handleTabChange('metadata')
    await flushPromises()

    expect(dataSourceApi.getMetadata).toHaveBeenCalledWith('ds-api')
    wrapper.unmount()
  })

  it('字段元数据标签渲染列定义表格（key/label/type/length）', async () => {
    stubList()
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({ data: mockMetadata })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openView({
      id: 'ds-api', name: '库存接口', type: 'API', formKey: null, sourceKey: 'external-stock',
      status: 'ENABLED', params: JSON.stringify({ list: { action: '/v1/products', method: 'GET' } }),
    })
    await nextTick()
    await flushPromises()

    await (wrapper.vm as any).handleTabChange('metadata')
    await flushPromises()

    const html = wrapper.html()
    expect(html).toContain('字段名')
    expect(html).toContain('显示名')
    expect(html).toContain('类型')
    expect(html).toContain('长度')
    // 列数据
    expect(html).toContain('id')
    expect(html).toContain('ID')
    expect(html).toContain('名称')
    // writable 标记
    expect(html).toContain('可写')
    wrapper.unmount()
  })

  it('切换到数据预览标签后调用 queryData 接口', async () => {
    stubList()
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({ data: mockMetadata })
    ;(dataSourceApi.queryData as any).mockResolvedValue({
      data: { records: [{ id: '1', data: { name: '测试' } }], total: 1, page: 1, size: 20 },
    })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openView({
      id: 'ds-api', name: '库存接口', type: 'API', formKey: null, sourceKey: 'external-stock',
      status: 'ENABLED', params: JSON.stringify({ list: { action: '/v1/products', method: 'GET' } }),
    })
    await nextTick()
    await flushPromises()

    await (wrapper.vm as any).handleTabChange('data')
    await flushPromises()

    expect(dataSourceApi.queryData).toHaveBeenCalledWith(
      'ds-api',
      expect.objectContaining({ page: 0, size: 20 })
    )
    const html = wrapper.html()
    expect(html).toContain('测试')
    wrapper.unmount()
  })

  it('只读数据源（SYSTEM）元数据 writable=false 显示只读标记', async () => {
    stubList()
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({
      data: { columns: [], writable: false },
    })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openView({
      id: 'ds-sys', name: '部门树', type: 'SYSTEM', formKey: null, sourceKey: 'dept-tree',
      status: 'ENABLED', params: null,
    })
    await nextTick()
    await flushPromises()

    await (wrapper.vm as any).handleTabChange('metadata')
    await flushPromises()

    expect(wrapper.html()).toContain('只读')
    wrapper.unmount()
  })

  it('@tab-click 事件 (onTabClick) 正确处理 Element Plus 事件签名: tab.props.name', async () => {
    stubList()
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({ data: mockMetadata })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openView({
      id: 'ds-api', name: '库存接口', type: 'API', formKey: null, sourceKey: 'external-stock',
      status: 'ENABLED', params: JSON.stringify({ list: { action: '/v1/products', method: 'GET' } }),
    })
    await nextTick()
    await flushPromises()

    // Element Plus @tab-click 发送 (pane, event) 两个参数，pane.props.name 包含标签名称
    await (wrapper.vm as any).onTabClick({ props: { name: 'metadata' } })
    await flushPromises()
    expect(dataSourceApi.getMetadata).toHaveBeenCalledWith('ds-api')

    const html = wrapper.html()
    expect(html).toContain('ID')
    expect(html).toContain('名称')
    wrapper.unmount()
  })
})
