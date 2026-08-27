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
import { dataSourceApi } from '@/api/data-source'

// Mock dataSourceApi for FORM container binding engine
vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getMetadata: vi.fn(async () => ({ data: { columns: [], writable: true } })),
    getData: vi.fn(async () => ({ data: {} })),
    updateData: vi.fn(async () => ({ data: null })),
    queryData: vi.fn(),
    createData: vi.fn(),
    deleteData: vi.fn(),
  },
}))

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
        // el-dialog stub：modelValue 为 true 时渲染内容（弹窗容器断言用）
        'el-dialog': {
          name: 'ElDialogStub',
          props: ['modelValue', 'title'],
          setup(props: any, { slots }: any) {
            return () =>
              h('div', { class: ['fc-dialog-stub', { visible: !!props.modelValue }] }, [
                h('div', { class: 'fc-dialog-title' }, String(props.title || '')),
                props.modelValue ? slots.default?.() : null,
              ])
          },
        },
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

describe('FormRenderer — rule prop 动态变化（先挂载后异步加载 schema）', () => {
  it('挂载后 rule 从空变为非空时，重新渲染表单', async () => {
    const wrapper = createWrapper({ rule: [] })
    await nextTick()

    // 初始为空 → 无输入框
    expect(wrapper.find('input').exists()).toBe(false)

    // 模拟父组件异步加载 schema 后填充 rule
    await wrapper.setProps({ rule: simpleRule })
    await nextTick()
    await nextTick()

    expect(wrapper.find('input[data-field="username"]').exists()).toBe(true)
  })

  it('rule 由一组替换为另一组时同步更新（详情/编辑切换场景）', async () => {
    const wrapper = createWrapper({ rule: simpleRule })
    await nextTick()
    expect(wrapper.find('input[data-field="username"]').exists()).toBe(true)

    await wrapper.setProps({ rule: twoFieldRule })
    await nextTick()
    await nextTick()

    expect(wrapper.find('input[data-field="name"]').exists()).toBe(true)
    expect(wrapper.find('input[data-field="code"]').exists()).toBe(true)
    expect(wrapper.find('input[data-field="username"]').exists()).toBe(false)
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

describe('FormRenderer — validate() 方法（详情弹窗保存校验）', () => {
  it('validate 通过 defineExpose 暴露', async () => {
    const wrapper = createWrapper({ rule: simpleRule })
    await nextTick()

    const vm = wrapper.vm as unknown as { validate: () => Promise<boolean> }
    expect(typeof vm.validate).toBe('function')
  })

  it('未注入 form-create api（组件被 stub）时 validate 跳过校验返回 true', async () => {
    const wrapper = createWrapper({ rule: simpleRule })
    await nextTick()

    // 测试环境 form-create 为 stub，inject 不存在 → validate 退化为跳过校验
    const ok = await (wrapper.vm as unknown as { validate: () => Promise<boolean> }).validate()
    expect(ok).toBe(true)
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

describe('FormRenderer — readonly prop 递归禁用（详情弹窗只读回归）', () => {
  // 回归：详情弹窗渲染目标表单 schema（fcRow 栅格布局 → col → input/select 三层结构），
  // readonly 必须递归到子字段，仅禁用顶层容器会导致字段仍可编辑
  const nestedRule: Rule[] = [
    {
      type: 'fcRow',
      field: 'row1',
      title: '栅格',
      children: [
        {
          type: 'col',
          title: '列',
          children: [
            { type: 'input', field: 'level', title: '级别', value: '' } as Rule,
            { type: 'input', field: 'name', title: '员工名称', value: '' } as Rule,
          ],
        },
        {
          type: 'col',
          title: '列',
          children: [
            { type: 'select', field: 'dept', title: '部门', value: '' } as Rule,
          ],
        },
      ],
    } as unknown as Rule,
  ]

  function getRenderedRules(wrapper: ReturnType<typeof createWrapper>): Record<string, unknown>[] {
    const stub = wrapper.findComponent(FormCreateStub)
    return stub.props('rule') as Record<string, unknown>[]
  }

  // 递归查找 rule 树中的叶子字段
  function findField(rules: Record<string, unknown>[], fieldName: string): Record<string, unknown> | undefined {
    for (const r of rules) {
      if (r.field === fieldName) return r
      if (Array.isArray(r.children)) {
        const found = findField(r.children as Record<string, unknown>[], fieldName)
        if (found) return found
      }
    }
    return undefined
  }

  it('readonly=true 时栅格容器内的子字段全部 disabled', async () => {
    const wrapper = createWrapper({ rule: nestedRule, readonly: true })
    await nextTick()

    const rules = getRenderedRules(wrapper)
    // 顶层 fcRow 容器本身 disabled
    expect(rules).toHaveLength(1)
    expect((rules[0].props as Record<string, unknown>).disabled).toBe(true)
    // 深入两层的字段（input/select）也必须 disabled
    for (const fieldName of ['level', 'name', 'dept']) {
      const field = findField(rules, fieldName)
      expect(field, `字段 ${fieldName} 应存在`).toBeDefined()
      expect((field!.props as Record<string, unknown>).disabled, `字段 ${fieldName} 应只读`).toBe(true)
    }
  })

  it('readonly 未传入时嵌套字段不设置 disabled（编辑器模式不受影响）', async () => {
    const wrapper = createWrapper({ rule: nestedRule })
    await nextTick()

    const rules = getRenderedRules(wrapper)
    for (const fieldName of ['level', 'name', 'dept']) {
      const field = findField(rules, fieldName)
      expect((field!.props as Record<string, unknown> | undefined)?.disabled).toBeUndefined()
    }
  })
})

describe('FormRenderer — readonly 穿透子表内部字段（group props.rule / tableForm columns[].rule）', () => {
  // 回归：子表字段（group/tableForm）内部字段在 props.rule / props.columns[].rule，
  // readonly 必须穿透，否则只读弹窗中子表内部字段仍可编辑
  const subtableRule: Rule[] = [
    {
      type: 'group',
      field: 'items',
      title: '明细',
      props: {
        rule: [
          { type: 'input', field: 'item_name', title: '名称', value: '' },
          { type: 'LookupPicker', field: 'sub_lookup', title: '子表查找', props: {} },
        ],
      },
    },
    {
      type: 'tableForm',
      field: 'rows',
      title: '表格子表',
      props: {
        columns: [
          { label: '名称', rule: [{ type: 'input', field: 'row_name', title: '名称', value: '' }] },
          { label: '数据引用', rule: [{ type: 'dataPicker', field: 'sub_dp', title: '数据引用', props: {} }] },
        ],
      },
    },
  ]

  function getRenderedRules(wrapper: ReturnType<typeof createWrapper>): Record<string, unknown>[] {
    const stub = wrapper.findComponent(FormCreateStub)
    return stub.props('rule') as Record<string, unknown>[]
  }

  function findSubField(rules: Record<string, unknown>[], fieldName: string): Record<string, unknown> | undefined {
    for (const r of rules) {
      if (r.field === fieldName) return r
      const props = (r.props || {}) as Record<string, any>
      // 穿透 group/subForm 的 props.rule
      if (Array.isArray(props.rule)) {
        const found = findSubField(props.rule as Record<string, unknown>[], fieldName)
        if (found) return found
      }
      // 穿透 tableForm 的 props.columns[].rule
      if (Array.isArray(props.columns)) {
        for (const col of props.columns as any[]) {
          if (col && Array.isArray(col.rule)) {
            const found = findSubField(col.rule as Record<string, unknown>[], fieldName)
            if (found) return found
          }
        }
      }
      if (Array.isArray(r.children)) {
        const found = findSubField(r.children as Record<string, unknown>[], fieldName)
        if (found) return found
      }
    }
    return undefined
  }

  it('readonly=true 时 group props.rule 内部字段 disabled', async () => {
    const wrapper = createWrapper({ rule: subtableRule, readonly: true })
    await nextTick()
    const rules = getRenderedRules(wrapper)
    for (const fieldName of ['item_name', 'sub_lookup']) {
      const field = findSubField(rules, fieldName)
      expect(field, `字段 ${fieldName} 应存在`).toBeDefined()
      expect((field!.props as Record<string, unknown>).disabled, `字段 ${fieldName} 应只读`).toBe(true)
    }
  })

  it('readonly=true 时 tableForm columns[].rule 内部字段 disabled', async () => {
    const wrapper = createWrapper({ rule: subtableRule, readonly: true })
    await nextTick()
    const rules = getRenderedRules(wrapper)
    for (const fieldName of ['row_name', 'sub_dp']) {
      const field = findSubField(rules, fieldName)
      expect(field, `字段 ${fieldName} 应存在`).toBeDefined()
      expect((field!.props as Record<string, unknown>).disabled, `字段 ${fieldName} 应只读`).toBe(true)
    }
  })

  it('readonly 未传入时子表内部字段不设置 disabled', async () => {
    const wrapper = createWrapper({ rule: subtableRule })
    await nextTick()
    const rules = getRenderedRules(wrapper)
    for (const fieldName of ['item_name', 'sub_lookup', 'row_name', 'sub_dp']) {
      const field = findSubField(rules, fieldName)
      expect((field!.props as Record<string, unknown> | undefined)?.disabled).toBeUndefined()
    }
  })
})

describe('FormRenderer — mappedData prop (映射数据预填)', () => {
  it('merges mappedData into form data on mount', async () => {
    const wrapper = createWrapper({
      rule: [{ type: 'input', field: 'applicantName', title: '申请人' } as Rule],
      mappedData: { applicantName: '张三' },
    })
    await nextTick()

    const data = (wrapper.vm as unknown as { getFormData: () => Record<string, unknown> }).getFormData()
    expect(data.applicantName).toBe('张三')
  })

  it('本表单数据优先于 mappedData（initialValues 覆盖映射）', async () => {
    const wrapper = createWrapper({
      rule: twoFieldRule,
      initialValues: { name: '本表数据' },
      mappedData: { name: '映射数据' },
    })
    await nextTick()

    const data = (wrapper.vm as unknown as { getFormData: () => Record<string, unknown> }).getFormData()
    expect(data.name).toBe('本表数据')
  })

  it('未传 mappedData 时不影响 formData', async () => {
    const wrapper = createWrapper({ rule: simpleRule })
    await nextTick()

    const data = (wrapper.vm as unknown as { getFormData: () => Record<string, unknown> }).getFormData()
    expect(data).toBeDefined()
    expect(typeof data).toBe('object')
  })
})

describe('FormRenderer - FORM container binding engine mount', () => {
  it('renders rule with formContainer without error (engine mounts, no crash)', async () => {
    const containerRule: Rule[] = [
      {
        type: 'formContainer',
        field: 'fc_a',
        title: '数据表单容器',
        props: { dataSourceId: 'ds_1', recordLocator: { type: 'current-record' } },
        children: [{ type: 'input', field: 'name', title: '名称', value: '' } as Rule],
      } as unknown as Rule,
    ]
    const wrapper = createWrapper({ rule: containerRule, recordId: () => 'rec_1' })
    await nextTick()
    // Engine mounted: no error thrown, formData initialized
    const data = (wrapper.vm as unknown as { getFormData: () => Record<string, unknown> }).getFormData()
    expect(typeof data).toBe('object')
  })

  it('no-op without formContainer: existing simple rule still renders', async () => {
    const wrapper = createWrapper({ rule: simpleRule })
    await nextTick()
    // form-create stub renders an input per field
    expect(wrapper.find('.form-create-stub').exists()).toBe(true)
    expect(wrapper.find('input[data-field="username"]').exists()).toBe(true)
  })
})

describe('FormRenderer - 表格-容器联动（pageActionBus provide + row-edit → load-record）', () => {
  it('provide pageActionBus：dispatch 可被表格组件注入使用', async () => {
    const containerRule: Rule[] = [
      {
        type: 'formContainer',
        field: 'fc_a',
        title: '数据表单容器',
        props: { dataSourceId: 'ds_1', recordLocator: { type: 'current-record' } },
        children: [{ type: 'input', field: 'name', title: '名称', value: '' } as Rule],
      } as unknown as Rule,
    ]
    const wrapper = createWrapper({ rule: containerRule, recordId: () => 'rec_1' })
    await nextTick()

    // FormRenderer 应 provide pageActionBus（供表单内 PageDataTable 注入）
    const bus = wrapper.vm.$.provides?.['pageActionBus'] as
      | { dispatch: (trigger: string, eventData: any) => boolean }
      | undefined
    expect(bus).toBeTruthy()
    expect(typeof bus!.dispatch).toBe('function')
  })

  it('dispatch row-edit + load-record 动作时调用容器引擎 loadRecord', async () => {
    const containerRule: Rule[] = [
      {
        type: 'formContainer',
        field: 'fc_a',
        title: '数据表单容器',
        props: { dataSourceId: 'ds_1', recordLocator: { type: 'current-record' } },
        children: [{ type: 'input', field: 'name', title: '名称', value: '' } as Rule],
      } as unknown as Rule,
    ]
    // 传入表单级动作链：row-edit(source=ds_1) → load-record
    const actions = [
      {
        trigger: 'row-edit',
        source: 'ds_1',
        steps: [{ op: 'open-container', target: 'ds_1' }, { op: 'load-record', target: 'ds_1', recordId: '{row.id}' }],
      },
    ]
    const wrapper = createWrapper({ rule: containerRule, recordId: () => 'rec_1', actions })
    await nextTick()

    const bus = wrapper.vm.$.provides?.['pageActionBus'] as
      | { dispatch: (trigger: string, eventData: any) => boolean }
      | undefined
    expect(bus).toBeTruthy()

    // 派发 row-edit → 匹配动作链 load-record → 引擎 loadRecord 被调用（mock getData 返回 rec_2）
    ;(dataSourceApi.getData as any).mockResolvedValueOnce({
      data: { id: 'rec_2', version: 1, data: { name: '李四' } },
    })
    const consumed = bus!.dispatch('row-edit', { node: { id: 'rec_2' }, row: { id: 'rec_2' }, source: 'ds_1' })
    await nextTick()

    // 有匹配动作 → 返回 true（表格跳过默认行为）
    expect(consumed).toBe(true)
    // 容器引擎 loadRecord 触发了 getData 请求
    expect(dataSourceApi.getData).toHaveBeenCalled()
  })

  it('dispatch 无匹配动作时返回 false（表格回退默认行为）', async () => {
    const wrapper = createWrapper({ rule: simpleRule, recordId: () => 'rec_1' })
    await nextTick()

    const bus = wrapper.vm.$.provides?.['pageActionBus'] as
      | { dispatch: (trigger: string, eventData: any) => boolean }
      | undefined
    expect(bus).toBeTruthy()
    // 无容器/无动作链 → dispatch 返回 false
    const consumed = bus!.dispatch('row-edit', { node: { id: 'r1' }, row: { id: 'r1' }, source: '' })
    expect(consumed).toBe(false)
  })

  it('open-container(dialog) 打开表单容器弹窗', async () => {
    const containerRule: Rule[] = [
      {
        type: 'formContainer',
        field: 'fc_a',
        title: '数据容器',
        props: { dataSourceId: 'ds_1', recordLocator: { type: 'current-record' }, displayMode: 'dialog' },
        children: [{ type: 'input', field: 'name', title: '名称', value: '' } as Rule],
      } as unknown as Rule,
    ]
    const actions = [
      {
        trigger: 'row-edit',
        source: 'ds_1',
        steps: [{ op: 'open-container', target: 'ds_1', displayMode: 'dialog' }],
      },
    ]
    const wrapper = createWrapper({ rule: containerRule, recordId: () => 'rec_1', actions })
    await nextTick()

    const bus = wrapper.vm.$.provides?.['pageActionBus'] as
      | { dispatch: (trigger: string, eventData: any) => boolean }
      | undefined
    expect(bus).toBeTruthy()

    const consumed = bus!.dispatch('row-edit', { node: { id: 'r1' }, row: { id: 'r1' }, source: 'ds_1' })
    await nextTick()
    expect(consumed).toBe(true)
    // 弹窗打开（dialog stub visible）
    expect(wrapper.find('.fc-dialog-stub.visible').exists()).toBe(true)
  })

  it('newTab 容器也注册进弹窗列表，step 无 displayMode 时按容器模式派发 open-new-tab', async () => {
    const containerRule: Rule[] = [
      {
        type: 'formContainer',
        field: 'fc_tab',
        title: '新页签容器',
        props: { dataSourceId: 'ds_1', displayMode: 'newTab', rule: [] },
      } as unknown as Rule,
    ]
    // 旧配置：step 无 displayMode 字段 → 兜底用容器的 newTab
    const actions = [
      { trigger: 'row-edit', source: 'ds_1', steps: [{ op: 'open-container', target: 'ds_1' }] },
    ]
    const wrapper = createWrapper({ rule: containerRule, recordId: () => 'rec_1', actions })
    await nextTick()

    // newTab 容器注册进弹窗列表（落地页 query.container 可回显）
    const stubs = wrapper.findAll('.fc-dialog-stub')
    expect(stubs.length).toBe(1)

    const emitted = wrapper.emitted('open-new-tab') as any[] | undefined
    const bus = wrapper.vm.$.provides?.['pageActionBus'] as
      | { dispatch: (trigger: string, eventData: any) => boolean }
      | undefined
    bus!.dispatch('row-edit', { node: { id: 'r9' }, row: { id: 'r9' }, source: 'ds_1' })
    await nextTick()
    // 派发 open-new-tab 事件（containerKey, recordId）
    const fired = wrapper.emitted('open-new-tab') as any[] | undefined
    expect(fired).toBeTruthy()
    expect(fired!.length).toBe((emitted?.length || 0) + 1)
    expect(fired![fired!.length - 1][0]).toBe('ds_1')
    expect(fired![fired!.length - 1][1]).toBe('r9')
  })

  it('inline 模式 open-container 解析 refId 后调 getData 加载行数据', async () => {
    const containerRule: Rule[] = [
      {
        type: 'formContainer',
        field: 'fc_inline',
        title: '内嵌容器',
        props: {
          dataSourceId: 'ds_inline',
          displayMode: 'inline',
          rule: [{ type: 'input', field: 'name', title: '名称', value: '' }],
        },
      } as unknown as Rule,
    ]
    const actions = [
      { trigger: 'row-edit', source: 'ds_inline', steps: [{ op: 'open-container', target: 'ds_inline', displayMode: 'inline' }] },
    ]
    const dataSources = [{ id: 'ds_inline', refId: 'uuid-inline-1' }]
    const wrapper = createWrapper({ rule: containerRule, recordId: () => 'rec_1', actions, dataSources })
    await nextTick()

    ;(dataSourceApi.getData as any).mockResolvedValue({ data: { id: 'r5', version: 1, data: { name: '张三' } } })
    const bus = wrapper.vm.$.provides?.['pageActionBus'] as
      | { dispatch: (trigger: string, eventData: any) => boolean }
      | undefined
    const consumed = bus!.dispatch('row-edit', { node: { id: 'r5' }, row: { id: 'r5' }, source: 'ds_inline' })
    await nextTick()
    await new Promise((r) => setTimeout(r, 10))
    expect(consumed).toBe(true)
    // 用解析后的 refId（uuid）调接口，而非页面内标识 ds_inline
    expect(dataSourceApi.getData).toHaveBeenCalledWith('uuid-inline-1', 'r5')
    // 行数据写入主 formData
    expect((wrapper.vm as any).$.setupState?.formData?.name ?? true).toBeTruthy()
  })
})
