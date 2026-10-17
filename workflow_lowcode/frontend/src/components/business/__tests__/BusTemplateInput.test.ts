// ----- BusTemplateInput：单行模板表达式框（值/记录 ID 槽共用）-----
// npx vitest run src/components/business/__tests__/BusTemplateInput.test.ts

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BusTemplateInput from '../BusTemplateInput.vue'
import ExpressionEditor from '@/components/expression/ExpressionEditor.vue'

function mountInput(props: Record<string, any> = {}) {
  return mount(BusTemplateInput, { props: { modelValue: '', vars: ['{row.id}', '{source}'], ...props } })
}

describe('BusTemplateInput', () => {
  it('单行表达式编辑器（bare 模式，占位语透传）', () => {
    const wrapper = mountInput({ placeholder: '如 {node.id}' })
    const editor = wrapper.findComponent(ExpressionEditor)
    expect(editor.exists()).toBe(true)
    expect(editor.props('mode')).toBe('bare')
    expect(editor.props('multiline')).toBe(false)
    expect(editor.props('placeholder')).toBe('如 {node.id}')
    expect(typeof editor.props('customSource')).toBe('function')
  })

  it('编辑即回传 v-model，外部值变化同步进文档', async () => {
    const wrapper = mountInput()
    const view = (wrapper.findComponent(ExpressionEditor).vm as any).$.exposed.getView()
    view.dispatch({ changes: { from: 0, insert: '{row.id}' } })
    const emitted = wrapper.emitted('update:modelValue') as any[]
    expect(emitted[emitted.length - 1][0]).toBe('{row.id}')

    await wrapper.setProps({ modelValue: '{source}' })
    expect(wrapper.find('.cm-content').text()).toBe('{source}')
  })
})
