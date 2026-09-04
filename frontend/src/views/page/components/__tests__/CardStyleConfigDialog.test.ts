// ----- TDD: CardStyleConfigDialog 完整卡片样式配置面板 -----
// npx vitest run src/views/page/components/__tests__/CardStyleConfigDialog.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import CardStyleConfigDialog from '../CardStyleConfigDialog.vue'
import type { CardStyle } from '@/components/business/ListCards.types'

function createWrapper(overrides: Record<string, any> = {}) {
  return mount(CardStyleConfigDialog, {
    props: {
      modelValue: true,
      cardStyle: undefined,
      ...overrides,
    },
    global: { plugins: [ElementPlus] },
  })
}

function confirmEmit(wrapper: any): CardStyle | undefined {
  const confirmBtn = wrapper.findAll('button').find(b => b.text().includes('确定'))
  ;(confirmBtn as any)?.trigger('click')
  return wrapper.emitted('confirm')?.at(-1)?.[0]
}

describe('CardStyleConfigDialog — 完整卡片样式配置', () => {
  it('打开时回显已有 cardStyle（背景色/标题字号/字段区域/dynamic）', async () => {
    const cardStyle: CardStyle = {
      backgroundColor: '#fafafa',
      titleFontSize: 20,
      css: 'opacity: 0.9',
      fields: { layout: 'grid', columns: 2 },
      dynamic: [{ when: "$row.status === '异常'" }],
    }
    const wrapper = createWrapper({ cardStyle })
    await nextTick()
    const vm = wrapper.vm as any
    // 顶层属性：表单使用 v-model 绑定，内部 form 同步自 cardStyle
    expect(vm.form.backgroundColor).toBe('#fafafa')
    expect(vm.form.titleFontSize).toBe(20)
    expect(vm.form.css).toBe('opacity: 0.9')
    // fields 子对象
    expect(vm.fields.layout).toBe('grid')
    expect(vm.fields.columns).toBe(2)
    // dynamic
    expect(vm.form.dynamic).toHaveLength(1)
    wrapper.unmount()
  })

  it('确定时 emit 完整 CardStyle（含 css 逃生舱与 regions）', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const vm = wrapper.vm as any
    // 设置若干字段
    vm.form.backgroundColor = '#ffffff'
    vm.form.css = 'border: 1px solid red'
    vm.form.titleFontWeight = 700
    vm.fields.layout = 'grid'
    vm.fields.columns = 3
    // regions.actions
    vm.regionsActionsPosition = 'right'
    vm.patchActions('position', 'right')

    const emit = confirmEmit(wrapper)
    expect(emit?.backgroundColor).toBe('#ffffff')
    expect(emit?.css).toBe('border: 1px solid red')
    expect(emit?.titleFontWeight).toBe(700)
    expect(emit?.fields?.layout).toBe('grid')
    expect(emit?.fields?.columns).toBe(3)
    expect(emit?.regions?.actions?.position).toBe('right')
    wrapper.unmount()
  })

  it('可新增动态条件样式并在确认时输出', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const vm = wrapper.vm as any
    vm.addDynamic()
    vm.patchDynamic(0, { when: "$row.status === '异常'" })
    vm.patchDynamicStyle(0, 'color:#f56c6c; font-weight:700')

    const emit = confirmEmit(wrapper)
    expect(emit?.dynamic).toHaveLength(1)
    expect(emit?.dynamic?.[0].when).toBe("$row.status === '异常'")
    expect(emit?.dynamic?.[0].style?.color).toBe('#f56c6c')
    expect(emit?.dynamic?.[0].style?.['font-weight']).toBe('700')
    wrapper.unmount()
  })

  it('退出时触发 update:modelValue false', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const cancelBtn = wrapper.findAll('button').find(b => b.text().includes('取消'))
    ;(cancelBtn as any)?.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe(false)
    wrapper.unmount()
  })
})
