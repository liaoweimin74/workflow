// ----- TDD: DataSourceListPage 列表/新建/编辑/删除交互 -----
// 数据源管理模式：FORM/WORKFLOW/SYSTEM 由系统自动管理（只读）；第三方 API 支持手动增删改
// npx vitest run src/views/dataSource/__tests__/DataSourceListPage.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'
import DataSourceListPage from '../DataSourceListPage.vue'
import VisualQueryBuilder from '../components/VisualQueryBuilder.vue'
import FieldMappingPreview from '../components/FieldMappingPreview.vue'

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
    getFormDefinitionByKey: vi.fn(),
  },
}))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return { ...actual, ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }, ElMessageBox: { confirm: vi.fn() } }
})
vi.mock('@element-plus/icons-vue', () => ({
  Plus: { name: 'Plus', render: () => h('span', '+') },
  Delete: { name: 'Delete', render: () => h('span', '×') },
  Edit: { name: 'Edit', render: () => h('span', '✎') },
  View: { name: 'View', render: () => h('span', '👁') },
  Close: { name: 'Close', render: () => h('span', '✕') },
  CircleCheck: { name: 'CircleCheck', render: () => h('span', '✓') },
  CircleClose: { name: 'CircleClose', render: () => h('span', '✕') },
  QuestionFilled: { name: 'QuestionFilled', render: () => h('span', '?') },
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

  it('行操作按钮：查看(全部) + 编辑/删除(API + SQL 类型)', async () => {
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

    // 编辑/删除仅对 API / SQL 类型显示
    expect(editBtn.show({ type: 'API' })).toBe(true)
    expect(editBtn.show({ type: 'SQL' })).toBe(true)
    expect(editBtn.show({ type: 'FORM' })).toBe(false)
    expect(editBtn.show({ type: 'WORKFLOW' })).toBe(false)
    expect(editBtn.show({ type: 'SYSTEM' })).toBe(false)
    expect(delBtn.show({ type: 'API' })).toBe(true)
    expect(delBtn.show({ type: 'SQL' })).toBe(true)
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

  // ==================== SQL 数据源增删改 ====================

  it('新建 SQL：sourceKey 必填（缺失时拦截，不提交）', async () => {
    stubList()
    ;(dataSourceApi.createDataSource as any).mockResolvedValue({ data: {} })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    const component: any = wrapper.vm as any
    component.form.type = 'SQL'
    component.form.name = '订单联查'
    component.sqlConfig.visual.mainTable = 'wf_biz_order'
    component.sqlConfig.visual.selectColumnsInput = 'm.order_no'
    await nextTick()

    await component.handleSave()
    await flushPromises()

    expect(dataSourceApi.createDataSource).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith('请输入数据源标识（sourceKey）')
    wrapper.unmount()
  })

  it('编辑 SQL：sourceKey 输入框回填（source_key 即唯一标识）', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    await (wrapper.vm as any).openEdit({
      id: 'ds-sql-1', name: '报表', type: 'SQL', sourceKey: 'orders-report', formKey: 'order',
      status: 'ENABLED', params: '{}',
    })
    await nextTick()
    await flushPromises()

    // form 状态回填 sourceKey
    expect((wrapper.vm as any).form.sourceKey).toBe('orders-report')
    // SQL 标识列渲染 sourceKey 输入框（data-testid 定位组件根）
    expect(wrapper.find('[data-testid="sql-source-key-input"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('新建 SQL（可视化模式）：保存序列化 queryMode/visual/query，调用 createDataSource', async () => {
    stubList()
    ;(dataSourceApi.createDataSource as any).mockResolvedValue({ data: {} })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    const component: any = wrapper.vm as any
    component.form.type = 'SQL'
    await nextTick()

    // 可视化配置区可见
    expect(wrapper.html()).toContain('可视化配置')
    expect(wrapper.html()).toContain('SQL 模式')

    // 填写可视化配置
    component.form.name = '订单联查'
    component.form.sourceKey = 'orders-report'
    component.sqlConfig.visual.mainTable = 'wf_biz_order'
    component.sqlConfig.visual.mainAlias = 'm'
    component.sqlConfig.visual.selectColumnsInput = 'm.order_no, c.name AS customer_name'
    component.sqlConfig.visual.joins = [{ alias: 'c', targetTable: 'wf_biz_customer', joinType: 'LEFT JOIN', on: 'c.id = m.customer_id', columns: [] }]
    component.sqlConfig.visual.where = [{ column: 'm.status', op: '=', value: 'PAID' }]
    component.sqlConfig.visual.orderBy = [{ column: 'm.created_at', order: 'DESC' }]
    component.sqlConfig.declaredColumns = [{ key: 'order_no', label: '订单号', columnType: 'VARCHAR', sortable: true, filterable: false }]
    component.sqlConfig.declaredParams = ['tenantId']
    await nextTick()

    await component.handleSave()
    await flushPromises()

    expect(dataSourceApi.createDataSource).toHaveBeenCalled()
    const payload = (dataSourceApi.createDataSource as any).mock.calls[0][0]
    expect(payload.type).toBe('SQL')
    expect(payload.sourceKey).toBe('orders-report')
    expect(payload.formKey).toBeNull()
    const p = JSON.parse(payload.params)
    expect(p.queryMode).toBe('visual')
    expect(p.visual.mainTable).toBe('wf_biz_order')
    expect(p.visual.joins[0].targetTable).toBe('wf_biz_customer')
    expect(p.visual.selectColumns).toContain('m.order_no')
    // 可视化模式也会生成 SQL 文本（前端预览，后端重新生成）
    expect(p.query).toContain('FROM wf_biz_order')
    expect(p.columns[0].key).toBe('order_no')
    expect(p.params).toEqual(['tenantId'])
    expect(ElMessage.success).toHaveBeenCalledWith('创建成功')
    wrapper.unmount()
  })

  it('SQL 配置区：接口操作分割线移除，可视化/SQL 模式改为按钮切换（保留 queryMode 逻辑）', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    const component: any = wrapper.vm as any
    component.form.type = 'SQL'
    await nextTick()

    // 需求1：接口操作分割线移除
    expect(wrapper.html()).not.toContain('接口操作')
    // 需求2：SQL 区内部 tab 改为按钮（el-radio-group），保留可视化配置/SQL 模式文案
    expect(wrapper.html()).toContain('可视化配置')
    expect(wrapper.html()).toContain('SQL 模式')
    expect(wrapper.find('.el-radio-group').exists()).toBe(true)
    expect(component.sqlConfig.queryMode).toBe('visual')
    // 按钮文案渲染（el-radio-button）
    const btns = wrapper.findAll('.el-radio-button')
    expect(btns.length).toBeGreaterThanOrEqual(2)
    // 切换逻辑保留：切到 sql 模式且 queryText 为空时用可视化配置生成起点
    component.sqlConfig.visual.mainTable = 'wf_biz_order'
    component.sqlConfig.queryMode = 'sql'
    await component.onSqlModeChange()
    expect(component.sqlConfig.queryText).toContain('FROM wf_biz_order')
    wrapper.unmount()
  })

  it('SQL 类型：标识 label 后 ? 提示「有值时合并表单列，CRUD 映射到主表」，仅 SQL 类型显示', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    const component: any = wrapper.vm as any
    component.form.type = 'SQL'
    await nextTick()

    // ? 提示图标存在（data-testid 定位）
    expect(wrapper.find('[data-testid="sql-form-key-hint"]').exists()).toBe(true)
    // tooltip content 为需求文案
    const tooltip = wrapper.findAllComponents({ name: 'ElTooltip' }).find((c) => (c.props('content') as string | undefined)?.includes('有值时合并表单列，CRUD 映射到主表'))
    expect(tooltip).toBeDefined()

    // 切换回 API 类型后 ? 消失
    component.form.type = 'API'
    await nextTick()
    expect(wrapper.find('[data-testid="sql-form-key-hint"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('新建弹窗：主表单 label-width 为 auto（标识/数据源名称/数据源类型自动宽度）', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    const forms = wrapper.findAllComponents({ name: 'ElForm' })
    expect(forms.length).toBeGreaterThan(0)
    // 主表单（含标识/数据源名称/数据源类型）label 自动宽度
    expect(forms[0].props('labelWidth')).toBe('auto')
    // ? 提示图标以 flex 包裹实现相对 label 垂直居中
    const wrap = wrapper.find('[data-testid="sql-form-key-label"]')
    expect(wrap.exists()).toBe(true)
    const style = (wrap.attributes('style') || '').replace(/\s+/g, '')
    expect(style).toContain('display:inline-flex')
    expect(style).toContain('align-items:center')
    wrapper.unmount()
  })

  it('SQL 类型：选择标识后接口配置区不再显示字段映射预览（FieldMappingPreview 已移除）', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    const component: any = wrapper.vm as any
    component.form.type = 'SQL'
    component.form.formKey = 'order'
    await nextTick()
    await flushPromises()
    expect(wrapper.findComponent(FieldMappingPreview).exists()).toBe(false)
    wrapper.unmount()
  })

  it('SQL 可视化配置：主表/JOIN 目标表字段按表单懒加载，tableFields 传给 VisualQueryBuilder', async () => {
    stubList()
    ;(formApi.getFormDefinitionByKey as any).mockImplementation((key: string) => {
      const colsByKey: Record<string, Array<{ key: string; label: string }>> = {
        order: [{ key: 'order_no', label: '订单号' }, { key: 'customer_id', label: '客户ID' }],
        customer: [{ key: 'id', label: 'ID' }, { key: 'name', label: '名称' }],
      }
      return Promise.resolve({ data: { formKey: key, name: key, columnConfig: JSON.stringify(colsByKey[key] || []) } })
    })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    const component: any = wrapper.vm as any
    component.form.type = 'SQL'
    component.sqlConfig.visual.mainTable = 'wf_biz_order'
    await nextTick()
    await flushPromises()

    // 主表变化 → 按表单懒加载字段
    expect(formApi.getFormDefinitionByKey).toHaveBeenCalledWith('order')
    expect(component.sqlTableFields['wf_biz_order']).toEqual(['order_no', 'customer_id'])

    // JOIN 目标表变化 → 懒加载目标表字段
    component.sqlConfig.visual.joins = [{ alias: 'c', targetTable: 'wf_biz_customer', joinType: 'LEFT JOIN', on: '', columns: [] }]
    await nextTick()
    await flushPromises()
    expect(formApi.getFormDefinitionByKey).toHaveBeenCalledWith('customer')
    expect(component.sqlTableFields['wf_biz_customer']).toEqual(['id', 'name'])

    // VisualQueryBuilder 收到 tableFields prop
    const vqb = wrapper.findComponent(VisualQueryBuilder)
    expect((vqb.props('tableFields') as Record<string, string[]>)['wf_biz_order']).toEqual(['order_no', 'customer_id'])
    expect((vqb.props('tableFields') as Record<string, string[]>)['wf_biz_customer']).toEqual(['id', 'name'])
    wrapper.unmount()
  })

  it('SQL 可视化：主表候选不产生 wf_biz_{formKey} 字面量占位符', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    const component: any = wrapper.vm as any
    component.form.type = 'SQL'
    await nextTick()
    await flushPromises()
    const cands = component.visualTableCandidates as string[]
    expect(cands.some((t) => t.includes('{formKey}'))).toBe(false)
    wrapper.unmount()
  })

  it('SQL 可视化：主表候选首项为已选表本身，不再拼接 wf_biz 双前缀', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    const component: any = wrapper.vm as any
    component.form.type = 'SQL'
    component.sqlConfig.visual.mainTable = 'wf_biz_order'
    await nextTick()
    await flushPromises()
    const cands = component.visualTableCandidates as string[]
    expect(cands[0]).toBe('wf_biz_order')
    expect(cands.some((t) => t === 'wf_biz_wf_biz_order')).toBe(false)
    wrapper.unmount()
  })

  it('SQL 可视化：双前缀表名懒加载时剥离全部 wf_biz 前缀再查表单', async () => {
    stubList()
    ;(formApi.getFormDefinitionByKey as any).mockResolvedValue({ data: { formKey: 'selector_test', columnConfig: null } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const component: any = wrapper.vm as any
    await component.ensureTableFields('wf_biz_wf_biz_selector_test')
    expect(formApi.getFormDefinitionByKey).toHaveBeenCalledWith('selector_test')
    wrapper.unmount()
  })

  it('新建 SQL：可视化模式缺主表时阻止保存', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    const component: any = wrapper.vm as any
    component.form.type = 'SQL'
    component.form.name = '未配置主表'
    component.form.sourceKey = 'orders-report'
    await nextTick()

    await component.handleSave()
    await flushPromises()

    expect(dataSourceApi.createDataSource).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith('请配置主表')
    wrapper.unmount()
  })

  it('新建 SQL（SQL 模式）：保存 SQL 文本为空时阻止，填写后直存 query', async () => {
    stubList()
    ;(dataSourceApi.createDataSource as any).mockResolvedValue({ data: {} })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    const component: any = wrapper.vm as any
    component.form.type = 'SQL'
    component.form.name = '手写 SQL'
    component.form.sourceKey = 'orders-report'
    component.sqlConfig.queryMode = 'sql'
    await nextTick()

    // 空 SQL 阻止保存
    await component.handleSave()
    await flushPromises()
    expect(dataSourceApi.createDataSource).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith('请输入 SQL 模板')

    // 填写后保存
    component.sqlConfig.queryText = 'SELECT * FROM wf_biz_order WHERE tenant_id = :tenantId'
    await component.handleSave()
    await flushPromises()
    const payload = (dataSourceApi.createDataSource as any).mock.calls[0][0]
    const p = JSON.parse(payload.params)
    expect(p.queryMode).toBe('sql')
    expect(p.query).toContain('SELECT * FROM wf_biz_order')
    expect(ElMessage.success).toHaveBeenCalledWith('创建成功')
    wrapper.unmount()
  })

  it('编辑 SQL：回填 queryMode/visual/query/columns/params，保存调用 updateDataSource', async () => {
    stubList()
    ;(dataSourceApi.updateDataSource as any).mockResolvedValue({ data: {} })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    await (wrapper.vm as any).openEdit({
      id: 'ds-sql', name: '订单联查', type: 'SQL', formKey: 'order', sourceKey: 'orders-report',
      status: 'ENABLED',
      params: JSON.stringify({
        queryMode: 'visual',
        visual: {
          mainTable: 'wf_biz_order', mainAlias: 'm',
          joins: [{ alias: 'c', targetTable: 'wf_biz_customer', joinType: 'LEFT JOIN', on: 'c.id = m.customer_id', columns: [] }],
          selectColumns: ['m.order_no', 'c.name AS customer_name'],
          where: [{ column: 'm.status', op: '=', value: 'PAID' }],
          orderBy: [{ column: 'm.created_at', order: 'DESC' }],
        },
        query: 'SELECT m.order_no FROM wf_biz_order m LEFT JOIN wf_biz_customer c ON c.id = m.customer_id',
        columns: [{ key: 'order_no', label: '订单号', columnType: 'VARCHAR', sortable: true, filterable: false }],
        params: ['tenantId'],
      }),
    })
    await nextTick()
    await flushPromises()

    const component: any = wrapper.vm as any
    expect(component.form.type).toBe('SQL')
    expect(component.isReadonlyForm).toBe(false)
    expect(component.sqlConfig.queryMode).toBe('visual')
    expect(component.sqlConfig.visual.mainTable).toBe('wf_biz_order')
    expect(component.sqlConfig.visual.selectColumnsInput).toContain('m.order_no')
    expect(component.sqlConfig.declaredColumns.length).toBe(1)
    expect(component.sqlConfig.declaredParams).toEqual(['tenantId'])

    // 保存：再次提交结构化 params
    await component.handleSave()
    await flushPromises()
    expect(dataSourceApi.updateDataSource).toHaveBeenCalled()
    const payload = (dataSourceApi.updateDataSource as any).mock.calls[0][1]
    expect(payload.sourceKey).toBe('orders-report')
    const p = JSON.parse(payload.params)
    expect(p.queryMode).toBe('visual')
    expect(p.visual.mainTable).toBe('wf_biz_order')
    expect(ElMessage.success).toHaveBeenCalledWith('保存成功')
    wrapper.unmount()
  })

  it('查看 SQL 数据源：只读视图模式，sqlConfig 正确回填', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openView({
      id: 'ds-sql', name: '订单联查', type: 'SQL', formKey: 'order', sourceKey: null,
      status: 'ENABLED',
      params: JSON.stringify({
        queryMode: 'visual',
        visual: { mainTable: 'wf_biz_order', mainAlias: 'm', joins: [], selectColumns: ['m.order_no'], where: [], orderBy: [] },
        query: 'SELECT m.order_no FROM wf_biz_order m',
        columns: [{ key: 'order_no', label: '订单号', columnType: 'VARCHAR' }],
        params: ['tenantId'],
      }),
    })
    await nextTick()
    await flushPromises()

    const component: any = wrapper.vm as any
    expect(component.isViewMode).toBe(true)
    expect(component.isReadonlyForm).toBe(true)
    expect(component.sqlConfig.queryMode).toBe('visual')
    expect(component.sqlConfig.visual.mainTable).toBe('wf_biz_order')
    // 查看模式：SQL tab 内 textarea 禁用
    expect(component.sqlConfig.declaredColumns.length).toBe(1)
    wrapper.unmount()
  })

  it('SQL 模式手改文本：标记可视化过期，重置后恢复', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    const component: any = wrapper.vm as any
    component.form.type = 'SQL'
    component.sqlConfig.visual.mainTable = 'wf_biz_order'
    component.sqlConfig.queryMode = 'sql'
    component.sqlConfig.queryText = 'SELECT * FROM wf_biz_order'
    await nextTick()

    // 手动编辑 SQL → stale
    component.markSqlEdited()
    expect(component.sqlConfig.isStale).toBe(true)

    // 重置为可视化 → 清除 stale 与 SQL 文本，恢复 visual 模式
    component.resetToVisual()
    expect(component.sqlConfig.isStale).toBe(false)
    expect(component.sqlConfig.queryText).toBe('')
    expect(component.sqlConfig.queryMode).toBe('visual')
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

  // ==================== 类型：新建可切换 API/SQL，编辑/查看为静态标签 ====================

  it('新建弹窗：类型 radio 可切换 API / SQL；编辑为静态标签', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    // 默认关闭：无 radio
    expect(wrapper.find('.el-radio-group').exists()).toBe(false)

    // 新建：类型 radio 可选 API / SQL
    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    expect((wrapper.vm as any).form.type).toBe('API')
    // 切换到 SQL：可编辑 SQL 配置区
    ;(wrapper.vm as any).form.type = 'SQL'
    await nextTick()
    expect((wrapper.vm as any).form.type).toBe('SQL')
    expect((wrapper.vm as any).isEditableType).toBe(true)
    expect((wrapper.vm as any).isReadonlyForm).toBe(false)

    // 查看 FORM：类型标签显示「业务表单」，radio 不渲染
    ;(wrapper.vm as any).openView({
      id: 'ds-form', name: '用户数据', type: 'FORM', formKey: 'user', sourceKey: null,
      status: 'ENABLED', params: null,
    })
    await nextTick()
    await flushPromises()
    expect(wrapper.html()).toContain('业务表单')
    expect(wrapper.find('.el-radio-group').exists()).toBe(false)
    wrapper.unmount()
  })

  // ==================== 字段元数据 + 数据预览标签页 ====================

  const mockMetadata = {
    columns: [
      { key: 'id', label: 'ID', columnType: 'VARCHAR', length: 64, required: true, unique: true, indexed: false, componentType: 'input' },
      { key: 'name', label: '名称', columnType: 'VARCHAR', length: 128, required: true, unique: false, indexed: false, componentType: 'input' },
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
    expect(html).toContain('标识')
    expect(html).toContain('组件')
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
      expect.objectContaining({ page: 1, size: 20 })
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

  // ==================== 嵌入方式打开表单（替代弹窗） ====================

  it('新建：表单以页内嵌入覆盖层打开（无 el-dialog，存在 inline-form-overlay + 标题）', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()

    // 不再使用 el-dialog 弹窗
    expect(wrapper.find('.el-dialog').exists()).toBe(false)
    expect(wrapper.find('.el-overlay').exists()).toBe(false)
    // 嵌入覆盖层渲染，标题保留
    expect(wrapper.find('.inline-form-overlay').exists()).toBe(true)
    expect(wrapper.find('.inline-form-title').text()).toContain('新建数据源')
    wrapper.unmount()
  })

  it('新建/编辑：嵌入覆盖层 footer 含取消 + 保存按钮（保存触发 handleSave）', async () => {
    stubList()
    ;(dataSourceApi.createDataSource as any).mockResolvedValue({ data: {} })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()

    const footer = wrapper.find('.inline-form-footer')
    expect(footer.exists()).toBe(true)
    const buttons = footer.findAll('button')
    const texts = buttons.map((b) => b.text())
    expect(texts).toContain('取消')
    expect(texts).toContain('保存')

    const component: any = wrapper.vm as any
    component.form.name = '库存接口'
    component.form.sourceKey = 'external-stock'
    component.apiOps.list.action = '/v1/products'
    await nextTick()
    const saveBtn = buttons.find((b) => b.text() === '保存')
    await saveBtn!.trigger('click')
    await flushPromises()
    expect(dataSourceApi.createDataSource).toHaveBeenCalled()
    // 保存后覆盖层关闭
    expect(wrapper.find('.inline-form-overlay').exists()).toBe(false)
    wrapper.unmount()
  })

  it('查看模式：嵌入覆盖层 footer 仅含关闭按钮（保存按钮不出现）', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openView({
      id: 'ds-sys', name: '部门树', type: 'SYSTEM', formKey: null, sourceKey: 'dept-tree',
      status: 'ENABLED', params: null,
    })
    await nextTick()
    await flushPromises()

    const footer = wrapper.find('.inline-form-footer')
    expect(footer.exists()).toBe(true)
    const texts = footer.findAll('button').map((b) => b.text())
    expect(texts).toContain('关闭')
    expect(texts).not.toContain('保存')
    wrapper.unmount()
  })

  it('嵌入覆盖层：header 关闭按钮点击后覆盖层关闭', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    expect(wrapper.find('.inline-form-overlay').exists()).toBe(true)

    const closeBtn = wrapper.find('.inline-form-header button')
    await closeBtn.trigger('click')
    await nextTick()
    expect(wrapper.find('.inline-form-overlay').exists()).toBe(false)
    wrapper.unmount()
  })
})
