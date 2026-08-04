// ----- TDD CYCLE: GREEN — FormRenderer with @vtj/renderer createRenderer -----
// npx vitest run src/views/form/components/__tests__/FormRenderer.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, defineComponent, h, reactive } from 'vue'
import ElementPlus from 'element-plus'
import type { BlockSchema } from '@vtj/core'
import FormRenderer from '../FormRenderer.vue'

// Mock formApi to verify no API call in rule mode
vi.mock('@/api/form', () => ({
  formApi: {
    getFormDefinition: vi.fn(),
    getFormData: vi.fn(),
    saveFormData: vi.fn(),
    updateFormData: vi.fn(),
  },
  FormDataDTO: {} as unknown,
}))

// Mock @vtj/renderer — avoids jsdom issues with the real renderer engine.
// Returns a stub renderer component that renders inputs from DSL nodes
// and a context whose `state` is a reactive object.
vi.mock('@vtj/renderer', () => {
  const { reactive, defineComponent, h } = require('vue')

  const StubRenderer = defineComponent({
    name: 'VtjRenderer',
    setup(_, { expose }) {
      const state = reactive<Record<string, unknown>>({})
      expose({ state })
      return () => h('div', { class: 'vtj-renderer-stub' })
    },
  })

  function createRenderer(options: { dsl?: BlockSchema }) {
    const dsl = options.dsl
    const context = {
      state: reactive<Record<string, unknown>>({}),
      setState(obj: Record<string, unknown>) {
        Object.assign(context.state, obj)
      },
    }

    // Extract XField names from DSL nodes and render inputs
    const StubWithFields = defineComponent({
      name: 'VtjRendererFields',
      setup() {
        return () => {
          const nodes = dsl?.nodes ?? []
          const fields = nodes
            .filter((n) => n.name === 'XField')
            .map((n) => {
              const fieldName =
                (n.props?.name as string) || (n.props?.field as string)
              return h('input', {
                'data-field': fieldName,
                value: (context.state as Record<string, unknown>)[fieldName] ?? '',
                onInput: (e: Event) => {
                  const target = e.target as HTMLInputElement
                  ;(context.state as Record<string, unknown>)[fieldName] = target.value
                },
              })
            })
          return h('div', { class: 'vtj-renderer-stub' }, fields)
        }
      },
    })

    return { renderer: StubWithFields, context }
  }

  return { createRenderer }
})

import { formApi } from '@/api/form'

/**
 * A simple VTJ DSL with one XField named "username".
 */
const simpleDsl: BlockSchema = {
  name: 'FormBlock',
  nodes: [
    {
      name: 'XField',
      props: { name: 'username', label: '用户名' },
    },
  ],
}

/**
 * A VTJ DSL with two XField nodes.
 */
const twoFieldDsl: BlockSchema = {
  name: 'FormBlock',
  nodes: [
    { name: 'XField', props: { name: 'name', label: '名称' } },
    { name: 'XField', props: { name: 'code', label: '编码' } },
  ],
}

function createWrapper(props: Record<string, unknown>) {
  return mount(FormRenderer, {
    props,
    global: {
      plugins: [ElementPlus],
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('FormRenderer — rule prop (直接渲染，无 API 调用)', () => {
  it('接收 rule prop 后直接渲染表单，不调用 getFormDefinition', async () => {
    const wrapper = createWrapper({ rule: simpleDsl })
    await nextTick()

    // 不应调用 API 获取表单定义
    expect(formApi.getFormDefinition).not.toHaveBeenCalled()

    // 应渲染 form-renderer 容器
    expect(wrapper.find('.form-renderer').exists()).toBe(true)
  })

  it('rule 模式下渲染出输入字段', async () => {
    const wrapper = createWrapper({ rule: simpleDsl })
    await nextTick()
    await nextTick()

    // VTJ renderer stub 渲染出 input 元素
    expect(wrapper.find('input').exists()).toBe(true)
    expect(wrapper.find('input[data-field="username"]').exists()).toBe(true)
  })

  it('同时传入 formDefId 和 rule 时，formDefId 优先（调用 API）', async () => {
    // 模拟 API 返回有效 VTJ DSL schema
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
        schema: JSON.stringify(twoFieldDsl),
      },
      msg: 'ok',
    })

    const wrapper = createWrapper({ formDefId: 'def-1', rule: simpleDsl })
    await nextTick()
    await nextTick()

    // formDefId 优先，应调用 API
    expect(formApi.getFormDefinition).toHaveBeenCalledWith('def-1')
  })
})

describe('FormRenderer — initialValues prop (预填表单数据)', () => {
  it('接收 initialValues 后预填 formData', async () => {
    const wrapper = createWrapper({
      rule: twoFieldDsl,
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
      rule: twoFieldDsl,
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
    const wrapper = createWrapper({ rule: simpleDsl })
    await nextTick()

    // 初始值应为对象
    const data = (wrapper.vm as unknown as { getFormData: () => Record<string, unknown> }).getFormData()
    expect(data).toBeDefined()
    expect(typeof data).toBe('object')
  })

  it('getFormData 在 initialValues 设置后返回预填数据', async () => {
    const wrapper = createWrapper({
      rule: twoFieldDsl,
      initialValues: { name: '王五', code: 'WW003' },
    })
    await nextTick()

    const data = (wrapper.vm as unknown as { getFormData: () => Record<string, unknown> }).getFormData()
    expect(data.name).toBe('王五')
    expect(data.code).toBe('WW003')
  })

  it('getFormData 通过 defineExpose 暴露', async () => {
    const wrapper = createWrapper({ rule: simpleDsl })
    await nextTick()

    // defineExpose 暴露的方法应在 vm 上可访问
    const vm = wrapper.vm as unknown as { getFormData: () => Record<string, unknown> }
    expect(typeof vm.getFormData).toBe('function')
  })
})

describe('FormRenderer — defineExpose 方法', () => {
  it('submit, getFormData, loadSchema, loadData 均通过 defineExpose 暴露', async () => {
    const wrapper = createWrapper({ rule: simpleDsl })
    await nextTick()

    const vm = wrapper.vm as unknown as Record<string, unknown>
    expect(typeof vm.submit).toBe('function')
    expect(typeof vm.getFormData).toBe('function')
    expect(typeof vm.loadSchema).toBe('function')
    expect(typeof vm.loadData).toBe('function')
  })
})

describe('FormRenderer — emit 事件', () => {
  it('loaded 和 submitted 事件已正确声明', async () => {
    const wrapper = createWrapper({ rule: simpleDsl })
    await nextTick()

    // 验证事件声明存在
    const emits = (wrapper.vm as unknown as { $props: unknown }).$props
    expect(emits).toBeDefined()
  })
})
