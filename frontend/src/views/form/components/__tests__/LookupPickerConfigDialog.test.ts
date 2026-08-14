// ----- TDD: LookupPickerConfigDialog 列 label 保持测试 -----
// npx vitest run src/views/form/components/__tests__/LookupPickerConfigDialog.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import LookupPickerConfigDialog from '../LookupPickerConfigDialog.vue'

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
  it('默认单选：confirm 产出 mode=single，且配置 idField 后写入', async () => {
    const wrapper = createWrapper({ currentFields: ['name', 'dept', 'emp_id'] })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    vm.form.mode = 'single'
    vm.form.idField = 'emp_id'
    await vm.handleConfirm()
    const emitted = wrapper.emitted('confirm') as any[]
    const props = emitted[0][0]
    expect(props.mode).toBe('single')
    expect(props.idField).toBe('emp_id')
  })

  it('多选模式：confirm 产出 mode=multiple 且不含 idField', async () => {
    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    vm.form.mode = 'multiple'
    vm.form.idField = ''
    await vm.handleConfirm()
    const emitted = wrapper.emitted('confirm') as any[]
    const props = emitted[0][0]
    expect(props.mode).toBe('multiple')
    expect(props.idField).toBeUndefined()
  })

  it('回填：lookupProps 含 mode 与 idField 时正确还原', async () => {
    const wrapper = createWrapper({
      lookupProps: {
        sourceType: 'form',
        sourceFormKey: 'emp_profile',
        displayField: 'name',
        mode: 'multiple',
        columns: [],
        returnFields: {},
      },
    })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    expect(vm.form.mode).toBe('multiple')
  })

  it('回填：无 mode 时默认单选', async () => {
    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    expect(vm.form.mode).toBe('single')
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