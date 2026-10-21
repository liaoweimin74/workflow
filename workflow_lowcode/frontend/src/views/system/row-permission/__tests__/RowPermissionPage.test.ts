// TDD: 数据权限管理页（权限对象列表 + 覆盖度 Tab 懒加载）
// npx vitest run src/views/system/row-permission/__tests__/RowPermissionPage.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import RowPermissionPage from '../RowPermissionPage.vue'

const { rowPermissionApi, dataSourceApi, getRoleList } = vi.hoisted(() => ({
  rowPermissionApi: {
    list: vi.fn(),
    get: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    coverage: vi.fn(),
    exemptions: vi.fn(),
    exempt: vi.fn(),
    revokeExemption: vi.fn(),
    columnCandidates: vi.fn(),
  },
  dataSourceApi: { getEnabledDataSources: vi.fn() },
  getRoleList: vi.fn(),
}))

vi.mock('@/api/rowPermission', () => ({ rowPermissionApi }))
vi.mock('@/api/data-source', () => ({ dataSourceApi }))
vi.mock('@/api/role', () => ({ getRoleList }))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn(), prompt: vi.fn() },
  }
})

const OBJECT = {
  id: 7,
  name: '销售本人数据',
  remark: '销售只能看自己录入的',
  conditions: [{ column: 'created_by', op: 'eq', value: '{userId}' }],
  dataSourceIds: ['ds-1'],
  grants: [
    { subjectType: 'ROLE', subjectKey: 'ROLE_CLERK' },
    { subjectType: 'ROLE', subjectKey: 'ROLE_GUEST' },
  ],
}

const UNGRANTED_OBJECT = {
  id: 8,
  name: '南方铝业',
  remark: null,
  conditions: [{ column: 'supplier', op: 'eq', value: '南方铝业' }],
  dataSourceIds: ['ds-1'],
  grants: [],
}

const mounted: any[] = []

async function mountPage() {
  rowPermissionApi.list.mockResolvedValue({ data: [OBJECT, UNGRANTED_OBJECT] })
  rowPermissionApi.coverage.mockResolvedValue({
    data: {
      sources: [
        {
          dataSourceId: 'ds-1',
          name: '订单数据源',
          type: 'FORM',
          coverage: { status: 'COVERED', permissionNames: ['销售本人数据'], exemption: null },
        },
      ],
      totalSources: 1,
      coveredSources: 1,
      noGrantSources: 0,
      exemptSources: 0,
      gapSources: 0,
    },
  })
  rowPermissionApi.exemptions.mockResolvedValue({ data: [] })
  dataSourceApi.getEnabledDataSources.mockResolvedValue({
    data: [
      { id: 'ds-1', name: '订单数据源', type: 'FORM', tenantId: 't1', status: 'ENABLED' },
      { id: 'ds-9', name: '系统用户', type: 'SYSTEM', tenantId: 't1', status: 'ENABLED' },
    ],
  })
  rowPermissionApi.columnCandidates.mockResolvedValue({ data: [] })
  getRoleList.mockResolvedValue({
    data: {
      rows: [
        { id: 2, roleCode: 'ROLE_CLERK', roleName: '职员' },
        { id: 3, roleCode: 'ROLE_GUEST', roleName: '访客' },
      ],
    },
  })

  const wrapper = mount(RowPermissionPage, { global: { plugins: [ElementPlus] } })
  mounted.push(wrapper)
  await nextTick()
  await flushPromises()
  await nextTick()
  return wrapper
}

describe('RowPermissionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  })

  it('加载对象列表并渲染条件、数据源与已授权角色', async () => {
    const wrapper = await mountPage()

    expect(rowPermissionApi.list).toHaveBeenCalled()
    expect(dataSourceApi.getEnabledDataSources).toHaveBeenCalled()
    const text = wrapper.text()
    expect(text).toContain('销售本人数据')
    expect(text).toContain('created_by = {userId}')
    expect(text).toContain('订单数据源')
    expect(text).toContain('职员')
    expect(text).toContain('访客')
    expect(text).not.toContain(' · 读')
    expect(text).toContain('已授权角色（只读）')
    // v3：未授权 = 受控但非管理员看不见，不能再说是「不收紧任何人」
    expect(text).toContain('未授权给任何角色（已关联的数据源非管理员都看不见）')
  })

  it('覆盖度 Tab 懒加载：切换后才请求盘点', async () => {
    const wrapper = await mountPage()
    expect(rowPermissionApi.coverage).not.toHaveBeenCalled()

    const tabs = wrapper.findAll('.el-tabs__item')
    expect(tabs.length).toBe(2)
    await tabs[1].trigger('click')
    await nextTick()
    await flushPromises()

    expect(rowPermissionApi.coverage).toHaveBeenCalled()
    expect(rowPermissionApi.exemptions).toHaveBeenCalled()
    expect(wrapper.text()).toContain('豁免记录（留痕，含已撤销）')
    expect(wrapper.text()).toContain('缺口')
  })

  it('刷新会同时重查覆盖度面板', async () => {
    const wrapper = await mountPage()
    const tabs = wrapper.findAll('.el-tabs__item')
    await tabs[1].trigger('click')
    await nextTick()
    await flushPromises()
    expect(rowPermissionApi.coverage).toHaveBeenCalledTimes(1)

    const refresh = wrapper.findAll('button').find((button) => button.text() === '刷新')!
    await refresh.trigger('click')
    await nextTick()
    await flushPromises()

    expect(rowPermissionApi.list).toHaveBeenCalledTimes(2)
    expect(rowPermissionApi.coverage).toHaveBeenCalledTimes(2)
  })

  it('新建按钮打开空白编辑器', async () => {
    const wrapper = await mountPage()

    await wrapper.find('[data-testid="rp-create"]').trigger('click')
    await nextTick()
    await flushPromises()

    expect(wrapper.text()).toContain('新建权限对象')
    expect((wrapper.find('[data-testid="rp-name"]').element as HTMLInputElement).value).toBe('')
  })

  it('编辑按钮打开预填编辑器并加载候选列', async () => {
    const wrapper = await mountPage()

    await wrapper.find('[data-testid="rp-edit"]').trigger('click')
    await nextTick()
    await flushPromises()

    expect(wrapper.text()).toContain('编辑权限对象 — 销售本人数据')
    expect((wrapper.find('[data-testid="rp-name"]').element as HTMLInputElement).value).toBe('销售本人数据')
    expect(rowPermissionApi.columnCandidates).toHaveBeenCalledWith(['ds-1'])
  })

  it('删除走二次确认并刷新列表', async () => {
    const { ElMessageBox } = await import('element-plus')
    ;(ElMessageBox.confirm as any).mockResolvedValue('confirm')
    rowPermissionApi.remove.mockResolvedValue({ data: null })
    const wrapper = await mountPage()

    await wrapper.find('[data-testid="rp-delete"]').trigger('click')
    await flushPromises()

    expect(rowPermissionApi.remove).toHaveBeenCalledWith(7)
    expect(rowPermissionApi.list).toHaveBeenCalledTimes(2)
  })

  it('取消删除不调接口', async () => {
    const { ElMessageBox } = await import('element-plus')
    ;(ElMessageBox.confirm as any).mockRejectedValue(new Error('cancel'))
    const wrapper = await mountPage()

    await wrapper.find('[data-testid="rp-delete"]').trigger('click')
    await flushPromises()

    expect(rowPermissionApi.remove).not.toHaveBeenCalled()
  })
})
