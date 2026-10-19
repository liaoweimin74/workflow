/**
 * dash-notice（公告栏）单测。
 *
 * 与数据源驱动的 dash 成员不同：公告不配 dataSourceId，数据直接来自用户端消息接口
 * （GET /v1/notifications?messageType=PUBLIC）。可见范围是硬约束——该接口的用户身份
 * 取自后端 SecurityContext，组件一个身份参数都不传，因此任何看页面的人只会看到
 * 「发给自己的公告」；一旦 props 里出现身份槽位，就等于把别人的公告也翻出来了。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const listMock = vi.fn()
const markReadMock = vi.fn()

vi.mock('@/modules/notification/api/notification', () => ({
  getNotifications: (p: any) => listMock(p),
  getNotification: vi.fn(),
  markAsRead: (id: number) => markReadMock(id),
}))

import DashNotice from '../DashNotice.vue'
import { dashNoticeRule } from '../../register'

function noticeRes(total: number, rows: any[] = []) {
  return { code: 0, data: { total, page: 1, size: 20, rows } }
}

const ROW = {
  id: 11,
  templateCode: 'ANNOUNCEMENT',
  title: '系统升级通知',
  content: { text: '本周六 22:00 停机升级', variables: {} },
  contentType: 'MARKDOWN',
  category: 'SYSTEM',
  messageType: 'PUBLIC',
  priority: 'NORMAL',
  readStatus: 'PENDING',
  createdAt: '2026-10-18T09:00:00.000+08:00',
}

/** el-dialog/el-carousel 用桩替掉：真实实现走 teleport + 定时器，断言只需要插槽内容 */
const globalStubs = {
  stubs: {
    'el-dialog': { template: '<div class="dialog-stub"><slot /></div>', props: ['modelValue', 'title'] },
    'el-carousel': { template: '<div class="carousel-stub"><slot /></div>', props: ['height', 'interval'] },
    'el-carousel-item': { template: '<div class="carousel-item-stub"><slot /></div>' },
    'el-empty': { template: '<div class="empty-stub"><slot /></div>', props: ['description'] },
  },
}

async function mountNotice(props: Record<string, any> = {}) {
  const wrapper = mount(DashNotice, { props, global: globalStubs })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  listMock.mockReset().mockResolvedValue(noticeRes(4, [ROW]))
  markReadMock.mockReset().mockResolvedValue({})
})

describe('dashNoticeRule：拖入契约', () => {
  it('类型 dash-notice，默认 props 齐备', () => {
    const rule = dashNoticeRule() as any
    expect(rule.type).toBe('dash-notice')
    expect(String(rule.field)).toMatch(/^notice/)
    expect(rule.props).toMatchObject({
      title: '',
      limit: 6,
      display: 'list',
      interval: 4000,
      span: 24,
      height: '',
    })
  })

  it('没有 dataSourceId / agg：公告不走页面数据源，也不接收聚合配置', () => {
    const rule = dashNoticeRule() as any
    expect(rule.props.dataSourceId).toBeUndefined()
    expect(rule.props.agg).toBeUndefined()
  })

  it('契约里没有身份槽位：谁能看到公告由后端登录态决定，不可配置', () => {
    const rule = dashNoticeRule() as any
    for (const forbidden of ['userId', 'assignee', 'receiverId', 'senderId', 'username']) {
      expect(rule.props, `props 不应出现 ${forbidden}`).not.toHaveProperty(forbidden)
    }
  })
})

describe('DashNotice 取数', () => {
  it('只查 PUBLIC 消息，且请求里没有任何身份参数', async () => {
    await mountNotice({ limit: 5 })
    expect(listMock).toHaveBeenCalledTimes(1)
    const params = listMock.mock.calls[0][0]
    expect(params).toMatchObject({ messageType: 'PUBLIC', page: 1, size: 5 })
    for (const forbidden of ['userId', 'assignee', 'receiverId', 'senderId']) {
      expect(params, `请求不应携带 ${forbidden}`).not.toHaveProperty(forbidden)
    }
  })

  it('计数徽标取 total，不是本页行数', async () => {
    const wrapper = await mountNotice({ limit: 2 })
    expect(listMock.mock.calls[0][0].size).toBe(2)
    expect(wrapper.find('.dash-notice-count').text()).toContain('4')
    expect(wrapper.findAll('.dash-notice-item')).toHaveLength(1)
  })

  it('接口失败不抛错，落到空态', async () => {
    listMock.mockRejectedValue(new Error('boom'))
    const wrapper = await mountNotice()
    expect(wrapper.find('.dash-notice-empty').exists()).toBe(true)
  })

  it('零条公告显示空态文案', async () => {
    listMock.mockResolvedValue(noticeRes(0, []))
    const wrapper = await mountNotice()
    expect(wrapper.find('.dash-notice-empty').text()).toContain('暂无公告')
  })

  it('limit 变更会重新取数（条数是接口参数，不是前端截断）', async () => {
    const wrapper = await mountNotice({ limit: 6 })
    listMock.mockClear()
    await wrapper.setProps({ limit: 3 })
    await flushPromises()
    expect(listMock).toHaveBeenCalledTimes(1)
    expect(listMock.mock.calls[0][0].size).toBe(3)
  })
})

