// ----- TDD: LookupPickerConfigDialog 列 label 保持测试 -----
// npx vitest run src/views/form/components/__tests__/LookupPickerConfigDialog.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import LookupPickerConfigDialog from '../LookupPickerConfigDialog.vue'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getEnabledDataSources: vi.fn(),
  },
}))

import { dataSourceApi } from '@/api/data-source'

beforeEach(() => {
  vi.clearAllMocks()
})

/** 模拟已配置的底表模式字段：columns 含中文 label */
function createWrapper(overrides: Record<string, any> = {}) {
  const wrapper = mount(LookupPickerConfigDialog, {
    props: {
      modelValue: false,
      currentFields: ['name', 'dept'],
      targetForms: [{ key: 'emp_profile', name: '员工档案' }],
      targetColumns: [],
      lookupProps: {
        sourceType: 'form',
        sourceFormKey: 'emp_profile',
        displayField: 'name',
        columns: [
          { prop: 'name', label: '员工名称' },
          { prop: 'dept', label: '部门' },
        ],
        returnFields: {},
        fetch: {
          action: '/v1/biz-data/emp_profile',
          method: 'GET',
          parse: 'records',
          totalParse: 'total',
          searchParam: 'keyword',
          keywordColumn: 'name',
        },
      },
      formDataSources: [],
      enabledDataSources: [],
      ...overrides,
    },
    global: { plugins: [ElementPlus] },
  })
  // 打开弹窗触发 watch 回填
  void wrapper.setProps({ modelValue: true })
  return wrapper
}

describe('LookupPickerConfigDialog — 列 label 保持', () => {
  it('重新打开弹窗（targetColumns 未加载）时保存，columns label 不丢失为中文', async () => {
    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    await vm.handleConfirm()
    const emitted = wrapper.emitted('confirm') as any[]
    expect(emitted).toBeTruthy()
    const props = emitted[0][0]
    expect(props.columns).toEqual([
      { prop: 'name', label: '员工名称' },
      { prop: 'dept', label: '部门' },
    ])
  })

  it('targetColumns 已加载时 label 取 targetColumns 的 label', async () => {
    const wrapper = createWrapper({
      targetColumns: [
        { key: 'name', label: '员工名称', columnType: 'VARCHAR', length: 64, scale: null, required: false, unique: false, indexed: false },
        { key: 'dept', label: '部门', columnType: 'VARCHAR', length: 64, scale: null, required: false, unique: false, indexed: false },
      ],
    })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    await vm.handleConfirm()
    const emitted = wrapper.emitted('confirm') as any[]
    const props = emitted[0][0]
    expect(props.columns).toEqual([
      { prop: 'name', label: '员工名称' },
      { prop: 'dept', label: '部门' },
    ])
  })
})

describe('LookupPickerConfigDialog — 选择模式与 idField', () => {
  it('confirm 产出 idField（模式恒为单选）', async () => {
    const wrapper = createWrapper({ currentFields: ['name', 'dept', 'emp_id'] })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    vm.form.idField = 'emp_id'
    await vm.handleConfirm()
    const emitted = wrapper.emitted('confirm') as any[]
    const props = emitted[0][0]
    expect(props.idField).toBe('emp_id')
  })

  it('confirm 不产出 mode 字段', async () => {
    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    await vm.handleConfirm()
    const emitted = wrapper.emitted('confirm') as any[]
    const props = emitted[0][0]
    expect(props.mode).toBeUndefined()
  })

  it('回填：lookupProps 含 idField 时正确还原，且无 mode 概念', async () => {
    const wrapper = createWrapper({
      lookupProps: {
        sourceType: 'form',
        sourceFormKey: 'emp_profile',
        displayField: 'name',
        idField: 'emp_id',
        columns: [],
        returnFields: {},
      },
    })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    expect(vm.form.idField).toBe('emp_id')
  })
})

describe('LookupPickerConfigDialog — 数据筛选', () => {
  it('配置静态筛选：confirm 产出 filter（logic + conditions）', async () => {
    const wrapper = createWrapper({ currentFields: ['name', 'dept', 'status'] })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    vm.form.filterLogic = 'AND'
    vm.form.filterRows = [
      { column: 'status', op: 'eq', source: 'fixed', fixedValue: 'PAID', field: '' },
    ]
    await vm.handleConfirm()
    const props = (wrapper.emitted('confirm') as any[])[0][0]
    expect(props.filter).toEqual({
      logic: 'AND',
      conditions: [{ column: 'status', op: 'eq', value: 'PAID' }],
    })
  })

  it('配置动态筛选：source=field 时产出 field 而非 value', async () => {
    const wrapper = createWrapper({ currentFields: ['name', 'dept', 'emp_dept'] })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    vm.form.filterLogic = 'AND'
    vm.form.filterRows = [
      { column: 'dept_id', op: 'eq', source: 'field', fixedValue: '', field: 'emp_dept' },
    ]
    await vm.handleConfirm()
    const props = (wrapper.emitted('confirm') as any[])[0][0]
    expect(props.filter.conditions[0]).toEqual({ column: 'dept_id', op: 'eq', field: 'emp_dept' })
  })

  it('无有效筛选条件时不产出 filter 键', async () => {
    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    vm.form.filterRows = []
    await vm.handleConfirm()
    const props = (wrapper.emitted('confirm') as any[])[0][0]
    expect(props.filter).toBeUndefined()
  })

  it('回填：lookupProps.filter 还原到 filterLogic/filterRows', async () => {
    const wrapper = createWrapper({
      lookupProps: {
        sourceType: 'form',
        sourceFormKey: 'emp_profile',
        displayField: 'name',
        columns: [],
        returnFields: {},
        filter: {
          logic: 'OR',
          conditions: [{ column: 'status', op: 'eq', value: 'PAID' }],
        },
      },
    })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    expect(vm.form.filterLogic).toBe('OR')
    expect(vm.form.filterRows[0]).toMatchObject({ column: 'status', op: 'eq', fixedValue: 'PAID' })
  })
})

