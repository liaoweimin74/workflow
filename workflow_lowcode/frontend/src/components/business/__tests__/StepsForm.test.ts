// ----- Task 3-g: StepsForm 分步表单容器测试 -----
// npx vitest run src/components/business/__tests__/StepsForm.test.ts
//
// 覆盖：步骤条渲染（steps 配置/children 推导）、pane 显隐切换（v-show、全挂载）、
// 步骤点击导航事件、direction 透传、设计态（DragBox）全显降级。

import { describe, it, expect } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import StepsForm from '../StepsForm.vue'

function createWrapper(props: any = {}, slotChildren?: any[]) {
  return mount(StepsForm, {
    props: {
      active: 0,
      ...props,
    },
    slots: {
      default: () => slotChildren || [
        h('div', { class: 'field-a' }, '字段A'),
        h('div', { class: 'field-b' }, '字段B'),
        h('div', { class: 'field-c' }, '字段C'),
      ],
    },
    global: { plugins: [ElementPlus] },
  })
}

function panes(wrapper: any) {
  return wrapper.findAll('.steps-form__pane')
}

/** 模拟 FcDesigner 画布的 DragBox 包裹（name 对齐 vendor/components/DragBox.vue） */
const FakeDragBox = defineComponent({ name: 'DragBox', setup: () => () => h('div', { class: 'fake-dragbox' }, 'DRAG AREA') })

describe('StepsForm — 渲染', () => {
  it('steps 未配置时按 children 数量推导「第 N 步」', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()
    const steps = wrapper.findAll('.el-step')
    expect(steps.length).toBe(3)
    expect(steps[0].text()).toContain('第 1 步')
  })

  it('steps 配置按索引生效（title/description）', async () => {
    const wrapper = createWrapper({
      steps: [
        { title: '基本信息', description: '填写主体' },
        { title: '明细信息' },
      ],
    })
    await nextTick()
    await nextTick()
    const steps = wrapper.findAll('.el-step')
    expect(steps.length).toBe(3) // children 3 个 > 配置 2 步 → 补齐「第 3 步」
    expect(steps[0].text()).toContain('基本信息')
    expect(steps[0].text()).toContain('填写主体')
    expect(steps[1].text()).toContain('明细信息')
  })

  it('每个直接子组件 = 一个 pane，且全部挂载（运行态）', () => {
    const wrapper = createWrapper()
    expect(panes(wrapper).length).toBe(3)
    expect(wrapper.find('.field-a').exists()).toBe(true)
    expect(wrapper.find('.field-b').exists()).toBe(true)
    expect(wrapper.find('.field-c').exists()).toBe(true)
  })

  it('direction 透传 el-steps', () => {
    const wrapper = createWrapper({ direction: 'vertical' })
    expect(wrapper.findComponent({ name: 'ElSteps' }).props('direction')).toBe('vertical')
  })
})

describe('StepsForm — 显隐切换（v-show 常挂载）', () => {
  it('active=0 时仅第 1 个 pane 可见，其余 display:none', () => {
    const wrapper = createWrapper({ active: 0 })
    const ps = panes(wrapper)
    expect(ps[0].attributes('style')).toBeUndefined()
    expect(ps[1].attributes('style')).toContain('display: none')
    expect(ps[2].attributes('style')).toContain('display: none')
  })

  it('active 切换为 1 时 pane 显隐随之翻转（子节点始终存在，不卸载）', async () => {
    const wrapper = createWrapper({ active: 0 })
    await wrapper.setProps({ active: 1 })
    const ps = panes(wrapper)
    expect(ps[0].attributes('style')).toContain('display: none')
    expect(ps[1].attributes('style')).toBeUndefined()
    // v-show 而非 v-if：切换后所有字段仍在 DOM
    expect(wrapper.find('.field-a').exists()).toBe(true)
    expect(wrapper.find('.field-b').exists()).toBe(true)
  })

  it('点击步骤头导航：emit update:active + change', async () => {
    const wrapper = createWrapper({ active: 0 })
    await nextTick()
    await nextTick()
    const steps = wrapper.findAll('.el-step')
    await steps[2].trigger('click')
    expect(wrapper.emitted('update:active')).toEqual([[2]])
    expect(wrapper.emitted('change')).toEqual([[2]])
  })

  it('active 越界钳制到 [0, stepCount-1]', () => {
    const wrapper = createWrapper({ active: 99 })
    // 越界钳制为最后一步：前两个 pane 隐藏
    const ps = panes(wrapper)
    expect(ps[0].attributes('style')).toContain('display: none')
    expect(ps[1].attributes('style')).toContain('display: none')
    expect(ps[2].attributes('style')).toBeUndefined()
  })
})

describe('StepsForm — 设计态（DragBox）降级', () => {
  it('单 DragBox 子节点识别为设计态：全显 + 显示设计提示 + 点击步骤不导航', async () => {
    const wrapper = mount(StepsForm, {
      props: { active: 0, steps: [{ title: '第一步' }, { title: '第二步' }] },
      slots: { default: () => [h(FakeDragBox)] },
      global: { plugins: [ElementPlus] },
    })
    await nextTick()
    await nextTick()
    expect(wrapper.find('.steps-form__design-tip').exists()).toBe(true)
    // 设计态 children 平铺在唯一 pane 内，不因显隐丢失
    expect(wrapper.find('.fake-dragbox').exists()).toBe(true)
    const steps = wrapper.findAll('.el-step')
    expect(steps.length).toBe(2)
    await steps[1].trigger('click')
    expect(wrapper.emitted('update:active')).toBeUndefined()
  })
})
