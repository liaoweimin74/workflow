/**
 * 业务数据 DTO —— 契约类型，对齐 Java 侧
 * `com.workflow.api.dto.BizDataVO` 与 `com.workflow.api.dto.BizDataPageVO`。
 *
 * 放在 common 的原因同 column-config.ts：engine（业务数据/数据源 SPI）
 * 与 api（`/api/v1/internal/system/*` 内置数据源）都要产出它。
 */

/** 单条业务数据。 */
export interface BizDataVO {
  id: string
  data: Record<string, unknown>
  version: number | null
  createdAt: Date | null
  updatedAt: Date | null
}

/**
 * 业务数据分页。
 *
 * ⚠️ 这是**第四种**分页形状（`{records,total,page,size}`）：
 *    与 PageResponse（content/pageNumber/...）、PageResult（total/page/size/rows）、
 *    裸数组都不同。别顺手「统一」成其中任何一个。
 */
export interface BizDataPageVO {
  records: BizDataVO[]
  total: number
  page: number
  size: number
}

export function bizDataVO(
  id: string,
  data: Record<string, unknown>,
  version: number | null,
  createdAt: Date | null,
  updatedAt: Date | null,
): BizDataVO {
  return { id, data, version, createdAt, updatedAt }
}

export function bizDataPageVO(
  records: BizDataVO[],
  total: number,
  page: number,
  size: number,
): BizDataPageVO {
  return { records, total, page, size }
}

// ==================== 聚合查询（仪表盘组件用，Task 119） ====================

/** 允许的聚合函数（闭集，控制器层校验后透传）。 */
export const AGGREGATE_FNS = ['count', 'sum', 'avg', 'max', 'min'] as const
export type AggregateFn = (typeof AGGREGATE_FNS)[number]

/** 允许的时间桶粒度（对维度的 DATETIME/DATE 列生效）。 */
export const TIME_GRAINS = ['day', 'week', 'month'] as const
export type TimeGrain = (typeof TIME_GRAINS)[number]

/**
 * 数据源聚合请求（`GET /api/v1/data-sources/{id}/aggregate`）。
 *
 * 与 `BizDataQueryRequest` 的关系：filter/keyword/keywordColumn 语义完全一致；
 * 分页字段被 `group/agg/metric/timeGrain/limit` 取代（聚合结果不是行集，不翻页）。
 */
export interface AggregateRequest {
  /** 分组维度列 key（白名单校验规则与 sort/filter 同源）。 */
  group: string
  /** 聚合函数，缺省 count。 */
  agg: AggregateFn
  /** 聚合指标列 key；`agg=count` 时可空，其余必填。 */
  metric: string | null
  /** 时间桶粒度；非空时 group 列必须是日期时间类型。 */
  timeGrain: TimeGrain | null
  /** 结构化/旧格式筛选 JSON（语义与 `/data` 一致）。 */
  filter: string | null
  keyword: string | null
  keywordColumn: string | null
  /** SQL 模板运行时参数 JSON（语义与 `/data` 一致；仅模板源消费）。 */
  params: string | null
  /** `key`（维度排序）或 `value`（指标排序），缺省 key。 */
  sort: string | null
  order: string | null
  /** 结果条数上限；0 = 不限制。 */
  limit: number
}

/** 聚合结果行。 */
export interface AggregateRowVO {
  key: string
  value: number
}

/**
 * 聚合结果。`total` = 分组数（rows.length），给上层判断空态用，
 * 不与行级分页的 total 混淆。
 */
export interface AggregateResultVO {
  rows: AggregateRowVO[]
  total: number
}

export function aggregateResultVO(rows: AggregateRowVO[]): AggregateResultVO {
  return { rows, total: rows.length }
}
