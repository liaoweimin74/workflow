// ----- TDD: DataPickerConfigDialog v3 配置（筛选条件 AND/OR+op+来源 / 搜索列） -----
// npx vitest run src/views/form/components/__tests__/DataPickerConfigDialog.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import DataPickerConfigDialog from '../DataPickerConfigDialog.vue'

const targetForms = [
  { id: '1', name: '员工档案', key: 'emp_profile', type: 'BUSINESS', version: 1, status: 'PUBLISHED', publishedVersion: 1, createdBy: null, createdAt: '', updatedAt: '' },
  { id: '2', name: '部门表', key: 'dept_profile', type: 'BUSINESS', version: 1, status: 'PUBLISHED', publishedVersion: 1, createdBy: null, createdAt: '', updatedAt: '' },
]

const targetColumns = [
  { key: 'name', label: '姓名', columnType: 'VARCHAR', length: 255, scale: null, required: false, unique: false, indexed: false },
  { key: 'dept', label: '部门', columnType: 'VARCHAR', length: 64, scale: null, required: false, unique: false, indexed: false },
  { key: 'status', label: '状态', columnType: 'VARCHAR', length: 32, scale: null, required: false, unique: false, indexed: false },
]

const currentFields = ['dept_field', 'emp_dept']

function createWrapper(overrides: Record<string, any> = {}) {
  return mount(DataPickerConfigDialog, {
    props: {
      modelValue: true,
      targetForms,
      currentFields,
      targetColumns,
      pickerProps: {},
      ...overrides,
    },
    global: { plugins: [ElementPlus] },
  })
}

function confirmProps(wrapper: any): Record<string, any> {
  const confirmBtn = wrapper.findAll('button').find(b => b.text().includes('确定'))
  ;(confirmBtn as any)?.trigger('click')
  return wrapper.emitted('confirm')?.at(-1)?.[0] || {}
}

describe('DataPickerConfigDialog — v1 dependOn 兼容回填', () => {
  it('dependOn 回填为一条 field 型筛选条件行', async () => {
    const wrapper = createWrapper({
      pickerProps: {
        sourceFormKey: 'emp_profile',
        displayField: 'name',
        columns: ['name'],
        maxCount: 1,
        dependOn: { field: 'dept_field', sourceColumn: 'dept' },
      },
    })
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.form.filterRows).toEqual([
      { column: 'dept', op: 'eq', source: 'field', fixedValue: '', field: 'dept_field' },
    ])
    expect(vm.form.filterLogic).toBe('AND')
    wrapper.unmount()
  })

  it('保存后产出结构化 filters，dependOn 不再单独产出', async () => {
    const wrapper = createWrapper({
      pickerProps: {
        sourceFormKey: 'emp_profile',
        displayField: 'name',
        columns: [],
        maxCount: 1,
        dependOn: { field: 'dept_field', sourceColumn: 'dept' },
      },
    })
    await nextTick()
    const props = confirmProps(wrapper)
    expect(props.filters).toEqual({
      logic: 'AND',
      conditions: [{ column: 'dept', op: 'eq', field: 'dept_field' }],
    })
    expect(props.dependOn).toBeUndefined()
    wrapper.unmount()
  })
})

describe('DataPickerConfigDialog — 筛选条件编辑（对齐 LookupPicker）', () => {
  it('添加 static（固定值）筛选条件并保存产出结构化 filter', async () => {
    const wrapper = createWrapper({
      pickerProps: { sourceFormKey: 'emp_profile', displayField: 'name', columns: [], maxCount: 1 },
    })
    await nextTick()
    const vm = wrapper.vm as any
    vm.form.filterRows.push({ column: 'status', op: 'eq', source: 'fixed', fixedValue: 'active', field: '' })
    const props = confirmProps(wrapper)
    expect(props.filters).toEqual({
      logic: 'AND',
      conditions: [{ column: 'status', op: 'eq', value: 'active' }],
    })
    wrapper.unmount()
  })

  it('支持 op 与 OR 组合产出', async () => {
    const wrapper = createWrapper({
      pickerProps: { sourceFormKey: 'emp_profile', displayField: 'name', columns: [], maxCount: 1 },
    })
    await nextTick()
    const vm = wrapper.vm as any
    vm.form.filterLogic = 'OR'
    vm.form.filterRows.push({ column: 'status', op: 'ne', source: 'fixed', fixedValue: 'closed', field: '' })
    vm.form.filterRows.push({ column: 'dept', op: 'isEmpty', source: 'fixed', fixedValue: '', field: '' })
    const props = confirmProps(wrapper)
    expect(props.filters).toEqual({
      logic: 'OR',
      conditions: [
        { column: 'status', op: 'ne', value: 'closed' },
        { column: 'dept', op: 'isEmpty' },
      ],
    })
    wrapper.unmount()
  })

  it('空条件行（无 column）不产出', async () => {
    const wrapper = createWrapper({
      pickerProps: { sourceFormKey: 'emp_profile', displayField: 'name', columns: [], maxCount: 1 },
    })
    await nextTick()
    const vm = wrapper.vm as any
    vm.form.filterRows.push({ column: '', op: 'eq', source: 'fixed', fixedValue: '', field: '' })
    const props = confirmProps(wrapper)
    expect(props.filters).toBeUndefined()
    wrapper.unmount()
  })

  it('结构化 filters 直接回填多行（含 logic）', async () => {
    const wrapper = createWrapper({
      pickerProps: {
        sourceFormKey: 'emp_profile',
        displayField: 'name',
        columns: [],
        maxCount: 1,
        filters: {
          logic: 'OR',
          conditions: [
            { column: 'dept', op: 'eq', field: 'dept_field' },
            { column: 'status', op: 'eq', value: 'active' },
          ],
        },
      },
    })
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.form.filterLogic).toBe('OR')
    expect(vm.form.filterRows).toHaveLength(2)
    expect(vm.form.filterRows[0]).toMatchObject({ column: 'dept', source: 'field', field: 'dept_field' })
    expect(vm.form.filterRows[1]).toMatchObject({ column: 'status', source: 'fixed', fixedValue: 'active' })
    wrapper.unmount()
  })
})

