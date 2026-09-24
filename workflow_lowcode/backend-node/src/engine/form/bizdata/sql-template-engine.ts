/**
 * SQL 模板引擎（对齐 Java `SqlTemplateEngine` 453 行）。
 *
 * 管理员写一段 SQL 模板（**必须含 `:tenantId`**），被包裹成分页子查询
 * （包裹逻辑在 `SqlQueryEngine.wrapSubquery`，对齐 Java 的宿主划分）：
 *
 * ```sql
 * SELECT * FROM (<管理员SQL>) _qs {白名单筛选} ORDER BY <声明列> LIMIT ? OFFSET ?
 * SELECT COUNT(*) FROM (<管理员SQL>) _qs {白名单筛选}
 * ```
 *
 * 外层的筛选 / 排序 / 关键词**只允许引用声明列**（`columns` 里 `filterable`/`sortable` 为 true 的），
 * 其余占位符一律参数绑定 —— 杜绝 SQL 注入与任意列注入。
 *
 * 筛选/关键词的片段生成与 `JoinSqlGenerator` **共用** `filter-sql.ts`，
 * 两份实现只差「列引用怎么解析」与「单片段是否套括号」（见该文件头注释）。
 */

import {
  appendFilters,
  appendKeyword,
  type ColumnAccess,
  type FilterEmitOptions,
} from './filter-sql'
import { wrapSubquery, type SqlAndParams, type WrappedQuery } from './sql-query-engine'
/**
 * 声明列类型（对齐 Java `JoinSqlGenerator.QueryColumn`）：定义在 `join-sql-generator.ts`
 * —— Java 侧这个 record 的宿主就是 `JoinSqlGenerator`，两处共用同一形状。
 * 这里**转出**（而不是重定义）以免出现两个结构相同却互不兼容的类型。
 */
export type { QueryColumn } from './join-sql-generator'
import type { QueryColumn } from './join-sql-generator'
/**
 * `SqlAndParams` / `WrappedQuery` 归 `sql-query-engine.ts`（对齐 Java 的宿主划分：
 * 记录在 `BizDataQueryBuilder`、`wrapSubquery` 在 `SqlQueryEngine`）。这里转出以稳定调用方路径。
 */
export type { SqlAndParams, WrappedQuery }

/** 允许的排序方向（对齐 Java `ALLOWED_ORDER`）。 */
const ALLOWED_ORDER = new Set(['asc', 'desc'])

/** `:占位符`（对齐 Java `PLACEHOLDER`）。 */
const PLACEHOLDER = /:[A-Za-z_][A-Za-z0-9_]*/g

/**
 * 抛「非法参数」——注意**不是** `BusinessException`。
 *
 * Java 用的是 `IllegalArgumentException` ⇒ 全局异常映射成 **HTTP 400**；
 * 用业务异常会变成 HTTP 200 + body code，与 Java 分叉（规格 U25 记的是同一类坑）。
 */
function illegal(message: string): Error {
  const error = new Error(message)
  error.name = 'IllegalArgumentException'
  return error
}

/**
 * 校验 SQL 模板（对齐 Java `validate`）。
 *
 * 五条：非空 → 必须以 SELECT 开头 → **必须含 `:tenantId`** → columns 非空 →
 * 每个声明列 key 必须出现在 SELECT 输出列（或别名）里（SELECT `*` 时跳过这条）；
 * 另外校验参数白名单：参数名必须是合法标识符，且模板里每个非 `:tenantId` 占位符
 * 都要命中白名单。
 */
export function validate(
  query: string | null,
  columns: QueryColumn[] | null,
  declaredParams: string[] = [],
): void {
  if (query === null || query.trim() === '') {
    throw illegal('SQL 模板不能为空')
  }
  const trimmed = query.trim()
  if (trimmed.slice(0, 6).toLowerCase() !== 'select') {
    throw illegal('仅允许 SELECT 查询')
  }
  if (!query.includes(':tenantId')) {
    throw illegal('SQL 模板必须包含 :tenantId 占位符')
  }
  if (columns === null || columns.length === 0) {
    throw illegal('columns 不能为空')
  }
  const outputs = extractSelectOutputs(trimmed)
  if (!outputs.has('*')) {
    for (const column of columns) {
      if (!outputs.has(column.key)) {
        throw illegal(`声明列不在查询结果中: ${column.key}`)
      }
    }
  }
  const params = declaredParams ?? []
  for (const name of params) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw illegal(`参数名非法: ${name}`)
    }
  }
  for (const placeholder of extractPlaceholders(trimmed)) {
    if (placeholder === ':tenantId') continue
    if (!params.includes(placeholder.slice(1))) {
      throw illegal(`SQL 模板包含未声明参数: ${placeholder}`)
    }
  }
}

