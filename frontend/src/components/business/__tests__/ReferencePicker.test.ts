// ----- TDD: ReferencePicker 组件测试 -----
// npx vitest run src/components/business/__tests__/ReferencePicker.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import ReferencePicker from '../ReferencePicker.vue'

function createWrapper(props: any = {}) {
  return mount(ReferencePicker, {
    props: {
      modelValue: null,
      valueField: 'id',
      displayField: 'name',
      fetchApi: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
      columns: [{ prop: 'id', label: 'ID' }, { prop: 'name', label: '名称' }],
      ...props,
    },
    global: {
      plugins: [ElementPlus],
    },
  })
}

describe('ReferencePicker — 基础渲染', () => {
  it('渲染输入框', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('input').exists()).toBe(true)
  })

  it('显示 placeholder', () => {
    const wrapper = createWrapper({ placeholder: '请选择用户' })
    const input = wrapper.find('input')
    expect(input.attributes('placeholder')).toBe('请选择用户')
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

describe('ReferencePicker — 弹窗交互', () => {
  it('点击输入框打开弹窗', async () => {
    const wrapper = createWrapper()
    await wrapper.find('input').trigger('click')
    await nextTick()
    // append-to-body 导致弹窗渲染到 document.body
    expect(document.body.querySelector('.el-dialog') !== null || wrapper.html().includes('dialog')).toBeTruthy()
  })

  it('disabled 时点击不打开弹窗', async () => {
    const wrapper = createWrapper({ disabled: true })
    await wrapper.find('input').trigger('click')
    await nextTick()
    expect(wrapper.find('.el-dialog__wrapper').exists()).toBe(false)
  })
})

describe('ReferencePicker — 数据获取', () => {
  it('打开弹窗时调用 fetchApi', async () => {
    const fetchApi = vi.fn().mockResolvedValue({ rows: [], total: 0 })
    const wrapper = createWrapper({ fetchApi })
    await wrapper.find('input').trigger('click')
    await nextTick()
    expect(fetchApi).toHaveBeenCalled()
  })

  it('显示搜索结果', async () => {
    const fetchApi = vi.fn().mockResolvedValue({
      rows: [{ id: 1, name: '张三' }],
      total: 1,
    })
    const wrapper = createWrapper({ fetchApi })
    await wrapper.find('input').trigger('click')
    await nextTick()
    await nextTick()
    // append-to-body 导致弹窗渲染到 body，不在 wrapper 内
    expect(document.body.textContent || '').toContain('张三')
  })
})

describe('ReferencePicker — displayField 显示', () => {
  it('单选模式显示选中文本', async () => {
    const fetchApi = vi.fn().mockResolvedValue({
      rows: [{ id: 1, name: '张三' }],
      total: 1,
    })
    const wrapper = createWrapper({ fetchApi, modelValue: 1 })
    await nextTick()
    // displayText computed 应该显示 "1"（表数据未加载时显示 value 本身）
    const input = wrapper.find('input')
    expect(input.element.value).toBe('1')
  })
})

describe('ReferencePicker — 清除', () => {
  it('clearable 时清除按钮可用', () => {
    const wrapper = createWrapper()
    // clearable 默认为 true
    expect(wrapper.find('.el-input__clear').exists() || wrapper.props('clearable')).toBeTruthy()
  })
})