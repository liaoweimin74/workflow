import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MessageDetailDrawer from '../MessageDetailDrawer.vue'

// 在导入组件前 mock API
vi.mock('../../api/notification', () => ({
  getNotification: vi.fn(),
  markAsRead: vi.fn(),
}))

import { getNotification, markAsRead } from '../../api/notification'

const mockGet = vi.mocked(getNotification)
const mockMarkRead = vi.mocked(markAsRead)

/** 挂载抽屉，stub 掉 Element Plus 组件 */
function mountDrawer() {
  return mount(MessageDetailDrawer, {
    props: { modelValue: false, messageId: null },
    global: {
      stubs: {
        'el-drawer': { template: '<div class="drawer-stub"><slot /></div>', props: ['modelValue'] },
        'el-descriptions': { template: '<div><slot /></div>' },
        'el-descriptions-item': { template: '<span class="desc-item"><slot /></span>' },
        'el-divider': { template: '<div class="divider-stub" />' },
        'el-link': { template: '<a><slot /></a>' },
        'el-icon': { template: '<span><slot /></span>' },
      },
    },
  })
}

describe('MessageDetailDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('打开未读消息抽屉：拉取详情、自动标记已读并触发 read 事件', async () => {
    mockGet.mockResolvedValue({
      data: { id: 1, status: 'PENDING', title: '未读消息', content: { text: '内容' } },
    })
    mockMarkRead.mockResolvedValue({})

    const wrapper = mountDrawer()
    await wrapper.setProps({ modelValue: true, messageId: 1 })
    await flushPromises()

    expect(mockGet).toHaveBeenCalledWith(1)
    expect(mockMarkRead).toHaveBeenCalledWith(1)
    expect(wrapper.emitted('read')).toBeTruthy()
    // 抽屉内详情状态更新为已读
    expect(wrapper.text()).toContain('已读')
  })

  it('打开已读消息抽屉：不调用 markAsRead、不触发 read 事件', async () => {
    mockGet.mockResolvedValue({
      data: { id: 2, status: 'SENT', title: '已读消息' },
    })

    const wrapper = mountDrawer()
    await wrapper.setProps({ modelValue: true, messageId: 2 })
    await flushPromises()

    expect(mockMarkRead).not.toHaveBeenCalled()
    expect(wrapper.emitted('read')).toBeFalsy()
  })

  it('切换消息时按新 messageId 重新加载', async () => {
    mockGet.mockResolvedValue({ data: { id: 1, status: 'SENT', title: '消息一' } })
    const wrapper = mountDrawer()
    await wrapper.setProps({ modelValue: true, messageId: 1 })
    await flushPromises()
    // 详情已加载（SENT 状态渲染为"已读"）
    expect(wrapper.text()).toContain('已读')

    mockGet.mockResolvedValue({ data: { id: 2, status: 'SENT', title: '消息二' } })
    await wrapper.setProps({ modelValue: true, messageId: 2 })
    await flushPromises()
    expect(mockGet).toHaveBeenLastCalledWith(2)
  })

  it('contentType=MARKDOWN 时正文按 Markdown 渲染为富文本', async () => {
    mockGet.mockResolvedValue({
      data: {
        id: 3,
        status: 'SENT',
        title: 'Markdown 消息',
        contentType: 'MARKDOWN',
        content: { text: '# 审批通过\n\n您的**请假申请**已通过。' },
      },
    })
    const wrapper = mountDrawer()
    await wrapper.setProps({ modelValue: true, messageId: 3 })
    await flushPromises()

    const md = wrapper.find('.detail-body--md')
    expect(md.exists()).toBe(true)
    // markdown-it 将 # 标题与 **加粗** 渲染为对应 HTML 标签
    expect(md.html()).toContain('<h1>')
    expect(md.html()).toContain('<strong>请假申请</strong>')
    // 纯文本 <pre> 分支不应出现
    expect(wrapper.find('pre.detail-body').exists()).toBe(false)
  })

  it('contentType=TEXT 或无 contentType 时正文按纯文本 pre 展示', async () => {
    mockGet.mockResolvedValue({
      data: { id: 4, status: 'SENT', title: '纯文本消息', contentType: 'TEXT', content: { text: '纯文本正文' } },
    })
    const wrapper = mountDrawer()
    await wrapper.setProps({ modelValue: true, messageId: 4 })
    await flushPromises()

    expect(wrapper.find('pre.detail-body').exists()).toBe(true)
    expect(wrapper.find('.detail-body--md').exists()).toBe(false)
    expect(wrapper.find('pre.detail-body').text()).toContain('纯文本正文')
  })
})
