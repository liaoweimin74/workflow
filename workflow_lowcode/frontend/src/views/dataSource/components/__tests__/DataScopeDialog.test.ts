// ----- TDD: DataScopeDialog 数据范围配置弹窗 -----
// 规则列表 + 新增/编辑（主体×动作×范围类型）+ 删除 + 生效预览
// npx vitest run src/views/dataSource/components/__tests__/DataScopeDialog.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, h } from 'vue'
import ElementPlus from 'element-plus'
import DataScopeDialog from '../DataScopeDialog.vue'

vi.mock('@element-plus/icons-vue', () => ({
  Lock: { name: 'Lock', render: () => h('span', '🔒') },
}))

const { dataScopeApi, dataSourceApi, getRoleList, getOrgTree, getMemberGroupList, getUserList, getUserBatch } =
  vi.hoisted(() => ({
    dataScopeApi: {
      list: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
      effective: vi.fn(),
    },
    dataSourceApi: { getMetadata: vi.fn() },
    getRoleList: vi.fn(),
    getOrgTree: vi.fn(),
    getMemberGroupList: vi.fn(),
    getUserList: vi.fn(),
    getUserBatch: vi.fn(),
  }))

vi.mock('@/api/dataScope', () => ({ dataScopeApi }))
vi.mock('@/api/data-source', () => ({ dataSourceApi }))
vi.mock('@/api/role', () => ({ getRoleList }))
vi.mock('@/api/org', () => ({ getOrgTree }))
vi.mock('@/api/memberGroup', () => ({ getMemberGroupList }))
vi.mock('@/api/user', () => ({ getUserList, getUserBatch }))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

const DS = { id: 'ds-1', name: '订单数据源', type: 'FORM', tenantId: 't1', status: 'ENABLED' } as any

/** el-dialog 会 teleport 到 body，测试用例如不卸载会互相串文本 */
const mounted: any[] = []

function rule(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    dataSourceId: 'ds-1',
    action: 'READ',
    subjectType: 'ROLE',
    subjectKey: 'ROLE_CLERK',
    scopeType: 'SELF',
    scopeColumn: null,
    scopeValue: null,
    ...overrides,
  }
}

async function mountDialog(rules: any[] = []) {
  dataScopeApi.list.mockResolvedValue({ data: rules })
  dataScopeApi.effective.mockResolvedValue({
    data: {
      dataSourceId: 'ds-1',
      action: 'READ',
      userId: 1,
      username: 'admin',
      subjects: ['ROLE:admin', 'USER:1'],
      matchedRules: [],
      effectiveRule: null,
      unrestricted: true,
      condition: {},
    },
  })
  getRoleList.mockResolvedValue({ data: { rows: [{ id: 2, roleCode: 'ROLE_CLERK', roleName: '职员' }] } })
  getOrgTree.mockResolvedValue({ data: [] })
  getMemberGroupList.mockResolvedValue({ data: { rows: [] } })
  getUserList.mockResolvedValue({ data: { rows: [] } })
  getUserBatch.mockResolvedValue({ data: [] })
  dataSourceApi.getMetadata.mockResolvedValue({ data: { columns: [{ key: 'owner_id', label: '负责人' }] } })

  const wrapper = mount(DataScopeDialog, {
    props: { modelValue: true, dataSource: DS },
    global: { plugins: [ElementPlus] },
  })
  mounted.push(wrapper)
  // el-dialog 首帧只置 rendered，内容要等下一个 tick 才 teleport 进 body
  await nextTick()
  await flushPromises()
  await nextTick()
  return wrapper
}

function findSelect(wrapper: any, testid: string) {
  const sel = wrapper.findAllComponents({ name: 'ElSelect' }).find((c: any) => c.attributes('data-testid') === testid)
  expect(sel, `未找到 el-select[data-testid=${testid}]`).toBeDefined()
  return sel!
}

/** 同时派 update:modelValue 与 change：el-select 的 @change 是组件内部派发的，测试要自己补上 */
function setValue(wrapper: any, testid: string, value: unknown) {
  const sel = findSelect(wrapper, testid)
  sel.vm.$emit('update:modelValue', value)
  sel.vm.$emit('change', value)
}

