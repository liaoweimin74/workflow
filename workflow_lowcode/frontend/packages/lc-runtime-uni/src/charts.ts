/**
 * @lc/runtime-uni/charts：出码页图表 option 构建（Task 3.2 占位）。
 *
 * 把语料 rows 按维度/指标归整为 { categories, series } 的图表无关结构；
 * 真实图表库适配（uCharts / echarts-for-uni 的 option 映射）在 Task 7.3
 * 复用本入口时扩展，emit 侧不感知具体图表库。
 */

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
