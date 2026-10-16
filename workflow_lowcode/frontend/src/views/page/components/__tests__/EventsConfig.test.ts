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

  it('容器联动动作可选（经宿主总线 runStep 执行）', async () => {
    const wrapper = createWrapper([], 'card')
    await nextTick()
    const vm = wrapper.vm as any
    const values = (vm.actionTypeOptions as { label: string; value: string }[]).map((o) => o.value)
    for (const v of ['open-container', 'load-record', 'save-container', 'close-container', 'set-filter', 'refresh']) {
      expect(values).toContain(v)
    }
    // new-record 仍无渲染器实现，不出现在候选中
    expect(values).not.toContain('new-record')
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

describe('EventsConfig — 脚本动作的参数值用编辑器输入', () => {
  it('script 动作的 source 参数渲染 CodeMirror 编辑器', async () => {
    const wrapper = createWrapper([
      {
        trigger: 'row-click',
        target: '',
        actions: [{ type: 'script', params: [{ key: 'source', value: 'ctx.set("a", 1)' }] }],
      },
    ])
    await nextTick()
    expect(wrapper.find('.cm-content').exists()).toBe(true)
    wrapper.unmount()
  })

  it('非脚本动作的参数值仍是单行输入框', async () => {
    const wrapper = createWrapper([
      {
        trigger: 'row-click',
        target: '',
        actions: [{ type: 'message', params: [{ key: 'text', value: '提示文案' }] }],
      },
    ])
    await nextTick()
    expect(wrapper.find('.cm-content').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('EventsConfig — 切动作类型自动补齐约定参数', () => {
  const oneAction = (type: string, params: any[] = []) => [
    { trigger: 'row-click', target: '', actions: [{ type, params }] },
  ]

  it('切到 script 立刻出现 source 参数行（不必手打参数名才看到脚本编辑器）', async () => {
    const wrapper = createWrapper(oneAction('refresh'))
    await nextTick()
    const vm = wrapper.vm as any
    vm.patchAction(0, 0, { type: 'script' })
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as any[]
    const next = emitted[emitted.length - 1][0]
    expect(next[0].actions[0].params).toEqual([{ key: 'source', value: '' }])
    // 宿主回写后（真实用法是 v-model），参数行即渲染脚本编辑器
    await wrapper.setProps({ modelValue: next })
    expect(wrapper.find('.cm-content').exists()).toBe(true)
    wrapper.unmount()
  })

  it('切回无约定参数的动作时保留过滤字段参数（set-filter 不清空）', async () => {
    const wrapper = createWrapper(oneAction('set-filter', [{ key: 'status', value: '$row.status' }]))
    await nextTick()
    const vm = wrapper.vm as any
    vm.patchAction(0, 0, { type: 'refresh' })
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as any[]
    expect(emitted[emitted.length - 1][0][0].actions[0].params).toEqual([{ key: 'status', value: '$row.status' }])
    wrapper.unmount()
  })

  it('参数名用下拉候选（可下拉选约定参数，也允许自由输入）', async () => {
    const wrapper = createWrapper(oneAction('script', [{ key: 'source', value: '' }]))
    await nextTick()
    expect(wrapper.find('.param-row .el-select').exists()).toBe(true)
    expect(wrapper.find('.param-row input[placeholder="参数名"]').exists()).toBe(false)
    wrapper.unmount()
  })
})