describe('DashNotice 行渲染', () => {
  it('行内展示标题与发布时间，未读带标记', async () => {
    const wrapper = await mountNotice()
    const item = wrapper.find('.dash-notice-item')
    expect(item.find('.dash-notice-item-title').text()).toBe('系统升级通知')
    expect(item.find('.dash-notice-item-meta').text()).toContain('2026-10-18 09:00')
    expect(item.find('.dash-notice-tag-unread').exists()).toBe(true)
  })

  it('后端时间是 ISO 串，展示转空格分隔且只到分钟', async () => {
    const wrapper = await mountNotice()
    const meta = wrapper.find('.dash-notice-item-meta').text()
    expect(meta).not.toContain('T09:00')
    expect(meta).not.toContain('+08:00')
  })

  it('已读公告不带未读标记', async () => {
    listMock.mockResolvedValue(noticeRes(1, [{ ...ROW, readStatus: 'SENT' }]))
    const wrapper = await mountNotice()
    expect(wrapper.find('.dash-notice-tag-unread').exists()).toBe(false)
  })

  it('标题缺失的行不至于渲染成空壳（退回正文摘要）', async () => {
    listMock.mockResolvedValue(noticeRes(1, [{ ...ROW, title: '', content: { text: '只有正文' } }]))
    const wrapper = await mountNotice()
    expect(wrapper.find('.dash-notice-item-title').text()).toContain('只有正文')
  })

  it('轮播形态用 el-carousel 渲染，条目仍可点击', async () => {
    const wrapper = await mountNotice({ display: 'carousel', interval: 3000, height: '180px' })
    expect(wrapper.find('.carousel-stub').exists()).toBe(true)
    expect(wrapper.findAll('.carousel-item-stub')).toHaveLength(1)
    expect(wrapper.find('.dash-notice-list').exists()).toBe(false)
  })
})

describe('DashNotice 详情与已读', () => {
  it('点行开详情：正文按 Markdown 渲染，原始 HTML 不被放行', async () => {
    listMock.mockResolvedValue(
      noticeRes(1, [{ ...ROW, readStatus: 'SENT', content: { text: '## 停机安排\n\n<img src=x onerror=alert(1)>' } }]),
    )
    const wrapper = await mountNotice()
    await wrapper.find('.dash-notice-item').trigger('click')
    await flushPromises()
    const body = wrapper.find('.dash-notice-detail-body')
    expect(body.exists()).toBe(true)
    expect(body.html()).toContain('<h2>')
    // MarkdownIt 以 html:false 构造：正文里的标签必须被转义成文本
    expect(body.html()).not.toContain('<img')
  })

  it('contentType=TEXT 的正文按纯文本展示，不当 Markdown 解析', async () => {
    listMock.mockResolvedValue(
      noticeRes(1, [{ ...ROW, readStatus: 'SENT', contentType: 'TEXT', content: { text: '# 这不是标题' } }]),
    )
    const wrapper = await mountNotice()
    await wrapper.find('.dash-notice-item').trigger('click')
    await flushPromises()
    const body = wrapper.find('.dash-notice-detail-body')
    expect(body.text()).toContain('# 这不是标题')
    expect(body.html()).not.toContain('<h1>')
  })

  it('打开未读公告即标记已读，行内未读点同步消失', async () => {
    const wrapper = await mountNotice()
    await wrapper.find('.dash-notice-item').trigger('click')
    await flushPromises()
    expect(markReadMock).toHaveBeenCalledWith(11)
    expect(wrapper.find('.dash-notice-tag-unread').exists()).toBe(false)
  })

  it('已读公告不再重复调用标记接口', async () => {
    listMock.mockResolvedValue(noticeRes(1, [{ ...ROW, readStatus: 'SENT' }]))
    const wrapper = await mountNotice()
    await wrapper.find('.dash-notice-item').trigger('click')
    await flushPromises()
    expect(markReadMock).not.toHaveBeenCalled()
  })

  it('详情直接用列表行数据，不再发第二次请求', async () => {
    const { getNotification } = await import('@/modules/notification/api/notification')
    const wrapper = await mountNotice()
    await wrapper.find('.dash-notice-item').trigger('click')
    await flushPromises()
    expect(getNotification).not.toHaveBeenCalled()
  })

  it('设计态点行不开详情（画布上不该弹层）', async () => {
    const wrapper = await mountNotice({ designMode: true })
    await wrapper.find('.dash-notice-item').trigger('click')
    await flushPromises()
    expect(wrapper.find('.dash-notice-detail-body').exists()).toBe(false)
    expect(markReadMock).not.toHaveBeenCalled()
  })
})

