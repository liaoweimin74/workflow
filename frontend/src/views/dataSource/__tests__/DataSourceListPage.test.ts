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
    getDbSchemaTables: vi.fn(),
    getDbSchemaColumns: vi.fn(),
    exploreSql: vi.fn(),
    exploreApi: vi.fn(),
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
  Grid: { name: 'Grid', render: () => h('span', '☰') },
  CircleCheck: { name: 'CircleCheck', render: () => h('span', '✓') },
  CircleClose: { name: 'CircleClose', render: () => h('span', '✕') },
  QuestionFilled: { name: 'QuestionFilled', render: () => h('span', '?') },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {} }),
  useRouter: () => ({ push: mockRouterPush }),
}))

const { mockRouterPush } = vi.hoisted(() => ({ mockRouterPush: vi.fn() }))

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
    // SQL 可视化主表/JOIN 候选来自数据库全表（真实 schema）
    ;(dataSourceApi.getDbSchemaTables as any).mockResolvedValue({ data: ['wf_biz_customer', 'wf_biz_order'] })
  }

  // ==================== 操作按钮可见性 ====================

  it('行操作按钮：查看(全部) + 数据管理(非WORKFLOW) + 编辑/删除(API + SQL 类型)', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const actionButtons = stub.props('actionButtons') as any[]

    const viewBtn = actionButtons.find((b: any) => b.label === '查看')
    const dataBtn = actionButtons.find((b: any) => b.label === '数据管理')
    const editBtn = actionButtons.find((b: any) => b.label === '编辑')
    const delBtn = actionButtons.find((b: any) => b.label === '删除')

    expect(viewBtn).toBeDefined()
    expect(dataBtn).toBeDefined()
    expect(editBtn).toBeDefined()
    expect(delBtn).toBeDefined()
    // 启用/禁用按钮已移除（保存即发布）
    expect(actionButtons.some((b: any) => b.label === '启用')).toBe(false)
    expect(actionButtons.some((b: any) => b.label === '禁用')).toBe(false)

    // 编辑/删除仅对 API / SQL 类型显示
    expect(editBtn.show({ type: 'API' })).toBe(true)
    expect(editBtn.show({ type: 'SQL' })).toBe(true)
    expect(editBtn.show({ type: 'FORM' })).toBe(false)
    expect(editBtn.show({ type: 'WORKFLOW' })).toBe(false)
    expect(editBtn.show({ type: 'SYSTEM' })).toBe(false)
    expect(delBtn.show({ type: 'API' })).toBe(true)
    expect(delBtn.show({ type: 'SQL' })).toBe(true)
    expect(delBtn.show({ type: 'FORM' })).toBe(false)
    // 数据管理：非 WORKFLOW 类型显示
    expect(dataBtn.show({ type: 'FORM' })).toBe(true)
    expect(dataBtn.show({ type: 'SYSTEM' })).toBe(true)
    expect(dataBtn.show({ type: 'API' })).toBe(true)
    expect(dataBtn.show({ type: 'SQL' })).toBe(true)
    expect(dataBtn.show({ type: 'WORKFLOW' })).toBe(false)
    // 查看对所有类型显示
    expect(viewBtn.show).toBeUndefined()
    wrapper.unmount()
  })

  it('数据管理：点击跳转数据源数据管理页', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const actionButtons = stub.props('actionButtons') as any[]

    const dataBtn = actionButtons.find((b: any) => b.label === '数据管理')
    await dataBtn.onClick({ id: 'ds-1', type: 'SQL', status: 'ENABLED', name: '报表' })
    expect(mockRouterPush).toHaveBeenCalledWith({ name: 'DataSourceData', params: { id: 'ds-1' } })
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
    // 接口配置 tab 不再有列定义编辑器（收敛到字段元数据 tab）
    expect(wrapper.find('.column-editor').exists()).toBe(false)
    // 字段元数据 tab 提供添加列能力（addMetadataColumn）
    const before = component.apiColumns.length
    await component.addMetadataColumn()
    await nextTick()
    expect(component.apiColumns.length).toBe(before + 1)
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

  it('新建头部：标识/数据源名称/数据源类型/业务表单 四个字段同一行', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()

    // 四个 el-col 处于同一 el-row 内
    const row = wrapper.find('.inline-form-body .el-row')
    expect(row.exists()).toBe(true)
    const cols = row.findAll('.el-col')
    expect(cols.length).toBe(4)
    // 四个 label 文案
    const html = row.html()
    expect(html).toContain('标识')
    expect(html).toContain('数据源名称')
    expect(html).toContain('数据源类型')
    expect(html).toContain('业务表单')
    wrapper.unmount()
  })

  it('新建 API：可绑定业务表单（formKey 可选，提交携带）', async () => {
    stubList()
    ;(dataSourceApi.createDataSource as any).mockResolvedValue({ data: {} })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    const component: any = wrapper.vm as any

    // API 类型显示业务表单绑定下拉（ds-form-key-hint 提示存在）
    expect(component.form.type).toBe('API')
    expect(wrapper.find('[data-testid="ds-form-key-hint"]').exists()).toBe(true)

    // 绑定业务表单后提交，payload 携带 formKey
    component.form.name = '库存接口'
    component.form.sourceKey = 'external-stock'
    component.form.formKey = 'order'
    component.apiOps.list.action = '/v1/products'
    await component.handleSave()
    await flushPromises()

    expect(dataSourceApi.createDataSource).toHaveBeenCalled()
    const payload = (dataSourceApi.createDataSource as any).mock.calls[0][0]
    expect(payload.formKey).toBe('order')
    expect(payload.sourceKey).toBe('external-stock')
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
    expect(wrapper.find('[data-testid="ds-source-key-input"]').exists()).toBe(true)
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
    component.sqlConfig.visual.selectColumns = ['m.order_no', 'c.name AS customer_name']
    component.sqlConfig.visual.joins = [{ alias: 'c', targetTable: 'wf_biz_customer', joinType: 'LEFT JOIN', on: 'c.id = m.customer_id', columns: [] }]
    component.sqlConfig.visual.where = [{ column: 'm.status', op: '=', value: 'PAID' }]
    component.sqlConfig.visual.orderBy = [{ column: 'm.created_at', order: 'DESC' }]
    component.sqlConfig.declaredColumns = [{ key: 'order_no', label: '订单号', columnType: 'VARCHAR', sortable: true, filterable: false, matchType: 'like' }]
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
    expect(p.columns[0].matchType).toBe('like')
    expect(p.params).toEqual(['tenantId'])
    expect(ElMessage.success).toHaveBeenCalledWith('创建成功')
    wrapper.unmount()
  })

  it('新建 SQL（可视化模式）：VQB 多选字段写入 selectColumns，保存保留（不复用 selectColumnsInput）', async () => {
    // 真实 VQB 交互：主表/JOIN 字段选择写入 visual.selectColumns（别名.字段），selectColumnsInput 不被更新
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
    component.form.sourceKey = 'orders-report'
    component.sqlConfig.visual.mainTable = 'wf_biz_order'
    component.sqlConfig.visual.mainAlias = 'm'
    component.sqlConfig.visual.joins = [{ alias: 'c', targetTable: 'wf_biz_customer', joinType: 'LEFT JOIN', on: 'c.id = m.customer_id', columns: [] }]
    // VQB 多选后的权威状态（selectColumnsInput 保持初始空串，模拟真实交互）
    component.sqlConfig.visual.selectColumns = ['m.order_no', 'c.name']
    await nextTick()

    await component.handleSave()
    await flushPromises()

    expect(dataSourceApi.createDataSource).toHaveBeenCalled()
    const p = JSON.parse((dataSourceApi.createDataSource as any).mock.calls[0][0].params)
    expect(p.visual.selectColumns).toContain('m.order_no')
    expect(p.visual.selectColumns).toContain('c.name')
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

  it('SQL/API 类型：业务表单 label 后 ? 提示「有值时合并表单列，CRUD 映射到主表」', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    const component: any = wrapper.vm as any

    // 默认 API 类型也显示业务表单绑定 ? 提示
    expect(wrapper.find('[data-testid="ds-form-key-hint"]').exists()).toBe(true)
    // tooltip content 为需求文案
    let tooltip = wrapper.findAllComponents({ name: 'ElTooltip' }).find((c) => (c.props('content') as string | undefined)?.includes('有值时合并表单列，CRUD 映射到主表'))
    expect(tooltip).toBeDefined()

    // 切换到 SQL 类型后 ? 仍显示
    component.form.type = 'SQL'
    await nextTick()
    expect(wrapper.find('[data-testid="ds-form-key-hint"]').exists()).toBe(true)
    tooltip = wrapper.findAllComponents({ name: 'ElTooltip' }).find((c) => (c.props('content') as string | undefined)?.includes('有值时合并表单列，CRUD 映射到主表'))
    expect(tooltip).toBeDefined()

    // 切换到 SYSTEM 类型后 ? 消失（系统结构无业务表单绑定）
    component.form.type = 'SYSTEM'
    await nextTick()
    expect(wrapper.find('[data-testid="ds-form-key-hint"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('新建弹窗：主表单 label-width 为 auto（标识/数据源名称/数据源类型/业务表单自动宽度）', async () => {
    stubList()
    const wrapper = createWrapper()
    await nextTick()
    ;(wrapper.vm as any).openCreate()
    await nextTick()
    await flushPromises()
    const forms = wrapper.findAllComponents({ name: 'ElForm' })
    expect(forms.length).toBeGreaterThan(0)
    // 主表单（含标识/数据源名称/数据源类型/业务表单）label 自动宽度
    expect(forms[0].props('labelWidth')).toBe('auto')
    // ? 提示图标以 flex 包裹实现相对 label 垂直居中
    const wrap = wrapper.find('[data-testid="ds-form-key-label"]')
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

  it('SQL 可视化配置：主表/JOIN 目标表字段按数据库真实表结构懒加载，tableFields 传给 VisualQueryBuilder', async () => {
    stubList()
    ;(dataSourceApi.getDbSchemaColumns as any).mockImplementation((table: string) => {
      const colsByTable: Record<string, Array<{ key: string; columnType: string }>> = {
        wf_biz_order: [{ key: 'order_no', columnType: 'VARCHAR' }, { key: 'customer_id', columnType: 'VARCHAR' }],
        wf_biz_customer: [{ key: 'id', columnType: 'VARCHAR' }, { key: 'name', columnType: 'VARCHAR' }],
      }
      return Promise.resolve({ data: colsByTable[table] || [] })
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

    // 主表变化 → 按真实表名查 information_schema 列
    expect(dataSourceApi.getDbSchemaColumns).toHaveBeenCalledWith('wf_biz_order')
    expect(component.sqlTableFields['wf_biz_order']).toEqual(['order_no', 'customer_id'])

    // JOIN 目标表变化 → 懒加载目标表字段
    component.sqlConfig.visual.joins = [{ alias: 'c', targetTable: 'wf_biz_customer', joinType: 'LEFT JOIN', on: '', columns: [] }]
    await nextTick()
    await flushPromises()
    expect(dataSourceApi.getDbSchemaColumns).toHaveBeenCalledWith('wf_biz_customer')
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

  it('SQL 可视化：主表候选来自数据库全表（dbTables），首项为已选表本身', async () => {
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
    // 候选 = 数据库全表（真实 schema），首项为已选主表
    expect(cands[0]).toBe('wf_biz_order')
    expect(cands).toContain('wf_biz_customer')
    expect(cands.some((t) => t === 'wf_biz_wf_biz_order')).toBe(false)
    // 已选主表去重（dbTables 中的 wf_biz_order 不重复出现）
    expect(cands.filter((t) => t === 'wf_biz_order')).toHaveLength(1)
    wrapper.unmount()
  })

  it('SQL 可视化：懒加载按真实表名直接查询列（不再剥 wf_biz 前缀查表单定义）', async () => {
    stubList()
    ;(dataSourceApi.getDbSchemaColumns as any).mockResolvedValue({ data: [{ key: 'id', columnType: 'VARCHAR' }] })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const component: any = wrapper.vm as any
    await component.ensureTableFields('service_log')
    expect(dataSourceApi.getDbSchemaColumns).toHaveBeenCalledWith('service_log')
    expect(component.sqlTableFields['service_log']).toEqual(['id'])
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

  it('查看 API 数据源：接口配置无列编辑器，字段元数据 tab 输入禁用', async () => {
    stubList()
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({ data: { columns: [], writable: false } })
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
    // 接口配置 tab 不再有列定义编辑器（列定义收敛到字段元数据 tab）
    expect(wrapper.find('.column-editor').exists()).toBe(false)
    // 字段元数据 tab 回填 apiColumns（单一来源）
    await (wrapper.vm as any).handleTabChange('metadata')
    await flushPromises()
    expect(component.apiColumns.length).toBe(1)
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

  it('SQL 字段元数据标签渲染可编辑列定义表格与工具栏按钮', async () => {
    stubList()
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({ data: mockMetadata })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openView({
      id: 'ds-sql', name: 'SQL数据源', type: 'SQL', formKey: null, sourceKey: 'emp_profile',
      status: 'ENABLED', params: JSON.stringify({
        queryMode: 'visual', query: 'SELECT id FROM wf_biz_emp_profile WHERE tenant_id = :tenantId',
        columns: [
          { key: 'id', label: 'ID', columnType: 'VARCHAR', required: true, hidden: false, sortable: true, filterable: true },
          { key: 'name', label: '名称', columnType: 'VARCHAR', required: false, hidden: false, sortable: true, filterable: true },
        ],
      }),
    })
    await nextTick()
    await flushPromises()

    await (wrapper.vm as any).handleTabChange('metadata')
    await flushPromises()

    const html = wrapper.html()
    // 工具栏：获取字段（SQL 类型）
    expect(html).toContain('获取字段')
    // 行内表格表头（7 列）
    expect(html).toContain('标识')
    expect(html).toContain('字段名')
    expect(html).toContain('组件类型')
    expect(html).toContain('必填')
    expect(html).toContain('隐藏')
    expect(html).toContain('排序')
    expect(html).toContain('筛选')
    // 回填的列数据（编辑对象 = sqlConfig.declaredColumns）
    expect(html).toContain('id')
    expect(html).toContain('ID')
    expect(html).toContain('名称')
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

  it('获取字段：调用 exploreSql 并全量替换 declaredColumns', async () => {
    stubList()
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({ data: mockMetadata })
    ;(dataSourceApi.exploreSql as any).mockResolvedValue({
      data: [
        { key: 'order_no', label: 'order_no', columnType: 'VARCHAR', length: 64 },
        { key: 'amount', label: 'amount', columnType: 'DECIMAL', length: 18, scale: 2 },
      ],
    })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openView({
      id: 'ds-sql', name: 'SQL数据源', type: 'SQL', formKey: null, sourceKey: 'emp_profile',
      status: 'ENABLED', params: JSON.stringify({
        queryMode: 'visual', query: 'SELECT id FROM wf_biz_emp_profile WHERE tenant_id = :tenantId',
        columns: [{ key: 'id', label: 'ID', columnType: 'VARCHAR', sortable: true, filterable: true }],
      }),
    })
    await nextTick()
    await flushPromises()
    await (wrapper.vm as any).handleTabChange('metadata')
    await flushPromises()

    const component: any = wrapper.vm as any
    component.sqlConfig.queryMode = 'sql'
    component.sqlConfig.queryText = 'SELECT order_no, amount FROM wf_biz_order WHERE tenant_id = :tenantId'
    await component.handleExploreSql()
    await flushPromises()

    expect(dataSourceApi.exploreSql).toHaveBeenCalledWith(
      'SELECT order_no, amount FROM wf_biz_order WHERE tenant_id = :tenantId',
    )
    // 全量替换（不再是 1 列）
    expect(component.sqlConfig.declaredColumns).toHaveLength(2)
    expect(component.sqlConfig.declaredColumns[0].key).toBe('order_no')
    expect(component.sqlConfig.declaredColumns[0].columnType).toBe('VARCHAR')
    expect(component.sqlConfig.declaredColumns[1].columnType).toBe('DECIMAL')
    wrapper.unmount()
  })

  it('从接口推断字段（API）：调用 exploreApi 并全量替换 apiColumns', async () => {
    stubList()
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({ data: mockMetadata })
    ;(dataSourceApi.exploreApi as any).mockResolvedValue({
      data: [{ key: 'sku', label: 'sku', columnType: 'VARCHAR' }, { key: 'price', label: 'price', columnType: 'DECIMAL' }],
    })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openView({
      id: 'ds-api', name: '库存接口', type: 'API', formKey: null, sourceKey: 'external-stock',
      status: 'ENABLED', params: JSON.stringify({ list: { action: '/v1/products', method: 'GET' }, columns: [{ key: 'id', label: 'ID', columnType: 'VARCHAR' }] }),
    })
    await nextTick()
    await flushPromises()
    await (wrapper.vm as any).handleTabChange('metadata')
    await flushPromises()

    const component: any = wrapper.vm as any
    await component.handleExploreApi()
    await flushPromises()

    expect(dataSourceApi.exploreApi).toHaveBeenCalledWith(expect.objectContaining({ action: '/v1/products', method: 'GET' }))
    expect(component.apiColumns).toHaveLength(2)
    expect(component.apiColumns[0].key).toBe('sku')
    wrapper.unmount()
  })

  it('从主表单覆盖：匹配 key 全属性覆盖，表单多出的 key 追加，schema 补 componentType', async () => {
    stubList()
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({ data: mockMetadata })
    ;(formApi.getFormDefinitionByKey as any).mockResolvedValue({
      data: {
        formKey: 'emp_profile',
        columnConfig: JSON.stringify([
          { key: 'id', label: '员工ID', columnType: 'VARCHAR', required: true, sortable: true, filterable: true },
          { key: 'dept', label: '部门', columnType: 'VARCHAR', required: false, sortable: true, filterable: true },
        ]),
        schema: JSON.stringify({
          rule: [{
            type: 'fcRow', children: [
              { type: 'input', field: 'id', title: '员工ID' },
              { type: 'select', field: 'dept', title: '部门' },
              { type: 'input', field: 'extra', title: '额外' },
            ],
          }],
        }),
      },
    })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openView({
      id: 'ds-sql', name: 'SQL数据源', type: 'SQL', formKey: 'emp_profile', sourceKey: 'emp_profile',
      status: 'ENABLED', params: JSON.stringify({
        queryMode: 'visual', query: 'SELECT id FROM wf_biz_emp_profile WHERE tenant_id = :tenantId',
        columns: [{ key: 'id', label: 'ID', columnType: 'VARCHAR', required: false, sortable: true, filterable: true }],
      }),
    })
    await nextTick()
    await flushPromises()
    await (wrapper.vm as any).handleTabChange('metadata')
    await flushPromises()

    const component: any = wrapper.vm as any
    await component.handleOverlayFromForm()
    await flushPromises()

    expect(formApi.getFormDefinitionByKey).toHaveBeenCalledWith('emp_profile')
    // id：全属性覆盖（label 变 员工ID，required 变 true）
    const idCol = component.sqlConfig.declaredColumns.find((c: any) => c.key === 'id')
    expect(idCol.label).toBe('员工ID')
    expect(idCol.required).toBe(true)
    expect(idCol.componentType).toBe('input')  // schema.rule 补充
    // dept：表单多出的 key 追加，componentType 从 schema 补充
    const deptCol = component.sqlConfig.declaredColumns.find((c: any) => c.key === 'dept')
    expect(deptCol).toBeDefined()
    expect(deptCol.label).toBe('部门')
    expect(deptCol.componentType).toBe('select')  // schema.rule 补充
    wrapper.unmount()
  })

  it('字段元数据行内编辑 + 保存：params.columns 携带全字段更新值', async () => {
    stubList()
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({ data: mockMetadata })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    ;(wrapper.vm as any).openView({
      id: 'ds-sql', name: 'SQL数据源', type: 'SQL', formKey: null, sourceKey: 'emp_profile',
      status: 'ENABLED', params: JSON.stringify({
        queryMode: 'visual', query: 'SELECT id FROM wf_biz_emp_profile WHERE tenant_id = :tenantId',
        columns: [{ key: 'id', label: 'ID', columnType: 'VARCHAR', required: false, hidden: false, sortable: true, filterable: true }],
      }),
    })
    await nextTick()
    await flushPromises()
    await (wrapper.vm as any).handleTabChange('metadata')
    await flushPromises()

    const component: any = wrapper.vm as any
    // 行内编辑 label + required
    component.sqlConfig.declaredColumns[0].label = '标识ID'
    component.sqlConfig.declaredColumns[0].required = true

    // 触发保存：校验 buildSqlParams 输出全字段
    const params = component.buildSqlParams()
    const col = params.columns[0]
    expect(col.key).toBe('id')
    expect(col.label).toBe('标识ID')
    expect(col.required).toBe(true)
    expect(col.hidden).toBe(false)
    expect(col.sortable).toBe(true)
    expect(col.filterable).toBe(true)
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

    // SYSTEM 类型无编辑工具栏，显示只读表格
    expect(wrapper.vm.isEditableType).toBe(false)
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
