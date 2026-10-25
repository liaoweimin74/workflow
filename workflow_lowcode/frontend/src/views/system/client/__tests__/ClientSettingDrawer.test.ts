// ----- Task 7: A2 客户端设置抽屉（ClientSettingDrawer）-----
// npx vitest run src/views/system/client/__tests__/ClientSettingDrawer.test.ts
//
// 简报四钉：
//   1. 勾选 MP 未填 appid 保存 → 前端校验阻断（不调接口）；
//   2. 初始授权角色下拉请求带当前端 clientId（tasks 3.3 UI 侧）；
//   3. portal(id=1) 渠道区 WEB 开关 disabled（锁定不可停）；
//   4. 保存 payload 形状：PUT /clients/:id（defaultRoleId/defaultMemberGroupId）
//      + 变更渠道逐个 PUT /clients/:id/channels（channelType/enabled/config 快照）。

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import ClientSettingDrawer from '../ClientSettingDrawer.vue'

vi.mock('@/api/client', () => ({
  updateClient: vi.fn(),
  upsertChannel: vi.fn(),
  testChannel: vi.fn(),
  listRolesByClient: vi.fn(),
}))

vi.mock('@/api/memberGroup', () => ({
  getMemberGroupList: vi.fn(),
}))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return {
    ...actual,
    ElMessage: { ...actual.ElMessage, success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  }
})

const api = (await import('@/api/client')) as any
const { getMemberGroupList } = (await import('@/api/memberGroup')) as any
const { ElMessage } = (await import('element-plus')) as any

function clientVO(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    code: 'driver_app',
    name: '司机端',
    icon: null,
    status: 1,
    defaultRoleId: null,
    defaultMemberGroupId: null,
    channels: [
      { channelType: 'H5', enabled: 1, config: { url: 'm.example.com' } },
      { channelType: 'MP', enabled: 1, config: { appid: 'wx1', secret: '******' } },
    ],
    ...overrides,
  }
}

async function mountDrawer(client: Record<string, unknown>) {
  setActivePinia(createPinia())
  const wrapper = mount(ClientSettingDrawer, {
    props: { modelValue: true, client: client as never },
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(api.listRolesByClient as any).mockResolvedValue({
    data: { rows: [{ id: 21, clientId: 7, roleName: '司机', roleCode: 'DRIVER', status: 1 }] },
  })
  ;(getMemberGroupList as any).mockResolvedValue({ data: { rows: [{ id: 5, groupName: '司机组' }], total: 1 } })
  ;(api.updateClient as any).mockResolvedValue({ data: {} })
  ;(api.upsertChannel as any).mockResolvedValue({ data: {} })
})

describe('ClientSettingDrawer 数据装载', () => {
  it('打开时按当前端拉角色与本端成员组（角色请求带 clientId，tasks 3.3）', async () => {
    const wrapper = await mountDrawer(clientVO())
    expect(api.listRolesByClient).toHaveBeenCalledWith(7)
    expect(getMemberGroupList).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('渠道草稿覆盖 WEB/H5/APP/MP 四行，未开通渠道 enabled=0', async () => {
    const wrapper = await mountDrawer(clientVO())
    const draft = (wrapper.vm as any).channelDraft as Record<string, any>
    expect(Object.keys(draft).sort()).toEqual(['APP', 'H5', 'MP', 'WEB'])
    expect(draft.H5.enabled).toBe(1)
    expect(draft.WEB.enabled).toBe(0)
    wrapper.unmount()
  })
})

describe('ClientSettingDrawer 渠道规则', () => {
  it('portal(id=1) 的 WEB 开关 disabled（锁定不可停）', async () => {
    const wrapper = await mountDrawer(
      clientVO({ id: 1, code: 'portal', name: '平台端', channels: [{ channelType: 'WEB', enabled: 1, config: {} }] }),
    )
    const webSwitch = wrapper.find('[data-test="channel-enable-WEB"] input')
    expect(webSwitch.exists()).toBe(true)
    expect((webSwitch.element as HTMLInputElement).disabled).toBe(true)
    wrapper.unmount()
  })

  it('非 portal 端 WEB 开关可操作', async () => {
    const wrapper = await mountDrawer(clientVO())
    const webSwitch = wrapper.find('[data-test="channel-enable-WEB"] input')
    expect((webSwitch.element as HTMLInputElement).disabled).toBe(false)
    wrapper.unmount()
  })

  it('MP 勾选但 appid 为空 → 保存被前端校验阻断，不调任何写接口', async () => {
    const wrapper = await mountDrawer(clientVO({ channels: [] }))
    const draft = (wrapper.vm as any).channelDraft as Record<string, any>
    draft.MP.enabled = 1
    draft.MP.config.appid = ''
    await (wrapper.vm as any).submit()
    expect(ElMessage.warning).toHaveBeenCalled()
    expect(api.updateClient).not.toHaveBeenCalled()
    expect(api.upsertChannel).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('MP appid 空但 secret 掩码已有值仍属非法：appid 与 secret 分别校验（缺 appid 即阻断）', async () => {
    const wrapper = await mountDrawer(clientVO())
    const draft = (wrapper.vm as any).channelDraft as Record<string, any>
    draft.MP.config.appid = ' '
    await (wrapper.vm as any).submit()
    expect(api.updateClient).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('ClientSettingDrawer 保存 payload', () => {
  it('授权字段走 PUT /clients/:id；变更渠道逐个 PUT /clients/:id/channels（形状快照）', async () => {
    const wrapper = await mountDrawer(clientVO())
    const vm = wrapper.vm as any
    vm.form.defaultRoleId = 21
    vm.form.defaultMemberGroupId = 5
    // 变更 H5 的登录方式（新增渠道后不变更也算原样，不重发）
    vm.channelDraft.H5.config.loginMethods = ['SMS', 'PWD']
    await vm.submit()
    expect(api.updateClient).toHaveBeenCalledWith(7, {
      defaultRoleId: 21,
      defaultMemberGroupId: 5,
    })
    // H5：enabled + config 变更 → 重发；MP 未变更 → 不重发
    expect(api.upsertChannel).toHaveBeenCalledTimes(1)
    expect(api.upsertChannel).toHaveBeenCalledWith(7, {
      channelType: 'H5',
      enabled: 1,
      config: { url: 'm.example.com', loginMethods: ['SMS', 'PWD'] },
    })
    expect(ElMessage.success).toHaveBeenCalled()
    expect(wrapper.emitted('saved')).toHaveLength(1)
    wrapper.unmount()
  })

  it('MP 保留 secret 掩码提交（后端识别掩码=不改密文）', async () => {
    const wrapper = await mountDrawer(clientVO())
    const vm = wrapper.vm as any
    vm.channelDraft.MP.config.appid = 'wx2'
    await vm.submit()
    expect(api.upsertChannel).toHaveBeenCalledWith(7, {
      channelType: 'MP',
      enabled: 1,
      config: { appid: 'wx2', secret: '******' },
    })
    wrapper.unmount()
  })

  it('连通测试按钮调 testChannel(id, MP) 并回显结果', async () => {
    ;(api.testChannel as any).mockResolvedValue({ data: { ok: false, msg: '签名失败' } })
    const wrapper = await mountDrawer(clientVO())
    const btn = wrapper.findAll('button').find((b) => b.text().includes('连通测试'))
    expect(btn).toBeDefined()
    await btn!.trigger('click')
    await flushPromises()
    expect(api.testChannel).toHaveBeenCalledWith(7, 'MP')
    expect(ElMessage.error).toHaveBeenCalledWith('签名失败')
    wrapper.unmount()
  })
})
