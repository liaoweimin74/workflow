import { flushPromises, mount } from '@vue/test-utils'
import Vant from 'vant'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { dataSourceApi } from '@/api/data-source'
import { formApi } from '@/api/form'
import MobileDataForm from '../blocks/MobileDataForm.vue'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: { queryData: vi.fn(), getData: vi.fn(), createData: vi.fn(), updateData: vi.fn(), getMetadata: vi.fn() },
}))
vi.mock('@/api/form', () => ({
  formApi: { getFormDefinitionByKey: vi.fn() },
}))

const GLOBALS = { plugins: [Vant] }

const createData = vi.mocked(dataSourceApi.createData)
const updateData = vi.mocked(dataSourceApi.updateData)
const getData = vi.mocked(dataSourceApi.getData)

/** 业务表单 schema：input 必填 + EP-only 字段（移动=占位，validate 须剥离不锁死提交） */
function mockFormSchema(rules: unknown[]) {
  vi.mocked(formApi.getFormDefinitionByKey).mockResolvedValue({ data: { schema: JSON.stringify({ rule: rules }) } } as never)
}

const BASIC_RULES = [
  { type: 'input', field: 'name', title: '名称', validate: [{ required: true, message: '名称必填' }] },
]

async function mountForm(props: Record<string, unknown> = {}) {
  const wrapper = mount(MobileDataForm, {
    props: { pageKey: 'p1', dsRefId: 'ref-1', formKey: 'customer', ...props },
    global: GLOBALS,
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFormSchema(BASIC_RULES)
  createData.mockResolvedValue({ data: 'new-id' } as never)
})

describe('MobileDataForm（page-form 移动实现：@form-create/vant 直通）', () => {
  it('loads the form schema by formKey and renders vant fields', async () => {
    const wrapper = await mountForm()
    expect(formApi.getFormDefinitionByKey).toHaveBeenCalledWith('customer')
    // input → van-field（@form-create/vant 内置映射）
    expect(wrapper.find('input.van-field__control').exists()).toBe(true)
    expect(wrapper.text()).toContain('名称')
  })

  it('submits create payloads through the data source API and emits saved', async () => {
    const wrapper = await mountForm()
    await wrapper.find('input.van-field__control').setValue('张三')
    wrapper.find('.van-button--primary').trigger('click')
    await flushPromises()

    expect(createData).toHaveBeenCalledTimes(1)
    expect(createData.mock.calls[0][0]).toBe('ref-1')
    expect(createData.mock.calls[0][1]).toMatchObject({ name: '张三' })
    expect(wrapper.emitted('saved')?.[0]?.[0]).toMatchObject({ name: '张三', id: 'new-id' })
  })

  it('blocks submit on required validation failure (no create call)', async () => {
    const wrapper = await mountForm()
    wrapper.find('.van-button--primary').trigger('click')
    await flushPromises()
    expect(createData).not.toHaveBeenCalled()
    // form-create 校验失败 → van-field 错误文案行呈现（实测类=van-field__error-message）
    expect(wrapper.find('.van-field__error-message').exists()).toBe(true)
  })

  it('renders EP-only custom fields as placeholders without blocking submission', async () => {
    mockFormSchema([
      ...BASIC_RULES,
      { type: 'LookupPicker', field: 'user', title: '负责人', validate: [{ required: true, message: '必选' }] },
    ])
    const wrapper = await mountForm()
    // 占位可见（字段类型+理由）
    expect(wrapper.text()).toContain('LookupPicker')
    // 占位不产输入值：required 被剥离，填 name 即可提交
    await wrapper.find('input.van-field__control').setValue('张三')
    wrapper.find('.van-button--primary').trigger('click')
    await flushPromises()
    expect(createData).toHaveBeenCalledTimes(1)
  })

  it('edit mode prefills from getData and submits updateData with version', async () => {
    getData.mockResolvedValue({ data: { id: 'r1', data: { name: '旧名' }, version: 3 } } as never)
    const wrapper = await mountForm({ mode: 'edit', recordId: 'r1' })
    await flushPromises()
    expect(getData).toHaveBeenCalledWith('ref-1', 'r1')
    expect((wrapper.find('input.van-field__control').element as HTMLInputElement).value).toBe('旧名')

    await wrapper.find('input.van-field__control').setValue('新名')
    wrapper.find('.van-button--primary').trigger('click')
    await flushPromises()

    expect(updateData).toHaveBeenCalledWith('ref-1', 'r1', expect.objectContaining({ name: '新名' }), 3)
    expect(createData).not.toHaveBeenCalled()
  })

  it('design mode hides the submit button (no writes from the canvas)', async () => {
    const wrapper = await mountForm({ designMode: true })
    expect(wrapper.find('.van-button--primary').exists()).toBe(false)
  })

  it('shows a hint when no data source is bound', async () => {
    const wrapper = mount(MobileDataForm, {
      props: { pageKey: 'p1', formKey: 'customer' },
      global: GLOBALS,
    })
    await flushPromises()
    expect(wrapper.text()).toContain('请在属性面板配置数据源')
    expect(formApi.getFormDefinitionByKey).not.toHaveBeenCalled()
  })

  it('exposes load(recordId) for action-bus linkage (create → edit switch)', async () => {
    getData.mockResolvedValue({ data: { id: 'r9', data: { name: '联动值' }, version: 1 } } as never)
    const wrapper = await mountForm()
    await (wrapper.vm as unknown as { load: (id: string) => Promise<void> }).load('r9')
    await flushPromises()
    expect((wrapper.find('input.van-field__control').element as HTMLInputElement).value).toBe('联动值')
  })

  it('falls back to metadata columns when the bound source has no formKey', async () => {
    vi.mocked(formApi.getFormDefinitionByKey).mockClear()
    vi.mocked(dataSourceApi.getMetadata).mockResolvedValue({
      data: { formKey: '', columns: [{ key: 'amount', label: '金额', columnType: 'INT' }] },
    } as never)
    const wrapper = mount(MobileDataForm, {
      props: { pageKey: 'p1', dsRefId: 'ref-1' },
      global: GLOBALS,
    })
    await flushPromises()
    expect(dataSourceApi.getMetadata).toHaveBeenCalledWith('ref-1')
    expect(wrapper.text()).toContain('金额')
    expect(formApi.getFormDefinitionByKey).not.toHaveBeenCalled()
  })
})
