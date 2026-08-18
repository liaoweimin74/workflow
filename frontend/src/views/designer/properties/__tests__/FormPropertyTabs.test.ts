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
import { useDesignerStore } from '@/stores/designerStore'

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
  ;(formApi.getFormDefinition as any).mockResolvedValue({ data: { schema: '[]' } })
  // 清理上一个测试残留的 el-select 下拉 popper（teleport 到 body，避免相互干扰）
  document.querySelectorAll('.el-select-dropdown').forEach((el) => el.remove())
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

describe('节点表单配置 — 字段数据来源映射', () => {
  function setupNodeConfig() {
    const store = useDesignerStore()
    store.selectNode('UserTask_1', 'bpmn:UserTask')
    store.setNodeConfig('UserTask_1', {
      form: { formDefId: 'F1', fieldPermissions: { amount: 'EDIT' } },
    })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({
      data: { content: [{ id: 'F1', name: '报销单', version: 1 }] },
    })
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
    return store
  }

  /** 在 el-table 中定位指定字段行 */
  async function mountTab() {
    const wrapper = mount(FormPropertyTab, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    return wrapper
  }

  /** 点击指定字段卡片的「映射」按钮展开其来源配置区 */
  async function expandRow(wrapper: any, rowText: string) {
    const card = wrapper.findAll('.field-card').find((r: any) => r.text().includes(rowText))
    expect(card).toBeTruthy()
    await card.find('.mapping-toggle-btn').trigger('click')
    await flushPromises()
    return card
  }

  /** 在已展开的字段行内选择来源配置选项 */
  async function pickSource(expandedRow: any, optionText: string, selector = '.source-select .el-select__wrapper') {
    const sourceSelect = expandedRow.find(selector)
    expect(sourceSelect.exists()).toBe(true)
    await sourceSelect.trigger('click')
    await flushPromises()
    // 仅匹配可见下拉（jsdom 中隐藏 popper 的 style.display === 'none'，避免命中残留下拉）
    const items = [...document.querySelectorAll('.el-select-dropdown__item')].filter(
      (i) => (i.closest('.el-select-dropdown') as HTMLElement | null)?.style.display !== 'none'
    )
    const item = [...items].find((i) => i.textContent?.trim() === optionText)
    expect(item).toBeTruthy()
    ;(item as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
  }

  it('配置字段数据来源为「流程变量」后 setNodeConfig 收到含 dataMappings 的节点配置', async () => {
    setupNodeConfig()
    const wrapper = await mountTab()

    const row = await expandRow(wrapper, '金额')
    await pickSource(row, '流程变量')

    const input = row.find('.variable-name-input input')
    expect(input.exists()).toBe(true)
    await input.setValue('requestAmount')
    await flushPromises()

    const saved = useDesignerStore().getNodeConfig('UserTask_1')
    expect(saved?.form?.dataMappings).toContainEqual({
      targetField: 'amount',
      source: 'variable:requestAmount',
    })
  })

  it('配置字段数据来源为「发起人表单」并选择源字段后写入 dataMappings', async () => {
    const store = setupNodeConfig()
    // 发起人节点（wf:nodeRole=initiator）绑定表单 F0
    store.setBpmnXml(
      '<definitions xmlns:wf="http://example.com/wf"><process><userTask id="UserTask_init" wf:nodeRole="initiator" name="发起人填报"/></process></definitions>'
    )
    store.setNodeConfig('UserTask_init', { form: { formDefId: 'F0' } })
    const wrapper = await mountTab()

    const row = await expandRow(wrapper, '金额')
    await pickSource(row, '发起人表单')
    // 发起人表单字段下拉应出现，选择"姓名"（源字段下拉）
    await pickSource(row, '姓名', '.source-field-select .el-select__wrapper')

    const saved = useDesignerStore().getNodeConfig('UserTask_1')
    expect(saved?.form?.dataMappings).toContainEqual({
      targetField: 'amount',
      source: 'form:initiator',
      sourceField: 'name',
    })
  })

  it('默认收起：未点击映射按钮时不渲染 source-cell', async () => {
    setupNodeConfig()
    const wrapper = await mountTab()
    expect(wrapper.findAll('.field-card').some((c: any) => c.find('.source-cell').exists())).toBe(false)
  })

  it('点击「映射」按钮后该行 source-cell 展开', async () => {
    setupNodeConfig()
    const wrapper = await mountTab()
    const row = await expandRow(wrapper, '金额')
    expect(row.find('.source-cell').exists()).toBe(true)
  })

  it('手风琴：展开新行时自动收起之前的行', async () => {
    setupNodeConfig()
    const wrapper = await mountTab()
    const rowAmount = await expandRow(wrapper, '金额')
    expect(rowAmount.find('.source-cell').exists()).toBe(true)

    const rowReason = await expandRow(wrapper, '事由')
    expect(rowReason.find('.source-cell').exists()).toBe(true)
    expect(rowAmount.find('.source-cell').exists()).toBe(false)
  })

  it('再次点击已展开行的「映射」按钮收起', async () => {
    setupNodeConfig()
    const wrapper = await mountTab()
    const row = await expandRow(wrapper, '金额')
    expect(row.find('.source-cell').exists()).toBe(true)
    await row.find('.mapping-toggle-btn').trigger('click')
    await flushPromises()
    expect(row.find('.source-cell').exists()).toBe(false)
  })

  it('映射按钮显示来源摘要：发起人表单与流程变量', async () => {
    const store = setupNodeConfig()
    store.setBpmnXml(
      '<definitions xmlns:wf="http://example.com/wf"><process><userTask id="UserTask_init" wf:nodeRole="initiator" name="发起人填报"/></process></definitions>'
    )
    store.setNodeConfig('UserTask_init', { form: { formDefId: 'F0' } })
    store.setNodeConfig('UserTask_1', {
      form: {
        formDefId: 'F1',
        fieldPermissions: { amount: 'EDIT', reason: 'EDIT' },
        dataMappings: [
          { targetField: 'amount', source: 'form:initiator', sourceField: 'name' },
          { targetField: 'reason', source: 'variable:requestAmount' },
        ],
      },
    })
    const wrapper = await mountTab()

    const rowAmount = wrapper.findAll('.field-card').find((c: any) => c.text().includes('金额'))!
    expect(rowAmount.find('.mapping-toggle-btn').text()).toContain('发起人表单')

    const rowReason = wrapper.findAll('.field-card').find((c: any) => c.text().includes('事由'))!
    expect(rowReason.find('.mapping-toggle-btn').text()).toContain('变量')
  })
})