describe('LookupPickerConfigDialog — 搜索列多选', () => {
  it('底表模式：配置多个搜索列，confirm 产出逗号分隔 keywordColumn', async () => {
    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    vm.form.searchColumns = ['name', 'dept']
    await vm.handleConfirm()
    const props = (wrapper.emitted('confirm') as any[])[0][0]
    expect(props.fetch.keywordColumn).toBe('name,dept')
  })

  it('底表模式：搜索列未选择时默认用显示字段', async () => {
    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    vm.form.searchColumns = []
    await vm.handleConfirm()
    const props = (wrapper.emitted('confirm') as any[])[0][0]
    expect(props.fetch.keywordColumn).toBe('name')
  })

  it('回填：fetch.keywordColumn 逗号分隔还原到 searchColumns', async () => {
    const wrapper = createWrapper({
      lookupProps: {
        sourceType: 'form',
        sourceFormKey: 'emp_profile',
        displayField: 'name',
        columns: [],
        returnFields: {},
        fetch: {
          action: '/v1/biz-data/emp_profile',
          method: 'GET',
          parse: 'records',
          totalParse: 'total',
          searchParam: 'keyword',
          keywordColumn: 'name,dept',
        },
      },
    })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    expect(vm.form.searchColumns).toEqual(['name', 'dept'])
  })
})

describe('LookupPickerConfigDialog — 页面内数据源下拉（数据源管理打通）', () => {
  const enabledDs = [
    {
      id: 'ds-form',
      name: '员工档案数据源',
      type: 'FORM',
      formKey: 'emp_profile',
      sourceKey: null,
      status: 'ENABLED',
    },
    {
      id: 'ds-api',
      name: '外部库存 API',
      type: 'API',
      formKey: null,
      sourceKey: 'external-stock',
      status: 'ENABLED',
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
  ]

  const formDataSources = [
    { id: 'local-ds-form', refId: 'ds-form' },
    { id: 'local-ds-api', refId: 'ds-api' },
  ]

  it('页面内数据源下拉显示正确的数据源列表', async () => {
    const wrapper = createWrapper({
      formDataSources,
      enabledDataSources: enabledDs,
    })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    expect(vm.formDataSources).toHaveLength(2)
    wrapper.unmount()
  })

  it('选中 FORM 页面内数据源 → sourceType=form + sourceFormKey 回填 + 触发 sourceChange', async () => {
    const wrapper = createWrapper({
      formDataSources,
      enabledDataSources: enabledDs,
    })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    vm.handleDataSourceSelect('local-ds-form')
    await wrapper.vm.$nextTick()
    expect(vm.form.sourceType).toBe('form')
    expect(vm.form.sourceFormKey).toBe('emp_profile')
    // 触发 sourceChange → 父组件加载目标表单列
    const emitted = wrapper.emitted('sourceChange') as any[]
    expect(emitted).toBeTruthy()
    expect(emitted[0][0]).toBe('emp_profile')
    wrapper.unmount()
  })

  it('选中 API 页面内数据源 → sourceType=api + LookupFetchConfig 各字段回填', async () => {
    const wrapper = createWrapper({
      formDataSources,
      enabledDataSources: enabledDs,
    })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    vm.handleDataSourceSelect('local-ds-api')
    await wrapper.vm.$nextTick()
    expect(vm.form.sourceType).toBe('api')
    expect(vm.form.action).toBe('/v1/external/list')
    expect(vm.form.method).toBe('POST')
    expect(vm.form.parse).toBe('records')
    expect(vm.form.totalParse).toBe('total')
    expect(vm.form.searchParam).toBe('kw')
    expect(vm.form.keywordColumn).toBe('name')
    expect(vm.form.pageBase).toBe(0)
    expect(vm.form.dataRows).toEqual([{ key: 'dept', value: 'IT' }])
    expect(vm.form.headerRows).toEqual([{ key: 'X-Api-Key', value: 'abc' }])
    wrapper.unmount()
  })

  it('API 数据源 params 缺失/非法时回退空配置，仅保留 sourceType=api', async () => {
    const wrapper = createWrapper({
      formDataSources: [{ id: 'local-ds-api2', refId: 'ds-api2' }],
      enabledDataSources: [{ id: 'ds-api2', name: '残缺 API', type: 'API', formKey: null, sourceKey: 'broken', status: 'ENABLED', params: 'not-json' }],
    })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    vm.handleDataSourceSelect('local-ds-api2')
    await wrapper.vm.$nextTick()
    expect(vm.form.sourceType).toBe('api')
    expect(vm.form.action).toBe('')
    expect(vm.form.dataRows).toEqual([])
    wrapper.unmount()
  })
})