// ----- TDD: 流程设计器表单配置页签只展示工作流表单 -----
// npx vitest run src/views/designer/properties/__tests__/FormPropertyTabs.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/form', () => ({
  formApi: {
    getFormDefinitions: vi.fn(),
    getFormDefinition: vi.fn(),
  },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: { id: 'process-1' } }),
}))

import { formApi } from '@/api/form'
import ProcessFormPropertyTab from '../ProcessFormPropertyTab.vue'
import FormPropertyTab from '../FormPropertyTab.vue'

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
  ;(formApi.getFormDefinition as any).mockResolvedValue({ data: { schema: '[]' } })
})

describe('流程设计器表单配置页签 — 仅选择工作流表单', () => {
  it('流程级表单配置（页面）：加载表单列表时按 type=WORKFLOW 过滤', async () => {
    mount(ProcessFormPropertyTab, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(formApi.getFormDefinitions).toHaveBeenCalledWith({
      type: 'WORKFLOW',
      status: 'PUBLISHED',
      size: 1000,
    })
  })

  it('节点表单配置：加载表单列表时按 type=WORKFLOW 过滤', async () => {
    mount(FormPropertyTab, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(formApi.getFormDefinitions).toHaveBeenCalledWith({
      type: 'WORKFLOW',
      status: 'PUBLISHED',
      size: 1000,
    })
  })
})
