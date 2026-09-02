// ----- TDD: DsBindingConfigDialog card listMode 展示模式与卡片字段序列化 -----
// npx vitest run src/views/form/components/__tests__/DsBindingConfigDialog.card.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getMetadata: vi.fn(),
  },
}))

// 子配置面板桩：接收 mode prop 并渲染到 data-mode，用于断言卡片模式透传
function modeStub(name: string, className: string) {
  return defineComponent({
    name,
    props: ['modelValue', 'mode', 'detail'],
    setup: (props: any) => () => h('div', { class: className, 'data-mode': props.mode || '' }),
  })
}
vi.mock('@/views/page/components/ActionsConfig.vue', () => ({
  default: modeStub('ActionsConfigStub', 'stub-actions'),
}))
vi.mock('@/views/page/components/EventsConfig.vue', () => ({
  default: modeStub('EventsConfigStub', 'stub-events'),
}))
vi.mock('@/views/page/components/QueryColumnsConfig.vue', () => ({
  default: modeStub('QueryColumnsConfigStub', 'stub-columns'),
}))

import { dataSourceApi } from '@/api/data-source'
import DsBindingConfigDialog from '../DsBindingConfigDialog.vue'

function mountDialog(bindingProps: Record<string, any> = {}, listMode = 'card') {
  return mount(DsBindingConfigDialog, {
    props: {
      modelValue: false,
      currentFields: ['name'],
      bindingProps,
      formDataSources: [{ id: 'ds1', refId: 'global1' }],
      listMode,
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

function mockMetadata() {
  ;(dataSourceApi.getMetadata as any).mockResolvedValue({
    data: {
      columns: [
        { key: 'name', label: '姓名', columnType: 'VARCHAR', sortable: true },
        { key: 'age', label: '年龄', columnType: 'INT', sortable: true },
      ],
    },
  })
}

describe('DsBindingConfigDialog — card listMode 展示模式', () => {
  it('listMode="card" 时进入列表配置（tabs 渲染），三个配置组件透传 mode="card"', async () => {
    mockMetadata()
    const wrapper = mountDialog({ dataSourceId: 'ds1' })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.isListMode).toBe(true)
    expect(vm.effectiveListMode).toBe('card')
    expect(wrapper.find('.stub-columns[data-mode="card"]').exists()).toBe(true)
    expect(wrapper.find('.stub-actions[data-mode="card"]').exists()).toBe(true)
    expect(wrapper.find('.stub-events[data-mode="card"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('listMode="card" 保存结果列序列化含卡片字段（role/span/fieldMinWidth/valueType/prefix/suffix/color/truncate）', async () => {
    mockMetadata()
    const wrapper = mountDialog({
      dataSourceId: 'ds1',
      columns: [
        { prop: 'name', label: '姓名', width: 130, align: 'left',
          role: 'title', span: 12, fieldMinWidth: 100, valueType: 'currency',
          prefix: '¥', suffix: '元', color: '#409eff', truncate: true },
        { prop: 'age', label: '年龄' },
      ],
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    // 回填：卡片字段进入组件列表数据
    const vm = wrapper.vm as any
    expect(vm.tableData.columns[0].role).toBe('title')
    expect(vm.tableData.columns[0].truncate).toBe(true)

    ;(wrapper.vm as any).handleConfirm()
    const result = (wrapper.emitted('confirm') as any[])[0][0]
    const name = result.columns.find((c: any) => c.prop === 'name')
    expect(name.role).toBe('title')
    expect(name.span).toBe(12)
    expect(name.fieldMinWidth).toBe(100)
    expect(name.valueType).toBe('currency')
    expect(name.prefix).toBe('¥')
    expect(name.suffix).toBe('元')
    expect(name.color).toBe('#409eff')
    expect(name.truncate).toBe(true)
    wrapper.unmount()
  })
})