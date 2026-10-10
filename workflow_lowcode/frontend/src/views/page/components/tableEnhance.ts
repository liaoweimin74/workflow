/**
 * 数据视图表格增强 — 纯逻辑层（Task ⑤：汇总行 + 表头筛选 + 批量操作）
 *
 * 供 PageDataTable.vue（PAGE 运行态/设计态）与 PageRenderer.vue（VIEW 运行态）共用：
 * - 汇总行：computeAggregate / buildSummaryValues / buildSummaryMethod（el-table summary-method 工厂）
 * - 表头筛选：headerFilterKindOf（列 → 筛选形态） / buildHeaderFilterCondition（→ 服务端结构化 filter 条件）
 *   / extractDistinctValues（当前页数据 → 文本多选候选）
 * - 行取值：rowValueOf 兼容两种行形态（扁平 {...data,id} / BizDataVO {id,data:{...}}）
 *
 * 设计约束：
 * - 未配置（schema 无对应字段）时全部函数返回空/false → 渲染器行为与现状一致（零回归）
 * - 筛选运算符对齐后端 BizDataQueryBuilder 结构化 filter 闭集：eq/ne/like/in/range/isEmpty/isNotEmpty
 *   多选值 → op='in'（数组列走 JSON_OVERLAPS）；区间 → op='range'（后端要求起止同时存在，缺失时条件丢弃）
 */

// ==================== 汇总行 ====================

/** 聚合函数闭集（对齐后端 AGGREGATE_FN：sum/avg/count/max/min） */
export type AggregateFn = 'sum' | 'avg' | 'count' | 'max' | 'min'

export const AGGREGATE_OPTIONS: { label: string; value: AggregateFn }[] = [
  { label: '求和', value: 'sum' },
  { label: '平均', value: 'avg' },
  { label: '最大', value: 'max' },
  { label: '最小', value: 'min' },
  { label: '计数', value: 'count' },
]

/** 数值列类型集合（这些列开放 sum/avg/max/min；全类型可 count） */
const NUMERIC_COLUMN_TYPES = new Set(['INT', 'TINYINT', 'BIGINT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'NUMBER'])

export function isNumericColumnType(columnType?: string | null): boolean {
  return !!columnType && NUMERIC_COLUMN_TYPES.has(columnType.toUpperCase())
}

/** 该列可用的聚合选项：数值列全量；其余列仅计数 */
export function aggregateOptionsOf(columnType?: string | null): { label: string; value: AggregateFn }[] {
  if (isNumericColumnType(columnType)) return AGGREGATE_OPTIONS
  return AGGREGATE_OPTIONS.filter((o) => o.value === 'count')
}

/** 浮点误差清理（0.1+0.2 → 0.3）；avg 另行保留 2 位小数 */
function roundFloat(v: number): number {
  return Number(v.toFixed(6))
}

/**
 * 行取值：兼容两种行形态
 * - 扁平行（PageDataTable：{...字段, id, version}）→ row[key]
 * - BizDataVO（PageRenderer/SearchTable list：{id, data:{字段...}, version}）→ row.data[key]
 */
export function rowValueOf(row: any, key: string): unknown {
  if (row === null || row === undefined) return undefined
  if (row.data !== null && row.data !== undefined && typeof row.data === 'object') return (row.data as any)[key]
  return row[key]
}

/**
 * 单列聚合计算（当前页/已加载行）。
 * count = 非空值计数（对齐 SQL COUNT(col) 语义）；sum/avg/max/min 忽略不可转数的值。
 */
export function computeAggregate(rows: any[], key: string, fn: AggregateFn): number | null {
  let count = 0
  const nums: number[] = []
  for (const row of rows || []) {
    const v = rowValueOf(row, key)
    if (v === null || v === undefined || v === '') continue
    count += 1
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n)) nums.push(n)
  }
  switch (fn) {
    case 'count':
      return count
    case 'sum':
      return roundFloat(nums.reduce((a, b) => a + b, 0))
    case 'avg':
      return nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null
    case 'max':
      return nums.length ? roundFloat(Math.max(...nums)) : null
    case 'min':
      return nums.length ? roundFloat(Math.min(...nums)) : null
    default:
      return null
  }
}

/** 汇总列声明（来自 schema columns[].aggregate） */
export interface SummaryColumnSpec {
  key: string
  aggregate: AggregateFn
}

/** 全列聚合值：{ key: 聚合值 }（仅含声明了 aggregate 的列） */
export function buildSummaryValues(rows: any[], specs: SummaryColumnSpec[]): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const s of specs || []) {
    if (s && s.key) out[s.key] = computeAggregate(rows, s.key, s.aggregate)
  }
  return out
}

