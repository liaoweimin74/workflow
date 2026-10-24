/**
 * @lc/runtime-uni/charts：出码页图表数据集与 option 构建（Task 7.3）。
 *
 * 聚合语义与 web 同源（src/views/page/components/chartDataset.ts + tableEnhance.computeAggregate）：
 * - uniRowValueOf 兼容扁平行 {...} 与 BizDataVO {id, data:{...}} 双形态（web rowValueOf 同款）；
 * - count=非空值计数（SQL COUNT(col) 语义）；sum/avg/max/min 剔除空值与不可转数的值；
 *   avg 保留 2 位小数；组内全空 → null（bar/line 该点断线，pie 剔除该扇区）；
 * - 分组保持维度值首现顺序（不按聚合值重排，保持服务端 sort 语义），limit 截前 N 组。
 *
 * option 构造（buildUniDatasetOption 对位 PageDataChart、buildUniAggregateOption 对位 DashChart）
 * 全部为静态对象字面量（no-eval：产物运行期零解释、无 formatter 函数）；
 * 空数据/未配置返回 null，由出码模板 v-if 走空态。
 * 图表库适配（uni-echarts 按需注册）由 emit 侧注入，本模块不感知具体图表库。
 */

// ==================== Task 3.2 占位（保留：向后兼容既有 build 入口测试） ====================

export interface UniChartConfig {
  /** 维度字段（类目轴取值） */
  dimension?: string
  /** 指标字段列表（每个字段一条 series） */
  metrics?: string[]
  [key: string]: unknown
}

export interface UniChartOption {
  categories: unknown[]
  series: Array<{ name: string; data: unknown[] }>
}

export function buildChartOption(config: UniChartConfig, rows: Array<Record<string, unknown>>): UniChartOption {
  const dimension = config.dimension ?? ''
  const metrics = config.metrics ?? []
  return {
    categories: rows.map((r) => r[dimension]),
    series: metrics.map((m) => ({ name: m, data: rows.map((r) => r[m]) })),
  }
}

// ==================== Task 7.3：聚合纯函数（chartDataset 同源） ====================

/** 指标聚合函数闭集（与 web AggregateFn 同构） */
export type UniChartAgg = 'sum' | 'avg' | 'count' | 'max' | 'min'

export interface UniChartYField {
  key: string
  agg: UniChartAgg
}

/** 出码图表配置（web ViewChartConfig 同构；type 仅作语义标记，option 由 chartType 参数决定） */
export interface UniChartViewConfig {
  type?: string
  /** 维度列（X 轴/分组依据） */
  xField: string
  /** 指标列（各带聚合方式） */
  yFields: UniChartYField[]
  /** 取前 N 个维度组 */
  limit: number
}

/**
 * 行取值：兼容两种行形态（web tableEnhance.rowValueOf 同款）
 * - 扁平行（{...字段}）→ row[key]
 * - BizDataVO（{id, data:{字段...}}）→ row.data[key]
 */
export function uniRowValueOf(row: any, key: string): unknown {
  if (row === null || row === undefined) return undefined
  if (row.data !== null && row.data !== undefined && typeof row.data === 'object') return (row.data as any)[key]
  return row[key]
}

/** 浮点误差清理（0.1+0.2 → 0.3）；avg 另行保留 2 位小数（web roundFloat 同款） */
function uniRoundFloat(v: number): number {
  return Number(v.toFixed(6))
}

/**
 * 单列聚合计算（与 web computeAggregate 同源）。
 * count = 非空值计数（对齐 SQL COUNT(col) 语义）；sum/avg/max/min 忽略不可转数的值；空集返回 null。
 */
export function computeAggregateUni(rows: any[] | null | undefined, key: string, fn: UniChartAgg): number | null {
  let count = 0
  const nums: number[] = []
  for (const row of rows || []) {
    const v = uniRowValueOf(row, key)
    if (v === null || v === undefined || v === '') continue
    count += 1
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n)) nums.push(n)
  }
  switch (fn) {
    case 'count':
      return count
    case 'sum':
      // 全空 → null（LOCK 口径：bar/line 该点断线、pie 剔除该扇区；web chartDataset 文档同款声明）
      return nums.length ? uniRoundFloat(nums.reduce((a, b) => a + b, 0)) : null
    case 'avg':
      return nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null
    case 'max':
      return nums.length ? uniRoundFloat(Math.max(...nums)) : null
    case 'min':
      return nums.length ? uniRoundFloat(Math.min(...nums)) : null
    default:
      return null
  }
}

