/**
 * 环比指标卡 DashKpiTrend 单测（Task 3-h）。
 *
 * 覆盖：
 *   - 纯函数层：环比计算（正/负/零/上期为 0 除零保护）、窗口条件、百分比文案
 *   - 组件层：自取数两次聚合（当前期窗口 vs 上期窗口）、升降配色方案、数据下发模式、设计态不取数
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DashKpiTrend from '../DashKpiTrend.vue'
import { computeComparePercent, formatComparePercent, compareSpanMs, periodRangeCondition } from '../kpiTrendShared'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    aggregate: vi.fn(),
  },
}))

vi.mock('@/utils/formDsBindingsStore', () => ({
  activeDsBindings: { value: [] },
}))

import { dataSourceApi } from '@/api/data-source'

function aggResult(value: number) {
  return { code: 0, data: { rows: [{ key: '__all__', value }], total: 1 } }
}

beforeEach(() => {
  ;(dataSourceApi.aggregate as any).mockReset()
})

describe('computeComparePercent（环比计算）', () => {
  it('正增长：120 vs 100 → +20%', () => {
    expect(computeComparePercent(120, 100)).toBeCloseTo(20)
    expect(formatComparePercent(computeComparePercent(120, 100))).toBe('+20%')
  })

  it('负增长：80 vs 100 → -20%', () => {
    expect(computeComparePercent(80, 100)).toBeCloseTo(-20)
    expect(formatComparePercent(computeComparePercent(80, 100))).toBe('-20%')
  })

  it('零变化：100 vs 100 → 0（含 0 vs 0 的零/零口径）', () => {
    expect(computeComparePercent(100, 100)).toBe(0)
    expect(computeComparePercent(0, 0)).toBe(0)
    expect(formatComparePercent(0)).toBe('0%')
  })

  it('上期为 0 除零保护：50 vs 0 → null（不展示）；任一期缺失 → null', () => {
    expect(computeComparePercent(50, 0)).toBeNull()
    expect(computeComparePercent(0, 0)).toBe(0)
    expect(computeComparePercent(null, 100)).toBeNull()
    expect(computeComparePercent(100, null)).toBeNull()
  })

  it('formatComparePercent 小数舍入（1 位）', () => {
    expect(formatComparePercent(12.55)).toBe('+12.6%')
    expect(formatComparePercent(-3.21)).toBe('-3.2%')
  })
})

describe('periodRangeCondition（窗口口径）', () => {
  it('当前期窗口 [now-span, now)，上期窗口再平移一期', () => {
    const now = new Date('2025-06-15T12:00:00Z').getTime()
    const cur = periodRangeCondition('created_at', 'month', 'current', now)
    const prev = periodRangeCondition('created_at', 'month', 'previous', now)
    expect(cur?.column).toBe('created_at')
    expect(cur?.op).toBe('range')
    expect(prev?.op).toBe('range')
    // 上期窗口终点 = 当前期窗口起点（compareOffset 平移）
    expect(prev?.value?.[1]).toBe(cur?.value?.[0])
    // month 窗口 = 30 天
    const span = compareSpanMs('month')
    expect(new Date(String(prev?.value?.[0]).replace(' ', 'T') + 'Z').getTime()).toBe(now - 2 * span)
    expect(new Date(String(cur?.value?.[1]).replace(' ', 'T') + 'Z').getTime()).toBe(now)
  })

  it('timeField 为空 → 返回 null（不设窗）', () => {
    expect(periodRangeCondition('', 'day', 'current')).toBeNull()
    expect(periodRangeCondition(null, 'day', 'previous')).toBeNull()
  })
})

describe('DashKpiTrend 自取数', () => {
  it('两次聚合取数：主值 + 上期值 + 环比 +20% 上升箭头（默认 up-good 配色）', async () => {
    ;(dataSourceApi.aggregate as any)
      .mockResolvedValueOnce(aggResult(120)) // 第 1 次：当前期窗口
      .mockResolvedValueOnce(aggResult(100)) // 第 2 次：上期窗口

    const wrapper = mount(DashKpiTrend, {
      props: { title: '新增订单', unit: '单', dsRefId: 'ds-x', trendField: 'created_at', compareOffset: 'day' },
    })
    await flushPromises()

    expect((dataSourceApi.aggregate as any).mock.calls.length).toBe(2)
    const [curCall, prevCall] = (dataSourceApi.aggregate as any).mock.calls
    expect(curCall[1].group).toBe('__all__')
    expect(JSON.parse(curCall[1].filter).conditions[0].op).toBe('range')
    expect(JSON.parse(prevCall[1].filter).conditions[0].op).toBe('range')

    expect(wrapper.find('.dash-kpi-trend-title').text()).toBe('新增订单')
    expect(wrapper.find('.dash-kpi-trend-value').text()).toBe('120')
    expect(wrapper.find('.dash-kpi-trend-prev-value').text()).toBe('100')
    expect(wrapper.find('.dash-kpi-trend-compare-value').text()).toBe('+20%')
    // 上升箭头（up svg）+ up-good 默认配色（good=成功色）
    expect(wrapper.find('.dash-kpi-trend-compare').classes()).toContain('good')
    expect(wrapper.find('.dash-kpi-trend-compare svg').exists()).toBe(true)
    wrapper.unmount()
  })

  it('负增长 → 下降箭头；down-good 方案（升红降绿）下负增长呈 good 配色', async () => {
    ;(dataSourceApi.aggregate as any).mockResolvedValueOnce(aggResult(80)).mockResolvedValueOnce(aggResult(100))
    const wrapper = mount(DashKpiTrend, {
      props: { dsRefId: 'ds-x', trendField: 'created_at', trendColorScheme: 'down-good' },
    })
    await flushPromises()
    expect(wrapper.find('.dash-kpi-trend-compare-value').text()).toBe('-20%')
    expect(wrapper.find('.dash-kpi-trend-compare').classes()).toContain('good')
    wrapper.unmount()

    // 同样数据在默认 up-good 下是 bad（危险色）
    ;(dataSourceApi.aggregate as any).mockReset()
    ;(dataSourceApi.aggregate as any).mockResolvedValueOnce(aggResult(80)).mockResolvedValueOnce(aggResult(100))
    const wrapper2 = mount(DashKpiTrend, { props: { dsRefId: 'ds-x', trendField: 'created_at' } })
    await flushPromises()
    expect(wrapper2.find('.dash-kpi-trend-compare').classes()).toContain('bad')
    wrapper2.unmount()
  })

  it('无 trendField → 不设窗只取一次全量主值，环比不可算（--）', async () => {
    ;(dataSourceApi.aggregate as any).mockResolvedValueOnce(aggResult(88))
    const wrapper = mount(DashKpiTrend, { props: { dsRefId: 'ds-x' } })
    await flushPromises()
    expect((dataSourceApi.aggregate as any).mock.calls.length).toBe(1)
    expect((dataSourceApi.aggregate as any).mock.calls[0][1].filter).toBeNull()
    expect(wrapper.find('.dash-kpi-trend-value').text()).toBe('88')
    expect(wrapper.find('.dash-kpi-trend-compare-value').text()).toBe('--')
    expect(wrapper.find('.dash-kpi-trend-compare').classes()).toContain('flat')
    wrapper.unmount()
  })

  it('数据下发模式（current/previous props）：不取数直接计算展示', async () => {
    const wrapper = mount(DashKpiTrend, {
      props: { compareLabel: '周环比', current: 66, previous: 120 },
    })
    await flushPromises()
    expect((dataSourceApi.aggregate as any).mock.calls.length).toBe(0)
    expect(wrapper.find('.dash-kpi-trend-value').text()).toBe('66')
    expect(wrapper.find('.dash-kpi-trend-prev-value').text()).toBe('120')
    expect(wrapper.find('.dash-kpi-trend-compare-label').text()).toBe('周环比')
    expect(wrapper.find('.dash-kpi-trend-compare-value').text()).toBe('-45%')
    expect(wrapper.find('.dash-kpi-trend-compare').classes()).toContain('bad')
    wrapper.unmount()
  })

  it('设计态（designMode）不取数 + 未绑数据源显示引导', async () => {
    const wrapper = mount(DashKpiTrend, { props: { designMode: true } })
    await flushPromises()
    expect((dataSourceApi.aggregate as any).mock.calls.length).toBe(0)
    expect(wrapper.find('.dash-kpi-trend-placeholder').text()).toBe('未绑定数据源')
    wrapper.unmount()
  })
})
