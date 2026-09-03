// ----- TDD: DsBindingConfigDialog card listMode 展示模式与卡片字段序列化 -----
// npx vitest run src/views/form/components/__tests__/DsBindingConfigDialog.card.test.ts

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
        'el-input-number': {
          name: 'ElInputNumberStub',
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template: '<input class="stub-input-number" :value="modelValue" />',
        },
        'el-radio-group': true,
        'el-radio-button': true,
        'el-button': true,
        'el-tabs': { template: '<div class="stub-tabs"><slot /></div>' },
        'el-tab-pane': { template: '<div class="stub-tab-pane"><slot /></div>' },
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
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.isListMode).toBe(true)
    expect(vm.effectiveListMode).toBe('card')
    expect(wrapper.find('.stub-columns[data-mode="card"]').exists()).toBe(true)
    expect(wrapper.find('.stub-actions[data-mode="card"]').exists()).toBe(true)
    expect(wrapper.find('.stub-events[data-mode="card"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('listMode="card" 保存结果列序列化含已实现卡片字段', async () => {
    mockMetadata()
    const wrapper = mountDialog({
      dataSourceId: 'ds1',
      columns: [
        { prop: 'name', label: '姓名', width: 130, align: 'left',
           role: 'title', valueType: 'currency', fontFamily: 'Microsoft YaHei', fontSize: 18,
           fontWeight: 700, fontColor: '#409eff', showLabel: false, labelPosition: 'top',
           style: 'border: 1px solid red;' },
        { prop: 'age', label: '年龄' },
      ],
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    // 回填：卡片字段进入组件列表数据
    const vm = wrapper.vm as any
    expect(vm.tableData.columns[0].role).toBe('title')
    expect(vm.tableData.columns[0].showLabel).toBe(false)

    ;(wrapper.vm as any).handleConfirm()
    const result = (wrapper.emitted('confirm') as any[])[0][0]
    const name = result.columns.find((c: any) => c.prop === 'name')
    expect(name.role).toBe('title')
    expect(name.valueType).toBe('currency')
    expect(name.fontFamily).toBe('Microsoft YaHei')
    expect(name.fontSize).toBe(18)
    expect(name.fontWeight).toBe(700)
    expect(name.fontColor).toBe('#409eff')
    expect(name.showLabel).toBe(false)
    expect(name.labelPosition).toBe('top')
    expect(name.style).toBe('border: 1px solid red;')
    wrapper.unmount()
  })
})

// ----- 布局断言：卡片顶部快捷配置两行布局（源码断言，无需 mount）-----
describe('DsBindingConfigDialog — 卡片字段顶部快捷配置两行布局', () => {
  const source = readFileSync(resolve(__dirname, '../DsBindingConfigDialog.vue'), 'utf8')

  it('第一行：显示查询栏/撑满/卡片最小宽度 依次放入同一 flex 行容器', () => {
    const rowStart = source.indexOf('class="card-quick-row"')
    expect(rowStart).toBeGreaterThan(-1)

    const order = ['显示查询栏', '撑满', '卡片最小宽度']
    let prev = rowStart
    for (const label of order) {
      const pos = source.indexOf(label, prev)
      expect(pos).toBeGreaterThan(prev)
      prev = pos === -1 ? prev : pos
    }

    // 第一行容器结束位置 = 第二行容器开始位置（保证三项都在第一行内）
    const rowEnd = source.indexOf('</div>', prev)
    const secondRowStart = source.indexOf('class="card-quick-row"', rowEnd)
    expect(secondRowStart).toBeGreaterThan(rowEnd)
  })

  it('第二行：分组字段/分组可折叠/操作区位置 依次放入同一 flex 行容器', () => {
    const secondRowStart = source.indexOf('class="card-quick-row"', source.indexOf('card-quick-config'))
    const secondRowStart2 = source.indexOf('class="card-quick-row"', secondRowStart + 1)
    expect(secondRowStart2).toBeGreaterThan(secondRowStart)

    const order = ['分组字段', '分组可折叠', '操作区位置']
    let prev = secondRowStart2
    for (const label of order) {
      const pos = source.indexOf(label, prev)
      expect(pos).toBeGreaterThan(prev)
      prev = pos === -1 ? prev : pos
    }

    const containerEnd = source.indexOf('</div>', prev)
    expect(containerEnd).toBeGreaterThan(prev)
  })

  it('分组字段/卡片最小宽度/分组可折叠/操作区位置 仅卡片模式显示', () => {
    // 卡片专属项受 effectiveListMode==='card' 保护；显示查询栏/撑满任意模式均显示
    expect(source).toContain("v-if=\"effectiveListMode === 'card'\"")
    expect(source).toContain('tableData.groupBy')
    expect(source).toContain('tableData.cardMinWidth')
    expect(source).toContain('tableData.collapsibleGroups')
    expect(source).toContain('tableData.actionsPlacement')
  })

  it('每行强制单行：nowrap + label 按内容宽（不换行）+ 控件可收缩', () => {
    // 目的：每行（显示查询栏/撑满/卡片最小宽度、分组字段/分组可折叠/操作区位置）各自在一行展示，不因超宽换行。
    expect(source).toMatch(/\.card-quick-row\s*\{[\s\S]*?flex-wrap:\s*nowrap;/)
    // 各项 label 区去掉 el-form 100px 固定留白，改为按内容宽并 nowrap
    expect(source).toMatch(/\.card-quick-row \.el-form-item__label\s*\{[\s\S]*?white-space:\s*nowrap;/)
    expect(source).toMatch(/--el-form-label-width:\s*max-content;/)
    // 控件弹性收缩，确保各项能被压缩进一行
    expect(source).toMatch(/\.el-form-item__content\s*\{[\s\S]*?flex: 1 1 auto;/)
  })

  it('label 左对齐：两行第一个 label 左边缘对齐（:deep 覆盖 element-plus 右对齐）', () => {
    // el-form 默认 label 右对齐（element-plus .el-form-item--label-right 强制 flex-end），
    // 字数不同的 label 右对齐后文字左边缘错位（如"显示查询栏"5字 vs"分组字段"4字），
    // 导致第二行看起来比第一行缩进。必须 :deep 命中子组件内部 label 并改为 flex-start。
    expect(source).toMatch(/\.card-quick-row :deep\(\.el-form-item__label\)\s*\{[\s\S]*?justify-content:\s*flex-start;/)
  })
})
