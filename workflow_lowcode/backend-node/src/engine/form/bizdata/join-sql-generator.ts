import {
  appendFilters,
  appendKeyword,
  type ColumnAccess,
  type FilterEmitOptions,
} from './filter-sql'
import { isJoinTargetSystemKey, resolveJoinTargetTable } from './join-target-catalog'

/**
 * config 模式 JOIN SQL 生成器（对齐 Java `com.workflow.engine.form.bizdata.JoinSqlGenerator`）。
 *
 * 将 declaration 配置的 `joins[]`（声明式）翻译为 `LEFT JOIN` + 虚拟列 `SELECT`：
 * ```sql
 *   SELECT m.*, c.name AS customer_name FROM wf_biz_order m
 *     LEFT JOIN wf_biz_customer c ON c.id = JSON_UNQUOTE(JSON_EXTRACT(m.customer_id,'$[0]'))
 *     WHERE m.tenant_id = ? [AND 白名单筛选] ORDER BY <ref> DESC LIMIT ? OFFSET ?
 * ```
 *
 * 主表固定别名 `m`；`localField` 为 JSON 列（dataPicker 外键数组）时走 `JSON_EXTRACT`
 * 提取首元素匹配，普通列直接等值连接。所有标识符（列/表/排序）来自调用方传入的
 * `QueryColumn` 映射或内置白名单，值全部参数绑定，杜绝 SQL 注入。
 */

/** 内置可排序/可查询列（主表系统列，始终解析为主表别名引用）。 */
const BUILTIN_COLUMNS = new Set(['id', 'created_at', 'updated_at'])

const ALLOWED_ORDER = new Set(['asc', 'desc'])

/** 关联声明（`joins[]` 条目）。 */
export interface JoinConfig {
  alias: string | null
  targetFormKey: string | null
  localField: string | null
  foreignField: string | null
  joinField: string | null
  virtualKey: string | null
  label: string | null
  sortable: boolean
  filterable: boolean
}

/** 查询列映射（key → SQL 引用 + 类型 + 能力标记）；ref 形如 `"m.order_no"` / `"c.name"`。 */
export interface QueryColumn {
  key: string
  ref: string
  columnType: string
  sortable: boolean
  filterable: boolean
}

/** SQL 与参数（对齐 Java `BizDataQueryBuilder.SqlAndParams`）。 */
export interface SqlAndParams {
  sql: string
  params: unknown[]
}

/** 抛 `IllegalArgumentException` 形态（Java 侧由 `BizDataSupport` 转成 400）。 */
function illegal(message: string): Error {
  const error = new Error(message)
  error.name = 'IllegalArgumentException'
  return error
}

/**
 * 生成分页 SELECT：主表 `m.*` + 虚拟列，`LEFT JOIN` 链，注入白名单筛选/排序/分页/租户。
 *
 * ⚠️ `sort` 缺省时用 `created_at`（**不是**第一个可排序列）—— 与 `SqlTemplateEngine`
 *    的「第一个可排序列」不同，两份实现不要互相套用。
 */
export function buildSelect(
  mainTable: string,
  tenantId: string,
  joins: JoinConfig[],
  columns: QueryColumn[],
  filters: Record<string, unknown> | null,
  keyword: string | null,
  keywordColumn: string | null,
  sort: string | null,
  order: string | null,
  page: number,
  size: number,
): SqlAndParams {
  let sql = 'SELECT m.*'
  for (const join of joins) {
    sql += `, ${String(join.alias)}.${String(join.joinField)} AS ${String(join.virtualKey)}`
  }
  sql += ` FROM ${mainTable} m`
  for (const join of joins) {
    sql += ` LEFT JOIN ${resolveJoinTargetTable(String(join.targetFormKey))} ${String(join.alias)}`
    sql += ` ON ${String(join.alias)}.${String(join.foreignField)} = ${localRef(join, columns)}`
  }
  sql += ' WHERE m.tenant_id = ?'
  const params: unknown[] = [tenantId]

  sql += appendFilters(params, filters, access(columns), FILTER_OPTIONS)
  sql += appendKeyword(params, keyword, keywordColumn, access(columns), FILTER_OPTIONS)

  const sortColumn = sort === null || sort.trim() === '' ? 'created_at' : sort
  const sortRef = resolveRef(sortColumn, columns, true, '排序字段')
  const orderDir = order === null || order.trim() === '' ? 'desc' : order.toLowerCase()
  if (!ALLOWED_ORDER.has(orderDir)) {
    throw illegal(`非法排序方向: ${String(order)}`)
  }
  sql += ` ORDER BY ${sortRef} ${orderDir.toUpperCase()}`

  if (size > 0) {
    sql += ' LIMIT ? OFFSET ?'
    params.push(size, page * size)
  }
  return { sql, params }
}

/**
 * 生成 COUNT 查询（分页总数，JOIN 链与筛选条件与 `buildSelect` 一致，无排序/分页）。
 */
