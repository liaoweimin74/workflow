import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import DataSourceConfigPanel from '../DataSourceConfigPanel.vue'
import BusTemplateInput from '../BusTemplateInput.vue'
import { resetBusFieldCache } from '../busFieldOptions'
import type { DataSourceDTO } from '@/api/data-source'

// 目标数据源列清单经 metadata 接口取（set-filter 字段下拉候选）
const getMetadataMock = vi.fn()
vi.mock('@/api/data-source', () => ({
  dataSourceApi: { getMetadata: (id: string) => getMetadataMock(id) },
}))

// Mock Element Plus（kebab-case 组件名，匹配模板 <el-xxx>）
const stub = (name: string, template: string, props: string[] | Record<string, any> = []) =>
  defineComponent({ name, template, props })

const ElStubs = {
  'el-input': stub('ElInputStub', '<input />', ['modelValue', 'placeholder']),
  // 布尔 props 需显式类型，否则裸写 filterable 传成 ''（断言读不到 true）
  'el-select': stub('ElSelectStub', '<select><slot /></select>', {
    modelValue: {},
    placeholder: String,
    filterable: Boolean,
    allowCreate: Boolean,
    defaultFirstOption: Boolean,
    reserveKeyword: Boolean,
  }),
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
  Delete: { template: '<span />', name: 'Delete' },
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
  beforeEach(() => {
    resetBusFieldCache()
    getMetadataMock.mockReset()
  })

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

  it('open-container 步骤不再配置 displayMode（显示模式以容器属性面板为准）', () => {
    const wrapper = mountPanel({
      actions: [{ trigger: 'row-edit', steps: [{ op: 'open-container', target: 'ds1' }] }],
    })
    // displayMode 下拉已移除：选项中不再有 dialog/newTab/inline 模式值
    const optionValues = wrapper.findAll('option').map((o) => o.attributes('value'))
    expect(optionValues).not.toContain('newTab')
    expect(optionValues).not.toContain('inline')
  })

  it('load-record 步骤渲染 recordId 参数输入', () => {
    const wrapper = mountPanel({
      actions: [{ trigger: 'row-edit', steps: [{ op: 'load-record', target: 'ds1', recordId: '{row.id}' }] }],
    })
    const vm = wrapper.vm as any
    expect(vm.localActions[0].steps[0].recordId).toBe('{row.id}')
  })

  it('步骤参数槽由清单驱动：按 op 渲染对应数量的下拉与表达式框', () => {
    const slotsOf = (op: string) => {
      const row = mountPanel({ actions: [{ trigger: 'row-edit', steps: [{ op, target: 'ds1' }] }] })
        .find('.step-row')
      return {
        selects: row.findAll('select').length,
        editors: row.findAllComponents(BusTemplateInput).length,
      }
    }
    // 每行固定 op + target 两个下拉；set-filter 多一个 field 下拉，value/recordId 各占一个表达式框
    expect(slotsOf('set-filter')).toEqual({ selects: 3, editors: 1 })
    expect(slotsOf('reload-record')).toEqual({ selects: 2, editors: 1 })
    expect(slotsOf('load-record')).toEqual({ selects: 2, editors: 1 })
    expect(slotsOf('refresh')).toEqual({ selects: 2, editors: 0 })
    expect(slotsOf('close-container')).toEqual({ selects: 2, editors: 0 })
  })

  it('reload-record 的 value 输入给出记录 ID 模板提示，set-filter 给过滤值提示', () => {
    const wrapper = mountPanel({
      actions: [{ trigger: 'record-change', steps: [{ op: 'reload-record', target: 'ds1' }] }],
    })
    const vm = wrapper.vm as any
    expect(vm.stepValuePlaceholder('reload-record')).toContain('记录ID')
    expect(vm.stepValuePlaceholder('set-filter')).toContain('{node.id}')
  })

  it('总线动作下拉不含 set-value（运行时支持但暂无配置入口）', () => {
    const wrapper = mountPanel({
      actions: [{ trigger: 'row-edit', steps: [{ op: 'refresh', target: 'ds1' }] }],
    })
    const optionValues = wrapper.findAll('option').map((o) => o.attributes('value'))
    expect(optionValues).not.toContain('set-value')
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

  // ==================== 值/记录 ID 模板补全 ====================

  it('value 槽是模板表达式框，候选按触发器可用根展开行字段', () => {
    const wrapper = mountPanel({
      rowFields: ['order_no'],
      actions: [{ trigger: 'row-click', steps: [{ op: 'set-filter', target: 'ds1' }] }],
    })
    const inputs = wrapper.findAllComponents(BusTemplateInput)
    expect(inputs).toHaveLength(1)
    expect(inputs[0].props('vars')).toEqual([
      '{node.order_no}',
      '{node.id}',
      '{row.order_no}',
      '{row.id}',
      '{source}',
    ])
  })

  it('recordId 槽同样用模板表达式框（load-record）', () => {
    const wrapper = mountPanel({
      actions: [{ trigger: 'record-change', steps: [{ op: 'load-record', target: 'ds1' }] }],
    })
    const inputs = wrapper.findAllComponents(BusTemplateInput)
    expect(inputs).toHaveLength(1)
    // 未上行字段时至少给 id
    expect(inputs[0].props('vars')).toContain('{record.id}')
  })

  it('无值槽的动作不渲染表达式框', () => {
    const wrapper = mountPanel({
      actions: [{ trigger: 'row-click', steps: [{ op: 'refresh', target: 'ds1' }] }],
    })
    expect(wrapper.findAllComponents(BusTemplateInput)).toHaveLength(0)
  })

  // ==================== set-filter 字段下拉（按 target 容器实际列） ====================

  const filterStep = () =>
    mountPanel({
      dataSources: [
        { id: 'dsTable', refId: 'g_order' },
        { id: 'dsForm', refId: 'g_customer' },
      ],
      actions: [{ trigger: 'row-click', steps: [{ op: 'set-filter', target: 'dsTable', field: '', value: '' }] }],
    })

  it('字段槽是可自由输入的下拉（候选按 target 数据源取实际列）', async () => {
    getMetadataMock.mockResolvedValue({ data: { columns: [{ key: 'order_no', label: '订单号' }] } })
    const wrapper = filterStep()
    const fieldSelect = wrapper
      .findAllComponents({ name: 'ElSelectStub' })
      .find((s) => s.props('placeholder') === '过滤字段')
    expect(fieldSelect).toBeTruthy()
    expect(fieldSelect!.props('filterable')).toBe(true)
    expect(fieldSelect!.props('allowCreate')).toBe(true)

    fieldSelect!.vm.$emit('visible-change', true)
    await wrapper.vm.$nextTick()
    await vi.waitFor(() => expect(wrapper.find('.step-row').text()).toContain('order_no'))
    expect(getMetadataMock).toHaveBeenCalledWith('g_order')
    expect(wrapper.findAll('.step-row option').map((o) => o.attributes('value'))).toContain('order_no')
  })

  it('target 换绑后候选跟着换（不沿用上一个数据源的列）', async () => {
    getMetadataMock.mockImplementation((id: string) =>
      Promise.resolve({ data: { columns: [{ key: `col_of_${id}` }] } }),
    )
    const wrapper = filterStep()
    const vm = wrapper.vm as any
    const fieldSelect = () =>
      wrapper.findAllComponents({ name: 'ElSelectStub' }).find((s) => s.props('placeholder') === '过滤字段')!
    fieldSelect().vm.$emit('visible-change', true)
    await vi.waitFor(() => expect(wrapper.html()).toContain('col_of_g_order'))

    vm.localActions[0].steps[0].target = 'dsForm'
    await wrapper.vm.$nextTick()
    fieldSelect().vm.$emit('visible-change', true)
    await vi.waitFor(() => expect(wrapper.html()).toContain('col_of_g_customer'))
  })

  it('未选目标数据源时不发请求（仍可手输字段名）', async () => {
    const wrapper = mountPanel({
      actions: [{ trigger: 'row-click', steps: [{ op: 'set-filter', target: '', field: '', value: '' }] }],
    })
    const fieldSelect = wrapper
      .findAllComponents({ name: 'ElSelectStub' })
      .find((s) => s.props('placeholder') === '过滤字段')
    fieldSelect!.vm.$emit('visible-change', true)
    await wrapper.vm.$nextTick()
    expect(getMetadataMock).not.toHaveBeenCalled()
  })

  // ==================== 值模板候选按来源容器 ====================

  it('已选来源：值模板候选按来源容器实际列（不是整页字段）', async () => {
    getMetadataMock.mockResolvedValue({ data: { columns: [{ key: 'status' }, { key: 'amount' }] } })
    const wrapper = mountPanel({
      dataSources: [
        { id: 'dsSrc', refId: 'g_src' },
        { id: 'dsTarget', refId: 'g_target' },
      ],
      rowFields: ['order_no'],
      actions: [
        {
          trigger: 'row-click',
          source: 'dsSrc',
          steps: [{ op: 'set-filter', target: 'dsTarget', field: '', value: '' }],
        },
      ],
    })
    await vi.waitFor(() =>
      expect(wrapper.findComponent(BusTemplateInput).props('vars')).toEqual([
        '{node.status}',
        '{node.amount}',
        '{node.id}',
        '{row.status}',
        '{row.amount}',
        '{row.id}',
        '{source}',
      ]),
    )
    expect(getMetadataMock).toHaveBeenCalledWith('g_src')
  })

  it('任意来源（source 空）：回退整页字段，且不预取列清单', async () => {
    const wrapper = mountPanel({
      dataSources: [{ id: 'dsTarget', refId: 'g_target' }],
      rowFields: ['order_no'],
      actions: [
        { trigger: 'row-click', source: '', steps: [{ op: 'set-filter', target: 'dsTarget', field: '', value: '' }] },
      ],
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(BusTemplateInput).props('vars')).toEqual([
      '{node.order_no}',
      '{node.id}',
      '{row.order_no}',
      '{row.id}',
      '{source}',
    ])
    expect(getMetadataMock).not.toHaveBeenCalled()
  })

  // ==================== 容器类动作的 target（页面级总线也走容器寻址） ====================

  /** 按 placeholder 取某个 select 的候选值 */
  function optionValuesOf(wrapper: any, placeholder: string): string[] {
    const sel = wrapper
      .findAllComponents({ name: 'ElSelectStub' })
      .find((s: any) => s.props('placeholder') === placeholder)
    expect(sel, `未找到 placeholder=${placeholder} 的 select`).toBeTruthy()
    return sel!.findAll('option').map((o: any) => o.attributes('value'))
  }

  const containerProps = {
    dataSources: [{ id: 'dsForm', refId: 'g2' }],
    containerTargets: [
      { value: 'FC1', label: '编辑员工（FC1）' },
      { value: 'FC2', label: '查看员工（FC2）' },
    ],
  }

  it('容器类动作（open-container）的 target 下拉给画布容器候选，不再给数据源', () => {
    const wrapper = mountPanel({
      ...containerProps,
      actions: [{ trigger: 'row-edit', steps: [{ op: 'open-container', target: '' }] }],
    })
    expect(optionValuesOf(wrapper, '目标容器')).toEqual(['FC1', 'FC2'])
  })

  it('load-record / save-container / close-container 同属容器动作', () => {
    for (const op of ['load-record', 'save-container', 'close-container']) {
      const wrapper = mountPanel({
        ...containerProps,
        actions: [{ trigger: 'row-edit', steps: [{ op, target: '' }] }],
      })
      expect(optionValuesOf(wrapper, '目标容器'), op).toEqual(['FC1', 'FC2'])
    }
  })

  it('非容器动作（refresh / set-filter）的 target 仍是数据源下拉', () => {
    const wrapper = mountPanel({
      ...containerProps,
      actions: [{ trigger: 'row-click', steps: [{ op: 'refresh', target: 'dsForm' }] }],
    })
    expect(optionValuesOf(wrapper, '目标数据源')).toEqual(['dsForm'])
  })

  it('容器候选可搜索可手填（地址在人眼读不出时仍能贴进来）', () => {
    const wrapper = mountPanel({
      ...containerProps,
      actions: [{ trigger: 'row-edit', steps: [{ op: 'open-container', target: 'FC9' }] }],
    })
    const sel = wrapper
      .findAllComponents({ name: 'ElSelectStub' })
      .find((s: any) => s.props('placeholder') === '目标容器')!
    expect(sel.props('filterable')).toBe(true)
    expect(sel.props('allowCreate')).toBe(true)
  })

  it('无容器候选时容器动作不给数据源（避免又配一个打不开的 target）', () => {
    const wrapper = mountPanel({
      dataSources: [{ id: 'dsForm', refId: 'g2' }],
      actions: [{ trigger: 'row-edit', steps: [{ op: 'open-container', target: '' }] }],
    })
    expect(optionValuesOf(wrapper, '目标容器')).toEqual([])
  })

  it('新建动作默认 target 取第一个容器地址；无容器时回退第一个数据源', () => {
    const withContainers = mountPanel({ ...containerProps, actions: [] })
    ;(withContainers.vm as any).addAction()
    expect((withContainers.vm as any).localActions[0].steps[0].target).toBe('FC1')

    const withoutContainers = mountPanel({ dataSources: [{ id: 'dsForm', refId: 'g2' }], actions: [] })
    ;(withoutContainers.vm as any).addAction()
    expect((withoutContainers.vm as any).localActions[0].steps[0].target).toBe('dsForm')
  })
})

describe('步骤参数宽度：只有最后一个参数占满行剩余宽度', () => {
  const FILL = 'step-param-fill'

  function selectClass(wrapper: any, placeholder: string): string {
    const sel = wrapper
      .findAllComponents({ name: 'ElSelectStub' })
      .find((s: any) => s.props('placeholder') === placeholder)
    expect(sel, `未找到 placeholder=${placeholder} 的 select`).toBeTruthy()
    return sel!.element.className
  }

  const stepOf = (step: Record<string, any>) => ({
    dataSources: [{ id: 'dsForm', refId: 'g2' }],
    containerTargets: [{ value: 'FC1', label: '员工（FC1）' }],
    actions: [{ trigger: 'row-edit', steps: [step] }],
  })

  it('单参数动作（open-container / refresh / save-record）：target 拉满', () => {
    for (const step of [
      { op: 'open-container', target: 'FC1' },
      { op: 'close-container', target: 'FC1' },
      { op: 'refresh', target: 'dsForm' },
      { op: 'save-record', target: 'dsForm' },
    ]) {
      const wrapper = mountPanel(stepOf(step))
      const placeholder = step.op.includes('container') ? '目标容器' : '目标数据源'
      expect(selectClass(wrapper, placeholder), step.op).toContain(FILL)
    }
  })

  it('三参数动作（set-filter）：只有末位 value 拉满，target/field 保持固定宽', () => {
    const wrapper = mountPanel(stepOf({ op: 'set-filter', target: 'dsForm', field: 'status', value: '{row.id}' }))
    expect(selectClass(wrapper, '目标数据源')).not.toContain(FILL)
    expect(selectClass(wrapper, '过滤字段')).not.toContain(FILL)
    // 唯一拉满的是行末的模板输入框
    const filled = wrapper.findAll(`.step-row .${FILL}`)
    expect(filled).toHaveLength(1)
    expect(filled[0].classes()).toContain('expr-editor')
  })

  it('load-record：末位 recordId 拉满，容器 target 不拉满', () => {
    const wrapper = mountPanel(stepOf({ op: 'load-record', target: 'FC1', recordId: '{row.id}' }))
    expect(selectClass(wrapper, '目标容器')).not.toContain(FILL)
    const filled = wrapper.findAll(`.step-row .${FILL}`)
    expect(filled).toHaveLength(1)
    expect(filled[0].classes()).toContain('expr-editor')
  })
})

describe('动作行（触发器+来源）参数宽度', () => {
  const FILL = 'step-param-fill'

  it('来源数据源是动作行最后一个控件，拉满剩余宽度；触发器保持定宽', () => {
    const wrapper = mountPanel({
      dataSources: [{ id: 'dsTable', refId: 'g1' }],
      actions: [{ trigger: 'row-click', source: 'dsTable', steps: [{ op: 'refresh', target: 'dsTable' }] }],
    })
    const selects = wrapper.findAll('.action-row select')
    expect(selects).toHaveLength(2) // 触发器 + 来源
    expect(selects[1].classes()).toContain(FILL)
    const filled = wrapper.findAll(`.action-row .${FILL}`)
    expect(filled).toHaveLength(1)
  })
})
