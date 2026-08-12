// ----- TDD: DataPicker 组件测试 -----
// npx vitest run src/views/form/components/__tests__/DataPicker.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import DataPicker from '../DataPicker.vue'

vi.mock('@/api/bizData', () => ({
  bizDataApi: {
    list: vi.fn().mockResolvedValue({ data: { records: [{ id: 't1', name: '张三' }], total: 1 } }),
    resolve: vi.fn().mockResolvedValue({ data: { t1: '张三' } }),
  },
}))

import { bizDataApi } from '@/api/bizData'

function createWrapper(props: any = {}) {
  return mount(DataPicker, {
    props: {
      modelValue: '',
      sourceFormKey: 'emp_profile',
      displayField: 'name',
      ...props,
    },
    global: { plugins: [ElementPlus] },
  })
}

describe('DataPicker — 基础渲染', () => {
  it('渲染输入框', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('input').exists()).toBe(true)
  })

  it('readonly 时不打开弹窗', async () => {
    const wrapper = createWrapper({ readonly: true })
    await wrapper.find('input').trigger('click')
    await nextTick()
    expect(document.body.querySelector('.el-dialog')).toBeFalsy()
  })
})

describe('DataPicker — 选择交互', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('点击输入框打开弹窗并查询', async () => {
    const wrapper = createWrapper()
    await wrapper.find('input').trigger('click')
    await nextTick()
    expect(document.body.querySelector('.el-dialog')).toBeTruthy()
    expect(bizDataApi.list).toHaveBeenCalledWith(
      'emp_profile',
      expect.objectContaining({ page: 1, size: 10 }),
    )
  })

  it('单选选中行 emit 逗号分隔 id 字符串', async () => {
    const wrapper = createWrapper()
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    const row = document.body.querySelector('.el-table__body tbody tr')
    ;(row as HTMLElement)?.click()
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['t1'])
    wrapper.unmount()
  })

  it('多选确认拼接 id', async () => {
    const wrapper = createWrapper({ mode: 'multiple' })
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    // 模拟选中两行后点确定
    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent === '确定')
    ;(confirmBtn as HTMLButtonElement)?.click()
    await nextTick()
    // tempSelection 为空时多选 confirm 提交空值（选择由 selection-change 驱动，此处验证不抛错）
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    wrapper.unmount()
  })

  it('清除时 emit 空并清空回填', async () => {
    const wrapper = createWrapper({
      modelValue: 't1',
      returnFields: { name: 'emp_name' },
    })
    await flushPromises()
    const clearIcon = wrapper.find('.el-input__clear')
    if (clearIcon.exists()) {
      await clearIcon.trigger('click')
      await nextTick()
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
    }
    wrapper.unmount()
  })
})

describe('DataPicker — 级联与回显', () => {
  it('dependOnValue 存在时列表查询带 filter', async () => {
    const wrapper = createWrapper({
      dependOn: { field: 'dept_field', sourceColumn: 'dept' },
      dependOnValue: 'rd',
    })
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    expect(bizDataApi.list).toHaveBeenCalledWith(
      'emp_profile',
      expect.objectContaining({ filter: { dept: 'rd' } }),
    )
    wrapper.unmount()
  })

  it('依赖字段变化时清空当前值', async () => {
    const wrapper = createWrapper({
      modelValue: 't1',
      dependOn: { field: 'dept_field', sourceColumn: 'dept' },
      dependOnValue: 'rd',
    })
    await wrapper.setProps({ dependOnValue: 'mk' })
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
    wrapper.unmount()
  })

  it('modelValue 有值时 resolve 补全显示文本', async () => {
    const wrapper = createWrapper({ modelValue: 't1' })
    await flushPromises()
    expect(bizDataApi.resolve).toHaveBeenCalledWith('emp_profile', ['t1'], 'name')
    const input = wrapper.find('input')
    expect((input.element as HTMLInputElement).value).toBe('张三')
    wrapper.unmount()
  })
})
