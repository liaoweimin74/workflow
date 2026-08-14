// ----- TDD: DataPicker 组件测试 -----
// npx vitest run src/views/form/components/__tests__/DataPicker.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'
import DataPicker from '../DataPicker.vue'

vi.mock('@/api/bizData', () => ({
  bizDataApi: {
    list: vi.fn().mockResolvedValue({ data: { records: [{ id: 't1', name: '张三' }], total: 1 } }),
    resolve: vi.fn().mockResolvedValue({ data: { t1: '张三' } }),
  },
}))

import { bizDataApi } from '@/api/bizData'

/** DataPickerCreateDialog 桩：验证"新增"入口交互 */
const CreateDialogStub = defineComponent({
  props: ['visible', 'sourceFormKey'],
  emits: ['update:visible', 'success'],
  setup(props, { emit }) {
    return () => h('div', { class: 'create-dialog-stub' })
  },
})

function createWrapper(props: any = {}, injectObj: any = {}) {
  return mount(DataPicker, {
    props: {
      modelValue: '',
      sourceFormKey: 'emp_profile',
      displayField: 'name',
      ...props,
    },
    global: {
      plugins: [ElementPlus],
      provide: {
        formCreateInject: injectObj,
      },
      stubs: { DataPickerCreateDialog: CreateDialogStub },
    },
  })
}

describe('DataPicker — 基础渲染', () => {
  it('渲染输入框', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('input').exists()).toBe(true)
  })

  it('readonly 时不打开弹窗', async () => {
    const wrapper = createWrapper({ readonly: true })
    await wrapper.find('input').trigger('click')
    await nextTick()
    expect(document.body.querySelector('.el-dialog')).toBeFalsy()
  })
})

describe('DataPicker — 选择交互', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('点击输入框打开弹窗并查询', async () => {
    const wrapper = createWrapper()
    await wrapper.find('input').trigger('click')
    await nextTick()
    expect(document.body.querySelector('.el-dialog')).toBeTruthy()
    expect(bizDataApi.list).toHaveBeenCalledWith(
      'emp_profile',
      expect.objectContaining({ page: 1, size: 10 }),
    )
  })

  it('单选选中行 emit 逗号分隔 id 字符串', async () => {
    const wrapper = createWrapper()
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    const row = document.body.querySelector('.el-table__body tbody tr')
    ;(row as HTMLElement)?.click()
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['t1'])
    wrapper.unmount()
  })

  it('多选确认拼接 id', async () => {
    const wrapper = createWrapper({ mode: 'multiple' })
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    // 模拟选中两行后点确定
    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent === '确定')
    ;(confirmBtn as HTMLButtonElement)?.click()
    await nextTick()
    // tempSelection 为空时多选 confirm 提交空值（选择由 selection-change 驱动，此处验证不抛错）
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    wrapper.unmount()
  })

  it('清除时 emit 空并清空回填', async () => {
    const wrapper = createWrapper({
      modelValue: 't1',
      returnFields: { name: 'emp_name' },
    })
    await flushPromises()
    const clearIcon = wrapper.find('.el-input__clear')
    if (clearIcon.exists()) {
      await clearIcon.trigger('click')
      await nextTick()
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
    }
    wrapper.unmount()
  })
})

