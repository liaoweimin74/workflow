import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import DataSourceConfigPanel from '../DataSourceConfigPanel.vue'
import type { DataSourceDTO } from '@/api/data-source'

// Mock Element Plus（kebab-case 组件名，匹配模板 <el-xxx>）
const stub = (name: string, template: string, props: string[] = []) =>
  defineComponent({ name, template, props })

const ElStubs = {
  'el-input': stub('ElInputStub', '<input />', ['modelValue', 'placeholder']),
  'el-select': stub('ElSelectStub', '<select><slot /></select>', ['modelValue', 'placeholder', 'filterable']),
  'el-option': stub('ElOptionStub', '<option :value="value">{{ label || value }}</option>', ['label', 'value']),
  'el-button': stub('ElButtonStub', '<button />', ['type', 'plain', 'link']),
  'el-empty': stub('ElEmptyStub', '<div />', ['description', 'imageSize']),
  'el-icon': stub('ElIconStub', '<span />'),
  'el-tabs': stub('ElTabsStub', '<div><slot /></div>', ['modelValue', 'type']),
  'el-tab-pane': stub('ElTabPaneStub', '<div><slot /></div>', ['label', 'name']),
  'el-radio-group': stub('ElRadioGroupStub', '<div><slot /></div>'),
  'el-radio-button': stub('ElRadioButtonStub', '<span><slot /></span>'),
}

vi.mock('element-plus', () => ({
  ElInput: { name: 'ElInput', template: '<input />', props: ['modelValue', 'placeholder'] },
  ElSelect: { name: 'ElSelect', template: '<select><slot /></select>', props: ['modelValue', 'placeholder', 'filterable'] },
  ElOption: { name: 'ElOption', template: '<option>{{ label || value }}</option>', props: ['label', 'value'] },
  ElButton: { name: 'ElButton', template: '<button />', props: ['type', 'plain', 'link'] },
  ElEmpty: { name: 'ElEmpty', template: '<div />', props: ['description', 'imageSize'] },
  ElIcon: { name: 'ElIcon', template: '<span />', props: [] },
  ElTabs: { name: 'ElTabs', template: '<div><slot /></div>', props: ['modelValue', 'type'] },
  ElTabPane: { name: 'ElTabPane', template: '<div><slot /></div>', props: ['label', 'name'] },
}))

// Mock icons
vi.mock('@element-plus/icons-vue', () => ({
  Plus: { template: '<span />', name: 'Plus' },
  InfoFilled: { template: '<span />', name: 'InfoFilled' },
}))

const mockDataSources: DataSourceDTO[] = [
  { id: 'ds1', tenantId: 't1', name: '用户数据源', type: 'FORM', formKey: 'user', sourceKey: null, params: null, status: 'ENABLED', createdBy: null, createdAt: '', updatedAt: '' },
  { id: 'ds2', tenantId: 't1', name: '订单数据源', type: 'API', formKey: null, sourceKey: 'order', params: null, status: 'ENABLED', createdBy: null, createdAt: '', updatedAt: '' },
]

function mountPanel(props: Record<string, any> = {}) {
  return mount(DataSourceConfigPanel, {
    props: {
      dataSources: [],
      enabledDataSources: mockDataSources,
      ...props,
    },
    global: { components: ElStubs },
  })
}