/**
 * el-table summary-method 工厂：首个未配置聚合的数据列显示「汇总」标签，
 * 其余单元格按列聚合值输出（未配置列输出空串）。
 */
export function buildSummaryMethod(
  specs: SummaryColumnSpec[],
): (param: { columns: any[]; data: any[] }) => (string | number)[] {
  const keys = new Set((specs || []).map((s) => s.key))
  return ({ columns, data }) => {
    const values = buildSummaryValues(data || [], specs)
    const cells: (string | number)[] = columns.map((c: any) => {
      if (!c?.property || !keys.has(c.property)) return ''
      const v = values[c.property]
      return v === null ? '—' : v
    })
    // 「汇总」标签放首个未配置聚合的数据列（避免覆盖已配置聚合列的数值）
    const labelIdx = columns.findIndex((c: any) => c?.property && !keys.has(c.property))
    if (labelIdx >= 0) cells[labelIdx] = '汇总'
    return cells
  }
}

// ==================== 表头筛选 ====================

/** 表头筛选形态：文本列=多选值、数值列=数字区间、日期列=日期区间 */
export type HeaderFilterKind = 'text' | 'number' | 'date'

/** 列类型 → 筛选形态 */
export function headerFilterKindOf(columnType?: string | null): HeaderFilterKind {
  const t = (columnType || '').toUpperCase()
  if (t === 'DATE' || t === 'DATETIME' || t === 'TIMESTAMP') return 'date'
  if (isNumericColumnType(t)) return 'number'
  return 'text'
}

/** 表头筛选值：多选（in）/ 区间（range） */
export type HeaderFilterValue =
  | { mode: 'in'; values: unknown[] }
  | { mode: 'range'; min: string | number; max: string | number }

/**
 * 表头筛选值 → 服务端结构化 filter 条件（对齐 BizDataQueryBuilder 运算符闭集）。
 * 多选空数组 / 区间缺一边 → null（不产生条件；后端 range 要求起止同时存在）。
 */
export function buildHeaderFilterCondition(
  key: string,
  value: HeaderFilterValue | null | undefined,
): { column: string; op: string; value: unknown } | null {
  if (!value) return null
  if (value.mode === 'in') {
    const vals = (value.values || []).filter((v) => v !== '' && v !== null && v !== undefined)
    return vals.length > 0 ? { column: key, op: 'in', value: vals } : null
  }
  const { min, max } = value
  if (min === '' || min === null || min === undefined || max === '' || max === null || max === undefined) return null
  return { column: key, op: 'range', value: [min, max] }
}

/** 该列是否已有生效的表头筛选条件（漏斗图标高亮依据） */
export function hasActiveHeaderFilter(value: HeaderFilterValue | null | undefined): boolean {
  return buildHeaderFilterCondition('', value) !== null
}

/**
 * 当前页数据 → 文本多选候选（去重、扁平化数组值、剔除空值/对象值）。
 * 与 el-table 内建 filters 同语义：候选来自已加载数据。
 */
export function extractDistinctValues(rows: any[], key: string): unknown[] {
  const out: unknown[] = []
  const seen = new Set<string>()
  for (const row of rows || []) {
    const v = rowValueOf(row, key)
    if (v === null || v === undefined || v === '') continue
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === null || item === undefined || item === '') continue
        if (typeof item === 'object') continue
        if (!seen.has(String(item))) {
          seen.add(String(item))
          out.push(item)
        }
      }
      continue
    }
    if (typeof v === 'object') continue
    if (!seen.has(String(v))) {
      seen.add(String(v))
      out.push(v)
    }
  }
  return out
}

// ==================== 配置归一化 ====================

/** 功能开关归一化：boolean | {enabled} | undefined → boolean（缺省 false = 现状行为） */
export function featureEnabled(cfg: boolean | { enabled?: boolean } | undefined | null): boolean {
  if (cfg === undefined || cfg === null) return false
  if (typeof cfg === 'boolean') return cfg
  return cfg.enabled === true
}

/** 批量删除开关：批量启用 且 未显式关闭 delete（缺省开启） */
export function batchDeleteEnabled(cfg: boolean | { enabled?: boolean; delete?: boolean } | undefined | null): boolean {
  if (!featureEnabled(cfg)) return false
  if (typeof cfg === 'boolean' || !cfg) return true
  return cfg.delete !== false
}

/**
 * 已选行 → 可删除 id 列表（批量操作挂载点共用）。
 * 两种行形态 id 均在顶层：扁平 {…字段, id} / BizDataVO {id, data:{…}}；剔除无 id 行。
 */
export function selectedRowIds(rows: any[]): Array<string | number> {
  return (rows || [])
    .map((r: any) => r?.id)
    .filter((id): id is string | number => id !== undefined && id !== null && id !== '')
}
