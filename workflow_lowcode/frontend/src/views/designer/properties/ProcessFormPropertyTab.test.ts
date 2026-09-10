// ----- TDD: 流程设计器流程级「流程变量映射」面板 -----
// npx vitest run src/views/designer/properties/ProcessFormPropertyTab.test.ts

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
import ProcessFormPropertyTab from './ProcessFormPropertyTab.vue'
import { useDesignerStore, DEFAULT_PROCESS_CONFIG } from '@/stores/designerStore'

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  ;(formApi.getFormDefinitions as any).mockResolvedValue({
    data: { content: [{ id: 'F1', name: '报销单', version: 1 }] },
  })
  ;(formApi.getFormDefinition as any).mockResolvedValue({
    data: {
      schema: JSON.stringify({
        rule: [
          { field: 'amount', title: '金额' },
          { field: 'reason', title: '事由' },
        ],
      }),
    },
  })
  // 清理上一个测试残留的 el-select 下拉 popper（teleport 到 body，避免相互干扰）
  document.querySelectorAll('.el-select-dropdown').forEach((el) => el.remove())
})

describe('流程级配置 — 流程变量映射面板', () => {
  async function mountTab() {
    const wrapper = mount(ProcessFormPropertyTab, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    return wrapper
  }

  /** 打开下拉并选择指定选项（仅匹配可见 popper） */
  async function pickOption(wrapper: any, selector: string, optionText: string) {
    const select = wrapper.find(selector)
    expect(select.exists()).toBe(true)
    await select.trigger('click')
    await flushPromises()
    const items = [...document.querySelectorAll('.el-select-dropdown__item')].filter(
      (i) => (i.closest('.el-select-dropdown') as HTMLElement | null)?.style.display !== 'none'
    )
    const item = items.find((i) => i.textContent?.trim() === optionText)
    expect(item).toBeTruthy()
    ;(item as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
  }

  it('新增变量映射条目（流程变量源）后 setProcessConfig 收到含 variableMappings 的配置', async () => {
    const store = useDesignerStore()
    store.setProcessConfig({ ...DEFAULT_PROCESS_CONFIG, form: { formDefId: 'F1' } })
    const wrapper = await mountTab()

    await wrapper.find('.add-mapping-btn').trigger('click')
    await flushPromises()

    const row = wrapper.find('.mapping-row')
    expect(row.exists()).toBe(true)
    await row.find('.mapping-variable-input input').setValue('requestAmount')
    await pickOption(wrapper, '.mapping-row .mapping-source-select', '流程变量')

    // 流程变量源：输入源变量名
    const srcInput = wrapper.find('.mapping-row .mapping-source-variable-input input')
    expect(srcInput.exists()).toBe(true)
    await srcInput.setValue('amount')
    await flushPromises()

    const saved = store.getProcessConfig()
    expect(saved.variableMappings).toContainEqual({
      variable: 'requestAmount',
      source: 'variable:amount',
    })
  })

  it('新增变量映射条目（发起人表单源）并选择源字段后写入 variableMappings', async () => {
    const store = useDesignerStore()
    store.setProcessConfig({ ...DEFAULT_PROCESS_CONFIG, form: { formDefId: 'F1' } })
    store.setBpmnXml(
      '<definitions xmlns:wf="http://example.com/wf"><process><userTask id="UserTask_init" wf:nodeRole="initiator" name="发起人填报"/></process></definitions>'
    )
    store.setNodeConfig('UserTask_init', { form: { formDefId: 'F0' } })
    ;(formApi.getFormDefinition as any).mockImplementation((formDefId: string) => {
      if (formDefId === 'F0') {
        return Promise.resolve({
          data: { schema: JSON.stringify({ rule: [{ field: 'name', title: '姓名' }] }) },
        })
      }
      return Promise.resolve({
        data: {
          schema: JSON.stringify({
            rule: [
              { field: 'amount', title: '金额' },
              { field: 'reason', title: '事由' },
            ],
          }),
        },
      })
    })
    const wrapper = await mountTab()

    await wrapper.find('.add-mapping-btn').trigger('click')
    await flushPromises()

    const row = wrapper.find('.mapping-row')
    await row.find('.mapping-variable-input input').setValue('applicantName')
    await pickOption(wrapper, '.mapping-row .mapping-source-select', '发起人表单字段')
    await pickOption(wrapper, '.mapping-row .mapping-source-field-select', '姓名')
    await flushPromises()

    const saved = store.getProcessConfig()
    expect(saved.variableMappings).toContainEqual({
      variable: 'applicantName',
      source: 'form:initiator',
      sourceField: 'name',
    })
  })

  it('输入重复变量名时 UI 提示且不写入重复条目', async () => {
    const store = useDesignerStore()
    store.setProcessConfig({
      ...DEFAULT_PROCESS_CONFIG,
      form: { formDefId: 'F1' },
      variableMappings: [{ variable: 'requestAmount', source: 'variable:amount' }],
    })
    const wrapper = await mountTab()

    await wrapper.find('.add-mapping-btn').trigger('click')
    await flushPromises()
    // 新添加的行是最后一行（预置行在前）
    const rows = wrapper.findAll('.mapping-row')
    await rows[rows.length - 1].find('.mapping-variable-input input').setValue('requestAmount')
    await flushPromises()

    expect(wrapper.find('.mapping-variable-error').exists()).toBe(true)
    expect(store.getProcessConfig().variableMappings?.length).toBe(1)
  })
})
