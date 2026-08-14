// ----- TDD: DataPickerConfigDialog v2 配置（filters/开关/dependOn 兼容） -----
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
  it('dependOn 回填为一条 field 型过滤条件行', async () => {
    const wrapper = createWrapper({
      pickerProps: {
        sourceFormKey: 'emp_profile',
        displayField: 'name',
        columns: ['name'],
        mode: 'single',
        returnFields: {},
        dependOn: { field: 'dept_field', sourceColumn: 'dept' },
      },
    })
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.form.filtersRows).toEqual([
      { column: 'dept', operator: '=', valueType: 'field', value: 'dept_field' },
    ])
    wrapper.unmount()
  })

  it('保存后产出 filters，dependOn 不再单独产出', async () => {
    const wrapper = createWrapper({
      pickerProps: {
        sourceFormKey: 'emp_profile',
        displayField: 'name',
        columns: [],
        mode: 'single',
        returnFields: {},
        dependOn: { field: 'dept_field', sourceColumn: 'dept' },
      },
    })
    await nextTick()
    const props = confirmProps(wrapper)
    expect(props.filters).toEqual([
      { column: 'dept', operator: '=', valueType: 'field', value: 'dept_field' },
    ])
    expect(props.dependOn).toBeUndefined()
    wrapper.unmount()
  })
})

describe('DataPickerConfigDialog — 过滤条件编辑', () => {
  it('添加 static 过滤条件并保存产出', async () => {
    const wrapper = createWrapper({
      pickerProps: { sourceFormKey: 'emp_profile', displayField: 'name', columns: [], mode: 'single', returnFields: {} },
    })
    await nextTick()
    const vm = wrapper.vm as any
    vm.form.filtersRows.push({ column: 'status', operator: '=', valueType: 'static', value: 'active' })
    const props = confirmProps(wrapper)
    expect(props.filters).toContainEqual({ column: 'status', operator: '=', valueType: 'static', value: 'active' })
    wrapper.unmount()
  })

  it('空条件行不产出', async () => {
    const wrapper = createWrapper({
      pickerProps: { sourceFormKey: 'emp_profile', displayField: 'name', columns: [], mode: 'single', returnFields: {} },
    })
    await nextTick()
    const vm = wrapper.vm as any
    vm.form.filtersRows.push({ column: '', operator: '=', valueType: 'static', value: '' })
    const props = confirmProps(wrapper)
    expect(props.filters).toBeUndefined()
    wrapper.unmount()
  })

  it('v2 filters 直接回填多行', async () => {
    const wrapper = createWrapper({
      pickerProps: {
        sourceFormKey: 'emp_profile',
        displayField: 'name',
        columns: [],
        mode: 'single',
        returnFields: {},
        filters: [
          { column: 'dept', operator: '=', valueType: 'field', value: 'dept_field' },
          { column: 'status', operator: '=', valueType: 'static', value: 'active' },
        ],
      },
    })
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.form.filtersRows).toHaveLength(2)
    expect(vm.form.filtersRows[1]).toMatchObject({ column: 'status', valueType: 'static', value: 'active' })
    wrapper.unmount()
  })
})

describe('DataPickerConfigDialog — 行为开关', () => {
  it('开关默认值与保存产出', async () => {
    const wrapper = createWrapper({
      pickerProps: { sourceFormKey: 'emp_profile', displayField: 'name', columns: [], mode: 'single', returnFields: {} },
    })
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.form.clearOnCascadeChange).toBe(false)
    expect(vm.form.allowCreate).toBe(false)
    expect(vm.form.viewLink).toBe(true)
    vm.form.clearOnCascadeChange = true
    vm.form.allowCreate = true
    const props = confirmProps(wrapper)
    expect(props.clearOnCascadeChange).toBe(true)
    expect(props.allowCreate).toBe(true)
    expect(props.viewLink).toBe(true)
    wrapper.unmount()
  })

  it('回填已配置的开关值', async () => {
    const wrapper = createWrapper({
      pickerProps: {
        sourceFormKey: 'emp_profile',
        displayField: 'name',
        columns: [],
        mode: 'single',
        returnFields: {},
        clearOnCascadeChange: true,
        allowCreate: true,
        viewLink: false,
      },
    })
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.form.clearOnCascadeChange).toBe(true)
    expect(vm.form.allowCreate).toBe(true)
    expect(vm.form.viewLink).toBe(false)
    wrapper.unmount()
  })
})
