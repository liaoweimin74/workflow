import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import StyleScriptInput from '../StyleScriptInput.vue'

describe('StyleScriptInput', () => {
  it('显示可直接编辑的脚本和编辑图标按钮', () => {
    const wrapper = mount(StyleScriptInput, { props: { modelValue: 'color: red;', title: '编辑样式脚本', scope: '整张卡片' }, global: { plugins: [ElementPlus] } })
    expect(wrapper.find('textarea').element.value).toBe('color: red;')
    expect(wrapper.find('button[aria-label="打开样式脚本编辑器"]').exists()).toBe(true)
  })

  it('支持单行脚本输入模式', () => {
    const wrapper = mount(StyleScriptInput, { props: { modelValue: 'color: red;', title: '编辑样式脚本', scope: '整张卡片', multiline: false }, global: { plugins: [ElementPlus] } })
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.find('input').element.value).toBe('color: red;')
  })

  it('编辑图标位于输入框外侧', () => {
    const wrapper = mount(StyleScriptInput, { props: { modelValue: 'color: red;', title: '编辑样式脚本', scope: '整张卡片', multiline: false }, global: { plugins: [ElementPlus] } })
    expect(wrapper.find('.script-editor-shell > .script-edit-button').exists()).toBe(true)
    expect(wrapper.find('.script-editor-shell > .el-input').exists()).toBe(true)
  })

  it('脚本编辑弹窗使用独立遮罩并挂载到 body', () => {
    const wrapper = mount(StyleScriptInput, { props: { modelValue: 'color: red;', title: '编辑样式脚本', scope: '整张卡片' }, global: { plugins: [ElementPlus] } })
    const dialog = wrapper.findComponent({ name: 'ElDialog' })
    expect(dialog.props('appendToBody')).toBe(true)
    expect(dialog.props('modal')).toBe(true)
    expect(dialog.props('lockScroll')).toBe(false)
    expect(dialog.props('zIndex')).toBe(3000)
  })

  it('直接输入和弹窗确认都更新脚本值', async () => {
    const wrapper = mount(StyleScriptInput, { props: { modelValue: '', title: '编辑样式脚本', scope: '整张卡片' }, global: { plugins: [ElementPlus] } })
    await wrapper.find('textarea').setValue('padding: 16px;')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe('padding: 16px;')
    await wrapper.find('button[aria-label="打开样式脚本编辑器"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.body.textContent).toContain('编辑样式脚本')
  })
})