describe('DataPickerConfigDialog — 搜索列', () => {
  it('搜索列多选保存产出（逗号分隔）', async () => {
    const wrapper = createWrapper({
      pickerProps: { sourceFormKey: 'emp_profile', displayField: 'name', columns: [], maxCount: 1 },
    })
    await nextTick()
    const vm = wrapper.vm as any
    vm.form.searchColumns = ['name', 'dept']
    const props = confirmProps(wrapper)
    expect(props.searchColumns).toEqual(['name', 'dept'])
    wrapper.unmount()
  })

  it('搜索列回填：keywordColumn 逗号串还原为多选', async () => {
    const wrapper = createWrapper({
      pickerProps: {
        sourceFormKey: 'emp_profile',
        displayField: 'name',
        columns: [],
        maxCount: 1,
        searchColumns: ['name', 'dept'],
      },
    })
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.form.searchColumns).toEqual(['name', 'dept'])
    wrapper.unmount()
  })
})

describe('DataPickerConfigDialog — 行为开关', () => {
  it('开关默认值与保存产出', async () => {
    const wrapper = createWrapper({
      pickerProps: { sourceFormKey: 'emp_profile', displayField: 'name', columns: [], maxCount: 1 },
    })
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.form.clearOnCascadeChange).toBe(false)
    expect(vm.form.allowCreate).toBe(false)
    expect(vm.form.detailReadonly).toBe(true)
    vm.form.clearOnCascadeChange = true
    vm.form.allowCreate = true
    vm.form.detailReadonly = false
    const props = confirmProps(wrapper)
    expect(props.clearOnCascadeChange).toBe(true)
    expect(props.allowCreate).toBe(true)
    expect(props.detailReadonly).toBe(false)
    wrapper.unmount()
  })

  it('回填已配置的开关值', async () => {
    const wrapper = createWrapper({
      pickerProps: {
        sourceFormKey: 'emp_profile',
        displayField: 'name',
        columns: [],
        maxCount: 1,
        clearOnCascadeChange: true,
        allowCreate: true,
        detailReadonly: false,
      },
    })
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.form.clearOnCascadeChange).toBe(true)
    expect(vm.form.allowCreate).toBe(true)
    expect(vm.form.detailReadonly).toBe(false)
    wrapper.unmount()
  })
})

describe('DataPickerConfigDialog — 最多可选数（maxCount）', () => {
  it('默认 maxCount 为 undefined（不限）', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.form.maxCount).toBeUndefined()
    wrapper.unmount()
  })

  it('回填：pickerProps.maxCount 正确还原', async () => {
    const wrapper = createWrapper({
      pickerProps: { sourceFormKey: 'emp_profile', displayField: 'name', columns: [], maxCount: 3 },
    })
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.form.maxCount).toBe(3)
    wrapper.unmount()
  })

  it('回填：旧 mode=single 兼容为 maxCount=1', async () => {
    const wrapper = createWrapper({
      pickerProps: { sourceFormKey: 'emp_profile', displayField: 'name', columns: [], mode: 'single' },
    })
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.form.maxCount).toBe(1)
    wrapper.unmount()
  })

  it('保存：配置 maxCount 后产出该值', async () => {
    const wrapper = createWrapper({
      pickerProps: { sourceFormKey: 'emp_profile', displayField: 'name', columns: [] },
    })
    await nextTick()
    const vm = wrapper.vm as any
    vm.form.maxCount = 5
    const props = confirmProps(wrapper)
    expect(props.maxCount).toBe(5)
    expect(props.mode).toBeUndefined()
    wrapper.unmount()
  })

  it('保存：未配置 maxCount 时不产出该键', async () => {
    const wrapper = createWrapper({
      pickerProps: { sourceFormKey: 'emp_profile', displayField: 'name', columns: [] },
    })
    await nextTick()
    const props = confirmProps(wrapper)
    expect(props.maxCount).toBeUndefined()
    wrapper.unmount()
  })
})