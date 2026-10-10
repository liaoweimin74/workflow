// ----- TDD: DsBindingConfigDialog table-mode sortableFields 配置 -----
// npx vitest run src/views/form/components/__tests__/DsBindingConfigDialog.table.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getMetadata: vi.fn(),
  },
}))

// 子配置面板桩（避免深层依赖）
vi.mock('@/views/page/components/ActionsConfig.vue', () => ({
  default: defineComponent({ name: 'ActionsConfigStub', props: ['modelValue'], setup: () => () => h('div', { class: 'stub-actions' }) }),
}))
vi.mock('@/views/page/components/EventsConfig.vue', () => ({
  default: defineComponent({ name: 'EventsConfigStub', props: ['modelValue'], setup: () => () => h('div', { class: 'stub-events' }) }),
}))
vi.mock('@/views/page/components/QueryColumnsConfig.vue', () => ({
  default: defineComponent({ name: 'QueryColumnsConfigStub', setup: () => () => h('div', { class: 'stub-columns' }) }),
}))

import { dataSourceApi } from '@/api/data-source'
import DsBindingConfigDialog from '../DsBindingConfigDialog.vue'

function mountDialog(bindingProps: Record<string, any> = {}) {
  return mount(DsBindingConfigDialog, {
    props: {
      modelValue: false,
      currentFields: ['name'],
      bindingProps,
      formDataSources: [{ id: 'ds1', refId: 'global1' }],
      tableMode: true,
    },
    global: {
      plugins: [ElementPlus],
      stubs: {
        teleport: true,
        'el-select': {
          name: 'ElSelectStub',
          props: ['modelValue'],
          emits: ['update:modelValue', 'change'],
          setup(props: any, { emit, slots }: any) {
            return () => h('select', {
              class: 'stub-select',
              value: props.modelValue,
              onChange: (e: Event) => {
                const v = (e.target as HTMLSelectElement).value
                emit('update:modelValue', v)
                emit('change', v)
              },
            }, slots.default?.())
          },
        },
        'el-option': {
          name: 'ElOptionStub',
          props: ['label', 'value'],
          setup(props: any) { return () => h('option', { value: props.value }, String(props.label || props.value)) },
        },
        'el-input': {
          name: 'ElInputStub',
          props: ['modelValue'],
          emits: ['update:modelValue'],
          setup(props: any, { emit }: any) {
            return () => h('input', {
              class: 'stub-input',
              value: props.modelValue ?? '',
              onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value),
            })
          },
        },
        'el-radio-group': true,
        'el-radio-button': true,
        'el-button': true,
        'el-tabs': true,
        'el-tab-pane': true,
      },
    },
  })
}

/** metadata：name/age 可排（数据源上限），bio 不可排 */
function mockMetadata() {
  ;(dataSourceApi.getMetadata as any).mockResolvedValue({
    data: {
      columns: [
        { key: 'name', label: '姓名', columnType: 'VARCHAR', sortable: true },
        { key: 'age', label: '年龄', columnType: 'INT', sortable: true },
        { key: 'bio', label: '简介', columnType: 'TEXT', sortable: false },
      ],
    },
  })
}

