// ----- Task 3-g: LocationPicker 定位（降级版）组件测试 -----
// npx vitest run src/components/business/__tests__/LocationPicker.test.ts
//
// 覆盖：输入渲染（范围/精度）、modelValue 解析回显与预览、数值修改发射、
// 粘贴解析（中英文逗号）、非法输入容错、越界钳制、清空。

import { describe, it, expect } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import LocationPicker from '../LocationPicker.vue'

function createWrapper(props: any = {}) {
  return mount(LocationPicker, {
    props: {
      modelValue: '',
      ...props,
    },
    global: { plugins: [ElementPlus] },
  })
}

function inputNumbers(wrapper: any) {
  return wrapper.findAllComponents({ name: 'ElInputNumber' })
}

function pasteInput(wrapper: any) {
  return wrapper.find('.location-picker__paste input')
}

describe('LocationPicker — 渲染', () => {
  it('渲染纬度/经度两个数字输入（范围 -90~90 / -180~180，精度 6 位）与清空按钮、粘贴框', () => {
    const wrapper = createWrapper()
    const nums = inputNumbers(wrapper)
    expect(nums.length).toBe(2)
    expect(nums[0].props('min')).toBe(-90)
    expect(nums[0].props('max')).toBe(90)
    expect(nums[0].props('precision')).toBe(6)
    expect(nums[1].props('min')).toBe(-180)
    expect(nums[1].props('max')).toBe(180)
    expect(nums[1].props('precision')).toBe(6)
    expect(wrapper.find('.location-picker__clear').exists()).toBe(true)
    expect(pasteInput(wrapper).exists()).toBe(true)
  })

  it('空值：预览显示「未设置坐标」，清空按钮禁用', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.location-picker__preview').text()).toBe('未设置坐标')
    expect(wrapper.find('.location-picker__clear').attributes('disabled')).toBeDefined()
  })

  it('modelValue 解析回显：输入框与格式化预览', () => {
    const wrapper = createWrapper({ modelValue: '39.9042,116.4074' })
    expect(inputNumbers(wrapper)[0].props('modelValue')).toBe(39.9042)
    expect(inputNumbers(wrapper)[1].props('modelValue')).toBe(116.4074)
    expect(wrapper.find('.location-picker__preview').text()).toBe('当前坐标：39.9042, 116.4074')
  })

  it('clearable=false 不渲染清空按钮；disabled 时输入禁用', () => {
    const wrapper = createWrapper({ clearable: false, disabled: true })
    expect(wrapper.find('.location-picker__clear').exists()).toBe(false)
    expect(inputNumbers(wrapper)[0].props('disabled')).toBe(true)
  })
})

describe('LocationPicker — 值发射', () => {
  it('修改经度 → emit update:modelValue 与 change（去尾零规范化）', async () => {
    const wrapper = createWrapper({ modelValue: '39.9042,116.4074' })
    inputNumbers(wrapper)[1].vm.$emit('update:modelValue', 116.4)
    await nextTick()
    expect(wrapper.emitted('update:modelValue')![0][0]).toBe('39.9042,116.4')
    expect(wrapper.emitted('change')![0][0]).toBe('39.9042,116.4')
  })

  it('仅设置纬度未设置经度时不发射（双向齐备才拼值）', async () => {
    const wrapper = createWrapper()
    inputNumbers(wrapper)[0].vm.$emit('update:modelValue', 39.9)
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('清空按钮：emit 空串并复位预览', async () => {
    const wrapper = createWrapper({ modelValue: '39.9042,116.4074' })
    await wrapper.find('.location-picker__clear').trigger('click')
    expect(wrapper.emitted('update:modelValue')![0][0]).toBe('')
    expect(wrapper.emitted('change')![0][0]).toBe('')
    await nextTick()
    expect(wrapper.find('.location-picker__preview').text()).toBe('未设置坐标')
  })

  it('越界钳制：经度 200 → 180 后发射', async () => {
    const wrapper = createWrapper({ modelValue: '39.9042,116.4074' })
    inputNumbers(wrapper)[1].vm.$emit('update:modelValue', 200)
    await nextTick()
    expect(wrapper.emitted('update:modelValue')![0][0]).toBe('39.9042,180')
  })
})

describe('LocationPicker — 粘贴解析', () => {
  it('粘贴「纬度,经度」自动拆分回填（中文逗号兼容）并清空粘贴框', async () => {
    const wrapper = createWrapper()
    pasteInput(wrapper).setValue('39.9042，116.4074')
    await pasteInput(wrapper).trigger('input')
    expect(wrapper.emitted('update:modelValue')![0][0]).toBe('39.9042,116.4074')
    expect(wrapper.emitted('change')![0][0]).toBe('39.9042,116.4074')
    await nextTick()
    expect((pasteInput(wrapper).element as HTMLInputElement).value).toBe('')
    expect(inputNumbers(wrapper)[0].props('modelValue')).toBe(39.9042)
  })

  it('非法粘贴（非坐标文本/越界）忽略，不破坏当前值', async () => {
    const wrapper = createWrapper({ modelValue: '39.9042,116.4074' })
    pasteInput(wrapper).setValue('not-a-coord')
    await pasteInput(wrapper).trigger('input')
    pasteInput(wrapper).setValue('100,116') // 纬度越界
    await pasteInput(wrapper).trigger('input')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.find('.location-picker__preview').text()).toBe('当前坐标：39.9042, 116.4074')
  })
})
