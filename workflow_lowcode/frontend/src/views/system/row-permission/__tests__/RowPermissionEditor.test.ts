// TDD: 权限对象编辑器（条件 + 关联数据源；授权只在角色管理维护）
// npx vitest run src/views/system/row-permission/__tests__/RowPermissionEditor.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import RowPermissionEditor from '../RowPermissionEditor.vue'

const { rowPermissionApi } = vi.hoisted(() => ({
  rowPermissionApi: {
    list: vi.fn(),
    get: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    columnCandidates: vi.fn(),
    coverage: vi.fn(),
    exemptions: vi.fn(),
    exempt: vi.fn(),
    revokeExemption: vi.fn(),
  },
}))

vi.mock('@/api/rowPermission', () => ({ rowPermissionApi }))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn(), prompt: vi.fn() },
  }
})

const DS = { id: 'ds-1', name: '订单数据源', type: 'FORM', tenantId: 't1', status: 'ENABLED' } as any

const mounted: any[] = []

async function mountEditor(permission: any = null) {
  rowPermissionApi.columnCandidates.mockResolvedValue({
    data: [
      { key: 'owner_id', label: '负责人' },
      { key: 'created_by', label: '创建人' },
    ],
  })
  rowPermissionApi.save.mockResolvedValue({ data: null })

  const wrapper = mount(RowPermissionEditor, {
    props: { modelValue: true, permission, dataSources: [DS] },
    global: { plugins: [ElementPlus] },
  })
  mounted.push(wrapper)
  await nextTick()
  await flushPromises()
  await nextTick()
  return wrapper
}

function setSelect(wrapper: any, testid: string, value: unknown) {
  const select = wrapper
    .findAllComponents({ name: 'ElSelect' })
    .find((c: any) => c.attributes('data-testid') === testid)
  expect(select, `未找到 el-select[data-testid=${testid}]`).toBeDefined()
  select!.vm.$emit('update:modelValue', value)
  select!.vm.$emit('change', value)
}

async function setValue(wrapper: any, value: string, testid = 'rp-condition-value') {
  await wrapper.find(`[data-testid="${testid}"]`).setValue(value)
}

/** { } 按钮弹出的变量层挂在 body（teleported），只能从 document 里取；
 *  一行里有多个弹层时（区间两端），闭着的那些只带 display:none，不能拿错 */
async function pickVariable(wrapper: any, name: string, triggerIndex = 0) {
  const triggers = wrapper.findAll('.rv-trigger')
  expect(triggers.length, '取值输入框后面要有 { } 变量按钮').toBeGreaterThan(triggerIndex)
  await triggers[triggerIndex].trigger('click')
  await nextTick()
  await flushPromises()
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(`.rv-popper [data-testid="rv-var-${name}"]`),
  )
  expect(candidates.length, `变量弹层里应能看到 {${name}}`).toBeGreaterThan(0)
  const option =
    candidates.find((item) => (item.closest('.rv-popper') as HTMLElement).style.display !== 'none') ??
    candidates[candidates.length - 1]
  option.click()
  await nextTick()
}

async function fillMinimalForm(wrapper: any) {
  await wrapper.find('[data-testid="rp-name"]').setValue('销售本人数据')
  setSelect(wrapper, 'rp-sources', ['ds-1'])
  await nextTick()
  setSelect(wrapper, 'rp-condition-column', 'owner_id')
  await setValue(wrapper, '{userId}')
  await nextTick()
}

