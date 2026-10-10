// ----- Task 3-b: 页面设计器纯展示组件五件套（PageIframe/PageNoticeCarousel/PageCalendar/PageTimeline/PageSteps） -----
// npx vitest run src/views/page/components/__tests__/PageDisplaySet.test.ts

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PageIframe from '../PageIframe.vue'
import PageNoticeCarousel from '../PageNoticeCarousel.vue'
import PageCalendar from '../PageCalendar.vue'
import PageTimeline from '../PageTimeline.vue'
import PageSteps from '../PageSteps.vue'

/** 统一挂载（ElementPlus 全局插件即可，无外部依赖 mock） */
function mountDisplay(component: Parameters<typeof mount>[0], props: Record<string, unknown> = {}): VueWrapper {
  return mount(component, { props, global: { plugins: [ElementPlus] } })
}

describe('PageIframe — 内嵌网页（url/height/scrolling）', () => {
  it('有 url：渲染 iframe，src/sandbox 安全基线/scrolling 透传', () => {
    const wrapper = mountDisplay(PageIframe, { url: 'https://example.com/embed' })
    const iframe = wrapper.find('iframe.page-iframe-frame')
    expect(iframe.exists()).toBe(true)
    expect(iframe.attributes('src')).toBe('https://example.com/embed')
    // 安全基线：允许脚本与同源资源，未开放表单提交/弹窗/顶层跳转
    const sandbox = iframe.attributes('sandbox') || ''
    expect(sandbox).toContain('allow-scripts')
    expect(sandbox).toContain('allow-same-origin')
    expect(sandbox).not.toContain('allow-forms')
    expect(sandbox).not.toContain('allow-top-navigation')
    expect(iframe.attributes('scrolling')).toBe('yes')
    expect(wrapper.find('.el-empty').exists()).toBe(false)
    wrapper.unmount()
  })

  it('scrolling=false → scrolling="no"；height 透传容器高度', () => {
    const wrapper = mountDisplay(PageIframe, { url: 'https://example.com/embed', scrolling: false, height: '420px' })
    expect(wrapper.find('iframe').attributes('scrolling')).toBe('no')
    expect(wrapper.find('.page-iframe').attributes('style')).toContain('420px')
    wrapper.unmount()
  })

  it('空 url：el-empty 占位，不渲染 iframe', () => {
    const wrapper = mountDisplay(PageIframe, {})
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.text()).toContain('暂未配置链接地址')
    wrapper.unmount()
  })
})

