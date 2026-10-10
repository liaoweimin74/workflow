/**
 * 图表视图形态（Task ④）— 纯逻辑层：schema.chart 归一化 + 行数据 → ECharts 数据集映射。
 *
 * 供 ViewDesigner.vue（配置归一/缺省回填）、PageRenderer.vue（编译产物解析）、
 * PageDataChart.vue（渲染前数据映射）共用。
 *
 * 设计约束：
 * - 聚合语义复用 tableEnhance.computeAggregate（与汇总行同源）：
 *   count=非空值计数（对齐 SQL COUNT(col)）；sum/avg/max/min 剔除空值与不可转数的值；空集返回 null。
 * - 分组顺序 = 维度值在数据中的首现顺序（不按聚合值重排，保持服务端 sort 语义）；
 *   limit 截取「前 N 个维度组」（取前 N 条）。
 * - 行取值复用 rowValueOf：兼容扁平行 {...} 与 BizDataVO {id, data:{...}} 双形态。
 * - normalizeChartConfig 对畸形/手改 JSON 容错：非法值回退缺省（type=bar / limit=20 / agg=sum），
 *   保证「未配置时给合理缺省」。
 */

import { computeAggregate, rowValueOf, type AggregateFn } from './tableEnhance'

// ==================== 类型与常量 ====================

/** 图表类型闭集 */
export type ChartType = 'bar' | 'line' | 'pie'
/** 指标聚合函数闭集（复用汇总行 AggregateFn：sum/avg/count/max/min） */
export type ChartAgg = AggregateFn

/** 指标列声明：列 key + 聚合方式（缺省 sum） */
export interface ChartYField {
  key: string
  agg: ChartAgg
}

/**
 * schema.chart 配置（display='chart' 时持久化）。
 * 注意：后端 ViewCompiler.compileDisplay 会把 display 归一为 table/card（发布后 display 被覆盖），
 * 渲染端/设计器以「chart 配置对象存在性」作为 chart 形态的权威信号。
 */
export interface ViewChartConfig {
  type: ChartType
  /** 维度列（X 轴/分组依据；视图 columns 中的单选） */
  xField: string
  /** 指标列（多选，各带聚合方式） */
  yFields: ChartYField[]
  /** 取前 N 个维度组（10/20/50/100；按数据顺序截取） */
  limit: number
}

export const CHART_TYPES: ChartType[] = ['bar', 'line', 'pie']
export const CHART_AGGS: ChartAgg[] = ['sum', 'avg', 'count', 'max', 'min']
export const CHART_LIMITS = [10, 20, 50, 100]
export const DEFAULT_CHART_LIMIT = 20

// ==================== 配置归一化 ====================

/**
 * 归一化 schema.chart：缺省 type=bar / xField='' / yFields=[] / limit=20；
 * 容忍 undefined / 非对象 / 字段缺省 / 非法枚举（回退缺省值）；yFields 剔除空 key 项、补 agg 缺省 sum。
 */
export function normalizeChartConfig(raw: unknown): ViewChartConfig {
  const src = (raw !== null && typeof raw === 'object' ? raw : {}) as {
    type?: unknown
    xField?: unknown
    yFields?: unknown
    limit?: unknown
  }
  const type = CHART_TYPES.includes(src.type as ChartType) ? (src.type as ChartType) : 'bar'
  const xField = typeof src.xField === 'string' ? src.xField : ''
  const yFields: ChartYField[] = Array.isArray(src.yFields)
    ? src.yFields
        .filter((y: any) => y && typeof y.key === 'string' && y.key !== '')
        .map((y: any) => ({
          key: y.key as string,
          agg: CHART_AGGS.includes(y.agg as ChartAgg) ? (y.agg as ChartAgg) : ('sum' as ChartAgg),
        }))
    : []
  const limitNum = Number(src.limit)
  const limit = Number.isFinite(limitNum) && limitNum > 0 ? Math.floor(limitNum) : DEFAULT_CHART_LIMIT
  return { type, xField, yFields, limit }
}

// ==================== 数据映射 ====================

/** 维度显示值：null/undefined/'' → （空）；对象/数组 → JSON 文本；其余 String() */
export function dimensionLabel(value: unknown): string {
  if (value === null || value === undefined || value === '') return '（空）'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

interface DimensionGroup {
  label: string
  rows: any[]
}

/** 按维度值分组（保持首现顺序），截取前 limit 个维度组；xField 未配置返回 null */
function groupByDimension(rows: any[], xField: string, limit: number): DimensionGroup[] | null {
  if (!xField) return null
  const order: string[] = []
  const buckets = new Map<string, any[]>()
  for (const row of rows || []) {
    const label = dimensionLabel(rowValueOf(row, xField))
    let bucket = buckets.get(label)
    if (!bucket) {
      bucket = []
      buckets.set(label, bucket)
      order.push(label)
    }
    bucket.push(row)
  }
  const kept = limit > 0 ? order.slice(0, limit) : order
  return kept.map((label) => ({ label, rows: buckets.get(label)! }))
}

/** bar/line 系列声明（name 经 labelOf 映射列显示名；data 与 dimensions 下标对齐，空聚合为 null） */
export interface ChartSeriesSpec {
  key: string
  name: string
  data: Array<number | null>
}

export interface ChartDataset {
  dimensions: string[]
  series: ChartSeriesSpec[]
}

/**
 * rows → {dimensions, series}（bar/line 用）：
 * 同名维度值分组合并，每个 yField 按其 agg 聚合；维度保持首现顺序并截取前 limit 组。
 * 未配置 xField 或 yFields 时返回 null（组件给「未配置」空态）；rows 为空时返回空数据集。
 */
export function buildChartDataset(
  rows: any[],
  config: ViewChartConfig,
  labelOf?: (key: string) => string,
): ChartDataset | null {
  if (!config.yFields.length) return null
  const groups = groupByDimension(rows, config.xField, config.limit)
  if (!groups) return null
  const series: ChartSeriesSpec[] = config.yFields.map((y) => ({
    key: y.key,
    name: labelOf ? labelOf(y.key) : y.key,
    data: groups.map((g) => computeAggregate(g.rows, y.key, y.agg)),
  }))
  return { dimensions: groups.map((g) => g.label), series }
}

/** pie 数据项 */
export interface PieDatum {
  name: string
  value: number
}

/**
 * pie 退化：只取第一个 yField 聚合；聚合为 null（组内该列全空）的维度组剔除。
 * 扇区名取维度值本身（无需列名映射）；未配置 xField 或 yFields 时返回 null。
 */
export function buildPieDataset(rows: any[], config: ViewChartConfig): PieDatum[] | null {
  const first = config.yFields[0]
  if (!first) return null
  const groups = groupByDimension(rows, config.xField, config.limit)
  if (!groups) return null
  const out: PieDatum[] = []
  for (const g of groups) {
    const v = computeAggregate(g.rows, first.key, first.agg)
    if (v !== null) out.push({ name: g.label, value: v })
  }
  return out
}
