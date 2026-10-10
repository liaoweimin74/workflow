// ----- Task 3-f: PAGE 轨「写闭环」双组件（PageDataForm 数据录入/编辑页 + PageDataDetail KV 详情） -----
// npx vitest run src/views/page/components/__tests__/PageDataFormDetail.test.ts
//
// mock 面：dataSourceApi / formApi（API 层）、element-plus 仅换 ElMessage（其余用真实组件渲染 el-descriptions/el-empty/el-button）、
// FormRenderer（stub：expose getFormData/validate，由 formStub 状态驱动）。formDsBindingsStore 真实模块以 bindings 数组注入。

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const state = vi.hoisted(() => ({
  getData: vi.fn(),
  createData: vi.fn(),
  updateData: vi.fn(),
  getMetadata: vi.fn(),
  getFormDefinitionByKey: vi.fn(),
  elMessageSuccess: vi.fn(),
  /** FormRenderer stub 的行为开关（getFormData 返回值 / validate 结果） */
  formStub: { formData: {} as Record<string, any>, validateOk: true },
  /** activeDsBindings 数据（store mock 内读引用，测试可随时改写） */
  bindings: [] as Array<{ id: string; refId: string }>,
}))

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getData: state.getData,
    createData: state.createData,
    updateData: state.updateData,
    getMetadata: state.getMetadata,
  },
}))

vi.mock('@/api/form', () => ({
  formApi: { getFormDefinitionByKey: state.getFormDefinitionByKey },
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: state.elMessageSuccess, error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  }
})

vi.mock('@/utils/formDsBindingsStore', () => ({
  activeDsBindings: { get value() { return state.bindings } },
}))

vi.mock('@/views/form/components/FormRenderer.vue', () => ({
  default: defineComponent({
    name: 'FormRendererStub',
    props: ['rule', 'option', 'initialValues', 'dataSources', 'readonly'],
    setup(_props, { expose }) {
      expose({
        getFormData: () => ({ ...state.formStub.formData }),
        validate: async () => state.formStub.validateOk,
      })
      return () => h('div', { class: 'form-renderer-stub' })
    },
  }),
}))

import PageDataForm from '../PageDataForm.vue'
import PageDataDetail from '../PageDataDetail.vue'

const FORM_KEY_SCHEMA = JSON.stringify({
  rule: [
    { type: 'input', field: 'name', title: '姓名' },
    { type: 'inputNumber', field: 'age', title: '年龄' },
  ],
  dataSources: [],
})

function mountForm(props: Record<string, unknown>) {
  return mount(PageDataForm, { props, global: { plugins: [ElementPlus] } })
}

