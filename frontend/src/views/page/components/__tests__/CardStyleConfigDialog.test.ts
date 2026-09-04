import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import CardStyleConfigDialog from '../CardStyleConfigDialog.vue'
import { CARD_THEMES } from '@/components/business/ListCards.themes'
import { themeToCssScript } from '@/components/business/ListCards.styles'

function createWrapper(cardStyle?: any) {
  return mount(CardStyleConfigDialog, { props: { modelValue: true, cardStyle }, global: { plugins: [ElementPlus] } })
}

describe('CardStyleConfigDialog', () => {
  it('提供六个预制主题并填充蓝色科技基础脚本', async () => {
    const wrapper = createWrapper()
    const vm = wrapper.vm as any
    vm.applyTheme('techBlue')
    await nextTick()
    expect(vm.theme).toBe('techBlue')
    expect(vm.base.css).toBe(themeToCssScript(CARD_THEMES.techBlue))
    expect(wrapper.text()).toContain('蓝色科技 · 霓虹科技风格')
    expect(wrapper.findAll('.el-select-dropdown__item')).toHaveLength(0)
  })

  it('保存基础样式、条件规则和 className', async () => {
    const wrapper = createWrapper()
    const vm = wrapper.vm as any
    vm.base.css = 'padding: 16px;'
    vm.rules = [{ enabled: true, when: "$row.status === '异常'", css: 'color: red;', className: 'status-error' }]
    vm.handleConfirm()
    const emitted = wrapper.emitted('confirm')?.[0]?.[0] as any
    expect(emitted.theme).toBe('default')
    expect(emitted.base.css).toBe('padding: 16px;')
    expect(emitted.rules[0]).toMatchObject({ when: "$row.status === '异常'", css: 'color: red;', className: 'status-error' })
  })

  it('回显已保存的基础规则和条件规则', async () => {
    const wrapper = createWrapper({ theme: 'dark', base: { enabled: true, css: 'padding: 20px;' }, rules: [{ enabled: true, when: 'true', css: 'color: red;', className: 'danger' }] })
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.theme).toBe('dark')
    expect(vm.base.css).toBe('padding: 20px;')
    expect(vm.rules[0].className).toBe('danger')
  })

  it('取消时关闭弹窗', async () => {
    const wrapper = createWrapper()
    const vm = wrapper.vm as any
    vm.visible = false
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe(false)
  })
})