/**
 * 包裹查询（对齐 Java `wrap`）：绑定占位符 → 注入白名单筛选/关键词 → 派生排序 →
 * 产出「行查询 + COUNT 查询」。
 *
 * ⚠️ 缺省排序取**第一个可排序列**；全部列都不可排序时**不附加 ORDER BY**
 *    （SQL 数据源允许这种配置，与 FORM 单表路径「没有排序列就报错」不同）。
 */
export function wrap(
  query: string,
  tenantId: string,
  columns: QueryColumn[],
  filters: Record<string, unknown> | null,
  keyword: string | null,
  keywordColumn: string | null,
  sort: string | null,
  order: string | null,
  page: number,
  size: number,
  declaredParams: string[] = [],
  runtimeParams: Record<string, unknown> = {},
): WrappedQuery {
  validate(query, columns, declaredParams)

  const innerParams: unknown[] = []
  const innerSql = bindPlaceholders(query, tenantId, declaredParams, runtimeParams, innerParams)

  let filterSql = ''
  const filterParams: unknown[] = []
  filterSql += appendFilters(filterParams, filters, access(columns), FILTER_OPTIONS)
  filterSql += appendKeyword(filterParams, keyword, keywordColumn, access(columns), FILTER_OPTIONS)
  // 结构化/旧格式筛选统一以 " AND ..." 追加；独立成片段时去掉前导 AND
  const filterBody = filterSql.startsWith(' AND ') ? filterSql.slice(5) : filterSql
  const filterFragment = filterBody === '' ? '' : ` WHERE ${filterBody}`

  const sortColumn =
    sort === null || sort.trim() === '' ? defaultSortColumn(columns) : sort
  let orderByFragment = ''
  if (sortColumn !== null) {
    if (!isSortable(columns, sortColumn)) {
      throw illegal(`该列不可排序: ${sortColumn}`)
    }
    const orderDir = order === null || order.trim() === '' ? 'desc' : order.toLowerCase()
    if (!ALLOWED_ORDER.has(orderDir)) {
      throw illegal(`非法排序方向: ${String(order)}`)
    }
    orderByFragment = ` ORDER BY ${sortColumn} ${orderDir.toUpperCase()}`
  }

  return wrapSubquery(
    { sql: innerSql, params: innerParams },
    filterFragment,
    filterParams,
    orderByFragment,
    page,
    size,
  )
}

/** 缺省排序列：第一个可排序列；全部不可排序 → null（调用方不加 ORDER BY）。 */
function defaultSortColumn(columns: QueryColumn[]): string | null {
  const first = columns.find((column) => column.sortable)
  return first === undefined ? null : first.key
}

function isSortable(columns: QueryColumn[], key: string): boolean {
  const column = columns.find((c) => c.key === key)
  return column === undefined ? false : column.sortable
}

/**
 * 替换全部 `:占位符`（对齐 Java `bindPlaceholders`）：
 * `:tenantId` → 租户；白名单参数 → 运行时值；其余占位符 / 白名单内缺值一律拒绝。
 */
function bindPlaceholders(
  query: string,
  tenantId: string,
  declaredParams: string[],
  runtimeParams: Record<string, unknown>,
  params: unknown[],
): string {
  return query.replace(PLACEHOLDER, (placeholder) => {
    if (placeholder === ':tenantId') {
      params.push(tenantId)
      return '?'
    }
    const name = placeholder.slice(1)
    if (!declaredParams.includes(name)) {
      throw illegal(`SQL 模板包含未声明参数: ${placeholder}`)
    }
    if (runtimeParams === null || !(name in runtimeParams)) {
      throw illegal(`缺少运行时参数值: ${placeholder}`)
    }
    params.push(runtimeParams[name])
    return '?'
  })
}

