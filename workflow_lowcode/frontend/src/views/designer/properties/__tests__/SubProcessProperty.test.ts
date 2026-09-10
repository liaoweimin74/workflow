import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'

const fakeEl = vi.hoisted(() => ({
  id: 'SubProcess_1',
  businessObject: { name: '入职处理', get: () => undefined },
}))

vi.mock('../../utils/bpmnModeler', () => ({
  getModeler: () => ({
    get: (name: string) => {
      if (name === 'elementRegistry') return { get: (id: string) => (id === 'SubProcess_1' ? fakeEl : null) }
      if (name === 'modeling') return { updateProperties: vi.fn() }
      return null
    },
  }),
}))

import SubProcessProperty from '../SubProcessProperty.vue'
import { useDesignerStore } from '@/stores/designerStore'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('SubProcessProperty', () => {
  it('回填已有 basic.name 与 description', async () => {
    const store = useDesignerStore()
    store.selectNode('SubProcess_1', 'bpmn:SubProcess')
    store.setNodeConfig('SubProcess_1', { basic: { name: '入职处理', description: '负责入职事务' } })
    const wrapper = mount(SubProcessProperty, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const inputValues = wrapper.findAll('input').map((i) => i.element.value)
    // 顺序：节点ID（禁用）→ 节点名称
    expect(inputValues).toContain('入职处理')
    expect(inputValues[0]).toBe('SubProcess_1')
    const textareaValues = wrapper.findAll('textarea').map((i) => i.element.value)
    expect(textareaValues).toContain('负责入职事务')
  })

  it('修改名称后写入 nodeConfig basic.name', async () => {
    const store = useDesignerStore()
    store.selectNode('SubProcess_1', 'bpmn:SubProcess')
    store.setNodeConfig('SubProcess_1', { basic: { name: '旧名' } })
    const wrapper = mount(SubProcessProperty, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const nameInput = wrapper.findAll('input')[1]
    await nameInput.setValue('新名')
    await nameInput.trigger('change')
    await flushPromises()
    const saved = store.getNodeConfig('SubProcess_1')
    expect(saved?.basic?.name).toBe('新名')
  })
})