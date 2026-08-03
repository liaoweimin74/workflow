// ----- TDD CYCLE: RED — FormRenderer rule prop + initialValues + getFormData -----
// npx vitest run src/views/form/components/__tests__/FormRenderer.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'
import type { Rule } from '@form-create/element-ui'
import FormRenderer from '../FormRenderer.vue'

// Mock formApi to verify no API call in rule mode
vi.mock('@/api/form', () => ({
  formApi: {
    getFormDefinition: vi.fn(),
    getFormData: vi.fn(),
    saveFormData: vi.fn(),
    updateFormData: vi.fn(),
  },
  FormDataDTO: {} as any,
}))

import { formApi } from '@/api/form'

/**
 * Stub for <form-create> component.
 * Avoids jsdom recursive update issues with the real form-create.
 * Renders a simple input for each rule field, and syncs v-model.
 */
const FormCreateStub = defineComponent({
  name: 'FormCreate',
  props: {
    rule: { type: Array, default: () => [] },
    option: { type: Object, default: () => ({}) },
    modelValue: { type: Object, default: () => ({}) },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => {
      const fields = (props.rule as Rule[]).map((r) => {
        const field = (r as Record<string, unknown>).field as string
        return h('input', {
          'data-field': field,
          value: (props.modelValue as Record<string, unknown>)[field] ?? '',
          onInput: (e: Event) => {
            const target = e.target as HTMLInputElement
            emit('update:modelValue', { ...props.modelValue, [field]: target.value })
          },
        })
      })
      return h('div', { class: 'form-create-stub' }, fields)
    }
  },
})

// A simple rule: one input field named "username"
const simpleRule: Rule[] = [
  {
    type: 'input',
    field: 'username',
    title: '用户名',
    value: '',
  } as Rule,
]

// A rule with two fields
const twoFieldRule: Rule[] = [
  { type: 'input', field: 'name', title: '名称', value: '' } as Rule,
  { type: 'input', field: 'code', title: '编码', value: '' } as Rule,
]

function createWrapper(props: Record<string, unknown>) {
  return mount(FormRenderer, {
    props,
    global: {
      plugins: [ElementPlus],
      stubs: {
        'form-create': FormCreateStub,
        'FormCreate': FormCreateStub,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('FormRenderer — rule prop (直接渲染，无 API 调用)', () => {
  it('接收 rule prop 后直接渲染表单，不调用 getFormDefinition', async () => {
    const wrapper = createWrapper({ rule: simpleRule })
    await nextTick()

    // 不应调用 API 获取表单定义
    expect(formApi.getFormDefinition).not.toHaveBeenCalled()

    // 应渲染 form-renderer 容器
    expect(wrapper.find('.form-renderer').exists()).toBe(true)
  })

  it('rule 模式下渲染出输入字段', async () => {
    const wrapper = createWrapper({ rule: simpleRule })
    await nextTick()

    // form-create stub 渲染出 input 元素
    expect(wrapper.find('input').exists()).toBe(true)
    expect(wrapper.find('input[data-field="username"]').exists()).toBe(true)
  })

  it('同时传入 formDefId 和 rule 时，formDefId 优先（调用 API）', async () => {
    // 模拟 API 返回有效 schema
    vi.mocked(formApi.getFormDefinition).mockResolvedValue({
      code: 200,
      data: {
        id: 'def-1',
        name: '测试表单',
        key: 'test-form',
        version: 1,
        status: 'PUBLISHED',
        publishedVersion: 1,
        createdBy: null,
        createdAt: '',
        updatedAt: '',
        schema: JSON.stringify(twoFieldRule),
      },
      msg: 'ok',
    })

    const wrapper = createWrapper({ formDefId: 'def-1', rule: simpleRule })
    await nextTick()
    await nextTick()

    // formDefId 优先，应调用 API
    expect(formApi.getFormDefinition).toHaveBeenCalledWith('def-1')
  })
})

describe('FormRenderer — initialValues prop (预填表单数据)', () => {
  it('接收 initialValues 后预填 formData', async () => {
    const wrapper = createWrapper({
      rule: twoFieldRule,
      initialValues: { name: '张三', code: 'ZS001' },
    })
    await nextTick()

    // getFormData 应返回预填的值
    const formData = (wrapper.vm as unknown as { getFormData: () => Record<string, unknown> }).getFormData()
    expect(formData.name).toBe('张三')
    expect(formData.code).toBe('ZS001')
  })

  it('initialValues 变化后更新 formData', async () => {
    const wrapper = createWrapper({
      rule: twoFieldRule,
      initialValues: { name: '张三', code: 'ZS001' },
    })
    await nextTick()

    // 修改 initialValues
    await wrapper.setProps({ initialValues: { name: '李四', code: 'LS002' } })
    await nextTick()

    const formData = (wrapper.vm as unknown as { getFormData: () => Record<string, unknown> }).getFormData()
    expect(formData.name).toBe('李四')
    expect(formData.code).toBe('LS002')
  })
})

describe('FormRenderer — getFormData() 方法', () => {
  it('getFormData 返回当前表单数据对象', async () => {
    const wrapper = createWrapper({ rule: simpleRule })
    await nextTick()

    // 初始值应为对象
    const data = (wrapper.vm as unknown as { getFormData: () => Record<string, unknown> }).getFormData()
    expect(data).toBeDefined()
    expect(typeof data).toBe('object')
  })

  it('getFormData 在 initialValues 设置后返回预填数据', async () => {
    const wrapper = createWrapper({
      rule: twoFieldRule,
      initialValues: { name: '王五', code: 'WW003' },
    })
    await nextTick()

    const data = (wrapper.vm as unknown as { getFormData: () => Record<string, unknown> }).getFormData()
    expect(data.name).toBe('王五')
    expect(data.code).toBe('WW003')
  })

  it('getFormData 通过 defineExpose 暴露', async () => {
    const wrapper = createWrapper({ rule: simpleRule })
    await nextTick()

    // defineExpose 暴露的方法应在 vm 上可访问
    const vm = wrapper.vm as unknown as { getFormData: () => Record<string, unknown> }
    expect(typeof vm.getFormData).toBe('function')
  })
})
