// ----- TDD: DataSourceListPage 列表/动态表单/启用禁用/删除交互 -----
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
    ElMessage: { success: vi.fn(), error: vi.fn() },
  }
})

import { dataSourceApi } from '@/api/data-source'
import { formApi } from '@/api/form'
import { ElMessageBox, ElMessage } from 'element-plus'

beforeEach(() => {
  vi.clearAllMocks()
})

/** SearchTable 桩：透传 actionButtons/formConfig/fetchApi，供测试驱动 */
const SearchTableStub = defineComponent({
  props: ['searchFields', 'columns', 'actionButtons', 'fetchApi', 'formConfig', 'defaultPageSize', 'maxVisibleButtons'],
  setup() {
    return () => h('div', { class: 'search-table-stub' })
  },
})

function createWrapper() {
  return mount(DataSourceListPage, {
    global: {
      plugins: [ElementPlus],
      stubs: { SearchTable: SearchTableStub },
    },
  })
}

describe('DataSourceListPage — 列表/动态表单/启用禁用/删除', () => {
  it('onMounted 加载已发布表单注入 FORM 分支 formKey 下拉候选；fetchApi 透传分页参数', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({
      data: { content: [{ id: 'ds1', name: '员工档案数据源', type: 'FORM', formKey: 'emp_profile', sourceKey: null, status: 'DRAFT' }], totalElements: 1 },
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
    // formKey 下拉候选注入到 type 字段 control 的 FORM 分支
    const formConfig = stub.props('formConfig') as any
    const typeRule = formConfig.rule.find((r: any) => r.field === 'type')
    const formControl = typeRule.control.find((c: any) => c.value === 'FORM')
    const formKeyRule = formControl.rule.find((r: any) => r.field === 'formKey')
    expect(formKeyRule.options).toHaveLength(1)
    expect(formKeyRule.options[0]).toEqual({ label: '员工档案', value: 'emp_profile' })
    // fetchApi：SearchTable 透传的查询参数 → dataSourceApi.getDataSources（page 转 0 基）
    const fetchApi = stub.props('fetchApi') as (params: any) => Promise<any>
    const res = await fetchApi({ page: 2, size: 20, name: '档案', status: 'DRAFT', type: 'FORM' })
    expect(dataSourceApi.getDataSources).toHaveBeenCalledWith({
      page: 1,
      size: 20,
      name: '档案',
      status: 'DRAFT',
      type: 'FORM',
    })
    expect(res).toEqual({
      rows: [{ id: 'ds1', name: '员工档案数据源', type: 'FORM', formKey: 'emp_profile', sourceKey: null, status: 'DRAFT' }],
      total: 1,
    })
    wrapper.unmount()
  })

  it('动态表单：type 单选 control 联动 FORM/SYSTEM/API 字段组', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const formConfig = stub.props('formConfig') as any
    const typeRule = formConfig.rule.find((r: any) => r.field === 'type')
    expect(typeRule.type).toBe('radio')
    expect(typeRule.value).toBe('FORM')
    const controls = typeRule.control as { value: string; rule: any[] }[]
    expect(controls.map((c) => c.value)).toEqual(['FORM', 'SYSTEM', 'API'])
    // FORM 分支 → formKey select
    const formCtl = controls.find((c) => c.value === 'FORM')!
    expect(formCtl.rule.map((r) => r.field)).toEqual(['formKey'])
    expect(formCtl.rule[0].type).toBe('select')
    // SYSTEM 分支 → sourceKey select（dept-tree/user-tree 枚举）
    const sysCtl = controls.find((c) => c.value === 'SYSTEM')!
    expect(sysCtl.rule.map((r) => r.field)).toEqual(['sourceKey'])
    expect(sysCtl.rule[0].options).toEqual([
      { label: '部门树', value: 'dept-tree' },
      { label: '用户树', value: 'user-tree' },
    ])
    // API 分支 → sourceKey 输入 + LookupFetchConfig 结构化字段（action/method/parse/totalParse/searchParam/keywordColumn/pageBase/data/headers）
    const apiCtl = controls.find((c) => c.value === 'API')!
    expect(apiCtl.rule.map((r) => r.field)).toEqual([
      'sourceKey', 'action', 'method', 'parse', 'totalParse',
      'searchParam', 'keywordColumn', 'pageBase', 'data', 'headers',
    ])
    expect(apiCtl.rule[0].type).toBe('input')
    // action 必填（LookupFetchConfig 契约）；method/pageBase 单选
    expect(apiCtl.rule[1].type).toBe('input')
    expect(apiCtl.rule[1].validate).toBeDefined()
    expect(apiCtl.rule[2].type).toBe('radio')
    expect(apiCtl.rule[8].type).toBe('textarea')
    expect(apiCtl.rule[9].type).toBe('textarea')
    wrapper.unmount()
  })

  it('API 类型提交：action/method/parse/… 序列化为 params JSON（LookupFetchConfig 结构）', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    ;(dataSourceApi.createDataSource as any).mockResolvedValue({ data: { id: 'ds1' } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const formConfig = stub.props('formConfig') as any
    const res = await formConfig.createApi({
      name: '外部库存 API',
      type: 'API',
      sourceKey: 'external-stock',
      action: '/v1/external/list',
      method: 'POST',
      parse: 'records',
      totalParse: 'total',
      searchParam: 'kw',
      keywordColumn: 'name',
      pageBase: 0,
      data: '{"dept":"IT"}',
      headers: '{"X-Api-Key":"abc"}',
    })
    expect(dataSourceApi.createDataSource).toHaveBeenCalledTimes(1)
    const payload = (dataSourceApi.createDataSource as any).mock.calls[0][0]
    expect(payload.formKey).toBeNull()
    expect(payload.sourceKey).toBe('external-stock')
    const params = JSON.parse(payload.params) as Record<string, any>
    expect(params).toEqual({
      action: '/v1/external/list',
      method: 'POST',
      parse: 'records',
      totalParse: 'total',
      searchParam: 'kw',
      keywordColumn: 'name',
      pageBase: 0,
      data: { dept: 'IT' },
      headers: { 'X-Api-Key': 'abc' },
    })
    expect(res).toEqual({ data: { id: 'ds1' } })
    wrapper.unmount()
  })

  it('API 类型提交：data/headers 留空时省略；非法 JSON 时回退空对象', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    ;(dataSourceApi.createDataSource as any).mockResolvedValue({ data: { id: 'ds1' } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const formConfig = stub.props('formConfig') as any
    await formConfig.createApi({
      name: '外部库存 API',
      type: 'API',
      sourceKey: 'external-stock',
      action: '/v1/external/list',
      method: 'GET',
      data: '',
      headers: 'not-json',
    })
    const payload = (dataSourceApi.createDataSource as any).mock.calls[0][0]
    const params = JSON.parse(payload.params) as Record<string, any>
    expect(params.data).toBeUndefined()
    expect(params.headers).toBeUndefined()
    wrapper.unmount()
  })

  it('编辑回填：getApi 返回 DTO，API 类型 params JSON 拆回各字段（data/headers JSON 化）', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    ;(dataSourceApi.getDataSource as any).mockResolvedValue({
      data: {
        id: 'ds1',
        name: '外部库存 API',
        type: 'API',
        formKey: null,
        sourceKey: 'external-stock',
        status: 'DRAFT',
        params: JSON.stringify({
          action: '/v1/external/list',
          method: 'POST',
          parse: 'records',
          totalParse: 'total',
          searchParam: 'kw',
          keywordColumn: 'name',
          pageBase: 0,
          data: { dept: 'IT' },
          headers: { 'X-Api-Key': 'abc' },
        }),
      },
    })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const formConfig = stub.props('formConfig') as any
    const formValues = await formConfig.getApi('ds1')
    expect(formValues.action).toBe('/v1/external/list')
    expect(formValues.method).toBe('POST')
    expect(formValues.parse).toBe('records')
    expect(formValues.searchParam).toBe('kw')
    expect(formValues.keywordColumn).toBe('name')
    expect(formValues.pageBase).toBe(0)
    expect(JSON.parse(formValues.data)).toEqual({ dept: 'IT' })
    expect(JSON.parse(formValues.headers)).toEqual({ 'X-Api-Key': 'abc' })
    wrapper.unmount()
  })

  it('创建提交：FORM 类型归一化提交（formKey 保留，sourceKey 置空）', async () => {
    ;(dataSourceApi.getDataSources as any).mockResolvedValue({ data: { content: [], totalElements: 0 } })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    ;(dataSourceApi.createDataSource as any).mockResolvedValue({ data: { id: 'ds1' } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const stub = wrapper.findComponent(SearchTableStub)
    const formConfig = stub.props('formConfig') as any
    const res = await formConfig.createApi({
      name: '员工档案数据源',
      type: 'FORM',
      formKey: 'emp_profile',
      sourceKey: 'whatever',
      params: '{"a":1}',
    })
    expect(dataSourceApi.createDataSource).toHaveBeenCalledWith({
      name: '员工档案数据源',
      type: 'FORM',
      formKey: 'emp_profile',
      sourceKey: null,
      params: null,
    })
    expect(res).toEqual({ data: { id: 'ds1' } })
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
})