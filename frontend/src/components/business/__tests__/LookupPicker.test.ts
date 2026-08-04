// ----- TDD: LookupPicker 组件测试 -----
// npx vitest run src/components/business/__tests__/LookupPicker.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import LookupPicker from '../LookupPicker.vue'

function createWrapper(props: any = {}) {
  return mount(LookupPicker, {
    props: {
      modelValue: null,
      fetchApi: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
      columns: [{ prop: 'code', label: '编号' }, { prop: 'name', label: '名称' }],
      ...props,
    },
    global: {
      plugins: [ElementPlus],
    },
  })
}

describe('LookupPicker — 基础渲染', () => {
  it('渲染输入框', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('input').exists()).toBe(true)
  })

  it('显示 placeholder', () => {
    const wrapper = createWrapper({ placeholder: '请选择盲板' })
    const input = wrapper.find('input')
    expect(input.attributes('placeholder')).toBe('请选择盲板')
  })

  it('默认为请选择', () => {
    const wrapper = createWrapper()
    const input = wrapper.find('input')
    expect(input.attributes('placeholder')).toBe('请选择')
  })

  it('disabled 时输入框不可用', () => {
    const wrapper = createWrapper({ disabled: true })
    const input = wrapper.find('input')
    expect(input.attributes('disabled')).toBeDefined()
  })
})

describe('LookupPicker — 弹窗交互', () => {
  it('点击输入框打开弹窗', async () => {
    const wrapper = createWrapper()
    await wrapper.find('input').trigger('click')
    await nextTick()
    expect(document.body.querySelector('.el-dialog') !== null).toBeTruthy()
  })

  it('disabled 时点击不打开弹窗', async () => {
    const wrapper = createWrapper({ disabled: true })
    await wrapper.find('input').trigger('click')
    await nextTick()
    expect(wrapper.find('.el-dialog__wrapper').exists()).toBe(false)
  })

  it('打开弹窗时调用 fetchApi', async () => {
    const fetchApi = vi.fn().mockResolvedValue({ rows: [], total: 0 })
    const wrapper = createWrapper({ fetchApi })
    await wrapper.find('input').trigger('click')
    await nextTick()
    expect(fetchApi).toHaveBeenCalled()
  })
})

describe('LookupPicker — 单选', () => {
  it('显示选中行 displayField', async () => {
    const wrapper = createWrapper({
      modelValue: { code: 'BL-001', name: '盲板A' },
      displayField: 'code',
    })
    await nextTick()
    const input = wrapper.find('input')
    expect(input.element.value).toBe('BL-001')
  })

  it('默认 displayField 取 columns 第一列 prop', async () => {
    const wrapper = createWrapper({
      modelValue: { code: 'BL-001', name: '盲板A' },
    })
    await nextTick()
    const input = wrapper.find('input')
    expect(input.element.value).toBe('BL-001')
  })
})

describe('LookupPicker — 清除', () => {
  it('clearable 默认为 true', () => {
    const wrapper = createWrapper()
    expect(wrapper.props('clearable')).toBe(true)
  })
})

// ----- returnFields emit 适配测试 -----

describe('LookupPicker — returnFields emit', () => {
  /**
   * 选中行时通过 emit('returnFields') 通知父组件回填字段。
   * 不再依赖 form-create 的 inject 机制。
   */
  function createWrapper(props: any = {}) {
    return mount(LookupPicker, {
      props: {
        modelValue: null,
        fetchApi: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
        columns: [{ prop: 'code', label: '编号' }, { prop: 'name', label: '名称' }],
        returnFields: { code: 'formCode', name: 'formName' },
        displayField: 'code',
        ...props,
      },
      global: {
        plugins: [ElementPlus],
      },
    })
  }

  it('选中行时 emit returnFields 回填数据', async () => {
    const wrapper = createWrapper()
    // 打开弹窗
    await wrapper.find('input').trigger('click')
    await nextTick()
    // 模拟表格行点击（handleRowClick）
    const row = { code: 'BL-001', name: '盲板A' }
    const vm = wrapper.vm as any
    vm.handleRowClick(row)
    await nextTick()
    // 应该 emit update:modelValue
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    // 应该 emit returnFields 带回填数据
    const returnFieldsEvents = wrapper.emitted('returnFields')
    expect(returnFieldsEvents).toBeTruthy()
    const returnData = returnFieldsEvents![0][0] as Record<string, { field: string; value: unknown }>
    expect(returnData['formCode']).toEqual({ field: 'formCode', value: 'BL-001' })
    expect(returnData['formName']).toEqual({ field: 'formName', value: '盲板A' })
  })

  it('清除选择时 emit returnFields 清空数据', async () => {
    const wrapper = createWrapper({
      modelValue: { code: 'BL-001', name: '盲板A' },
    })
    await nextTick()
    // 触发清除
    const vm = wrapper.vm as any
    vm.handleClear()
    await nextTick()
    // 应该 emit update:modelValue 为 null
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    const emitted = wrapper.emitted('update:modelValue')!
    expect(emitted[emitted.length - 1][0]).toBeNull()
    // 应该 emit returnFields 清空数据
    const returnFieldsEvents = wrapper.emitted('returnFields')
    expect(returnFieldsEvents).toBeTruthy()
    const returnData = returnFieldsEvents![0][0] as Record<string, { field: string; value: unknown }>
    expect(returnData['formCode']).toEqual({ field: 'formCode', value: null })
    expect(returnData['formName']).toEqual({ field: 'formName', value: null })
  })

  it('无 returnFields 时不 emit returnFields 事件', async () => {
    const wrapper = mount(LookupPicker, {
      props: {
        modelValue: null,
        fetchApi: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
        columns: [{ prop: 'code', label: '编号' }],
        displayField: 'code',
      },
      global: {
        plugins: [ElementPlus],
      },
    })
    // 选中行不应报错，不应 emit returnFields
    const row = { code: 'BL-002' }
    const vm = wrapper.vm as any
    vm.handleRowClick(row)
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('returnFields')).toBeFalsy()
    // 清除也不应报错，不应 emit returnFields
    vm.handleClear()
    await nextTick()
    expect(wrapper.emitted('clear')).toBeTruthy()
    expect(wrapper.emitted('returnFields')).toBeFalsy()
  })

  it('选中行字段值为 undefined 时回填 null', async () => {
    const wrapper = createWrapper()
    await wrapper.find('input').trigger('click')
    await nextTick()
    // 行数据缺少 name 字段
    const row = { code: 'BL-003' }
    const vm = wrapper.vm as any
    vm.handleRowClick(row)
    await nextTick()
    const returnFieldsEvents = wrapper.emitted('returnFields')
    expect(returnFieldsEvents).toBeTruthy()
    const returnData = returnFieldsEvents![0][0] as Record<string, { field: string; value: unknown }>
    expect(returnData['formCode']).toEqual({ field: 'formCode', value: 'BL-003' })
    expect(returnData['formName']).toEqual({ field: 'formName', value: null })
  })
})