export function buildCount(
  mainTable: string,
  tenantId: string,
  joins: JoinConfig[],
  columns: QueryColumn[],
  filters: Record<string, unknown> | null,
  keyword: string | null,
  keywordColumn: string | null,
): SqlAndParams {
  let sql = `SELECT COUNT(1) FROM ${mainTable} m`
  for (const join of joins) {
    sql += ` LEFT JOIN ${resolveJoinTargetTable(String(join.targetFormKey))} ${String(join.alias)}`
    sql += ` ON ${String(join.alias)}.${String(join.foreignField)} = ${localRef(join, columns)}`
  }
  sql += ' WHERE m.tenant_id = ?'
  const params: unknown[] = [tenantId]

  sql += appendFilters(params, filters, access(columns), FILTER_OPTIONS)
  sql += appendKeyword(params, keyword, keywordColumn, access(columns), FILTER_OPTIONS)
  return { sql, params }
}

/**
 * 保存校验：必填字段、alias/virtualKey 唯一、virtualKey 不与主表列冲突。
 */
export function validate(joins: JoinConfig[] | null, mainColumns: string[] | null): void {
  if (joins === null || joins.length === 0) return
  const aliases = new Set<string>()
  const virtualKeys = new Set<string>()
  for (const join of joins) {
    if (join.alias === null || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(join.alias)) {
      throw illegal(`关联别名非法: ${String(join.alias)}`)
    }
    if (aliases.has(join.alias)) {
      throw illegal(`关联别名重复: ${join.alias}`)
    }
    aliases.add(join.alias)
    requireText(join.targetFormKey, '关联目标表')
    requireText(join.localField, '主表关联字段')
    requireText(join.foreignField, '目标表关联字段')
    requireText(join.joinField, '目标表展示字段')
    requireText(join.virtualKey, '虚拟列 key')
    if (virtualKeys.has(join.virtualKey as string)) {
      throw illegal(`虚拟列 key 重复: ${join.virtualKey}`)
    }
    virtualKeys.add(join.virtualKey as string)
    if (mainColumns !== null && mainColumns.includes(join.virtualKey as string)) {
      throw illegal(`虚拟列 key 与主表列冲突: ${join.virtualKey}`)
    }
  }
}

/**
 * 保存校验：目标物理表必须存在（FORM → `wf_biz_<formKey>`；内建数据源 → 系统物理表，
 * 由 join-target-catalog 白名单解析，杜绝任意表名拼接）。
 */
export function validateTargets(
  joins: JoinConfig[] | null,
  tableExists: (table: string) => boolean,
): void {
  if (joins === null || joins.length === 0) return
  for (const join of joins) {
    const targetKey = String(join.targetFormKey)
    if (isJoinTargetSystemKey(targetKey)) continue // 内建目标表由 baseline 迁移建表，必然存在
    if (!tableExists(`wf_biz_${targetKey}`)) {
      throw illegal(`关联表单不存在: ${targetKey}`)
    }
  }
}

function requireText(value: string | null, label: string): void {
  if (value === null || value.trim() === '') {
    throw illegal(`${label}不能为空`)
  }
}

/** JOIN 匹配的 `localField` 引用：JSON 列提取首元素，普通列直接引用。 */
function localRef(join: JoinConfig, columns: QueryColumn[]): string {
  if (isJsonColumn(columns, join.localField)) {
    return `JSON_UNQUOTE(JSON_EXTRACT(m.${String(join.localField)},'$[0]'))`
  }
  return `m.${String(join.localField)}`
}

function isJsonColumn(columns: QueryColumn[], key: string | null): boolean {
  const column = columns.find((c) => c.key === key)
  return column === undefined ? false : column.columnType.toUpperCase() === 'JSON'
}

/**
 * 解析列引用：白名单校验 + 返回 SQL 引用；内置列（id/created_at/updated_at）走主表别名。
 *
 * ⚠️ 内置列在**白名单之前**短路 —— 即使它不在 `columns` 里也允许排序/筛选。
 */
function resolveRef(
  column: string | null,
  columns: QueryColumn[],
  sortable: boolean,
  label: string,
): string {
  if (column === null || column.trim() === '') {
    throw illegal(`${label}不能为空`)
  }
  if (BUILTIN_COLUMNS.has(column)) {
    return `m.${column}`
  }
  const matched = columns.find((c) => c.key === column)
  if (matched === undefined) {
    throw illegal(`非法${label}: ${column}`)
  }
  if (sortable && !matched.sortable) {
    throw illegal(`该列不可排序: ${column}`)
  }
  if (!sortable && !matched.filterable) {
    throw illegal(`该列不可${label}: ${column}`)
  }
  return matched.ref
}

/** 本模块的列访问器（`ref` 语义 + 内置列短路）。 */
function access(columns: QueryColumn[]): ColumnAccess {
  return {
    filterRef: (column, label) => resolveRef(column, columns, false, label),
    isJson: (key) => isJsonColumn(columns, key),
  }
}

/**
 * 本模块的片段选项（对齐 Java `JoinSqlGenerator`）。
 *
 * ⚠️ `parensOnSingleStructured = true`：单片段也套括号 —— 这是与 `SqlTemplateEngine`
 *    的**真实行为差异**（见 `filter-sql.ts` 头注释）。
 */
const FILTER_OPTIONS: FilterEmitOptions = {
  parensOnSingleStructured: true,
  illegal,
}