/** 提取模板中全部 `:占位符`（含 `:tenantId`）。 */
export function extractPlaceholders(sql: string): string[] {
  return [...sql.matchAll(PLACEHOLDER)].map((match) => match[0])
}

/**
 * 解析 SELECT 输出列 / 别名集合（对齐 Java `extractSelectOutputs`）。
 *
 * `*` 表示通配（跳过逐列匹配）；`AS` 之后取到第一个空白或逗号；否则取最后一个 `.` 之后的部分；
 * 反引号与双引号会被去掉。
 *
 * ⚠️ 这是**字符串解析**而不是真 SQL 解析：`SELECT`/`FROM` 用「前后不是字母数字」的
 *    关键字匹配（`indexOfKeyword`），所以子查询、函数里的 FROM 都可能被误判 —— 与 Java 同源。
 */
export function extractSelectOutputs(sql: string): Set<string> {
  const out = new Set<string>()
  const select = indexOfKeyword(sql, 'SELECT')
  if (select < 0) return out
  const from = indexOfKeyword(sql, 'FROM', select + 6)
  if (from < 0) return out
  const list = sql.slice(select + 6, from)
  for (const part of list.split(',')) {
    const trimmed = part.trim()
    if (trimmed === '') continue
    if (trimmed === '*' || trimmed.endsWith('.*')) {
      out.add('*')
      continue
    }
    let name: string
    const as = indexOfKeyword(trimmed, 'AS')
    if (as >= 0) {
      name = (trimmed.slice(as + 2).trim().split(/[\s,]+/)[0] ?? '').trim()
    } else {
      const dot = trimmed.lastIndexOf('.')
      name = (dot >= 0 ? trimmed.slice(dot + 1) : trimmed).trim()
    }
    name = name.replaceAll('`', '').replaceAll('"', '')
    if (name !== '') out.add(name)
  }
  return out
}

/** 关键字定位：大小写不敏感，且要求**前后都不是字母数字**（对齐 Java `indexOfKeyword`）。 */
export function indexOfKeyword(s: string, keyword: string, from = 0): number {
  const lower = s.toLowerCase()
  const k = keyword.toLowerCase()
  let i = lower.indexOf(k, from)
  while (i >= 0) {
    const beforeOk = i === 0 || !/[a-zA-Z0-9]/.test(lower[i - 1])
    const end = i + k.length
    const afterOk = end >= lower.length || !/[a-zA-Z0-9]/.test(lower[end])
    if (beforeOk && afterOk) return i
    i = lower.indexOf(k, i + 1)
  }
  return -1
}

/** 本模块的列访问器（`SqlTemplateEngine.resolveKey` 语义：返回声明列 key）。 */
function access(columns: QueryColumn[]): ColumnAccess {
  return {
    filterRef: (column, label) => resolveKey(column, columns, label),
    isJson: (key) => isJsonColumn(columns, key),
  }
}

/**
 * 本模块的片段选项（对齐 Java `SqlTemplateEngine`）。
 *
 * ⚠️ `parensOnSingleStructured = false`：结构化筛选只剩一个片段时**不套括号**
 *    （`JoinSqlGenerator` 是始终套括号，见 `filter-sql.ts` 头注释）。
 */
const FILTER_OPTIONS: FilterEmitOptions = {
  parensOnSingleStructured: false,
  illegal,
}

/** 白名单校验：返回列 key；未声明或 filterable=false 一律拒绝。 */
function resolveKey(column: string | null, columns: QueryColumn[], label: string): string {
  if (column === null || column === undefined || column.trim() === '') {
    throw illegal(`${label}不能为空`)
  }
  const matched = columns.find((c) => c.key === column)
  if (matched === undefined) {
    throw illegal(`非法${label}: ${column}`)
  }
  if (!matched.filterable) {
    throw illegal(`该列不可${label}: ${column}`)
  }
  return matched.key
}

function isJsonColumn(columns: QueryColumn[], key: string): boolean {
  const column = columns.find((c) => c.key === key)
  return column === undefined ? false : column.columnType.toUpperCase() === 'JSON'
}