describe('RowPermissionEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  })

  it('新建：条件 + 数据源一次性提交，载荷不含授权', async () => {
    const wrapper = await mountEditor()
    await fillMinimalForm(wrapper)

    await wrapper.find('[data-testid="rp-save"]').trigger('click')
    await flushPromises()

    expect(rowPermissionApi.save).toHaveBeenCalledWith({
      id: null,
      name: '销售本人数据',
      remark: null,
      conditions: [{ column: 'owner_id', op: 'eq', value: '{userId}' }],
      dataSourceIds: ['ds-1'],
    })
  })

  /** 候选列问后端要交集，前端不再从 metadata 自行拼并集 */
  it('列名候选来自后端交集接口', async () => {
    const wrapper = await mountEditor()
    setSelect(wrapper, 'rp-sources', ['ds-1'])
    await flushPromises()

    expect(rowPermissionApi.columnCandidates).toHaveBeenCalledWith(['ds-1'])
    const options = wrapper
      .findAllComponents({ name: 'ElOption' })
      .map((option: any) => option.props('value'))
      .filter((value: any) => typeof value === 'string')
    expect(options).toContain('owner_id')
    expect(options).toContain('created_by')
  })

  /** 关联了不可施加范围的源时后端会报错：候选退化为空，列名仍可手输 */
  it('候选加载失败不挡手输列名', async () => {
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="rp-name"]').setValue('手输列名')
    rowPermissionApi.columnCandidates.mockRejectedValueOnce(new Error('boom'))
    setSelect(wrapper, 'rp-sources', ['ds-1'])
    await nextTick()
    await flushPromises()

    setSelect(wrapper, 'rp-condition-column', 'dept_id')
    await setValue(wrapper, '{orgId}')
    await wrapper.find('[data-testid="rp-save"]').trigger('click')
    await flushPromises()

    expect(rowPermissionApi.save).toHaveBeenCalledWith(
      expect.objectContaining({ conditions: [{ column: 'dept_id', op: 'eq', value: '{orgId}' }] }),
    )
  })

  it('名称为空不提交', async () => {
    const { ElMessage } = await import('element-plus')
    const wrapper = await mountEditor()

    await wrapper.find('[data-testid="rp-save"]').trigger('click')
    await flushPromises()

    expect(rowPermissionApi.save).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith('请填写权限名称')
  })

  it('条件缺列名不提交', async () => {
    const { ElMessage } = await import('element-plus')
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="rp-name"]').setValue('缺列条件')
    setSelect(wrapper, 'rp-sources', ['ds-1'])
    await nextTick()

    await wrapper.find('[data-testid="rp-save"]').trigger('click')
    await flushPromises()

    expect(rowPermissionApi.save).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('缺少列名'))
  })

  it('集合变量配 IN 时按逗号拆成列表提交，混写其他值也照常展开', async () => {
    const wrapper = await mountEditor()
    await fillMinimalForm(wrapper)
    setSelect(wrapper, 'rp-condition-op', 'in')
    await setValue(wrapper, '3, {orgIdSubtree}')
    await nextTick()

    await wrapper.find('[data-testid="rp-save"]').trigger('click')
    await flushPromises()

    expect(rowPermissionApi.save).toHaveBeenCalledWith(
      expect.objectContaining({
        conditions: [{ column: 'owner_id', op: 'in', value: ['3', '{orgIdSubtree}'] }],
      }),
    )
  })

  it('集合变量配非 IN 运算符当场拒绝', async () => {
    const { ElMessage } = await import('element-plus')
    const wrapper = await mountEditor()
    await fillMinimalForm(wrapper)
    await setValue(wrapper, '{orgIdSubtree}')

    await wrapper.find('[data-testid="rp-save"]').trigger('click')
    await flushPromises()

    expect(rowPermissionApi.save).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('只能配合 IN'))
  })

  it('区间是两端表达式', async () => {
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="rp-name"]').setValue('金额区间')
    setSelect(wrapper, 'rp-sources', ['ds-1'])
    await nextTick()
    setSelect(wrapper, 'rp-condition-column', 'amount')
    setSelect(wrapper, 'rp-condition-op', 'range')
    await nextTick()
    await setValue(wrapper, '1', 'rp-range-start')
    await setValue(wrapper, '9', 'rp-range-end')

    await wrapper.find('[data-testid="rp-save"]').trigger('click')
    await flushPromises()

    expect(rowPermissionApi.save).toHaveBeenCalledWith(
      expect.objectContaining({ conditions: [{ column: 'amount', op: 'range', value: ['1', '9'] }] }),
    )
  })

  /** 交互照逻辑流：输入框后面的 { } 按钮弹出变量列表，点一条即把 token 写进取值 */
  it('点 { } 按钮从弹层选变量会写进取值', async () => {
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="rp-name"]').setValue('变量插入')
    setSelect(wrapper, 'rp-sources', ['ds-1'])
    await nextTick()
    setSelect(wrapper, 'rp-condition-column', 'owner_id')

    await pickVariable(wrapper, 'userId')

    expect((wrapper.find('[data-testid="rp-condition-value"]').element as HTMLInputElement).value).toBe('{userId}')
    await wrapper.find('[data-testid="rp-save"]').trigger('click')
    await flushPromises()
    expect(rowPermissionApi.save).toHaveBeenCalledWith(
      expect.objectContaining({ conditions: [{ column: 'owner_id', op: 'eq', value: '{userId}' }] }),
    )
  })

  /** IN 是逗号分隔的列表：变量追加成新的一项，不与上一项黏在一起 */
  it('IN 已有取值时变量作为新的一项追加', async () => {
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="rp-name"]').setValue('IN 追加')
    setSelect(wrapper, 'rp-sources', ['ds-1'])
    await nextTick()
    setSelect(wrapper, 'rp-condition-column', 'dept_id')
    setSelect(wrapper, 'rp-condition-op', 'in')
    await setValue(wrapper, '3')

    await pickVariable(wrapper, 'orgIdSubtree')

    expect((wrapper.find('[data-testid="rp-condition-value"]').element as HTMLInputElement).value).toBe(
      '3, {orgIdSubtree}',
    )
  })

  it('区间的两端各有 { } 按钮', async () => {
    const wrapper = await mountEditor()
    setSelect(wrapper, 'rp-sources', ['ds-1'])
    await nextTick()
    setSelect(wrapper, 'rp-condition-column', 'amount')
    setSelect(wrapper, 'rp-condition-op', 'range')
    await nextTick()

    expect(wrapper.findAll('.rv-trigger')).toHaveLength(2)
    await pickVariable(wrapper, 'userId', 1)

    expect((wrapper.find('[data-testid="rp-range-end"]').element as HTMLInputElement).value).toBe('{userId}')
  })

  it('编辑态预填条件并携带对象 id 保存', async () => {
    const wrapper = await mountEditor({
      id: 7,
      name: '本人或部门',
      remark: '备注',
      conditions: [
        { column: 'created_by', op: 'eq', value: '{userId}' },
        { column: 'dept_id', op: 'in', value: ['3', '{orgIdSubtree}'] },
      ],
      dataSourceIds: ['ds-1'],
      grants: [{ subjectType: 'ROLE', subjectKey: 'ROLE_CLERK' }],
    })

    expect((wrapper.find('[data-testid="rp-name"]').element as HTMLInputElement).value).toBe('本人或部门')
    const values = wrapper
      .findAll('[data-testid="rp-condition-value"]')
      .map((input: any) => (input.element as HTMLInputElement).value)
    expect(values).toEqual(['{userId}', '3, {orgIdSubtree}'])
    expect(wrapper.text()).toContain('当前已有 1 条角色授权')

    await wrapper.find('[data-testid="rp-save"]').trigger('click')
    await flushPromises()

    expect(rowPermissionApi.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 7,
        conditions: [
          { column: 'created_by', op: 'eq', value: '{userId}' },
          { column: 'dept_id', op: 'in', value: ['3', '{orgIdSubtree}'] },
        ],
      }),
    )
    expect(JSON.stringify((rowPermissionApi.save as any).mock.calls[0][0])).not.toContain('grants')
  })

  it('没有任何角色授权时提示关联源对非管理员不可见', async () => {
    const wrapper = await mountEditor({
      id: 7,
      name: '只关联未授权',
      remark: null,
      conditions: [{ column: 'created_by', op: 'eq', value: '{userId}' }],
      dataSourceIds: ['ds-1'],
      grants: [],
    })

    expect(wrapper.text()).toContain('当前没有任何角色授权')
    expect(wrapper.text()).toContain('非管理员都看不见')
    expect(wrapper.text()).not.toContain('不会收紧任何人')
    expect(wrapper.text()).not.toContain('添加授权')
  })

  /** v3：空条件对象合法，代表「全部行」——用于给某角色放开整源 */
  it('空条件对象可以保存（全部行）', async () => {
    const wrapper = await mountEditor({
      id: 9,
      name: '全部可见',
      remark: null,
      conditions: [],
      dataSourceIds: ['ds-1'],
      grants: [{ subjectType: 'ROLE', subjectKey: 'ROLE_ADMIN_CLERK' }],
    })

    await wrapper.find('[data-testid="rp-save"]').trigger('click')
    await flushPromises()

    expect(rowPermissionApi.save).toHaveBeenCalledWith(expect.objectContaining({ id: 9, conditions: [] }))
  })
})