/** 维度显示值：null/undefined/'' → （空）；对象/数组 → JSON 文本；其余 String()（web dimensionLabel 同款） */
function uniDimensionLabel(value: unknown): string {
  if (value === null || value === undefined || value === '') return '（空）'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

interface UniDimensionGroup {
  label: string
  rows: any[]
}

/** 按维度值分组（保持首现顺序），截取前 limit 个维度组；xField 未配置返回 null（web groupByDimension 同款） */
function uniGroupByDimension(rows: any[], xField: string, limit: number): UniDimensionGroup[] | null {
  if (!xField) return null
  const order: string[] = []
  const buckets = new Map<string, any[]>()
  for (const row of rows || []) {
    const label = uniDimensionLabel(uniRowValueOf(row, xField))
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
export interface UniChartSeriesSpec {
  key: string
  name: string
  data: Array<number | null>
}

export interface UniChartDataset {
  dimensions: string[]
  series: UniChartSeriesSpec[]
}

/**
 * rows → {dimensions, series}（bar/line 用，web buildChartDataset 同源）：
 * 同名维度值分组合并，每个 yField 按其 agg 聚合；维度保持首现顺序并截取前 limit 组。
 * 未配置 xField 或 yFields 时返回 null；rows 为空时返回空数据集。
 */
export function buildUniChartDataset(
  rows: any[] | null | undefined,
  config: UniChartViewConfig,
  labelOf?: (key: string) => string,
): UniChartDataset | null {
  if (!config.yFields.length) return null
  const groups = uniGroupByDimension(rows || [], config.xField, config.limit)
  if (!groups) return null
  const series: UniChartSeriesSpec[] = config.yFields.map((y) => ({
    key: y.key,
    name: labelOf ? labelOf(y.key) : y.key,
    data: groups.map((g) => computeAggregateUni(g.rows, y.key, y.agg)),
  }))
  return { dimensions: groups.map((g) => g.label), series }
}

/** pie 数据项 */
export interface UniPieDatum {
  name: string
  value: number
}

/**
 * pie 退化（web buildPieDataset 同源）：只取第一个 yField 聚合；
 * 聚合为 null（组内该列全空）的维度组剔除；未配置 xField 或 yFields 时返回 null。
 */
export function buildUniPieDataset(
  rows: any[] | null | undefined,
  config: UniChartViewConfig,
): UniPieDatum[] | null {
  const first = config.yFields[0]
  if (!first) return null
  const groups = uniGroupByDimension(rows || [], config.xField, config.limit)
  if (!groups) return null
  const out: UniPieDatum[] = []
  for (const g of groups) {
    const v = computeAggregateUni(g.rows, first.key, first.agg)
    if (v !== null) out.push({ name: g.label, value: v })
  }
  return out
}

// ==================== Task 7.3：option 构造（静态字面量，no-eval） ====================

/** ECharts option（uni-echarts 直接 setOption 的静态结构；禁含函数——no-eval 断言依赖） */
export type UniEchartsOption = Record<string, unknown>

/** 归一 chartType：bar/line/pie 之外回退 bar（emit 侧已拦 unsupported 类型） */
function normalizeUniChartType(chartType: string): 'bar' | 'line' | 'pie' {
  if (chartType === 'pie') return 'pie'
  if (chartType === 'line') return 'line'
  return 'bar'
}

/**
 * 出码页（page-chart）option：rows 前端聚合 → bar/line/pie（对位 PageDataChart.buildOption 静态子集）。
 * bar/line 多系列共用 category X 轴（line 加 smooth）；pie 单系列环图只取第一个指标。
 * 空数据/未配置维度指标返回 null（模板 v-if 空态）。
 */
export function buildUniDatasetOption(
  chartType: string,
  rows: any[] | null | undefined,
  config: UniChartViewConfig,
): UniEchartsOption | null {
  const type = normalizeUniChartType(chartType)
  if (type === 'pie') {
    const data = buildUniPieDataset(rows, config)
    if (!data || !data.length) return null
    return {
      color: DASH_PALETTE,
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [{ type: 'pie', radius: ['42%', '68%'], center: ['50%', '46%'], data }],
    }
  }
  const ds = buildUniChartDataset(rows, config)
  if (!ds || !ds.dimensions.length || !ds.series.length) return null
  return {
    color: DASH_PALETTE,
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { left: 8, right: 16, top: 30, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: ds.dimensions },
    yAxis: { type: 'value' },
    series: ds.series.map((s) =>
      type === 'line'
        ? { name: s.name, type: 'line', data: s.data, smooth: true }
        : { name: s.name, type: 'bar', data: s.data },
    ),
  }
}

/**
 * 仪表盘片段（dash-chart）option：aggregate 端点 rows [{key,value}] → bar/line/pie
 * （对位 DashChart.render 静态子集；空维度 key → （空））。空 rows 返回 null（模板空态）。
 */
export function buildUniAggregateOption(
  chartType: string,
  aggRows: Array<{ key: unknown; value: unknown }> | null | undefined,
  metricName: string,
): UniEchartsOption | null {
  const rows = aggRows || []
  if (!rows.length) return null
  const type = normalizeUniChartType(chartType)
  const labels = rows.map((r) => uniDimensionLabel(r.key))
  const values = rows.map((r) => r.value)
  if (type === 'pie') {
    return {
      color: DASH_PALETTE,
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [{ type: 'pie', radius: ['42%', '68%'], center: ['50%', '46%'], data: rows.map((r, i) => ({ name: labels[i], value: values[i] })) }],
    }
  }
  return {
    color: DASH_PALETTE,
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { left: 8, right: 16, top: 30, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: labels },
    yAxis: { type: 'value' },
    series: [
      type === 'line'
        ? { name: metricName, type: 'line', data: values, smooth: true }
        : { name: metricName, type: 'bar', data: values },
    ],
  }
}

/** 出码图表色板（web useEcharts.DASH_PALETTE 同款 8 色） */
export const DASH_PALETTE = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399', '#36cfc9', '#597ef7', '#9254de']