describe('DashNotice 接筛选器广播', () => {
  /** 广播载荷形状与 PageRendererPage.broadcastDashFilter 一致：{ 字段: { op, value } } */
  async function mountWithBroadcast(cond: Record<string, any>) {
    const wrapper = await mountNotice()
    listMock.mockClear()
    ;(wrapper.vm as any).setFilter(cond)
    await flushPromises()
    return wrapper
  }

  it('range 条件落到 start / end，用后端要的「年-月-日 时:分:秒」空格格式', async () => {
    // /v1/notifications 的时间参数是 @DateTimeFormat(pattern="yyyy-MM-dd HH:mm:ss")，
    // 与任务接口相反：那里只认 ISO，这里带 T 反而解析失败
    await mountWithBroadcast({ createdAt: { op: 'range', value: ['2026-10-01 00:00:00', '2026-10-08 23:59:59'] } })
    expect(listMock.mock.calls[0][0]).toMatchObject({
      start: '2026-10-01 00:00:00',
      end: '2026-10-08 23:59:59',
    })
  })

  it('纯日期补全时刻：起始 00:00:00、截止 23:59:59（别把截止当天整日漏掉）', async () => {
    await mountWithBroadcast({ createdAt: { op: 'range', value: ['2026-10-01', '2026-10-08'] } })
    expect(listMock.mock.calls[0][0]).toMatchObject({
      start: '2026-10-01 00:00:00',
      end: '2026-10-08 23:59:59',
    })
  })

  it('ISO / 缺秒的值统一规整成空格格式，认不出的形状原样透传', async () => {
    await mountWithBroadcast({ createdAt: { op: 'range', value: ['2026-10-01T08:30:00', '上周'] } })
    expect(listMock.mock.calls[0][0]).toMatchObject({ start: '2026-10-01 08:30:00', end: '上周' })
  })

  it('range 不认广播里的字段名：公告时间轴只有发布时间一条', async () => {
    await mountWithBroadcast({ anyDate: { op: 'range', value: ['2026-10-01', '2026-10-02'] } })
    expect(listMock.mock.calls[0][0]).toMatchObject({ start: '2026-10-01 00:00:00', end: '2026-10-02 23:59:59' })
  })

  it('标题类条件映射到 keyword（接口只支持标题模糊）', async () => {
    await mountWithBroadcast({ title: { op: 'like', value: '升级' } })
    expect(listMock.mock.calls[0][0]).toMatchObject({ keyword: '升级' })
  })

  it('表达不了的条件被忽略，不污染请求参数', async () => {
    await mountWithBroadcast({ priority: { op: 'eq', value: 'HIGH' } })
    expect(listMock.mock.calls[0][0]).not.toHaveProperty('priority')
    expect(listMock.mock.calls[0][0]).not.toHaveProperty('keyword')
  })

  it('null 清除同字段条件后重查', async () => {
    const wrapper = await mountNotice()
    const vm = wrapper.vm as any
    vm.setFilter({ createdAt: { op: 'range', value: ['2026-10-01', '2026-10-08'] } })
    await flushPromises()
    listMock.mockClear()
    vm.setFilter({ createdAt: null })
    await flushPromises()
    expect(listMock.mock.calls[0][0]).not.toHaveProperty('start')
    wrapper.unmount()
  })

  it('refresh 清掉广播条件并重查', async () => {
    const wrapper = await mountNotice()
    const vm = wrapper.vm as any
    vm.setFilter({ title: { op: 'eq', value: '升级' } })
    await flushPromises()
    listMock.mockClear()
    vm.refresh()
    await flushPromises()
    expect(listMock.mock.calls[0][0]).not.toHaveProperty('keyword')
    wrapper.unmount()
  })
})

describe('DashNotice 实例上报与布局', () => {
  it('ready 上报 setFilter / refresh（筛选器广播与动作总线刷新靠它）', async () => {
    const wrapper = await mountNotice()
    const emitted = wrapper.emitted('ready') as any[]
    expect(emitted).toBeTruthy()
    expect(typeof emitted[0][0].setFilter).toBe('function')
    expect(typeof emitted[0][0].refresh).toBe('function')
  })

  it('span <24 时卡片左右留白，全宽不加（与仪表盘其他组件同规则）', async () => {
    const wide = await mountNotice({ span: 12 })
    expect(wide.find('.dash-notice').attributes('style') || '').toContain('margin')
    const full = await mountNotice({ span: 24 })
    expect(full.find('.dash-notice').attributes('style') || '').not.toContain('margin')
  })
})