describe('DataSourceConfigPanel', () => {

  it('renders panel with tabs', () => {
    const wrapper = mountPanel()

    // Check that the component renders
    expect(wrapper.exists()).toBe(true)
    // Check for panel header
    expect(wrapper.text()).toContain('数据源绑定配置')
  })

  it('has correct props interface', () => {
    const wrapper = mountPanel({ actions: [] })

    const vm = wrapper.vm as any
    expect(vm.localDataSources).toEqual([])
    expect(vm.localActions).toEqual([])
  })

  it('validates duplicate page identifiers', async () => {
    const wrapper = mountPanel({
      dataSources: [
        { id: 'myDs', refId: 'ds1' },
        { id: 'myDs', refId: 'ds2' },
      ],
    })

    const vm = wrapper.vm as any
    // Trigger validation
    vm.validateAll()
    await wrapper.vm.$nextTick()

    // Should have errors for duplicate
    expect(vm.errors.length).toBe(2)
    expect(vm.errors[0].id).toBe('页面内标识已存在')
  })

  it('validates empty page identifier', async () => {
    const wrapper = mountPanel({
      dataSources: [
        { id: '', refId: 'ds1' },
      ],
    })

    const vm = wrapper.vm as any
    // Trigger validation
    vm.validateAll()
    await wrapper.vm.$nextTick()

    // Should have error for empty
    expect(vm.errors.length).toBe(1)
    expect(vm.errors[0].id).toBe('页面内标识不能为空')
  })

  it('validates missing global data source selection', async () => {
    const wrapper = mountPanel({
      dataSources: [
        { id: 'myDs', refId: '' },
      ],
    })

    const vm = wrapper.vm as any
    // Trigger validation
    vm.validateAll()
    await wrapper.vm.$nextTick()

    // Should have error for missing selection
    expect(vm.errors.length).toBe(1)
    expect(vm.errors[0].refId).toBe('请选择全局数据源')
  })

  it('supports actions prop', async () => {
    const wrapper = mountPanel({
      actions: [
        { trigger: 'node-click', steps: [{ op: 'refresh', target: 'ds1' }] },
      ],
    })

    expect(wrapper.emitted('update:actions')).toBeFalsy()
  })

  // ==================== 表格-容器联动动作配置 ====================

  it('动作总线触发器下拉包含 row-edit/row-view/row-create 联动触发器', () => {
    const wrapper = mountPanel({
      actions: [{ trigger: 'row-edit', steps: [] }],
    })
    const vm = wrapper.vm as any
    expect(vm.localActions[0].trigger).toBe('row-edit')
    // 触发器下拉选项（渲染为 option 元素）
    const triggerOptions = wrapper.findAll('option').map((o) => o.attributes('value'))
    expect(triggerOptions).toContain('row-edit')
    expect(triggerOptions).toContain('row-view')
    expect(triggerOptions).toContain('row-create')
  })

  it('动作步骤下拉包含容器联动动作（open-container/load-record/save-container/close-container）', () => {
    const wrapper = mountPanel({
      actions: [{ trigger: 'row-edit', steps: [{ op: 'open-container', target: 'ds1' }] }],
    })
    const optionValues = wrapper.findAll('option').map((o) => o.attributes('value'))
    expect(optionValues).toContain('open-container')
    expect(optionValues).toContain('load-record')
    expect(optionValues).toContain('save-container')
    expect(optionValues).toContain('close-container')
  })

  it('open-container 步骤渲染 displayMode 参数下拉（弹窗/新页签/内嵌）', () => {
    const wrapper = mountPanel({
      actions: [{ trigger: 'row-edit', steps: [{ op: 'open-container', target: 'ds1' }] }],
    })
    const optionValues = wrapper.findAll('option').map((o) => o.attributes('value'))
    expect(optionValues).toContain('dialog')
    expect(optionValues).toContain('newTab')
    expect(optionValues).toContain('inline')
  })

  it('load-record 步骤渲染 recordId 参数输入', () => {
    const wrapper = mountPanel({
      actions: [{ trigger: 'row-edit', steps: [{ op: 'load-record', target: 'ds1', recordId: '{row.id}' }] }],
    })
    const vm = wrapper.vm as any
    expect(vm.localActions[0].steps[0].recordId).toBe('{row.id}')
  })

  it('新增动作默认 steps 支持 open-container 配置', async () => {
    const wrapper = mountPanel({ actions: [] })
    const vm = wrapper.vm as any
    // 添加动作 → 默认触发器应为 row-edit（联动场景优先）
    vm.addAction()
    expect(vm.localActions.length).toBe(1)
    // 提交时不崩溃
    vm.emitActions()
    const emitted = wrapper.emitted('update:actions') as any[]
    expect(emitted).toBeTruthy()
    expect(emitted[0][0][0].trigger).toBe('row-edit')
  })

  // ==================== 动作来源数据源（多数据源） ====================

  it('动作卡片渲染来源数据源下拉（全局 + 各数据源）', () => {
    const wrapper = mountPanel({
      dataSources: [
        { id: 'dsTable', refId: 'g1' },
        { id: 'dsForm', refId: 'g2' },
      ],
      actions: [{ trigger: 'row-edit', steps: [{ op: 'open-container', target: 'dsForm' }] }],
    })
    const optionValues = wrapper.findAll('option').map((o) => o.attributes('value'))
    expect(optionValues).toContain('') // 全局（不限制来源）
    expect(optionValues).toContain('dsTable')
    expect(optionValues).toContain('dsForm')
  })

  it('动作 source 字段参与提交（选中来源后保存）', () => {
    const wrapper = mountPanel({
      dataSources: [{ id: 'dsTable', refId: 'g1' }],
      actions: [{ trigger: 'row-edit', source: 'dsTable', steps: [] }],
    })
    const vm = wrapper.vm as any
    expect(vm.localActions[0].source).toBe('dsTable')
    vm.emitActions()
    const emitted = wrapper.emitted('update:actions') as any[]
    expect(emitted[0][0][0].source).toBe('dsTable')
  })

  // ==================== 目标数据源下拉（step.target） ====================

  it('步骤 target 渲染为下拉（选项来自数据源绑定）', () => {
    const wrapper = mountPanel({
      dataSources: [
        { id: 'dsTable', refId: 'g1' },
        { id: 'dsForm', refId: 'g2' },
      ],
      actions: [{ trigger: 'row-edit', steps: [{ op: 'open-container', target: 'dsForm' }] }],
    })
    // select 选项（option 元素）应包含数据源 id（target 候选）
    const optionValues = wrapper.findAll('option').map((o) => o.attributes('value'))
    expect(optionValues).toContain('dsTable')
    expect(optionValues).toContain('dsForm')
    // target 不再渲染为文本输入框（el-input stub 是 input 元素）
    // —— 验证存在 select 元素承载 target
    expect(wrapper.findAll('select').length).toBeGreaterThanOrEqual(3) // trigger + source + target
  })

  it('步骤 target 默认值自动填充第一个数据源（新建动作时）', () => {
    const wrapper = mountPanel({
      dataSources: [{ id: 'dsForm', refId: 'g2' }],
      actions: [],
    })
    const vm = wrapper.vm as any
    vm.addAction()
    // addAction 新建 open-container 步骤，target 应预填第一个数据源
    expect(vm.localActions[0].steps[0].target).toBe('dsForm')
  })
})