describe('DataScopeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    mounted.splice(0).forEach((w) => w.unmount())
  })

  it('打开即拉取规则、主体候选与预览', async () => {
    const wrapper = await mountDialog([rule()])

    expect(dataScopeApi.list).toHaveBeenCalledWith('ds-1')
    expect(getRoleList).toHaveBeenCalled()
    expect(dataSourceApi.getMetadata).toHaveBeenCalledWith('ds-1')
    expect(dataScopeApi.effective).toHaveBeenCalledWith({ dataSourceId: 'ds-1', action: 'READ', userId: undefined })
    // el-dialog 默认不 append-to-body，而 mount 又是脱离文档流的，只能读 wrapper 自己的文本
    expect(wrapper.text()).toContain('角色：职员（ROLE_CLERK）')
  })

  it('CUSTOM 规则的列与值原样展示', async () => {
    const wrapper = await mountDialog([rule({ scopeType: 'CUSTOM', scopeColumn: 'owner_id', scopeValue: '{userId}' })])

    expect(wrapper.text()).toContain('owner_id = {userId}')
  })

  it('用户主体按 id 批量回查名称（候选集里没有的 id）', async () => {
    await mountDialog([rule({ subjectType: 'USER', subjectKey: '200' })])

    expect(getUserBatch).toHaveBeenCalledWith([200])
  })

  it('SELF 模式提交不携带列与值', async () => {
    const wrapper = await mountDialog()
    dataScopeApi.save.mockResolvedValue({ data: rule() })

    setValue(wrapper, 'ds-scope-subject', 'ROLE_CLERK')
    wrapper.findAllComponents({ name: 'ElRadioGroup' })[0].vm.$emit('update:modelValue', 'SELF')
    await nextTick()
    wrapper.findAll('button').find((b) => b.text().includes('新增规则'))!.trigger('click')
    await flushPromises()

    expect(dataScopeApi.save).toHaveBeenCalledWith({
      dataSourceId: 'ds-1',
      action: 'READ',
      subjectType: 'ROLE',
      subjectKey: 'ROLE_CLERK',
      scopeType: 'SELF',
      scopeColumn: null,
      scopeValue: null,
    })
  })

  it('CUSTOM 缺列或缺值时不提交', async () => {
    const { ElMessage } = await import('element-plus')
    const wrapper = await mountDialog()

    setValue(wrapper, 'ds-scope-subject', 'ROLE_CLERK')
    wrapper.findAllComponents({ name: 'ElRadioGroup' })[0].vm.$emit('update:modelValue', 'CUSTOM')
    await nextTick()
    wrapper.findAll('button').find((b) => b.text().includes('新增规则'))!.trigger('click')
    await flushPromises()

    expect(dataScopeApi.save).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalled()
  })

  it('未选主体时不提交', async () => {
    const wrapper = await mountDialog()

    wrapper.findAll('button').find((b) => b.text().includes('新增规则'))!.trigger('click')
    await flushPromises()

    expect(dataScopeApi.save).not.toHaveBeenCalled()
  })

  it('编辑态锁死动作与主体，只改范围', async () => {
    const wrapper = await mountDialog([rule({ id: 7 })])

    wrapper.findAll('button').find((b) => b.text() === '编辑')!.trigger('click')
    await nextTick()

    expect(findSelect(wrapper, 'ds-scope-action').props('disabled')).toBe(true)
    expect(findSelect(wrapper, 'ds-scope-subject-type').props('disabled')).toBe(true)
    expect(findSelect(wrapper, 'ds-scope-subject').props('disabled')).toBe(true)
  })

  it('删除规则走二次确认，确认后调 remove', async () => {
    const { ElMessageBox } = await import('element-plus')
    ;(ElMessageBox.confirm as any).mockResolvedValue('confirm')
    dataScopeApi.remove.mockResolvedValue({ data: null })
    const wrapper = await mountDialog([rule({ id: 7 })])

    wrapper.findAll('button').find((b) => b.text() === '删除')!.trigger('click')
    await flushPromises()

    expect(dataScopeApi.remove).toHaveBeenCalledWith(7)
  })

  it('取消删除时不调接口', async () => {
    const { ElMessageBox } = await import('element-plus')
    ;(ElMessageBox.confirm as any).mockRejectedValue(new Error('cancel'))
    const wrapper = await mountDialog([rule({ id: 7 })])

    wrapper.findAll('button').find((b) => b.text() === '删除')!.trigger('click')
    await flushPromises()

    expect(dataScopeApi.remove).not.toHaveBeenCalled()
  })

  it('预览：切换动作重新请求并渲染不受限结论', async () => {
    const wrapper = await mountDialog()

    setValue(wrapper, 'ds-scope-preview-action', 'WRITE')
    await flushPromises()

    expect(dataScopeApi.effective).toHaveBeenLastCalledWith({
      dataSourceId: 'ds-1',
      action: 'WRITE',
      userId: undefined,
    })
    expect(wrapper.text()).toContain('不受限（可访问全部行）')
  })

  it('预览：受限用户展示实际追加条件', async () => {
    const wrapper = await mountDialog()
    dataScopeApi.effective.mockResolvedValue({
      data: {
        dataSourceId: 'ds-1',
        action: 'READ',
        userId: 200,
        username: 'clerk01',
        subjects: ['ROLE:ROLE_CLERK', 'USER:200'],
        matchedRules: [rule()],
        effectiveRule: rule(),
        unrestricted: false,
        condition: { created_by: '200' },
      },
    })

    await wrapper.find('[data-testid="ds-scope-preview-btn"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('created_by')
    expect(wrapper.text()).toContain('命中规则 1 条')
  })
})