describe('DsBindingConfigDialog — table-mode sortableFields', () => {
  it('保存结果含 sortableFields，columns 无列级 sortable 残留', async () => {
    mockMetadata()
    const wrapper = mountDialog({
      dataSourceId: 'ds1',
      columns: [{ prop: 'name', label: '姓名' }],
      sortableFields: ['name'],
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    ;(wrapper.vm as any).handleConfirm()

    const result = (wrapper.emitted('confirm') as any[])[0][0]
    // 回填并保存组件级可排序字段
    expect(result.sortableFields).toEqual(['name'])
    // 列配置不再写回 sortable（排序能力由 sortableFields + 数据源决定）
    expect(result.columns[0].sortable).toBeUndefined()
    wrapper.unmount()
  })

  it('未声明 sortableFields 时默认跟随数据源全部可排字段（不可排字段不进入默认）', async () => {
    mockMetadata()
    const wrapper = mountDialog({ dataSourceId: 'ds1' })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    ;(wrapper.vm as any).handleConfirm()

    const result = (wrapper.emitted('confirm') as any[])[0][0]
    // bio 数据源不可排 → 不在默认可排序集合
    expect(result.sortableFields).toEqual(['name', 'age'])
    wrapper.unmount()
  })

  it('保存结果含分页配置（pagination/pageSize/pageSizes）', async () => {
    mockMetadata()
    const wrapper = mountDialog({
      dataSourceId: 'ds1',
      pagination: true,
      pageSize: 50,
      pageSizes: [10, 50, 100],
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    ;(wrapper.vm as any).handleConfirm()

    const result = (wrapper.emitted('confirm') as any[])[0][0]
    expect(result.pagination).toBe(true)
    expect(result.pageSize).toBe(50)
    expect(result.pageSizes).toEqual([10, 50, 100])
    wrapper.unmount()
  })

  it('未声明分页配置时回填默认（true / 20 / [10,20,50]）', async () => {
    mockMetadata()
    const wrapper = mountDialog({ dataSourceId: 'ds1' })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    ;(wrapper.vm as any).handleConfirm()

    const result = (wrapper.emitted('confirm') as any[])[0][0]
    expect(result.pagination).toBe(true)
    expect(result.pageSize).toBe(20)
    expect(result.pageSizes).toEqual([10, 20, 50])
    wrapper.unmount()
  })

  it('回填已有列时保留高级配置字段（contentType/contentValue/className/styleExpr/onCellClick/custom/hidden）', async () => {
    mockMetadata()
    const advanced = {
      prop: 'name', label: '姓名',
      contentType: 'template', contentValue: '${name}(${status})',
      className: 'col-highlight', styleExpr: '$row.status === "PENDING" ? "color:red" : ""',
      onCellClick: { actions: [{ type: 'message', params: [{ key: 'text', value: '点击' }] }] },
      custom: true, hidden: false,
    }
    const wrapper = mountDialog({ dataSourceId: 'ds1', columns: [advanced] })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.tableData.columns[0].contentType).toBe('template')
    expect(vm.tableData.columns[0].contentValue).toBe('${name}(${status})')
    expect(vm.tableData.columns[0].className).toBe('col-highlight')
    expect(vm.tableData.columns[0].styleExpr).toBe('$row.status === "PENDING" ? "color:red" : ""')
    expect(vm.tableData.columns[0].onCellClick.actions).toHaveLength(1)
    expect(vm.tableData.columns[0].custom).toBe(true)
    expect(vm.tableData.columns[0].hidden).toBe(false)
    wrapper.unmount()
  })

  it('确认保存时透传列高级配置字段', async () => {
    mockMetadata()
    const wrapper = mountDialog({ dataSourceId: 'ds1', columns: [
      { prop: 'name', label: '姓名',
        contentType: 'expression', contentValue: '$row.price * $row.qty',
        className: 'col-highlight', styleExpr: 'color:blue',
        onCellClick: { actions: [{ type: 'message', params: [] }] },
        custom: true, hidden: true },
    ] })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    ;(wrapper.vm as any).handleConfirm()
    const result = (wrapper.emitted('confirm') as any[])[0][0]
    const col = result.columns[0]
    expect(col.contentType).toBe('expression')
    expect(col.contentValue).toBe('$row.price * $row.qty')
    expect(col.className).toBe('col-highlight')
    expect(col.styleExpr).toBe('color:blue')
    expect(col.onCellClick.actions).toHaveLength(1)
    expect(col.custom).toBe(true)
    expect(col.hidden).toBe(true)
    wrapper.unmount()
  })

  it('选项类组件主列（JSON）可查询：filterableKeys 含 select/tree/cascader/transfer 列', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({
      data: {
        columns: [
          { key: 'name', label: '姓名', columnType: 'VARCHAR' },
          { key: 'dept', label: '部门', columnType: 'JSON' },
          { key: 'dept_text', label: '部门（显示）', columnType: 'VARCHAR', hidden: true },
          { key: 'tags', label: '标签', columnType: 'JSON' },
          { key: 'tags_text', label: '标签（显示）', columnType: 'VARCHAR', hidden: true },
          { key: 'region', label: '级联', columnType: 'JSON' },
          { key: 'region_text', label: '级联（显示）', columnType: 'VARCHAR', hidden: true },
          { key: 'tree', label: '树', columnType: 'JSON' },
          { key: 'tree_text', label: '树（显示）', columnType: 'VARCHAR', hidden: true },
          { key: 'users', label: '穿梭', columnType: 'JSON' },
          { key: 'users_text', label: '穿梭（显示）', columnType: 'VARCHAR', hidden: true },
          { key: 'content', label: '内容', columnType: 'TEXT' },
        ],
      },
    })
    const wrapper = mountDialog({ dataSourceId: 'ds1' })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const keys = (wrapper.vm as any).tableFilterableKeys as Set<string>
    // 选项类组件主列（JSON）可查询（查询走 <key>_text 显示列）
    expect(keys.has('dept')).toBe(true)
    expect(keys.has('tags')).toBe(true)
    expect(keys.has('region')).toBe(true)
    expect(keys.has('tree')).toBe(true)
    expect(keys.has('users')).toBe(true)
    // 文本列仍可查；TEXT 列仍不可查
    expect(keys.has('name')).toBe(true)
    expect(keys.has('content')).toBe(false)
    wrapper.unmount()
  })
})

// ----- 表格增强配置入口（Task ⑤）：表头筛选/批量操作/批量删除/列级汇总透传 -----
describe('DsBindingConfigDialog — table-mode 表格增强（Task ⑤ 配置入口）', () => {
  it('未声明时缺省关闭：confirm 输出 headerFilter={enabled:false} / batch={enabled:false, delete:true}', async () => {
    mockMetadata()
    const wrapper = mountDialog({ dataSourceId: 'ds1' })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    ;(wrapper.vm as any).handleConfirm()
    const result = (wrapper.emitted('confirm') as any[])[0][0]
    expect(result.headerFilter).toEqual({ enabled: false })
    expect(result.batch).toEqual({ enabled: false, delete: true })
    wrapper.unmount()
  })

  it('回填并保存三开关：headerFilter / batch.enabled / batch.delete', async () => {
    mockMetadata()
    const wrapper = mountDialog({
      dataSourceId: 'ds1',
      headerFilter: { enabled: true },
      batch: { enabled: true, delete: false },
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.tableData.headerFilter).toBe(true)
    expect(vm.tableData.batch).toBe(true)
    expect(vm.tableData.batchDelete).toBe(false)

    vm.handleConfirm()
    const result = (wrapper.emitted('confirm') as any[])[0][0]
    expect(result.headerFilter).toEqual({ enabled: true })
    expect(result.batch).toEqual({ enabled: true, delete: false })
    wrapper.unmount()
  })

  it('表格增强仅 table 模式输出：card 模式 confirm 不含 headerFilter/batch/Excel 键', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({
      data: { columns: [{ key: 'name', label: '姓名', columnType: 'VARCHAR', sortable: true }] },
    })
    const wrapper = mount(DsBindingConfigDialog, {
      props: {
        modelValue: false,
        currentFields: ['name'],
        bindingProps: { dataSourceId: 'ds1' },
        formDataSources: [{ id: 'ds1', refId: 'global1' }],
        listMode: 'card',
      },
      global: { plugins: [ElementPlus], stubs: { teleport: true, 'el-select': true, 'el-option': true, 'el-input': true, 'el-button': true, 'el-tabs': true, 'el-tab-pane': true } },
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    ;(wrapper.vm as any).handleConfirm()
    const result = (wrapper.emitted('confirm') as any[])[0][0]
    expect(result.headerFilter).toBeUndefined()
    expect(result.batch).toBeUndefined()
    expect(result.excelExport).toBeUndefined()
    expect(result.excelImport).toBeUndefined()
    // card 专属字段正常输出
    expect(result.groupBy).toBe('')
    wrapper.unmount()
  })

  it('列级 aggregate 透传：QueryColumnsConfig 高级配置的聚合声明不丢失', async () => {
    mockMetadata()
    const wrapper = mountDialog({ dataSourceId: 'ds1', columns: [
      { prop: 'amount', label: '金额', aggregate: 'sum' },
      { prop: 'name', label: '姓名' },
    ] })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    ;(wrapper.vm as any).handleConfirm()
    const result = (wrapper.emitted('confirm') as any[])[0][0]
    expect(result.columns[0].aggregate).toBe('sum')
    expect(result.columns[1].aggregate).toBeUndefined()
    wrapper.unmount()
  })
})

// ----- Excel 导入导出配置入口（Task 5-b）：能力位缺省关闭/回填保存/card 模式排除 -----
describe('DsBindingConfigDialog — table-mode Excel 导入导出（Task 5-b 配置入口）', () => {
  it('未声明时缺省关闭：confirm 输出 excelExport={enabled:false} / excelImport={enabled:false}', async () => {
    mockMetadata()
    const wrapper = mountDialog({ dataSourceId: 'ds1' })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    ;(wrapper.vm as any).handleConfirm()
    const result = (wrapper.emitted('confirm') as any[])[0][0]
    expect(result.excelExport).toEqual({ enabled: false })
    expect(result.excelImport).toEqual({ enabled: false })
    wrapper.unmount()
  })

  it('回填并保存 Excel 能力位：excelExport / excelImport enabled 透传', async () => {
    mockMetadata()
    const wrapper = mountDialog({
      dataSourceId: 'ds1',
      excelExport: { enabled: true },
      excelImport: { enabled: true },
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.tableData.excelExport).toBe(true)
    expect(vm.tableData.excelImport).toBe(true)

    vm.handleConfirm()
    const result = (wrapper.emitted('confirm') as any[])[0][0]
    expect(result.excelExport).toEqual({ enabled: true })
    expect(result.excelImport).toEqual({ enabled: true })
    wrapper.unmount()
  })
})

// ----- 汇总行总开关（summaryRow）：开关替代「去配置」链接；存量 schema 按列级聚合推导保持旧行为 -----
describe('DsBindingConfigDialog — table-mode 汇总行总开关 summaryRow', () => {
  it('存量 schema 未声明 summaryRow 且存在列级聚合：推导开启，保存写入 {enabled:true}；「去配置」链接已移除', async () => {
    mockMetadata()
    const wrapper = mountDialog({ dataSourceId: 'ds1', columns: [
      { prop: 'amount', label: '金额', aggregate: 'sum' },
      { prop: 'name', label: '姓名' },
    ] })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.tableData.summaryRow).toBe(true)
    // 「去配置」入口已删除（用户反馈：无实际作用，配置位置改由 tooltip 说明）
    expect(wrapper.find('.summary-entry').exists()).toBe(false)

    vm.handleConfirm()
    const result = (wrapper.emitted('confirm') as any[])[0][0]
    expect(result.summaryRow).toEqual({ enabled: true })
    wrapper.unmount()
  })

  it('存量 schema 未声明 summaryRow 且无列级聚合：推导关闭，保存写入 {enabled:false}', async () => {
    mockMetadata()
    const wrapper = mountDialog({ dataSourceId: 'ds1' })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.tableData.summaryRow).toBe(false)

    vm.handleConfirm()
    const result = (wrapper.emitted('confirm') as any[])[0][0]
    expect(result.summaryRow).toEqual({ enabled: false })
    wrapper.unmount()
  })

  it('显式声明 summaryRow={enabled:false}（即便存在聚合列）：回填关闭并如实保存', async () => {
    mockMetadata()
    const wrapper = mountDialog({
      dataSourceId: 'ds1',
      columns: [{ prop: 'amount', label: '金额', aggregate: 'sum' }],
      summaryRow: { enabled: false },
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.tableData.summaryRow).toBe(false)

    vm.handleConfirm()
    const result = (wrapper.emitted('confirm') as any[])[0][0]
    expect(result.summaryRow).toEqual({ enabled: false })
    wrapper.unmount()
  })

  it('显式声明 summaryRow={enabled:true}：回填开启并如实保存', async () => {
    mockMetadata()
    const wrapper = mountDialog({ dataSourceId: 'ds1', summaryRow: { enabled: true } })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.tableData.summaryRow).toBe(true)

    vm.handleConfirm()
    const result = (wrapper.emitted('confirm') as any[])[0][0]
    expect(result.summaryRow).toEqual({ enabled: true })
    wrapper.unmount()
  })
})
