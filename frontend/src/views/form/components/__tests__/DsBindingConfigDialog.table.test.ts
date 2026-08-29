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
})
