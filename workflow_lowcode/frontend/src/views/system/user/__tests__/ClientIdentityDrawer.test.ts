// ----- J5b: A4 端身份抽屉（ClientIdentityDrawer）-----
// npx vitest run src/views/system/user/__tests__/ClientIdentityDrawer.test.ts
//
// 钉六件事（spec client-login-identity「A4 端身份 Tab」+ J5a 端点契约）：
//   1. 打开抽屉按 userId 拉端身份列表；
//   2. 空列表出「暂无端身份」文案（不报错）；
//   3. 解绑：确认 → POST unbind(100,7) → 重新拉列表；取消 → 不调写接口；
//   4. 吊销：确认 → POST revoke(100,21)；已吊销设备显示标签、无吊销按钮；
//   5. 绑定码：issueBindCode({userId:100, clientId:7}) 并回显 code 一次性全文；
//   6. openid 掩码原样展示（服务端已掩码，前端不二次处理）。

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ClientIdentityDrawer from '../ClientIdentityDrawer.vue'

vi.mock('@/api/clientIdentity', () => ({
  listClientIdentities: vi.fn(),
  adminUnbindClient: vi.fn(),
  revokeDevice: vi.fn(),
  issueBindCode: vi.fn(),
}))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return {
    ...actual,
    ElMessage: { ...actual.ElMessage, success: vi.fn(), warning: vi.fn(), error: vi.fn() },
    ElMessageBox: { ...actual.ElMessageBox, confirm: vi.fn().mockResolvedValue('confirm') },
  }
})

const api = (await import('@/api/clientIdentity')) as any
const { ElMessage, ElMessageBox } = (await import('element-plus')) as any

const USER = { id: 100, username: 'zhangsan', nickname: '张三' }

function identityRow(overrides: Record<string, unknown> = {}) {
  return {
    clientId: 7,
    clientName: '司机端',
    clientCode: 'mp-driver',
    openidMasked: 'o7ab****ef99',
    boundAt: '2026-10-01T08:00:00',
    devices: [
      { id: 21, platform: 'ios', deviceTokenMasked: 'abcd****klmn', revoked: 0, lastLoginAt: '2026-10-20T09:00:00' },
    ],
    ...overrides,
  }
}

async function mountDrawer(rows: unknown[]) {
  ;(api.listClientIdentities as any).mockResolvedValue({ data: rows })
  const wrapper = mount(ClientIdentityDrawer, {
    props: { modelValue: true, user: USER as never },
    global: {
      plugins: [ElementPlus],
      directives: { permission: { mounted() {} } },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(ElMessageBox.confirm as any).mockResolvedValue('confirm')
  ;(api.adminUnbindClient as any).mockResolvedValue({ data: null })
  ;(api.revokeDevice as any).mockResolvedValue({ data: null })
  ;(api.issueBindCode as any).mockResolvedValue({ data: { code: '8F3K2A', expiresAt: '2026-10-26T12:00:00' } })
})

describe('ClientIdentityDrawer 数据装载', () => {
  it('打开时按 userId 拉端身份列表', async () => {
    const wrapper = await mountDrawer([identityRow()])
    expect(api.listClientIdentities).toHaveBeenCalledWith(100)
    // 服务端掩码原样展示，不做二次处理
    expect(wrapper.text()).toContain('o7ab****ef99')
    wrapper.unmount()
  })

  it('空列表渲染「暂无端身份」文案', async () => {
    const wrapper = await mountDrawer([])
    expect(wrapper.text()).toContain('暂无端身份')
    wrapper.unmount()
  })
})

describe('ClientIdentityDrawer 解绑', () => {
  it('确认后调 unbind(100,7) 并重新拉列表', async () => {
    const wrapper = await mountDrawer([identityRow()])
    api.listClientIdentities.mockClear()
    await wrapper.find('[data-test="unbind-7"]').trigger('click')
    await flushPromises()
    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(api.adminUnbindClient).toHaveBeenCalledWith(100, 7)
    expect(api.listClientIdentities).toHaveBeenCalledTimes(1)
    expect(ElMessage.success).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('取消确认弹窗 → 不调写接口', async () => {
    const wrapper = await mountDrawer([identityRow()])
    ;(ElMessageBox.confirm as any).mockRejectedValueOnce(new Error('cancel'))
    await wrapper.find('[data-test="unbind-7"]').trigger('click')
    await flushPromises()
    expect(api.adminUnbindClient).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('未绑 openid 的端不出解绑按钮', async () => {
    const wrapper = await mountDrawer([identityRow({ openidMasked: null, boundAt: null })])
    expect(wrapper.find('[data-test="unbind-7"]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('ClientIdentityDrawer 设备吊销', () => {
  it('确认后调 revoke(100,21)', async () => {
    const wrapper = await mountDrawer([identityRow()])
    await wrapper.find('[data-test="revoke-21"]').trigger('click')
    await flushPromises()
    expect(api.revokeDevice).toHaveBeenCalledWith(100, 21)
    expect(ElMessage.success).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('已吊销设备显示「已吊销」标签且无吊销按钮', async () => {
    const wrapper = await mountDrawer([
      identityRow({ devices: [{ id: 22, platform: 'android', deviceTokenMasked: '****', revoked: 1, lastLoginAt: null }] }),
    ])
    expect(wrapper.text()).toContain('已吊销')
    expect(wrapper.find('[data-test="revoke-22"]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('ClientIdentityDrawer 绑定码', () => {
  it('签发后回显 code 全文（一次性凭证仅展示一次）', async () => {
    const wrapper = await mountDrawer([identityRow()])
    await wrapper.find('[data-test="bindcode-7"]').trigger('click')
    await flushPromises()
    expect(api.issueBindCode).toHaveBeenCalledWith({ userId: 100, clientId: 7 })
    expect(wrapper.find('[data-test="bindcode-value-7"]').text()).toBe('8F3K2A')
    wrapper.unmount()
  })
})
