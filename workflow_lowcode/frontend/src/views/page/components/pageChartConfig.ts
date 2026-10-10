/**
 * PAGE 轨图表组件（page-chart）配置契约 — 共享类型（Task 3-e）。
 *
 * 供 PageDataChartPage.vue（渲染，props.config 消费方）与 PageChartConfigDialog.vue
 * （设计器配置弹窗，产出方）共用，避免两端结构漂移。
 *
 * 形态说明：这是设计器持久化在组件 props.config 的「PAGE 轨形态」；
 * 渲染前由 PageDataChartPage 经 chartDataset.normalizeChartConfig 归一为 VIEW 轨
 * ViewChartConfig（{type, xField, yFields, limit}）再交 PageDataChart 渲染——
 * 聚合语义复用 tableEnhance.computeAggregate（与汇总行同源口径）。
 */
import type { AggregateFn } from './tableEnhance'

/** 指标列声明：字段 key + 聚合方式（对齐汇总行 AggregateFn 闭集）+ 可选显示名（图例/系列名） */
export interface PageChartMeasure {
  /** 指标字段 key（数据源 metadata 列 key） */
  key: string
  /** 聚合方式：sum/avg/count/max/min（缺省 sum） */
  agg: AggregateFn
  /** 可选显示名（缺省回退列 label → key） */
  label?: string
}

/** 图表配置（设计器 props.config 持久化形态；字段宽松可选，渲染端归一容错） */
export interface PageChartConfig {
  /** 图表类型（缺省 bar） */
  type?: 'bar' | 'line' | 'pie'
  /** 维度列（X 轴 / 饼图分组依据；数据源 metadata 列 key） */
  dimension?: string
  /** 指标列（多选，各带聚合方式；pie 形态仅第一条生效） */
  measures?: PageChartMeasure[]
}
