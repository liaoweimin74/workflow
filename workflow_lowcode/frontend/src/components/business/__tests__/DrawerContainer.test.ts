// ----- Task 3-g: DrawerContainer 抽屉容器测试 -----
// npx vitest run src/components/business/__tests__/DrawerContainer.test.ts
//
// 覆盖：按钮渲染（文案/类型/plain）、drawer 开关（点击打开 / update:modelValue 关闭）、
// children 渲染进抽屉内容区、设计态（DragBox）平铺降级。

import { describe, it, expect } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DrawerContainer from '../DrawerContainer.vue'

/** 模拟 FcDesigner 画布的 DragBox 包裹（name 对齐 vendor/components/DragBox.vue） */
const FakeDragBox = defineComponent({ name: 'DragBox', setup: () => () => h('div', { class: 'fake-dragbox' }, 'DRAG AREA') })

function createRuntimeWrapper(props: any = {}) {
  return mount(DrawerContainer, {
    props,
    slots: {
      default: () => [h('div', { class: 'inner-field' }, '抽屉内字段')],
    },
    global: { plugins: [ElementPlus] },
  })
}

function drawer(wrapper: any) {
  return wrapper.findComponent({ name: 'ElDrawer' })
}

describe('DrawerContainer — 按钮渲染', () => {
  it('默认文案「展开详情」/ primary / plain', () => {
    const wrapper = createRuntimeWrapper()
    const button = wrapper.find('.drawer-container__button')
    expect(button.text()).toBe('展开详情')
    expect(button.classes()).toContain('el-button--primary')
    expect(button.classes()).toContain('is-plain')
  })

  it('buttonText / buttonType / plain 可配置', () => {
    const wrapper = createRuntimeWrapper({ buttonText: '查看附件', buttonType: 'success', plain: false })
    const button = wrapper.find('.drawer-container__button')
    expect(button.text()).toBe('查看附件')
    expect(button.classes()).toContain('el-button--success')
    expect(button.classes()).not.toContain('is-plain')
  })

  it('title / size 透传 el-drawer', () => {
    const wrapper = createRuntimeWrapper({ title: '关联合同详情', size: '600px' })
    expect(drawer(wrapper).props('title')).toBe('关联合同详情')
    expect(drawer(wrapper).props('size')).toBe('600px')
  })
})

describe('DrawerContainer — drawer 开关', () => {
  it('初始关闭；点击按钮打开（modelValue=true），children 渲染进抽屉内容区', async () => {
    const wrapper = createRuntimeWrapper()
    expect(drawer(wrapper).props('modelValue')).toBe(false)
    // 懒挂载：未打开时抽屉内字段不存在
    expect(wrapper.find('.inner-field').exists()).toBe(false)
    await wrapper.find('.drawer-container__button').trigger('click')
    expect(drawer(wrapper).props('modelValue')).toBe(true)
    await nextTick()
    await new Promise(r => setTimeout(r, 30))
    expect(wrapper.find('.inner-field').exists()).toBe(true)
    expect(wrapper.emitted('open')).toBeTruthy()
  })

  it('关闭（update:modelValue=false）后 emit close，且字段保留挂载（destroy-on-close=false）', async () => {
    const wrapper = createRuntimeWrapper()
    await wrapper.find('.drawer-container__button').trigger('click')
    await nextTick()
    await new Promise(r => setTimeout(r, 30))
    expect(wrapper.find('.inner-field').exists()).toBe(true)
    drawer(wrapper).vm.$emit('update:modelValue', false)
    await nextTick()
    await new Promise(r => setTimeout(r, 30))
    expect(drawer(wrapper).props('modelValue')).toBe(false)
    expect(wrapper.emitted('close')).toBeTruthy()
    // 不销毁：关闭后字段仍挂载（取值/回显友好）
    expect(wrapper.find('.inner-field').exists()).toBe(true)
  })

  it('暴露 openDrawer/closeDrawer 方法', async () => {
    const wrapper = createRuntimeWrapper()
    ;(wrapper.vm as any).openDrawer()
    await nextTick()
    expect(drawer(wrapper).props('modelValue')).toBe(true)
    ;(wrapper.vm as any).closeDrawer()
    await nextTick()
    expect(drawer(wrapper).props('modelValue')).toBe(false)
  })
})

describe('DrawerContainer — 设计态（DragBox）降级', () => {
  it('单 DragBox 子节点识别为设计态：不渲染抽屉，children 平铺在设计预览区', () => {
    const wrapper = mount(DrawerContainer, {
      props: {},
      slots: { default: () => [h(FakeDragBox)] },
      global: { plugins: [ElementPlus] },
    })
    expect(drawer(wrapper).exists()).toBe(false)
    expect(wrapper.find('.drawer-container__design-area').exists()).toBe(true)
    expect(wrapper.find('.fake-dragbox').exists()).toBe(true)
    expect(wrapper.find('.drawer-container__button').text()).toBe('展开详情')
  })
})
