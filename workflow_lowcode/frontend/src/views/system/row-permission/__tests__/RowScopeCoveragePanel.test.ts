// TDD: 覆盖度盘点面板（v3 按源单状态：已受控 / 未授权 / 缺口 / 豁免登记 / 撤销留痕）
// npx vitest run src/views/system/row-permission/__tests__/RowScopeCoveragePanel.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import RowScopeCoveragePanel from '../RowScopeCoveragePanel.vue'

const { rowPermissionApi } = vi.hoisted(() => ({
  rowPermissionApi: {
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
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
    ElMessageBox: { confirm: vi.fn(), prompt: vi.fn() },
  }
})

const mounted: any[] = []

function exemption(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    dataSourceId: 'ds-3',
    reason: '仅管理员使用，由菜单权限兜底',
    createdBy: 'admin',
    createdAt: '2026-10-20T10:00:00',
    revokedBy: null,
    revokedAt: null,
    ...overrides,
  }
}

function coverage() {
  return {
    sources: [
      {
        dataSourceId: 'ds-1',
        name: '订单数据源',
        type: 'FORM',
        coverage: {
          status: 'COVERED',
          permissionNames: ['销售本人数据'],
          exemption: exemption({ id: 6, dataSourceId: 'ds-1' }),
        },
      },
      {
        dataSourceId: 'ds-2',
        name: '报价数据源',
        type: 'SQL',
        coverage: {
          status: 'NO_GRANT',
          permissionNames: ['南方铝业', '东方电子'],
          exemption: null,
        },
      },
      {
        dataSourceId: 'ds-3',
        name: '客户数据源',
        type: 'SQL',
        coverage: {
          status: 'EXEMPT',
          permissionNames: [],
          exemption: exemption({ id: 7 }),
        },
      },
      {
        dataSourceId: 'ds-4',
        name: '台账数据源',
        type: 'FORM',
        coverage: {
          status: 'GAP',
          permissionNames: [],
          exemption: null,
        },
      },
    ],
    totalSources: 4,
    coveredSources: 1,
    noGrantSources: 1,
    exemptSources: 1,
    gapSources: 1,
  }
}

async function mountPanel() {
  rowPermissionApi.coverage.mockResolvedValue({ data: coverage() })
  rowPermissionApi.exemptions.mockResolvedValue({
    data: [
      exemption({ id: 7 }),
      exemption({
        id: 4,
        dataSourceId: 'ds-4',
        reason: '历史接受',
        revokedBy: 'admin',
        revokedAt: '2026-10-19T09:00:00',
      }),
    ],
  })
  const wrapper = mount(RowScopeCoveragePanel, {
    props: {
      dataSourceNames: {
        'ds-1': '订单数据源',
        'ds-2': '报价数据源',
        'ds-3': '客户数据源',
        'ds-4': '台账数据源',
      },
    },
    global: { plugins: [ElementPlus] },
  })
  mounted.push(wrapper)
  await nextTick()
  await flushPromises()
  await nextTick()
  return wrapper
}

function findButton(wrapper: any, text: string) {
  return wrapper.findAll('button').find((b: any) => b.text().includes(text))
}

describe('RowScopeCoveragePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  })

  it('按源展示四种状态与汇总计数', async () => {
    const wrapper = await mountPanel()

    expect(rowPermissionApi.coverage).toHaveBeenCalled()
    expect(rowPermissionApi.exemptions).toHaveBeenCalled()
    const text = wrapper.text()
    expect(text).toContain('已受控')
    expect(text).toContain('未授权')
    expect(text).toContain('已豁免')
    expect(text).toContain('缺口')
    // 已受控的源仍回显历史豁免记录
    expect(text).toContain('仍挂着生效豁免')
    expect(text).toContain('仅管理员使用，由菜单权限兜底')
    expect(text).toContain('已撤销')
  })

  it('未授权 = 挂了对象但没人被授到，非管理员不可见', async () => {
    const wrapper = await mountPanel()

    expect(wrapper.text()).toContain('没有任何角色被授权')
    expect(wrapper.text()).toContain('非管理员看不见该源')
  })

  it('登记豁免：理由随请求提交并刷新报告', async () => {
    const { ElMessageBox } = await import('element-plus')
    ;(ElMessageBox.prompt as any).mockResolvedValue({ value: ' 该源仅管理员使用 ' })
    rowPermissionApi.exempt.mockResolvedValue({ data: exemption() })
    const wrapper = await mountPanel()

    findButton(wrapper, '登记豁免')!.trigger('click')
    await flushPromises()

    expect(ElMessageBox.prompt).toHaveBeenCalled()
    expect(rowPermissionApi.exempt).toHaveBeenCalledWith({
      dataSourceId: 'ds-4',
      reason: '该源仅管理员使用',
    })
    expect(rowPermissionApi.coverage).toHaveBeenCalledTimes(2)
  })

  it('取消豁免弹窗不调接口', async () => {
    const { ElMessageBox } = await import('element-plus')
    ;(ElMessageBox.prompt as any).mockRejectedValue(new Error('cancel'))
    const wrapper = await mountPanel()

    findButton(wrapper, '登记豁免')!.trigger('click')
    await flushPromises()

    expect(rowPermissionApi.exempt).not.toHaveBeenCalled()
  })

  it('撤销豁免走二次确认，成功后重新拉取', async () => {
    const { ElMessageBox } = await import('element-plus')
    ;(ElMessageBox.confirm as any).mockResolvedValue('confirm')
    rowPermissionApi.revokeExemption.mockResolvedValue({ data: exemption({ revokedAt: '2026-10-20T11:00:00' }) })
    const wrapper = await mountPanel()

    findButton(wrapper, '撤销豁免')!.trigger('click')
    await flushPromises()

    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(rowPermissionApi.revokeExemption).toHaveBeenCalledWith(7)
    expect(rowPermissionApi.exemptions).toHaveBeenCalledTimes(2)
  })

  it('取消撤销不调接口', async () => {
    const { ElMessageBox } = await import('element-plus')
    ;(ElMessageBox.confirm as any).mockRejectedValue(new Error('cancel'))
    const wrapper = await mountPanel()

    findButton(wrapper, '撤销豁免')!.trigger('click')
    await flushPromises()

    expect(rowPermissionApi.revokeExemption).not.toHaveBeenCalled()
  })
})
