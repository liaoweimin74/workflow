// ----- Task 3-g: RelationCard 组件测试 -----
// npx vitest run src/components/business/__tests__/RelationCard.test.ts
//
// 覆盖：渲染（字符串/对象/空值）、值摘要提取（displayField 深层取值 + 常用键回退）、
// clickable 交互（open-detail 事件）。

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import RelationCard from '../RelationCard.vue'

function createWrapper(props: any = {}) {
  return mount(RelationCard, {
    props: {
      modelValue: null,
      ...props,
    },
    global: { plugins: [ElementPlus] },
  })
}

function valueEl(wrapper: any) {
  return wrapper.find('.relation-card__value')
}

function placeholderEl(wrapper: any) {
  return wrapper.find('.relation-card__placeholder')
}

describe('RelationCard — 渲染', () => {
  it('空值显示「未选择关联记录」占位，不渲染值摘要', () => {
    const wrapper = createWrapper({ modelValue: '' })
    expect(placeholderEl(wrapper).exists()).toBe(true)
    expect(placeholderEl(wrapper).text()).toContain('未选择关联记录')
    expect(valueEl(wrapper).exists()).toBe(false)
  })

  it('字符串值直显（对齐 LookupPicker 新语义：modelValue=显示文本）', () => {
    const wrapper = createWrapper({ modelValue: 'XX 采购合同' })
    expect(valueEl(wrapper).text()).toBe('XX 采购合同')
    expect(placeholderEl(wrapper).exists()).toBe(false)
  })

  it('对象值按 displayField 深层取值（BizDataVO 内层 data 优先）', () => {
    const wrapper = createWrapper({
      modelValue: { id: 42, data: { code: 'PRJ-A' }, code: '顶层code' },
      displayField: 'code',
    })
    expect(valueEl(wrapper).text()).toBe('PRJ-A')
  })

  it('对象值未配置 displayField 时回退常用键（name/title/label/id）', () => {
    const wrapper = createWrapper({ modelValue: { id: 7, title: '备件入库单' } })
    expect(valueEl(wrapper).text()).toBe('备件入库单')
  })

  it('title 与 description 渲染在卡片标题行/说明行', () => {
    const wrapper = createWrapper({
      modelValue: '关联方：A 公司',
      title: '关联合同',
      description: '来自合同台账',
    })
    expect(wrapper.find('.relation-card__title').text()).toBe('关联合同')
    expect(wrapper.find('.relation-card__desc').text()).toBe('来自合同台账')
  })
})

describe('RelationCard — 交互', () => {
  it('clickable（默认 true）时点击卡片 emit open-detail 并携带原始值', async () => {
    const value = { id: 9, name: '某某项目' }
    const wrapper = createWrapper({ modelValue: value })
    await wrapper.find('.relation-card__body').trigger('click')
    expect(wrapper.emitted('open-detail')).toHaveLength(1)
    expect(wrapper.emitted('open-detail')![0][0]).toEqual(value)
  })

  it('clickable=false 时点击不触发 open-detail，且无 hover 可点击态', () => {
    const wrapper = createWrapper({ modelValue: '文本值', clickable: false })
    expect(wrapper.find('.relation-card__body').classes()).not.toContain('is-clickable')
    wrapper.find('.relation-card__body').trigger('click')
    expect(wrapper.emitted('open-detail')).toBeUndefined()
  })

  it('空值时点击不触发 open-detail（无详情可看）', () => {
    const wrapper = createWrapper({ modelValue: null })
    wrapper.find('.relation-card__body').trigger('click')
    expect(wrapper.emitted('open-detail')).toBeUndefined()
  })
})
