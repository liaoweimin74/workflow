/**
 * 环比指标卡（DashKpiTrend）纯函数层（Task 3-h）。
 *
 * 与 dash-shared.ts 同层职责：只放无副作用的计算函数，便于单测与主组件复用。
 * 区间口径与 DashKpi.grainMs 对齐：day=1 天 / week=7 天 / month=30 天（自然月
 * 不做日历切分，保持与 DashKpi 趋势区间同一套算法，避免同页两种口径）。
 */
import type { DashCondition } from './dash-shared'

/** 环比窗口粒度：day（近 24h vs 前 24h）/ week（近 7 天 vs 前 7 天）/ month（近 30 天 vs 前 30 天） */
export type KpiCompareOffset = 'day' | 'week' | 'month'

/** 趋势配色方案：up-good=上升用成功色（与 DashKpi 家族默认一致）；down-good=上升用警示色（升红降绿，适合成本/故障类指标） */
export type KpiTrendColorScheme = 'up-good' | 'down-good'

/** 粒度对应毫秒数（环比窗口长度，与 DashKpi.grainMs 同口径） */
export function compareSpanMs(offset: string | undefined | null): number {
  if (offset === 'week') return 7 * 86400000
  if (offset === 'month') return 30 * 86400000
  return 86400000
}

/** 时间戳 → 'yyyy-MM-dd HH:mm:ss'（与 DashKpi.prevRangeCondition 的 fmt 同款，UTC ISO 截断） */
export function formatWindowTime(ts: number): string {
  return new Date(ts).toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * 计算某期窗口的时间过滤条件（op='range'，左闭右开 [起, 止)）。
 * - period='current'：[now - span, now)
 * - period='previous'：[now - 2·span, now - span)（compareOffset 平移一期）
 * field 为空返回 null（调用方跳过区间过滤）。
 */
export function periodRangeCondition(
  field: string | undefined | null,
  offset: string | undefined | null,
  period: 'current' | 'previous',
  now: number = Date.now(),
): DashCondition | null {
  if (!field) return null
  const span = compareSpanMs(offset)
  const currentStart = now - span
  const start = period === 'current' ? currentStart : currentStart - span
  const end = period === 'current' ? now : currentStart
  return { column: field, op: 'range', value: [formatWindowTime(start), formatWindowTime(end)] }
}

/**
 * 环比百分比：(cur - prev) / prev × 100。
 * - 任一期为 null（未取到/未启用）→ null（不展示环比）
 * - prev=0 除零保护：cur 同为 0 → 0（持平）；cur>0 → null（新增量无基数，无法计算环比）
 */
export function computeComparePercent(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null) return null
  if (prev === 0) return cur === 0 ? 0 : null
  return ((cur - prev) / prev) * 100
}

/** 环比文案：绝对值四舍五入 1 位小数（带符号） */
export function formatComparePercent(percent: number | null): string {
  if (percent === null) return ''
  const rounded = Math.round(Math.abs(percent) * 10) / 10
  return `${percent > 0 ? '+' : percent < 0 ? '-' : ''}${rounded}%`
}