describe('PageDataForm — create 模式', () => {
  beforeEach(() => {
    state.getData.mockReset()
    state.createData.mockReset()
    state.updateData.mockReset()
    state.getMetadata.mockReset()
    state.getFormDefinitionByKey.mockReset()
    state.elMessageSuccess.mockReset()
    state.formStub.formData = { name: '张三', age: 20 }
    state.formStub.validateOk = true
    state.bindings = [{ id: 'orders', refId: 'global-orders' }]
    state.getFormDefinitionByKey.mockResolvedValue({ data: { schema: FORM_KEY_SCHEMA } })
    state.createData.mockResolvedValue({ code: 0, data: 'new-1', msg: '' })
    state.updateData.mockResolvedValue({ code: 0, data: null, msg: '' })
  })

  it('按 formKey 加载表单定义并渲染 FormRenderer（rule/option/dataSources 透传）', async () => {
    const wrapper = mountForm({ pageKey: 'page-orders', dataSourceId: 'orders', formKey: 'orders-form' })
    await flushPromises()

    expect(state.getFormDefinitionByKey).toHaveBeenCalledWith('orders-form')
    const stub = wrapper.findComponent({ name: 'FormRendererStub' })
    expect(stub.exists()).toBe(true)
    const rule = stub.props('rule') as any[]
    expect(rule.map((r) => r.field)).toEqual(['name', 'age'])
    // 内建提交由组件 footer 按钮承担：隐藏 form-create 内建提交/重置
    expect((stub.props('option') as any).submitBtn).toEqual({ show: false })
    expect(stub.props('dataSources')).toEqual([])
    // 未提交不落写操作
    expect(state.createData).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('提交调用创建 API：refId 经 activeDsBindings 解析，payload 取 getFormData', async () => {
    const wrapper = mountForm({ pageKey: 'page-orders', dataSourceId: 'orders', formKey: 'orders-form' })
    await flushPromises()

    await wrapper.find('.page-data-form-submit').trigger('click')
    await flushPromises()

    expect(state.createData).toHaveBeenCalledTimes(1)
    expect(state.createData).toHaveBeenCalledWith('global-orders', expect.objectContaining({ name: '张三', age: 20 }))
    expect(state.updateData).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('提交成功：ElMessage.success + emit saved（载荷含新建 id）', async () => {
    const wrapper = mountForm({ pageKey: 'page-orders', dataSourceId: 'orders', formKey: 'orders-form' })
    await flushPromises()

    await wrapper.find('.page-data-form-submit').trigger('click')
    await flushPromises()

    expect(state.elMessageSuccess).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('saved')![0][0]).toEqual({ name: '张三', age: 20, id: 'new-1' })
    wrapper.unmount()
  })

  it('提交失败（创建 API reject）：不弹成功、不 emit saved（错误由 http 拦截器 toast）', async () => {
    state.createData.mockRejectedValueOnce(new Error('网络错误'))
    const wrapper = mountForm({ pageKey: 'page-orders', dataSourceId: 'orders', formKey: 'orders-form' })
    await flushPromises()

    await wrapper.find('.page-data-form-submit').trigger('click')
    await flushPromises()

    expect(state.elMessageSuccess).not.toHaveBeenCalled()
    expect(wrapper.emitted('saved')).toBeUndefined()
    wrapper.unmount()
  })

  it('校验失败（validate=false）阻断提交', async () => {
    state.formStub.validateOk = false
    const wrapper = mountForm({ pageKey: 'page-orders', dataSourceId: 'orders', formKey: 'orders-form' })
    await flushPromises()

    await wrapper.find('.page-data-form-submit').trigger('click')
    await flushPromises()

    expect(state.createData).not.toHaveBeenCalled()
    expect(wrapper.emitted('saved')).toBeUndefined()
    wrapper.unmount()
  })

  it('designMode：提交按钮禁用，点击不产生写操作', async () => {
    const wrapper = mountForm({ pageKey: 'page-orders', dataSourceId: 'orders', formKey: 'orders-form', designMode: true })
    await flushPromises()

    const btn = wrapper.find('.page-data-form-submit')
    expect(btn.attributes('disabled')).toBeDefined()
    await btn.trigger('click')
    await flushPromises()

    expect(state.createData).not.toHaveBeenCalled()
    expect(wrapper.emitted('saved')).toBeUndefined()
    wrapper.unmount()
  })

  it('dsRefId 优先于 activeDsBindings 解析', async () => {
    const wrapper = mountForm({ pageKey: 'page-orders', dataSourceId: 'orders', dsRefId: 'direct-ref', formKey: 'orders-form' })
    await flushPromises()

    await wrapper.find('.page-data-form-submit').trigger('click')
    await flushPromises()

    expect(state.createData).toHaveBeenCalledWith('direct-ref', expect.anything())
    wrapper.unmount()
  })
})

describe('PageDataForm — edit 模式与外部联动', () => {
  beforeEach(() => {
    state.getData.mockReset()
    state.createData.mockReset()
    state.updateData.mockReset()
    state.getMetadata.mockReset()
    state.getFormDefinitionByKey.mockReset()
    state.elMessageSuccess.mockReset()
    state.formStub.formData = { name: '新名', age: 19 }
    state.formStub.validateOk = true
    state.bindings = [{ id: 'orders', refId: 'global-orders' }]
    state.getFormDefinitionByKey.mockResolvedValue({ data: { schema: FORM_KEY_SCHEMA } })
    state.getData.mockResolvedValue({ code: 0, data: { id: '7', version: 3, data: { name: '旧名', age: 18 } }, msg: '' })
    state.createData.mockResolvedValue({ code: 0, data: 'new-1', msg: '' })
    state.updateData.mockResolvedValue({ code: 0, data: null, msg: '' })
  })

  it('edit 模式按 recordId 取单条回填 initialValues，提交调用更新 API（version 乐观锁透传）', async () => {
    const wrapper = mountForm({ pageKey: 'page-orders', dataSourceId: 'orders', formKey: 'orders-form', mode: 'edit', recordId: '7' })
    await flushPromises()

    expect(state.getData).toHaveBeenCalledWith('global-orders', '7')
    const stub = wrapper.findComponent({ name: 'FormRendererStub' })
    expect(stub.props('initialValues')).toEqual(expect.objectContaining({ name: '旧名', age: 18, id: '7', version: 3 }))

    await wrapper.find('.page-data-form-submit').trigger('click')
    await flushPromises()

    expect(state.updateData).toHaveBeenCalledTimes(1)
    expect(state.updateData).toHaveBeenCalledWith('global-orders', '7', expect.objectContaining({ name: '新名', age: 19 }), 3)
    expect(state.createData).not.toHaveBeenCalled()
    expect(state.elMessageSuccess).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('saved')![0][0]).toEqual(expect.objectContaining({ name: '新名', id: '7' }))
    wrapper.unmount()
  })

  it('expose load(recordId)：create 模式外部注入记录后切换为编辑态（联动入口）', async () => {
    const wrapper = mountForm({ pageKey: 'page-orders', dataSourceId: 'orders', formKey: 'orders-form' })
    await flushPromises()

    await (wrapper.vm as any).load('9')
    await flushPromises()

    expect(state.getData).toHaveBeenCalledWith('global-orders', '9')
    // 回填单条记录
    const stub = wrapper.findComponent({ name: 'FormRendererStub' })
    expect(stub.props('initialValues')).toEqual(expect.objectContaining({ name: '旧名' }))
    // 提交走更新 API（记录 id=9）
    await wrapper.find('.page-data-form-submit').trigger('click')
    await flushPromises()
    expect(state.updateData).toHaveBeenCalledWith('global-orders', '9', expect.anything(), 3)
    wrapper.unmount()
  })

  it('props.formKey 缺省时回退 metadata.formKey 加载表单定义', async () => {
    state.getMetadata.mockResolvedValue({
      data: { writable: true, formKey: 'meta-form', columns: [{ key: 'name', label: '名称', columnType: 'VARCHAR' }] },
    })
    state.getFormDefinitionByKey.mockClear()
    const wrapper = mountForm({ pageKey: 'page-orders', dataSourceId: 'orders' })
    await flushPromises()

    expect(state.getMetadata).toHaveBeenCalledWith('global-orders')
    expect(state.getFormDefinitionByKey).toHaveBeenCalledWith('meta-form')
    expect(wrapper.findComponent({ name: 'FormRendererStub' }).exists()).toBe(true)
    wrapper.unmount()
  })

  it('submitText 与 title 渲染到界面', async () => {
    const wrapper = mountForm({ pageKey: 'page-orders', dataSourceId: 'orders', formKey: 'orders-form', title: '录入订单', submitText: '保存订单' })
    await flushPromises()

    expect(wrapper.find('.page-data-form-title').text()).toBe('录入订单')
    expect(wrapper.find('.page-data-form-submit').text()).toBe('保存订单')
    wrapper.unmount()
  })
})

describe('PageDataDetail — KV 详情', () => {
  beforeEach(() => {
    state.getData.mockReset()
    state.createData.mockReset()
    state.updateData.mockReset()
    state.getMetadata.mockReset()
    state.getFormDefinitionByKey.mockReset()
    state.elMessageSuccess.mockReset()
  })

  function mountDetail(props: Record<string, unknown> = {}) {
    return mount(PageDataDetail, {
      props: { pageKey: 'page-orders', dataSourceId: 'orders', ...props },
      global: { plugins: [ElementPlus] },
    })
  }

  it('空 record 显示 el-empty 引导文案（不渲染 descriptions）', () => {
    const wrapper = mountDetail({ columns: [{ key: 'name', label: '名称' }] })

    expect(wrapper.find('.el-empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('请在上方列表点击行查看详情')
    expect(wrapper.find('.el-descriptions').exists()).toBe(false)
    wrapper.unmount()
  })

  it('load(record) 渲染 el-descriptions KV，clear() 回空态', async () => {
    const wrapper = mountDetail({ title: '订单详情', columns: [
      { key: 'name', label: '名称' },
      { key: 'age', label: '年龄' },
    ] })
    await (wrapper.vm as any).load({ id: '7', name: '张三', age: 18 })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.el-empty').exists()).toBe(false)
    expect(wrapper.find('.page-data-detail-title').text()).toBe('订单详情')
    const labels = wrapper.findAll('.el-descriptions__label').map((c) => c.text())
    expect(labels).toEqual(['名称', '年龄'])
    const cells = wrapper.findAll('.el-descriptions__cell').map((c) => c.text())
    expect(cells.join('|')).toContain('张三')
    expect(cells.join('|')).toContain('18')

    await (wrapper.vm as any).clear()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.el-empty').exists()).toBe(true)
    expect(wrapper.find('.el-descriptions').exists()).toBe(false)
    wrapper.unmount()
  })

  it('formatter 函数生效：(value, record) 定制显示；数组值 join(", ")', async () => {
    const formatter = vi.fn((v: any) => `¥${v}`)
    const wrapper = mountDetail({ columns: [
      { key: 'price', label: '价格', formatter },
      { key: 'tags', label: '标签' },
    ] })
    await (wrapper.vm as any).load({ price: 99, tags: ['a', 'b'] })
    await wrapper.vm.$nextTick()

    const cells = wrapper.findAll('.el-descriptions__cell').map((c) => c.text())
    expect(formatter).toHaveBeenCalledWith(99, expect.objectContaining({ price: 99 }))
    expect(cells.join('|')).toContain('¥99')
    expect(cells.join('|')).toContain('a, b')
    wrapper.unmount()
  })

  it('columns 缺省时回退记录自身键生成 KV（剔除 <key>_text 内部显示列）', async () => {
    const wrapper = mountDetail()
    await (wrapper.vm as any).load({ name: '李四', dept_text: '研发部' })
    await wrapper.vm.$nextTick()

    const labels = wrapper.findAll('.el-descriptions__label').map((c) => c.text())
    expect(labels).toEqual(['name'])
    expect(wrapper.text()).toContain('李四')
    expect(wrapper.text()).not.toContain('dept_text')
    wrapper.unmount()
  })
})
