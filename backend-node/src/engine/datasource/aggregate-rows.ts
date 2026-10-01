/**
 * 内存聚合器（Task 119 仪表盘）。
 *
 * 三类调用方：
 *   - SYSTEM 源：行集本就在内存（systemQuery / SystemSourceQueryService）；
 *   - API 源：远端返回什么就聚合什么 —— **已聚合的行集再聚合是幂等的**
 *     （每维度一行时分组结果不变），这正是「远端本身就是聚合接口」也能走
 *     同一条端点的原因（透传 + 幂等归并，见 Task 119 方案确认记录）；
 *   - FORM config 模式（JOIN）：无单表可包，MVP 用行级取数 + 内存聚合兜底。
 *
 * 与 SQL 路径（buildAggregate / wrapAggregate）的语义必须一致：
 * count 计行数；sum/avg/max/min 对数值聚合，null/空串/非数值**跳过**
 * （SQL 的 SUM/AVG/MAX/MIN 忽略 NULL；空串在数值语境同样不可聚）。
 */

import type { AggregateRowVO, TimeGrain } from '../../common/domain/biz-data'

/** 时间桶 DATE_FORMAT 对应的 JS 侧格式化（与 SQL 模板同语义）。 */
export function bucketKey(raw: string, timeGrain: TimeGrain): string {
  if (timeGrain === 'day') {
    return raw.slice(0, 10)
  }
  if (timeGrain === 'month') {
    return raw.slice(0, 7)
  }
  // week：ISO 周（MariaDB %x-W%v：4 位年份 + 2 位周数，周一为一周起点）
  const base = new Date(`${raw.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(base.getTime())) return raw
  const target = new Date(base.getTime())
  // ISO 8601：周四所在年份为该周年份；先滚到本周周四
  const day = target.getUTCDay() === 0 ? 7 : target.getUTCDay()
  target.setUTCDate(target.getUTCDate() + (4 - day))
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export interface InMemoryAggregateOptions {
  group: string
  agg: string
  metric: string | null
  timeGrain: string | null
  sort: string | null
  order: string | null
  limit: number
}

/** 对行集做分组聚合，产出与 SQL 路径同形的 `{key, value}` 行集。 */
export function aggregateRowsInMemory(
  rows: Array<Record<string, unknown>>,
  options: InMemoryAggregateOptions,
): AggregateRowVO[] {
  const { group, agg, metric, timeGrain } = options
  const counts = new Map<string, number>()
  const numeric = new Map<string, { sum: number; max: number; min: number; n: number }>()

  for (const row of rows) {
    // 保留维度：整表聚合成单值，所有行进同一组（KPI 无分组场景）
    const rawKey = group === '__all__' ? '__all__' : row[group]
    if (rawKey === null || rawKey === undefined) continue
    const raw =
      rawKey instanceof Date ? rawKey.toISOString().replace('T', ' ').slice(0, 19) : String(rawKey)
    const key = timeGrain !== null ? bucketKey(raw, timeGrain as TimeGrain) : raw

    counts.set(key, (counts.get(key) ?? 0) + 1)
    if (agg !== 'count') {
      const value = toNumber(row[metric ?? ''])
      if (value === null) continue
      const bucket = numeric.get(key) ?? { sum: 0, max: value, min: value, n: 0 }
      bucket.sum += value
      bucket.max = Math.max(bucket.max, value)
      bucket.min = Math.min(bucket.min, value)
      bucket.n += 1
      numeric.set(key, bucket)
    }
  }

  const out: AggregateRowVO[] = []
  for (const [key, count] of counts) {
    let value: number
    if (agg === 'count') {
      value = count
    } else {
      const bucket = numeric.get(key)
      if (bucket === undefined || bucket.n === 0) {
        value = 0
      } else if (agg === 'sum') {
        value = bucket.sum
      } else if (agg === 'avg') {
        value = bucket.n === 0 ? 0 : bucket.sum / bucket.n
      } else if (agg === 'max') {
        value = bucket.max
      } else {
        value = bucket.min
      }
    }
    out.push({ key, value: round(value) })
  }

  const sortKey = options.sort === null || options.sort.trim() === '' ? 'key' : options.sort.trim().toLowerCase()
  if (sortKey !== 'key' && sortKey !== 'value') {
    throw new Error(`非法聚合排序字段: ${String(options.sort)}`)
  }
  const dir = options.order === null || options.order.trim() === '' ? 'asc' : options.order.toLowerCase()
  if (dir !== 'asc' && dir !== 'desc') {
    throw new Error(`非法排序方向: ${String(options.order)}`)
  }
  out.sort((a, b) => {
    const av = sortKey === 'key' ? a.key : a.value
    const bv = sortKey === 'key' ? b.key : b.value
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return dir === 'asc' ? cmp : -cmp
  })

  return options.limit > 0 ? out.slice(0, options.limit) : out
}

/** 数值提取：null/undefined/空串/非有限数 → null（与 SQL 忽略 NULL 的语义对齐）。 */
function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  const text = String(raw).trim()
  if (text === '') return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : 0
}

/** 结构化筛选条件（与 /data 端点的 filter JSON 同形）。 */
interface FilterCondition {
  column: string
  op?: string
  value?: unknown
}

/**
 * 内存版结构化筛选（SYSTEM / API 聚合路径用；这两类源的数据不在 SQL 层）。
 *
 * 运算符语义与 `filter-sql.ts` / `biz-data-query-builder.ts` 一致：
 * eq/ne/like/in/range/isempty/isnotempty；旧格式 `{col: value}` 等价于 eq-AND。
 * 列不存在时该条条件按「不命中」处理（源没这列 = 行集里取不到值）。
 */
export function applyInMemoryFilter(
  rows: Array<Record<string, unknown>>,
  filterJson: string | null,
): Array<Record<string, unknown>> {
  if (filterJson === null || filterJson.trim() === '') return rows
  let parsed: unknown
  try {
    parsed = JSON.parse(filterJson)
  } catch {
    throw new Error('筛选条件不是合法 JSON')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('筛选条件不是合法 JSON')
  }
  const filters = parsed as Record<string, unknown>

  const conditions = filters.conditions
  if (!Array.isArray(conditions)) {
    // 旧格式：等值 AND
    return rows.filter((row) =>
      Object.entries(filters).every(([column, value]) => String(row[column] ?? '') === String(value)),
    )
  }

  const logic = String(filters.logic ?? 'AND').toUpperCase() === 'AND' ? 'AND' : 'OR'
  const items = conditions.filter(
    (c): c is FilterCondition => c !== null && typeof c === 'object',
  )
  const test = (row: Record<string, unknown>, condition: FilterCondition): boolean => {
    const raw = row[condition.column]
    const text = raw === null || raw === undefined ? '' : String(raw)
    const op = condition.op === null || condition.op === undefined ? 'eq' : String(condition.op).toLowerCase()
    const value = condition.value
    switch (op) {
      case 'eq':
        return value !== null && value !== undefined && text === String(value)
      case 'ne':
        return !(value !== null && value !== undefined && text === String(value))
      case 'like':
        return value !== null && value !== undefined && text.includes(String(value))
      case 'in':
        return Array.isArray(value) && value.some((item) => String(item) === text)
      case 'range': {
        if (!Array.isArray(value) || value.length !== 2) return false
        const numeric = Number(text)
        if (!Number.isFinite(numeric)) return false
        return numeric >= Number(value[0]) && numeric <= Number(value[1])
      }
      case 'isempty':
        return text === ''
      case 'isnotempty':
        return text !== ''
      default:
        return false
    }
  }

  return rows.filter((row) =>
    logic === 'AND'
      ? items.every((condition) => test(row, condition))
      : items.some((condition) => test(row, condition)),
  )
}
