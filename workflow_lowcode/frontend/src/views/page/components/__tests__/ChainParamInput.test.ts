// ----- TDD: ChainParamInput 动作链参数值输入（脚本形态走 CM6 编辑器）-----
// npx vitest run src/views/page/components/__tests__/ChainParamInput.test.ts

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import type { EditorView } from '@codemirror/view'
import ChainParamInput from '../ChainParamInput.vue'
import ExpressionEditor from '@/components/expression/ExpressionEditor.vue'

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(ChainParamInput, {
    props: { modelValue: '', kind: 'free', ...props },
    global: { plugins: [ElementPlus] },
  })
}

describe('ChainParamInput', () => {
  it('free 形态渲染单行输入框并显示 placeholder', async () => {
    const wrapper = createWrapper({ placeholder: '值，支持 $row.xxx' })
    await nextTick()
    expect(wrapper.find('.cm-content').exists()).toBe(false)
    const input = wrapper.find('input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('placeholder')).toBe('值，支持 $row.xxx')
    wrapper.unmount()
  })

  it('free 形态输入时 emit update:modelValue', async () => {
    const wrapper = createWrapper()
    await wrapper.find('input').setValue('abc')
    const emitted = wrapper.emitted('update:modelValue') as unknown[][]
    expect(emitted.at(-1)![0]).toBe('abc')
    wrapper.unmount()
  })

  it('script 形态渲染 CodeMirror 编辑器而非单行输入框', async () => {
    const wrapper = createWrapper({ kind: 'script', modelValue: 'ctx.set("a", 1)' })
    await nextTick()
    expect(wrapper.find('.cm-content').exists()).toBe(true)
    expect(wrapper.find('.cm-content').text()).toContain('ctx.set(')
    wrapper.unmount()
  })

  it('script 形态编辑文档后 emit update:modelValue', async () => {
    const wrapper = createWrapper({ kind: 'script' })
    await nextTick()
    const ed = wrapper.findComponent(ExpressionEditor)
    // script setup 的 defineExpose 成员经内部实例 exposed 访问
    const exposed = (ed.vm.$ as unknown as { exposed: { getView: () => EditorView } }).exposed
    const view = exposed.getView()
    view.dispatch({ changes: { from: 0, to: 0, insert: 'x = 1' } })
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as unknown[][]
    expect(emitted.at(-1)![0]).toBe('x = 1')
    wrapper.unmount()
  })

  it('options 非空渲染枚举下拉，选定后 emit 对应值', async () => {
    const wrapper = createWrapper({ options: ['info', 'success', 'warning', 'error'] })
    // el-select 下拉 teleport 到 body，需挂到 document 才能查到选项
    await nextTick()
    expect(wrapper.find('.el-select').exists()).toBe(true)
    await wrapper.find('.el-select__wrapper').trigger('click')
    await nextTick()
    const opt = [...document.querySelectorAll('.el-select-dropdown__item')].find(
      (o) => o.textContent?.trim() === 'success',
    )
    expect(opt).toBeTruthy()
    opt!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as unknown[][]
    expect(emitted.at(-1)![0]).toBe('success')
    wrapper.unmount()
  })

  it('options 为空回落自由输入（无下拉）', async () => {
    const wrapper = createWrapper({ options: [] })
    await nextTick()
    expect(wrapper.find('.el-select').exists()).toBe(false)
    expect(wrapper.find('input').exists()).toBe(true)
    wrapper.unmount()
  })
})
