/**
 * 仪表盘组件共享工具（Task 120）：结构化筛选合并 + setFilter 条件归一。
 *
 * setFilter 动作总线契约（升级版）：
 *   - `setFilter({ field: value })` —— 等值（Task 119 兼容）
 *   - `setFilter({ field: { op: 'range', value: [a, b] } })` —— 显式运算符（日期筛选器等）
 *   - `setFilter({ field: null })` —— 清除该字段条件
 */

export interface DashCondition {
  column: string
  op: string
  value: unknown
}

export function parseDashFilter(json: string | null | undefined): Record<string, unknown> | null {
  if (json === null || json === undefined || json.trim() === '') return null
  try {
    const parsed = JSON.parse(json)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** 基础 filter（props）+ 组件级追加条件 → 结构化 filter JSON 文本。 */
export function mergeDashFilter(
  baseFilter: Record<string, unknown> | null,
  extraConditions: DashCondition[],
  propsFilter: string | null | undefined,
): string | null {
  if (extraConditions.length === 0) return propsFilter || null
  const base: Record<string, unknown> =
    baseFilter !== null && Array.isArray((baseFilter as { conditions?: unknown }).conditions)
      ? { ...baseFilter }
      : { logic: 'AND', conditions: [...(((baseFilter as { conditions?: unknown[] })?.conditions as unknown[]) || [])] }
  const conditions = [...((base.conditions as unknown[]) || []), ...extraConditions]
  return JSON.stringify({ ...base, conditions })
}

/** 将 setFilter 入参归一为条件数组并合并进 extraConditions（原地更新）。 */
export function upsertDashConditions(
  extraConditions: DashCondition[],
  cond: Record<string, unknown>,
): void {
  for (const [column, raw] of Object.entries(cond)) {
    // 清除语义：value 为 null/undefined 时移除该字段条件
    if (raw === null || raw === undefined) {
      const idx = extraConditions.findIndex((item) => item.column === column)
      if (idx >= 0) extraConditions.splice(idx, 1)
      continue
    }
    // 显式运算符形态：{ op, value }（value 数组 = range/in）
    const isStructured =
      typeof raw === 'object' && raw !== null && !Array.isArray(raw) && 'op' in (raw as Record<string, unknown>)
    const item: DashCondition = isStructured
      ? { column, op: String((raw as { op: unknown }).op || 'eq'), value: (raw as { value: unknown }).value }
      : { column, op: 'eq', value: raw }
    const existing = extraConditions.find((c) => c.column === column)
    if (existing) Object.assign(existing, item)
    else extraConditions.push(item)
  }
}

/** 复合维度 key（后端 "a|b"）拆分。 */
export function splitCompositeKey(key: string): string[] {
  return key.split('|')
}

/**
 * 统一宽高档位（图表分组全部组件共用一套：dash-kpi / dash-chart / dash-filter /
 * dash-goal / dash-leaderboard / dash-alert / dash-kpi-trend / page-chart）。
 * 档位是唯一事实源——配置弹窗与属性面板都从这里取，避免各组件选项不一致。
 */

/** 宽度：24 栅格档位，value 0 = 自定义栅格（数字输入 1-24） */
export const DASH_SPAN_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 24, label: '撑满 (100%)' },
  { value: 16, label: '2/3 宽' },
  { value: 12, label: '1/2 宽' },
  { value: 8, label: '1/3 宽' },
  { value: 6, label: '1/4 宽' },
  { value: 0, label: '自定义栅格…' },
]

/** 显示高度：'' = 自适应（随内容伸缩），'custom' = 自定义输入，其余为 CSS 高度值 */
export const DASH_HEIGHT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '自适应' },
  { value: '120px', label: '紧凑 (120px)' },
  { value: '200px', label: '矮 (200px)' },
  { value: '260px', label: '标准 (260px)' },
  { value: '320px', label: '高 (320px)' },
  { value: '420px', label: '超高 (420px)' },
  { value: 'custom', label: '自定义…' },
]

/** 固定跨度档（不含自定义档 0） */
const SPAN_PRESETS = DASH_SPAN_OPTIONS.filter((o) => o.value !== 0).map((o) => o.value)
/** 固定高度档（不含自适应 '' 与自定义 'custom'） */
const HEIGHT_PRESETS = DASH_HEIGHT_OPTIONS
  .filter((o) => o.value !== '' && o.value !== 'custom')
  .map((o) => o.value)

export function clampDashSpan(value: unknown): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n <= 0) return 24
  return Math.min(24, Math.max(1, n))
}

/** 既有 span 回填为档位：命中固定档用该档，否则落自定义档 */
export function dashSpanModeOf(span: unknown): number {
  const n = clampDashSpan(span)
  return SPAN_PRESETS.includes(n) ? n : 0
}

/** 既有 height 回填为档位：'' / auto = 自适应；命中固定档（纯数字自动补 px）用该档；其余落自定义档保留原值 */
export function dashHeightModeOf(height: unknown): string {
  let raw = String(height ?? '').trim()
  if (!raw || raw === 'auto') return ''
  if (/^\d+$/.test(raw)) raw = `${raw}px`
  return HEIGHT_PRESETS.includes(raw) ? raw : 'custom'
}

/**
 * Task 123 宽度布局：栅格跨度 <24（并排）时组件根左右留白，避免相邻卡片贴住。
 * 用 margin 而非 padding——组件根自带内边距（卡片留白语义），不能被覆盖；
 * 全宽（24）不加，保证与历史页面视觉零差异。全屏态由组件自行跳过（铺满语义）。
 */
export function dashSpanGapStyle(span: number | undefined): Record<string, string> {
  const s = Number(span ?? 24)
  return s > 0 && s < 24 ? { margin: '0 8px' } : {}
}

/**
 * Task 123 显示高度：'' / 'auto' = 自适应（返回 null，不加内联样式）；
 * 纯数字自动补 px；其余原样（支持 '260px' / '50vh' 等 CSS 高度值）。
 */
export function dashHeightStyle(height: string | undefined | null): { height: string } | null {
  const raw = String(height ?? '').trim()
  if (!raw || raw === 'auto') return null
  return { height: /^\d+$/.test(raw) ? `${raw}px` : raw }
}