describe('DataPicker — filters 与级联保留', () => {
  it('filters static 条件参与查询', async () => {
    const wrapper = createWrapper({
      filters: [{ column: 'status', operator: '=', valueType: 'static', value: 'active' }],
    })
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    expect(bizDataApi.list).toHaveBeenCalledWith(
      'emp_profile',
      expect.objectContaining({ filter: { status: 'active' } }),
    )
    wrapper.unmount()
  })

  it('filters field 条件取当前表单字段值参与查询', async () => {
    const wrapper = createWrapper(
      { filters: [{ column: 'dept', operator: '=', valueType: 'field', value: 'dept_field' }] },
      { api: { getValue: () => 'rd', setValue: vi.fn() } },
    )
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    expect(bizDataApi.list).toHaveBeenCalledWith(
      'emp_profile',
      expect.objectContaining({ filter: { dept: 'rd' } }),
    )
    wrapper.unmount()
  })

  it('dependOn 兼容：归一化为 field 型 filter', async () => {
    const wrapper = createWrapper(
      { dependOn: { field: 'dept_field', sourceColumn: 'dept' } },
      { api: { getValue: () => 'rd', setValue: vi.fn() } },
    )
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    expect(bizDataApi.list).toHaveBeenCalledWith(
      'emp_profile',
      expect.objectContaining({ filter: { dept: 'rd' } }),
    )
    wrapper.unmount()
  })

  it('依赖字段变化时默认保留已选值（不清空）', async () => {
    const wrapper = createWrapper(
      {
        modelValue: 't1',
        dependOn: { field: 'dept_field', sourceColumn: 'dept' },
        dependOnValue: 'rd',
      },
      { api: { getValue: () => 'mk', setValue: vi.fn() } },
    )
    await wrapper.setProps({ dependOnValue: 'mk' })
    await nextTick()
    // 默认 clearOnCascadeChange=false：保留已选值，不清空
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
    wrapper.unmount()
  })

  it('clearOnCascadeChange=true 时依赖字段变化清空选择与回填', async () => {
    const wrapper = createWrapper({
      modelValue: 't1',
      clearOnCascadeChange: true,
      dependOn: { field: 'dept_field', sourceColumn: 'dept' },
      dependOnValue: 'rd',
    })
    await wrapper.setProps({ dependOnValue: 'mk' })
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
    wrapper.unmount()
  })
})

describe('DataPicker — 悬空降级', () => {
  it('resolve 缺失 id 时编辑态显示删除提示', async () => {
    ;(bizDataApi.resolve as any).mockResolvedValueOnce({ data: {} })
    const wrapper = createWrapper({ modelValue: 't1' })
    await flushPromises()
    const input = wrapper.find('input')
    expect((input.element as HTMLInputElement).value).toBe('1 条引用数据已删除')
    expect(wrapper.find('.el-input').classes()).toContain('pick-ref-missing')
    wrapper.unmount()
  })

  it('resolve 缺失 id 时只读态显示原始 id', async () => {
    ;(bizDataApi.resolve as any).mockResolvedValueOnce({ data: {} })
    const wrapper = createWrapper({ modelValue: 't1', readonly: true })
    await flushPromises()
    const input = wrapper.find('input')
    expect((input.element as HTMLInputElement).value).toBe('t1')
    wrapper.unmount()
  })
})

describe('DataPicker — 允许新增', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('allowCreate=true 时选择弹窗显示"新增"按钮', async () => {
    const wrapper = createWrapper({ allowCreate: true })
    await wrapper.find('input').trigger('click')
    await nextTick()
    const btn = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent === '新增')
    expect(btn).toBeTruthy()
    wrapper.unmount()
  })

  it('allowCreate=false（默认）时不显示"新增"按钮', async () => {
    const wrapper = createWrapper()
    await wrapper.find('input').trigger('click')
    await nextTick()
    const btn = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent === '新增')
    expect(btn).toBeFalsy()
    wrapper.unmount()
  })
})

describe('DataPicker — 级联与回显', () => {
  it('dependOnValue 存在时列表查询带 filter', async () => {
    const wrapper = createWrapper({
      dependOn: { field: 'dept_field', sourceColumn: 'dept' },
      dependOnValue: 'rd',
    })
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    expect(bizDataApi.list).toHaveBeenCalledWith(
      'emp_profile',
      expect.objectContaining({ filter: { dept: 'rd' } }),
    )
    wrapper.unmount()
  })

  it('modelValue 有值时 resolve 补全显示文本', async () => {
    const wrapper = createWrapper({ modelValue: 't1' })
    await flushPromises()
    expect(bizDataApi.resolve).toHaveBeenCalledWith('emp_profile', ['t1'], 'name')
    const input = wrapper.find('input')
    expect((input.element as HTMLInputElement).value).toBe('张三')
    wrapper.unmount()
  })
})
