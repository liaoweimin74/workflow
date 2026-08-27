// ----- TDD: DsBindingConfigDialog formContainer 模式显示/按钮配置 -----
// npx vitest run src/views/form/components/__tests__/DsBindingConfigDialog.container.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getMetadata: vi.fn(() => Promise.resolve({ data: { columns: [{ key: 'name', label: '姓名' }] } })),
  },
}))

// ActionsConfig / EventsConfig / QueryColumnsConfig 桩（formContainer 模式不使用，避免深层依赖）
vi.mock('@/views/page/components/ActionsConfig.vue', () => ({
  default: defineComponent({ name: 'ActionsConfigStub', props: ['modelValue'], setup: () => () => h('div', { class: 'stub-actions' }) }),
}))
vi.mock('@/views/page/components/EventsConfig.vue', () => ({
  default: defineComponent({ name: 'EventsConfigStub', props: ['modelValue'], setup: () => () => h('div', { class: 'stub-events' }) }),
}))
vi.mock('@/views/page/components/QueryColumnsConfig.vue', () => ({
  default: defineComponent({ name: 'QueryColumnsConfigStub', setup: () => () => h('div', { class: 'stub-columns' }) }),
}))

import DsBindingConfigDialog from '../DsBindingConfigDialog.vue'

function mountDialog(bindingProps: Record<string, any> = {}, tableMode = false) {
  const wrapper = mount(DsBindingConfigDialog, {
    props: {
      modelValue: false,
      currentFields: ['name'],
      bindingProps,
      formDataSources: [{ id: 'ds1', refId: 'global1' }],
      tableMode,
    },
    global: {
      plugins: [ElementPlus],
      stubs: {
        teleport: true,
        // ElementPlus 表单组件在 jsdom 有 popper/teleport 递归问题，统一 stub 为简单元素
        'el-select': {
          name: 'ElSelectStub',
          props: ['modelValue'],
          emits: ['update:modelValue', 'change'],
          setup(props: any, { emit, slots }: any) {
            return () =>
              h('select', {
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
          setup(props: any) {
            return () => h('option', { value: props.value }, String(props.label || props.value))
          },
        },
        'el-input': {
          name: 'ElInputStub',
          props: ['modelValue'],
          emits: ['update:modelValue'],
          setup(props: any, { emit }: any) {
            return () =>
              h('input', {
                class: 'stub-input',
                value: props.modelValue ?? '',
                onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value),
              })
          },
        },
        'el-switch': {
          name: 'ElSwitchStub',
          props: ['modelValue'],
          emits: ['update:modelValue'],
          setup(props: any, { emit }: any) {
            return () =>
              h('button', {
                class: 'stub-switch',
                onClick: () => emit('update:modelValue', !props.modelValue),
              }, String(props.modelValue ?? false))
          },
        },
        'el-button': { template: '<button class="stub-btn" @click="$emit(\'click\')"><slot /></button>', emits: ['click'] },
        'el-radio-group': { template: '<div class="stub-radio-group"><slot /></div>' },
        'el-radio-button': { template: '<span class="stub-radio"><slot /></span>' },
        'el-divider': { template: '<div class="stub-divider"><slot /></div>' },
        'el-form-item': {
          name: 'ElFormItemStub',
          props: ['label'],
          setup(props: any, { slots }: any) {
            return () => h('div', { class: 'stub-form-item' }, [
              h('span', { class: 'stub-label' }, String(props.label || '')),
              slots.default?.(),
            ])
          },
        },
        'el-form': { template: '<div class="stub-form"><slot /></div>' },
        'el-dialog': {
          name: 'ElDialogStub',
          props: ['modelValue', 'title'],
          setup(props: any, { slots }: any) {
            return () =>
              h('div', { class: 'stub-dialog' }, [
                h('div', { class: 'stub-dialog-title' }, String(props.title || '')),
                props.modelValue ? slots.default?.() : null,
                props.modelValue ? slots.footer?.() : null,
              ])
          },
        },
      },
    },
  })
  // 模拟打开弹窗（false → true 触发回填 watch）
  wrapper.setProps({ modelValue: true })
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DsBindingConfigDialog formContainer 显示与按钮配置', () => {
  it('formContainer 模式显示 displayMode 下拉（弹窗/新页签/内嵌）', async () => {
    const wrapper = mountDialog({ displayMode: 'newTab' })
    await flushPromises()

    // stub 渲染为 .stub-form-item，label 在 .stub-label
    const labels = wrapper.findAll('.stub-label').map((f) => f.text())
    expect(labels.join(' ')).toContain('显示模式')
    // 弹窗/新页签/内嵌选项存在（displayMode 下拉：含全部三种选项的那个 select）
    const selectText = wrapper.findAll('.stub-select').map((s) => s.text()).join(' ')
    expect(selectText).toContain('弹出窗口')
    expect(selectText).toContain('新开页签')
    expect(selectText).toContain('页面内嵌')
  })

  it('formContainer 模式按显示模式条件渲染尺寸/标题/内嵌高度', async () => {
    // newTab：显示页签标题，隐藏弹窗宽度
    const w1 = mountDialog({ displayMode: 'newTab' })
    await flushPromises()
    expect(w1.text()).toContain('页签标题')
    expect(w1.text()).not.toContain('弹窗宽度')
    w1.unmount()

    // dialog（默认）：显示弹窗宽度/高度，隐藏页签标题
    const w2 = mountDialog({ displayMode: 'dialog' })
    await flushPromises()
    expect(w2.text()).toContain('弹窗宽度')
    expect(w2.text()).toContain('弹窗高度')
    expect(w2.text()).not.toContain('页签标题')
    w2.unmount()

    // inline：显示内嵌高度
    const w3 = mountDialog({ displayMode: 'inline' })
    await flushPromises()
    expect(w3.text()).toContain('内嵌高度')
    w3.unmount()
  })

  it('formContainer 模式显示按钮开关（新增/取消/确定/删除/复制）', async () => {
    const wrapper = mountDialog({})
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('新增按钮')
    expect(text).toContain('取消按钮')
    expect(text).toContain('确定按钮')
    expect(text).toContain('删除按钮')
    expect(text).toContain('复制按钮')
  })

  it('formContainer 模式显示自定义按钮 JSON 配置', async () => {
    const wrapper = mountDialog({})
    await flushPromises()
    expect(wrapper.text()).toContain('自定义按钮')
  })

  it('确认时提交显示模式/尺寸/按钮配置', async () => {
    const wrapper = mountDialog({
      dataSourceId: 'ds1',
      displayMode: 'dialog',
      dialogWidth: '900px',
      dialogHeight: '500px',
      tabTitle: '编辑员工',
      inlineHeight: 'auto',
      showNewButton: true,
      showCancelButton: true,
      showConfirmButton: true,
      showDeleteButton: false,
      showCopyButton: false,
      customButtons: [{ key: 'x', label: 'X' }],
    })
    await flushPromises()

    // 确定按钮是 footer 最后一个 stub-btn
    const confirmBtn = wrapper.findAll('.stub-btn').at(-1)
    expect(confirmBtn).toBeTruthy()
    await confirmBtn!.trigger('click')
    await flushPromises()

    const emitted = wrapper.emitted('confirm') as any[]
    expect(emitted).toBeTruthy()
    const result = emitted[0][0]
    expect(result.displayMode).toBe('dialog')
    expect(result.dialogWidth).toBe('900px')
    expect(result.dialogHeight).toBe('500px')
    expect(result.tabTitle).toBe('编辑员工')
    expect(result.inlineHeight).toBe('auto')
    expect(result.showDeleteButton).toBe(false)
    expect(result.showCopyButton).toBe(false)
    expect(result.customButtons).toEqual([{ key: 'x', label: 'X' }])
  })
})
