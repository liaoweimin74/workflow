/**
 * 图表分组组件宽高布局测试（Task 123 起于「dashboard 组件可以设置宽度和高度吗」，
 * 后续统一为：图表分组 8 个组件共用同一套宽高档位与语义）。
 *
 * 覆盖四层契约：
 *  1. dash-shared 布局工具（span 留白 / 高度规范化 / 档位归一）；
 *  2. register.ts rule 工厂（col.span + props 镜像 + height 缺省全部自适应）；
 *  3. 组件运行时（root 内联样式、is-fixed-height 类、统计图画布伸缩）；
 *  4. 配置链路源码锚点（宽高段单一来源 DashSizeFields，两种配置入口共用）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import DashKpi from '../DashKpi.vue'
import DashChart from '../DashChart.vue'
import DashFilter from '../DashFilter.vue'
import DashConfigDialog from '../DashConfigDialog.vue'
import {
  DASH_HEIGHT_OPTIONS,
  DASH_SPAN_OPTIONS,
  clampDashSpan,
  dashHeightModeOf,
  dashHeightStyle,
  dashSpanGapStyle,
  dashSpanModeOf,
  isDashFillHeight,
} from '../dash-shared'
import {
  dashKpiRule,
  dashChartRule,
  dashFilterRule,
  dashGoalRule,
  dashLeaderboardRule,
  dashAlertRule,
  dashTodoRule,
} from '../../register'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    aggregate: vi.fn(),
    getMetadata: vi.fn(),
  },
}))

describe('dash-shared 布局工具', () => {
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
    // 撑满档：就是 100% 高度，靠 dash-fill-height.css 补齐祖先链才等高
    expect(dashHeightStyle('100%')).toEqual({ height: '100%' })
  })

  it('isDashFillHeight：只有 100%（含首尾空白）算撑满，其余档位与自定义值都不算', () => {
    expect(isDashFillHeight('100%')).toBe(true)
    expect(isDashFillHeight(' 100% ')).toBe(true)
    expect(isDashFillHeight('')).toBe(false)
    expect(isDashFillHeight('auto')).toBe(false)
    expect(isDashFillHeight('260px')).toBe(false)
    expect(isDashFillHeight('50vh')).toBe(false)
    expect(isDashFillHeight(undefined)).toBe(false)
  })

  it('clampDashSpan：越界与非法值回缺省（1-24，非法 = 24）', () => {
    expect(clampDashSpan(12)).toBe(12)
    expect(clampDashSpan(30)).toBe(24)
    expect(clampDashSpan(0)).toBe(24)
    expect(clampDashSpan(undefined)).toBe(24)
    expect(clampDashSpan('abc')).toBe(24)
  })

  it('档位归一：固定档命中自身，非固定档落自定义档（不丢历史值）', () => {
    expect(dashSpanModeOf(12)).toBe(12)
    expect(dashSpanModeOf(10)).toBe(0)
    expect(dashHeightModeOf('')).toBe('')
    expect(dashHeightModeOf('260px')).toBe('260px')
    expect(dashHeightModeOf('260')).toBe('260px')
    expect(dashHeightModeOf('100%')).toBe('100%')
    expect(dashHeightModeOf('280px')).toBe('custom')
  })
})

describe('宽高档位唯一事实源', () => {
  it('高度档位含自适应与自定义，宽度档位含撑满与自定义栅格', () => {
    expect(DASH_HEIGHT_OPTIONS.map((o) => o.value)).toEqual([
      '',
      '100%',
      '120px',
      '200px',
      '260px',
      '320px',
      '420px',
      'custom',
    ])
    expect(DASH_SPAN_OPTIONS.map((o) => o.value)).toEqual([24, 16, 12, 8, 6, 0])
  })
})

describe('register.ts rule 工厂', () => {
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

  it('宽高语义统一：全部组件（含统计图与筛选器）拖入默认自适应', () => {
    for (const [name, factory] of factories) {
      expect((factory() as any).props.height, `${name} 默认高度应自适应`).toBe('')
    }
  })
})

describe('组件运行时宽高渲染', () => {
  it('DashKpi：span=12 + height=300 → 根节点 8px 留白、固定 300px 高与 is-fixed-height 类', () => {
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

  it('DashKpi：默认全宽自适应 → 无留白无固定高（与历史页面视觉零差异）', () => {
    const wrapper = mount(DashKpi, { props: { designMode: true } })
    const root = wrapper.find('.dash-kpi')
    expect(root.attributes('style') || '').not.toContain('margin')
    expect(root.attributes('style') || '').not.toContain('height')
    expect(root.classes()).not.toContain('is-fixed-height')
  })

  it('DashChart：固定显示高度时卡片定高、画布随卡片伸缩（不再用像素绘图高度）', () => {
    const wrapper = mount(DashChart, {
      props: { designMode: true, height: '320px' },
      global: { plugins: [ElementPlus] },
    })
    const root = wrapper.find('.dash-chart')
    expect(root.attributes('style')).toContain('height: 320px')
    expect(root.classes()).toContain('is-fixed-height')
    const style = wrapper.find('.dash-chart-empty').attributes('style') || ''
    expect(style).toContain('flex')
    // min-height 同含 "height" 字样，故只匹配独立的 height 属性
    expect(style).not.toMatch(/(?:^|;\s*)height:/)
  })

  it('DashChart：自适应时用缺省绘图高度（与改动前的图表观感一致）', () => {
    const wrapper = mount(DashChart, {
      props: { designMode: true },
      global: { plugins: [ElementPlus] },
    })
    const root = wrapper.find('.dash-chart')
    expect(root.attributes('style') || '').not.toContain('height')
    expect(wrapper.find('.dash-chart-empty').attributes('style')).toContain('height: 260px')
  })

  it('DashFilter：与其他图表分组组件一样接受显示高度并写入根节点', () => {
    const wrapper = mount(DashFilter, {
      props: { designMode: true, field: 'startTime', height: '200px' },
      global: { plugins: [ElementPlus] },
    })
    expect(wrapper.find('.dash-filter').attributes('style')).toContain('height: 200px')
  })
})

describe('配置链路源码锚点', () => {
  const dialog = readFileSync(resolve(__dirname, '../DashConfigDialog.vue'), 'utf8')
  const sizeFields = readFileSync(resolve(__dirname, '../DashSizeFields.vue'), 'utf8')
  const chartDialog = readFileSync(resolve(__dirname, '../../../page/components/PageChartConfigDialog.vue'), 'utf8')
  const designer = readFileSync(resolve(__dirname, '../../../page/PageDesigner.vue'), 'utf8')

  it('档位只写在 dash-shared：宽高下拉选项取自共享常量（不再各写一套）', () => {
    expect(sizeFields).toContain('DASH_SPAN_OPTIONS')
    expect(sizeFields).toContain('DASH_HEIGHT_OPTIONS')
    expect(sizeFields).toContain('label="宽度"')
    expect(sizeFields).toContain('label="显示高度"')
    expect(dialog).not.toContain('绘图高度')
    expect(dialog).not.toContain('label="宽度"')
  })

  it('仪表盘配置弹窗与数据图表配置弹窗共用同一段宽高控件', () => {
    expect(dialog).toContain('<DashSizeFields')
    expect(chartDialog).toContain('<DashSizeFields')
  })

  it('设计器：仪表盘、数据图表与数据容器都把 span 双写 props 镜像与 rule.col', () => {
    expect(designer).toContain('active.props.span = spanNum')
    expect(designer).toContain('active.col = { ...(active.col || {}), span: spanNum }')
    expect((designer.match(/active\.col = \{ \.\.\.\(active\.col \|\| \{\}\), span: spanNum \}/g) || []).length).toBe(3)
  })
})

describe('宽高段对所有模式可见', () => {
  /** el-dialog 内容 teleport 到 document.body：DOM 级断言用 document 查询（attachTo 保证树内挂载，unmount 清理） */
  function createDialog(mode: string) {
    return mount(DashConfigDialog, {
      props: {
        modelValue: true,
        mode,
        bindingProps: {},
        formDataSources: [],
        enabledDataSources: [],
      },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
  }

  afterEach(() => {
    document.body.innerHTML = ''
  })

  for (const mode of ['kpi', 'chart', 'filter', 'goal', 'leaderboard', 'alert', 'kpiTrend']) {
    it(`${mode}：弹窗含「宽度」与「显示高度」两段`, async () => {
      const wrapper = createDialog(mode)
      await flushPromises()
      const text = document.body.textContent || ''
      expect(text).toContain('宽度')
      expect(text).toContain('显示高度')
      wrapper.unmount()
    })
  }
})