describe('PageNoticeCarousel — 公告轮播（items/interval/arrow/indicatorPosition）', () => {
  // ≥3 个条目：el-carousel 对仅 2 条 + loop 会克隆节点，为避免计数受克隆影响，测试用 3 条
  const items = [
    { title: '停机公告', content: '周六 02:00-04:00 系统维护', color: '#f56c6c' },
    { title: '版本更新', content: 'v2.6 上线表单公式字段' },
    { title: '安全提醒', content: '请勿共享账号密码' },
  ]

  it('items 渲染轮播条目：title 加粗 + content 段落 + color 文本色透传', () => {
    const wrapper = mountDisplay(PageNoticeCarousel, { items })
    const carouselItems = wrapper.findAll('.el-carousel__item')
    expect(carouselItems.length).toBe(items.length)
    expect(wrapper.find('.page-notice-carousel-title').text()).toBe('停机公告')
    expect(wrapper.find('.page-notice-carousel-content').text()).toBe('周六 02:00-04:00 系统维护')
    const body = wrapper.find('.page-notice-carousel-body').element as HTMLElement
    expect(body.style.color).toMatch(/#f56c6c|rgb\(245,\s*108,\s*108\)/i)
    wrapper.unmount()
  })

  it('容器级 props 透传 el-carousel（height/interval/arrow/indicatorPosition）', () => {
    const wrapper = mountDisplay(PageNoticeCarousel, {
      items,
      height: '220px',
      interval: 1000,
      arrow: 'always',
      indicatorPosition: 'outside',
    })
    const carousel = wrapper.findComponent({ name: 'ElCarousel' })
    expect(carousel.props('height')).toBe('220px')
    expect(carousel.props('interval')).toBe(1000)
    expect(carousel.props('arrow')).toBe('always')
    expect(carousel.props('indicatorPosition')).toBe('outside')
    wrapper.unmount()
  })

  it('点击条目 emit item-click 且携带该 item', async () => {
    const wrapper = mountDisplay(PageNoticeCarousel, { items })
    await wrapper.findAll('.el-carousel__item')[1].trigger('click')
    const emitted = wrapper.emitted('item-click')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toEqual(items[1])
    wrapper.unmount()
  })

  it('空 items：el-empty 占位，不渲染轮播', () => {
    const wrapper = mountDisplay(PageNoticeCarousel, {})
    expect(wrapper.find('.el-carousel').exists()).toBe(false)
    expect(wrapper.text()).toContain('暂无公告')
    wrapper.unmount()
  })
})

describe('PageCalendar — 日历（modelValue/highlightedDates）', () => {
  it('highlightedDates 命中单元格渲染小圆点；未配置不渲染圆点', () => {
    const wrapper = mountDisplay(PageCalendar, {
      modelValue: '2026-01-02',
      highlightedDates: ['2026-01-02', '2026-01-15'],
    })
    expect(wrapper.findAll('.page-calendar-cell-dot').length).toBe(2)
    wrapper.unmount()

    const plain = mountDisplay(PageCalendar, { modelValue: '2026-01-02' })
    expect(plain.findAll('.page-calendar-cell-dot').length).toBe(0)
    plain.unmount()
  })

  it('点击单元格 emit update:modelValue（归一为 Date）', async () => {
    const wrapper = mountDisplay(PageCalendar, { modelValue: '2026-01-02' })
    // el-calendar 自有 date-table：单元格 class 为 current/prev/next（非 date-picker 的 available）
    const cell = wrapper.find('.el-calendar-table td.current .el-calendar-day')
    expect(cell.exists()).toBe(true)
    await cell.trigger('click')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toBeInstanceOf(Date)
    wrapper.unmount()
  })

  it('modelValue 兼容 Date 对象；字符串按 yyyy-MM-dd 解析定位月份', () => {
    const wrapper = mountDisplay(PageCalendar, { modelValue: new Date(2026, 0, 2) })
    expect(wrapper.find('.el-calendar').exists()).toBe(true)
    expect(wrapper.text()).toContain('2026')
    wrapper.unmount()
  })
})

describe('PageTimeline — 时间线（items/reverse）', () => {
  const items = [
    { timestamp: '2026-01-01 09:00', title: '提交申请', content: '张三提交了请假申请', color: '#f00' },
    { timestamp: '2026-01-01 10:30', title: '主管审批', content: '李四审批通过', icon: '✓' },
  ]

  it('items 渲染节点：timestamp/title/content + color 节点色透传', () => {
    const wrapper = mountDisplay(PageTimeline, { items })
    const nodes = wrapper.findAll('.el-timeline-item')
    expect(nodes.length).toBe(2)
    expect(wrapper.text()).toContain('2026-01-01 09:00')
    expect(wrapper.find('.page-timeline-item-title').text()).toBe('提交申请')
    expect(wrapper.find('.page-timeline-item-content').text()).toBe('张三提交了请假申请')
    const node = wrapper.find('.el-timeline-item__node').element as HTMLElement
    expect(node.style.backgroundColor).toMatch(/#f00|rgb\(255,\s*0,\s*0\)/i)
    wrapper.unmount()
  })

  it('icon 字符串经 dot 插槽渲染为节点图标文本', () => {
    const wrapper = mountDisplay(PageTimeline, { items })
    const dotIcon = wrapper.find('.page-timeline-item-dot-icon')
    expect(dotIcon.exists()).toBe(true)
    expect(dotIcon.text()).toContain('✓')
    wrapper.unmount()
  })

  it('reverse=true 节点倒序渲染；空 items 走 el-empty 占位', () => {
    const wrapper = mountDisplay(PageTimeline, { items, reverse: true })
    const titles = wrapper.findAll('.page-timeline-item-title')
    expect(titles[0].text()).toBe('主管审批')
    expect(titles[1].text()).toBe('提交申请')
    wrapper.unmount()

    const empty = mountDisplay(PageTimeline, {})
    expect(empty.find('.el-timeline').exists()).toBe(false)
    expect(empty.text()).toContain('暂无时间线数据')
    empty.unmount()
  })
})

describe('PageSteps — 步骤条（items/active/direction/processStatus/finishStatus）', () => {
  const items = [
    { title: '填写信息', description: '填写基础资料' },
    { title: '提交审核', description: '等待主管审核' },
    { title: '完成', description: '流程结束' },
  ]

  it('items 渲染步骤：title/description + active 进度态（is-finish/is-process）', async () => {
    const wrapper = mountDisplay(PageSteps, { items, active: 1 })
    // 步骤下标经 useOrderedChildren 异步注册，等一轮微任务后状态类才落位
    await nextTick()
    const steps = wrapper.findAll('.el-step')
    expect(steps.length).toBe(3)
    expect(wrapper.text()).toContain('填写信息')
    expect(wrapper.text()).toContain('等待主管审核')
    expect(wrapper.find('.el-step__head.is-finish').exists()).toBe(true)
    expect(wrapper.find('.el-step__head.is-process').exists()).toBe(true)
    wrapper.unmount()
  })

  it('direction/processStatus/finishStatus 透传 el-steps', () => {
    const wrapper = mountDisplay(PageSteps, {
      items,
      direction: 'vertical',
      processStatus: 'error',
      finishStatus: 'success',
    })
    expect(wrapper.find('.el-steps').classes()).toContain('el-steps--vertical')
    const elSteps = wrapper.findComponent({ name: 'ElSteps' })
    expect(elSteps.props('processStatus')).toBe('error')
    expect(elSteps.props('finishStatus')).toBe('success')
    wrapper.unmount()
  })

  it('空 items：el-empty 占位，不渲染步骤条', () => {
    const wrapper = mountDisplay(PageSteps, {})
    expect(wrapper.find('.el-steps').exists()).toBe(false)
    expect(wrapper.text()).toContain('暂无步骤数据')
    wrapper.unmount()
  })
})
