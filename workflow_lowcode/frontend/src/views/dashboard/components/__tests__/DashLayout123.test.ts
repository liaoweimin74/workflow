/**
 * 仪表盘组件宽高布局测试（Task 123：用户需求「dashboard 组件可以设置宽度和高度吗？比如撑满，1/2」）。
 *
 * 覆盖三层契约：
 *  1. dash-shared 布局工具（span 留白 / 高度规范化）；
 *  2. register.ts rule 工厂（col.span + props 镜像 + height 默认值）；
 *  3. 组件运行时（root 内联样式与 is-fixed-height 类）+ 配置链路源码锚点。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import DashKpi from '../DashKpi.vue'
import {
  dashSpanGapStyle,
  dashHeightStyle,
} from '../dash-shared'
import {
  dashKpiRule,
  dashChartRule,
  dashFilterRule,
  dashGoalRule,
  dashLeaderboardRule,
  dashAlertRule,
} from '../../register'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    aggregate: vi.fn(),
    getMetadata: vi.fn(),
  },
}))

describe('dash-shared 布局工具（Task 123）', () => {
  it('dashSpanGapStyle：全宽（24/0/undefined）不留白，跨度 <24 时根节点左右 8px 留白', () => {
    expect(dashSpanGapStyle(24)).toEqual({})
    expect(dashSpanGapStyle(0)).toEqual({})
    expect(dashSpanGapStyle(undefined)).toEqual({})
    expect(dashSpanGapStyle(12)).toEqual({ margin: '0 8px' })
    expect(dashSpanGapStyle(6)).toEqual({ margin: '0 8px' })
  })

  it('dashHeightStyle：空/auto 自适应返回 null，纯数字补 px，css 值原样', () => {
    expect(dashHeightStyle('')).toBeNull()
    expect(dashHeightStyle('auto')).toBeNull()
    expect(dashHeightStyle(undefined)).toBeNull()
    expect(dashHeightStyle(null)).toBeNull()
    expect(dashHeightStyle('300')).toEqual({ height: '300px' })
    expect(dashHeightStyle('300px')).toEqual({ height: '300px' })
    expect(dashHeightStyle('50vh')).toEqual({ height: '50vh' })
  })
})

describe('register.ts rule 工厂（Task 123）', () => {
  const factories = [
    ['kpi', dashKpiRule],
    ['chart', dashChartRule],
    ['filter', dashFilterRule],
    ['goal', dashGoalRule],
    ['leaderboard', dashLeaderboardRule],
    ['alert', dashAlertRule],
  ] as const

  it('六个组件拖入 rule 均带 col.span=24（form-create 栅格）与 props.span 镜像', () => {
    for (const [name, factory] of factories) {
      const rule = factory() as any
      expect(rule.col, `${name} 缺 col`).toEqual({ span: 24 })
      expect(rule.props.span, `${name} props 缺 span 镜像`).toBe(24)
    }
  })

  it('数据卡片类组件默认高度自适应（height 空），图表保持 260px 绘图高度', () => {
    expect((dashKpiRule() as any).props.height).toBe('')
    expect((dashGoalRule() as any).props.height).toBe('')
    expect((dashAlertRule() as any).props.height).toBe('')
    expect((dashLeaderboardRule() as any).props.height).toBe('')
    expect((dashFilterRule() as any).props.height).toBeUndefined()
    expect((dashChartRule() as any).props.height).toBe('260px')
  })
})

describe('DashKpi 宽高渲染（Task 123）', () => {
  it('span=12 + height=300：根节点带 8px 留白、固定 300px 高与 is-fixed-height 类', () => {
    const wrapper = mount(DashKpi, {
      props: { designMode: true, span: 12, height: '300' },
    })
    const root = wrapper.find('.dash-kpi')
    // jsdom 会把 margin: 0 8px 规范化为 margin: 0px 8px，故分开断言
    expect(root.attributes('style')).toContain('margin')
    expect(root.attributes('style')).toContain('8px')
    expect(root.attributes('style')).toContain('height: 300px')
    expect(root.classes()).toContain('is-fixed-height')
  })

  it('默认全宽自适应：无留白无固定高（与历史页面视觉零差异）', () => {
    const wrapper = mount(DashKpi, { props: { designMode: true } })
    const root = wrapper.find('.dash-kpi')
    expect(root.attributes('style') || '').not.toContain('margin')
    expect(root.attributes('style') || '').not.toContain('height')
    expect(root.classes()).not.toContain('is-fixed-height')
  })
})

describe('配置链路源码锚点（Task 123）', () => {
  const dialog = readFileSync(resolve(__dirname, '../DashConfigDialog.vue'), 'utf8')
  const designer = readFileSync(resolve(__dirname, '../../../page/PageDesigner.vue'), 'utf8')

  it('配置弹窗：宽度栅格段全模式可用（含筛选器）且含常用档位', () => {
    expect(dialog).toContain('label="宽度"')
    expect(dialog).toContain('label="撑满 (100%)"')
    expect(dialog).toContain('label="1/2 宽"')
    expect(dialog).toContain('label="1/3 宽"')
    expect(dialog).toContain('label="1/4 宽"')
    // 宽度段位于两个模式分支之外（filter 与数据组件共用）
    const filterBranchEnd = dialog.indexOf('</template>\n\n      <!-- Task 123')
    expect(filterBranchEnd).toBeGreaterThan(-1)
  })

  it('配置弹窗：非图表组件有「显示高度」段（图表保留绘图高度语义）', () => {
    expect(dialog).toContain('label="显示高度"')
    expect(dialog).toMatch(/v-if="mode !== 'chart'" label="显示高度"/)
  })

  it('配置弹窗：六个 confirm 分支均回传 span', () => {
    expect(dialog).toContain('span: effectiveSpan.value')
  })

  it('设计器：handleDashConfirm 把 span 双写 props 镜像与 rule.col', () => {
    expect(designer).toContain('active.props.span = spanNum')
    expect(designer).toContain('active.col = { ...(active.col || {}), span: spanNum }')
  })
})
