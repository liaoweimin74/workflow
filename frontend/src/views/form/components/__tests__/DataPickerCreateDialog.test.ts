// ----- TDD: DataPickerCreateDialog 允许新增测试 -----
// npx vitest run src/views/form/components/__tests__/DataPickerCreateDialog.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'
import DataPickerCreateDialog from '../DataPickerCreateDialog.vue'

vi.mock('@/api/form', () => ({
  formApi: {
    getFormDefinitionByKey: vi.fn().mockResolvedValue({
      data: {
        name: '员工档案',
        schema: JSON.stringify({
          rule: [{ type: 'input', field: 'name', title: '姓名' }],
          option: {},
        }),
        columnConfig: '[]',
      },
    }),
  },
}))

vi.mock('@/api/bizData', () => ({
  bizDataApi: {
    create: vi.fn().mockResolvedValue({ data: { id: 'new-1', data: { name: '新员工' } } }),
  },
}))

import { formApi } from '@/api/form'
import { bizDataApi } from '@/api/bizData'

/** form-create 桩：模拟渲染，不加载真实表单组件 */
const FormCreateStub = defineComponent({
  props: ['rule', 'option', 'modelValue'],
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('div', { class: 'form-create-stub' })
  },
})

function createWrapper(props: any = {}) {
  return mount(DataPickerCreateDialog, {
    props: { visible: true, sourceFormKey: 'emp_profile', ...props },
    global: {
      plugins: [ElementPlus],
      stubs: { 'form-create': FormCreateStub },
    },
  })
}

describe('DataPickerCreateDialog — 目标表单加载', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(formApi.getFormDefinitionByKey as any).mockResolvedValue({
      data: {
        name: '员工档案',
        schema: JSON.stringify({ rule: [{ type: 'input', field: 'name', title: '姓名' }], option: {} }),
        columnConfig: '[]',
      },
    })
  })

  it('visible=true 时加载目标表单定义', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    expect(formApi.getFormDefinitionByKey).toHaveBeenCalledWith('emp_profile')
    wrapper.unmount()
  })
})

describe('DataPickerCreateDialog — 提交', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
    ;(formApi.getFormDefinitionByKey as any).mockResolvedValue({
      data: {
        name: '员工档案',
        schema: JSON.stringify({ rule: [{ type: 'input', field: 'name', title: '姓名' }], option: {} }),
        columnConfig: '[]',
      },
    })
    ;(bizDataApi.create as any).mockResolvedValue({ data: { id: 'new-1', data: { name: '新员工' } } })
  })

  it('提交成功调用创建接口并 emit success 携带新记录', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const submitBtn = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.includes('提交'))
    ;(submitBtn as HTMLButtonElement)?.click()
    await flushPromises()
    expect(bizDataApi.create).toHaveBeenCalledWith('emp_profile', expect.any(Object))
    expect(wrapper.emitted('success')?.at(-1)).toEqual([{ id: 'new-1', data: { name: '新员工' } }])
    wrapper.unmount()
  })

  it('提交失败不 emit success', async () => {
    ;(bizDataApi.create as any).mockRejectedValue(new Error('bad'))
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    const submitBtn = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.includes('提交'))
    ;(submitBtn as HTMLButtonElement)?.click()
    await flushPromises()
    expect(wrapper.emitted('success')).toBeFalsy()
    wrapper.unmount()
  })
})
