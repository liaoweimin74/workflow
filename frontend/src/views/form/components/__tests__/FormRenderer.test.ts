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

describe('FormRenderer — fieldPermissions prop (字段级权限)', () => {
  const permRule: Rule[] = [
    { type: 'input', field: 'name', title: '名称', value: '' } as Rule,
    { type: 'input', field: 'code', title: '编码', value: '' } as Rule,
    { type: 'input', field: 'secret', title: '机密', value: '' } as Rule,
  ]

  function getRenderedRules(wrapper: ReturnType<typeof createWrapper>): Record<string, unknown>[] {
    const stub = wrapper.findComponent(FormCreateStub)
    return stub.props('rule') as Record<string, unknown>[]
  }

  it('VIEW 权限 → 字段渲染为只读（props.disabled=true）', async () => {
    const wrapper = createWrapper({
      rule: permRule,
      fieldPermissions: { code: 'VIEW' },
    })
    await nextTick()

    const rules = getRenderedRules(wrapper)
    const codeField = rules.find(r => r.field === 'code') as Record<string, unknown>
    // form-create 的禁用属性在 props 内层
    const propsObj = codeField.props as Record<string, unknown>
    expect(propsObj.disabled).toBe(true)
    // 其他字段不设置 disabled
    const nameField = rules.find(r => r.field === 'name') as Record<string, unknown>
    expect((nameField.props as Record<string, unknown> | undefined)?.disabled).toBeUndefined()
  })

  it('HIDDEN 权限 → 字段从 rule 数组中移除（不渲染、不提交）', async () => {
    const wrapper = createWrapper({
      rule: permRule,
      fieldPermissions: { secret: 'HIDDEN' },
    })
    await nextTick()

    const rules = getRenderedRules(wrapper)
    expect(rules.some(r => r.field === 'secret')).toBe(false)
    // 其余字段保留
    expect(rules.some(r => r.field === 'name')).toBe(true)
    expect(rules.some(r => r.field === 'code')).toBe(true)
  })

  it('EDIT 权限 → 字段保持可编辑（不修改 rule）', async () => {
    const wrapper = createWrapper({
      rule: permRule,
      fieldPermissions: { name: 'EDIT', code: 'EDIT' },
    })
    await nextTick()

    const rules = getRenderedRules(wrapper)
    const nameField = rules.find(r => r.field === 'name') as Record<string, unknown>
    expect((nameField.props as Record<string, unknown> | undefined)?.disabled).toBeUndefined()
    // EDIT 字段全部保留
    expect(rules).toHaveLength(3)
  })

  it('fieldPermissions 为空对象 → 所有字段默认可编辑', async () => {
    const wrapper = createWrapper({
      rule: permRule,
      fieldPermissions: {},
    })
    await nextTick()

    const rules = getRenderedRules(wrapper)
    expect(rules).toHaveLength(3)
    for (const rule of rules) {
      const propsObj = (rule as Record<string, unknown>).props as Record<string, unknown> | undefined
      expect(propsObj?.disabled).toBeUndefined()
    }
  })

  it('fieldPermissions 未传入 → 所有字段默认可编辑', async () => {
    const wrapper = createWrapper({ rule: permRule })
    await nextTick()

    const rules = getRenderedRules(wrapper)
    expect(rules).toHaveLength(3)
    for (const rule of rules) {
      const propsObj = (rule as Record<string, unknown>).props as Record<string, unknown> | undefined
      expect(propsObj?.disabled).toBeUndefined()
    }
  })

  it('权限在 form-create 实例创建前一次性应用（初始化后 rule 不变）', async () => {
    const wrapper = createWrapper({
      rule: permRule,
      fieldPermissions: { code: 'VIEW', secret: 'HIDDEN' },
    })
    await nextTick()

    // 初次应用后再次触发同一批 props，rule 应保持稳定（不累积/不恢复）
    const firstRules = getRenderedRules(wrapper)
    expect(firstRules.some(r => r.field === 'secret')).toBe(false)
    const codeFirst = firstRules.find(r => r.field === 'code') as Record<string, unknown>
    expect((codeFirst.props as Record<string, unknown>).disabled).toBe(true)
  })
})
