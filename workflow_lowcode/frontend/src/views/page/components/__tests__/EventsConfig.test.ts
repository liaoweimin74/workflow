// ----- TDD: EventsConfig 事件动作链（声明式）配置；card 模式过滤表格专属触发器 -----
// npx vitest run src/views/page/components/__tests__/EventsConfig.test.ts

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import EventsConfig from '../EventsConfig.vue'

function createWrapper(events: any[] = [], mode: 'table' | 'card' = 'table') {
  return mount(EventsConfig, {
    props: { modelValue: events, mode },
    global: { plugins: [ElementPlus] },
  })
}

describe('EventsConfig — 触发器选项按模式过滤', () => {
  it('table 模式触发器含表格专属：cell-click / selection-change / current-change', async () => {
    const wrapper = createWrapper([], 'table')
    await nextTick()
    const vm = wrapper.vm as any
    const values = (vm.triggerOptions as { label: string; value: string }[]).map((o) => o.value)
    expect(values).toContain('cell-click')
    expect(values).toContain('selection-change')
    expect(values).toContain('current-change')
    expect(values).toContain('row-click')
    wrapper.unmount()
  })

  it('card 模式触发器过滤表格专属（cell/selection/current），保留 row-click', async () => {
    const wrapper = createWrapper([], 'card')
    await nextTick()
    const vm = wrapper.vm as any
    const values = (vm.triggerOptions as { label: string; value: string }[]).map((o) => o.value)
    expect(values).not.toContain('cell-click')
    expect(values).not.toContain('selection-change')
    expect(values).not.toContain('current-change')
    expect(values).toContain('row-click')
    wrapper.unmount()
  })

  it('card 模式触发器保留 refresh / CRUD success / 表单容器联动', async () => {
    const wrapper = createWrapper([], 'card')
    await nextTick()
    const vm = wrapper.vm as any
    const values = (vm.triggerOptions as { label: string; value: string }[]).map((o) => o.value)
    for (const v of ['row-click', 'refresh', 'create-success', 'delete-success', 'dialog-open', 'dialog-close', 'load-success', 'save-success']) {
      expect(values).toContain(v)
    }
    wrapper.unmount()
  })

  it('card 模式动作类型保留容器联动：open-container / load-record / save-container / close-container', async () => {
    const wrapper = createWrapper([], 'card')
    await nextTick()
    const vm = wrapper.vm as any
    const values = (vm.actionTypeOptions as { label: string; value: string }[]).map((o) => o.value)
    for (const v of ['open-container', 'load-record', 'save-container', 'close-container', 'set-filter', 'refresh']) {
      expect(values).toContain(v)
    }
    wrapper.unmount()
  })

  it('card 模式兼容旧数据：已保存的表格专属触发器仍可渲染（旧值兼容选项）', async () => {
    const legacyEvents = [{ trigger: 'cell-click', target: '', actions: [{ type: 'refresh', params: [] }] }]
    const wrapper = createWrapper(legacyEvents, 'card')
    await nextTick()
    const vm = wrapper.vm as any
    const values = (vm.triggerOptions as { label: string; value: string }[]).map((o) => o.value)
    expect(values).not.toContain('cell-click')
    // 旧值仍作为兼容项被渲染（values 不含，但模板提供 legacy 回退项）
    expect(vm.filteredTriggerValues.has('cell-click')).toBe(true)
    wrapper.unmount()
  })
})

describe('EventsConfig — 事件动作链编辑（共享能力）', () => {
  it('添加事件 → update:modelValue 追加 row-click 默认事件', async () => {
    const wrapper = createWrapper([], 'card')
    await nextTick()
    const vm = wrapper.vm as any
    vm.addEvent()
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as any[]
    const last = emitted[emitted.length - 1][0]
    expect(last.length).toBe(1)
    expect(last[0].trigger).toBe('row-click')
    expect(last[0].actions[0].type).toBe('set-filter')
    wrapper.unmount()
  })

  it('patchAction 更新动作类型 → update:modelValue 收到新类型', async () => {
    const wrapper = createWrapper(
      [{ trigger: 'row-click', target: '', actions: [{ type: 'set-filter', params: [] }] }],
      'card',
    )
    await nextTick()
    const vm = wrapper.vm as any
    vm.patchAction(0, 0, { type: 'open-container' })
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as any[]
    const last = emitted[emitted.length - 1][0]
    expect(last[0].actions[0].type).toBe('open-container')
    wrapper.unmount()
  })

  it('addParam 追加参数行 → 动作参数增加', async () => {
    const wrapper = createWrapper(
      [{ trigger: 'row-click', target: '', actions: [{ type: 'open-container', params: [] }] }],
      'card',
    )
    await nextTick()
    const vm = wrapper.vm as any
    vm.addParam(0, 0)
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as any[]
    const last = emitted[emitted.length - 1][0]
    expect(last[0].actions[0].params).toEqual([{ key: '', value: '' }])
    wrapper.unmount()
  })

  it('card 模式移除事件仍正常', async () => {
    const wrapper = createWrapper(
      [
        { trigger: 'row-click', target: '', actions: [{ type: 'refresh', params: [] }] },
        { trigger: 'refresh', target: '', actions: [{ type: 'set-filter', params: [] }] },
      ],
      'card',
    )
    await nextTick()
    const vm = wrapper.vm as any
    vm.removeEvent(0)
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as any[]
    const last = emitted[emitted.length - 1][0]
    expect(last.length).toBe(1)
    expect(last[0].trigger).toBe('refresh')
    wrapper.unmount()
  })
})