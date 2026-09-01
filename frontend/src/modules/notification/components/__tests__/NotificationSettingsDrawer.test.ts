import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import NotificationSettingsDrawer from '../NotificationSettingsDrawer.vue'

// 在导入组件前 mock API
vi.mock('../../api/notification', () => ({
  getSubscriptionPreferences: vi.fn(),
  updateSubscriptionPreferences: vi.fn(),
}))

import { getSubscriptionPreferences, updateSubscriptionPreferences } from '../../api/notification'

const mockGet = vi.mocked(getSubscriptionPreferences)
const mockUpdate = vi.mocked(updateSubscriptionPreferences)

/** 挂载抽屉，stub 掉 Element Plus 组件 */
function mountDrawer() {
  return mount(NotificationSettingsDrawer, {
    props: { modelValue: false },
    global: {
      stubs: {
        'el-drawer': { template: '<div class="drawer-stub"><slot /></div>', props: ['modelValue'] },
        'el-switch': {
          template: '<button class="switch-stub" :class="{ on: modelValue }" @click="toggle"><slot /></button>',
          props: ['modelValue'],
          emits: ['update:modelValue'],
          methods: {
            toggle() {
              this.$emit('update:modelValue', !this.modelValue)
            },
          },
        },
        'el-button': {
          template: '<button class="btn-stub" @click="$emit(\'click\')"><slot /></button>',
          emits: ['click'],
        },
      },
    },
  })
}

describe('NotificationSettingsDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('打开抽屉时加载当前用户订阅偏好', async () => {
    mockGet.mockResolvedValue({
      data: [
        { channel: 'IN_APP', channelName: '站内信', subscribed: true },
        { channel: 'SMS', channelName: '短信', subscribed: false },
      ],
    })

    const wrapper = mountDrawer()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    expect(mockGet).toHaveBeenCalled()
    expect(wrapper.text()).toContain('站内信')
    expect(wrapper.text()).toContain('短信')
  })

  it('点击保存时提交全部渠道的偏好', async () => {
    mockGet.mockResolvedValue({
      data: [
        { channel: 'IN_APP', channelName: '站内信', subscribed: true },
        { channel: 'SMS', channelName: '短信', subscribed: false },
      ],
    })
    mockUpdate.mockResolvedValue({})

    const wrapper = mountDrawer()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    // 点击保存
    const saveBtn = wrapper.findAll('.btn-stub').find((b) => b.text().includes('保存'))
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(mockUpdate).toHaveBeenCalledWith([
      { channel: 'IN_APP', subscribed: true },
      { channel: 'SMS', subscribed: false },
    ])
    expect(wrapper.emitted('saved')).toBeTruthy()
    // 保存后关闭抽屉
    expect(wrapper.emitted('update:modelValue')).toContainEqual([false])
  })

  it('切换开关后保存提交新值', async () => {
    mockGet.mockResolvedValue({
      data: [{ channel: 'SMS', channelName: '短信', subscribed: true }],
    })
    mockUpdate.mockResolvedValue({})

    const wrapper = mountDrawer()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    // 点击短信开关（从 true → false）
    await wrapper.find('.switch-stub').trigger('click')
    await flushPromises()

    const saveBtn = wrapper.findAll('.btn-stub').find((b) => b.text().includes('保存'))
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(mockUpdate).toHaveBeenCalledWith([{ channel: 'SMS', subscribed: false }])
  })
})
