import { randomBytes } from 'node:crypto'
import { sql, type RawBuilder } from 'kysely'
import type { ColumnConfig } from '../../../common/domain/column-config'

/**
 * 业务数据动态 SQL 生成器（对齐 Java `BizDataQueryBuilder`）。
 *
 * ## 安全模型
 * 与 Java 完全一致：**标识符（表名/列名/排序字段）走白名单校验，值走参数绑定**。
 * 区别只在实现手段 —— Java 用 `PreparedStatement` 的 `?` 手拼字符串，
 * 这里用 Kysely 的 `sql` 片段组合。**没有任何一处把值拼进 SQL 文本**，
 * 表名与列名分别经 `sql.table()` / `sql.ref()` 交给 Kysely 转义。
 *
 * ## 为什么返回片段而不是 `{sql, params}` 字符串
 * 手拼字符串 + 事后重新绑定参数，需要一个「把 `?` 文本还原成绑定片段」的转换器 ——
 * 那正是最容易出错、也最难测的一段代码。让 Kysely 从一开始就持有参数，
 * 这层转换就不存在了。
 * 单测里用 `compileQuery` 把片段编译成 MySQL 方言的 SQL 与参数来断言（见 spec）。
 */

/** 内置可排序/可查询列（对齐 Java `BUILTIN_COLUMNS`）。 */
const BUILTIN_COLUMNS = new Set(['id', 'created_at', 'updated_at'])

const ALLOWED_ORDER = new Set(['asc', 'desc'])

/** 列 key → 大写 columnType 的映射。 */
export type ColumnTypeMap = Map<string, string>

function isJsonColumn(columnTypeOf: ColumnTypeMap, column: string): boolean {
  return (columnTypeOf.get(column) ?? '').toUpperCase() === 'JSON'
}

/** 由列定义构建类型映射（对齐 Java `ctx.columns().stream().collect(toMap(...))`）。 */
export function columnTypeMapOf(columns: ColumnConfig[]): ColumnTypeMap {
  const map: ColumnTypeMap = new Map()
  for (const column of columns) {
    const key = String(column.key)
    if (!map.has(key)) {
      map.set(key, column.columnType === null ? '' : column.columnType.toUpperCase())
    }
  }
  return map
}

/** 筛选值序列化为 JSON 片段（`'\"v\"'` / `'[\"a\",\"b\"]'`），供 JSON_CONTAINS/JSON_OVERLAPS 匹配。 */
function jsonValue(value: unknown): string {
  const encoded = JSON.stringify(value)
  return encoded === undefined ? String(value) : encoded
}

/**
 * 生成分页 SELECT。
 *
 * 排序默认 `created_at desc`；`size <= 0` 表示不分页取全部（跳过 LIMIT/OFFSET）。
 * 抛出的 `Error` 由调用方转成 `BusinessException(400, message)`（对齐 Java 的
 * `catch (IllegalArgumentException e)`）。
 */
export function buildSelect(
  tableName: string,
  allowedColumns: string[],
  columnTypeOf: ColumnTypeMap,
  tenantId: string,
  filters: Record<string, unknown>,
  keyword: string | null,
  keywordColumn: string | null,
  sort: string | null,
  order: string | null,
  page: number,
  size: number,
): RawBuilder<unknown> {
  let query = sql`SELECT * FROM ${sql.table(tableName)} WHERE tenant_id = ${tenantId}`
  query = appendFilters(query, allowedColumns, columnTypeOf, filters)
  query = appendKeyword(query, allowedColumns, keyword, keywordColumn)

  const sortColumn = sort === null || sort.trim() === '' ? 'created_at' : sort
  validateColumn(sortColumn, allowedColumns, '排序字段')
  const orderDir = order === null || order.trim() === '' ? 'desc' : order.toLowerCase()
  if (!ALLOWED_ORDER.has(orderDir)) {
    throw new Error(`非法排序方向: ${String(order)}`)
  }
  // 方向来自 ALLOWED_ORDER 闭集，列名已过白名单 —— 两者都不是用户可控的原始文本
  query = sql`${query} ORDER BY ${sql.ref(sortColumn)} ${sql.raw(orderDir.toUpperCase())}`

  if (size > 0) {
    query = sql`${query} LIMIT ${size} OFFSET ${page * size}`
  }
  return query
}

/** 生成 COUNT 查询（过滤条件与 `buildSelect` 完全一致）。 */
export function buildCount(
  tableName: string,
  allowedColumns: string[],
  columnTypeOf: ColumnTypeMap,
  tenantId: string,
  filters: Record<string, unknown>,
  keyword: string | null,
  keywordColumn: string | null,
): RawBuilder<unknown> {
  // ⚠️ `AS total` 是刻意的：Java 用 `queryForObject(sql, Long.class)` 按**位置**取值，
  //    不关心列名；Kysely 只能按**列名**取值，而 `SELECT COUNT(1)` 的列名是 `COUNT(1)`。
  //    给它一个稳定别名，读取侧才不必依赖数据库的列标签拼法。
  //    别名不出现在任何响应里，不影响契约。
  let query = sql`SELECT COUNT(1) AS total FROM ${sql.table(tableName)} WHERE tenant_id = ${tenantId}`
  query = appendFilters(query, allowedColumns, columnTypeOf, filters)
  query = appendKeyword(query, allowedColumns, keyword, keywordColumn)
  return query
}

/**
 * 关键词搜索：`keywordColumn` 支持逗号分隔多列（OR LIKE 组合，括号包裹）。
 * 单列保持向后兼容（原样 LIKE）。列名逐一白名单校验。
 */
function appendKeyword(
  query: RawBuilder<unknown>,
  allowedColumns: string[],
  keyword: string | null,
  keywordColumn: string | null,
): RawBuilder<unknown> {
  if (keyword === null || keyword.trim() === '') return query
  const columns =
    keywordColumn === null || keywordColumn.trim() === '' ? [] : keywordColumn.split(',')

  const fragments: RawBuilder<unknown>[] = []
  for (const raw of columns) {
    const column = raw.trim()
    if (column === '') continue
    validateColumn(column, allowedColumns, '关键词匹配列')
    fragments.push(sql`${sql.ref(column)} LIKE ${`%${keyword}%`}`)
  }
  if (fragments.length === 0) {
    throw new Error('关键词匹配列不能为空')
  }
  if (fragments.length === 1) {
    return sql`${query} AND ${fragments[0]}`
  }
  return sql`${query} AND (${sql.join(fragments, sql` OR `)})`
}

/**
 * 筛选条件：结构化 `{logic, conditions:[{column,op,value}]}` 或旧格式 `{column: value}`（等值 AND）。
 */
function appendFilters(
  query: RawBuilder<unknown>,
  allowedColumns: string[],
  columnTypeOf: ColumnTypeMap,
  filters: Record<string, unknown>,
): RawBuilder<unknown> {
  if (Object.keys(filters).length === 0) return query

  const conditions = filters.conditions
  if (Array.isArray(conditions)) {
    const logic = String(filters.logic ?? 'AND').toUpperCase() === 'AND' ? 'AND' : 'OR'
    return appendStructuredFilters(
      query,
      allowedColumns,
      columnTypeOf,
      logic,
      conditions.filter((c): c is Record<string, unknown> => c !== null && typeof c === 'object'),
    )
  }

  let out = query
  for (const [column, value] of Object.entries(filters)) {
    validateColumn(column, allowedColumns, '筛选字段')
    if (value === null || value === undefined) continue
    out = isJsonColumn(columnTypeOf, column)
      ? sql`${out} AND JSON_CONTAINS(${sql.ref(column)}, ${jsonValue(value)})`
      : sql`${out} AND ${sql.ref(column)} = ${value}`
  }
  return out
}

/**
 * 结构化多条件：按 logic 组合 AND/OR，括号包裹；列名白名单校验，值参数绑定。
 * 运算符（对齐 Java）：eq / ne / like / in / range / isEmpty / isNotEmpty。
 */
function appendStructuredFilters(
  query: RawBuilder<unknown>,
  allowedColumns: string[],
  columnTypeOf: ColumnTypeMap,
  logic: 'AND' | 'OR',
  conditions: Array<Record<string, unknown>>,
): RawBuilder<unknown> {
  const fragments: RawBuilder<unknown>[] = []
  for (const condition of conditions) {
    const column = String(condition.column)
    validateColumn(column, allowedColumns, '筛选字段')
    const op =
      condition.op === null || condition.op === undefined
        ? 'eq'
        : String(condition.op).toLowerCase()
    const json = isJsonColumn(columnTypeOf, column)
    const value = condition.value

    switch (op) {
      case 'eq':
        if (value === null || value === undefined) continue
        fragments.push(
          json
            ? sql`JSON_CONTAINS(${sql.ref(column)}, ${jsonValue(value)})`
            : sql`${sql.ref(column)} = ${value}`,
        )
        break
      case 'ne':
        if (value === null || value === undefined) continue
        fragments.push(
          json
            ? sql`NOT JSON_CONTAINS(${sql.ref(column)}, ${jsonValue(value)})`
            : sql`${sql.ref(column)} <> ${value}`,
        )
        break
      case 'like':
        if (value === null || value === undefined) continue
        fragments.push(sql`${sql.ref(column)} LIKE ${`%${String(value)}%`}`)
        break
      case 'in': {
        if (!Array.isArray(value) || value.length === 0) continue
        if (json) {
          fragments.push(sql`JSON_OVERLAPS(${sql.ref(column)}, ${jsonValue(value)})`)
        } else {
          fragments.push(
            sql`${sql.ref(column)} IN (${sql.join(
              value.map((v) => sql`${v}`),
              sql`, `,
            )})`,
          )
        }
        break
      }
      case 'range': {
        if (
          !Array.isArray(value) ||
          value.length !== 2 ||
          value[0] === null ||
          value[0] === undefined ||
          value[1] === null ||
          value[1] === undefined
        ) {
          continue
        }
        fragments.push(
          sql`(${sql.ref(column)} >= ${value[0]} AND ${sql.ref(column)} <= ${value[1]})`,
        )
        break
      }
      case 'isempty':
        fragments.push(sql`(${sql.ref(column)} IS NULL OR ${sql.ref(column)} = '')`)
        break
      case 'isnotempty':
        fragments.push(sql`(${sql.ref(column)} IS NOT NULL AND ${sql.ref(column)} <> '')`)
        break
      default:
        throw new Error(`非法筛选运算符: ${op}`)
    }
  }
  if (fragments.length === 0) return query
  return sql`${query} AND (${sql.join(fragments, sql` ${sql.raw(logic)} `)})`
}

/** 列名白名单校验（对齐 Java `validateColumn`）。 */
function validateColumn(
  column: string | null,
  allowedColumns: string[],
  label: string,
): void {
  if (column === null || column.trim() === '') {
    throw new Error(`${label}不能为空`)
  }
  if (!allowedColumns.includes(column) && !BUILTIN_COLUMNS.has(column)) {
    throw new Error(`非法${label}: ${column}`)
  }
}

// ==================== 写路径 ====================

/**
 * 过滤入参：**忽略系统列**（`id` / `tenant_id` / `version`，防调用方覆盖）与**未知列**
 * （不在 `column_config` 白名单里的键）。
 *
 * 对齐 Java `BizDataQueryBuilder.filterData` —— 注意它是**静默忽略**，不报错。
 */
export function filterData(
  allowedColumns: string[],
  data: Record<string, unknown> | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data === null) return out
  for (const [key, value] of Object.entries(data)) {
    if (key === 'id' || key === 'tenant_id' || key === 'version') continue
    if (!allowedColumns.includes(key)) continue
    out[key] = value
  }
  return out
}

/**
 * 生成 INSERT（对齐 Java `buildInsert`）。
 *
 * ⚠️ 主键由**这里生成**（32 位 hex），`id`/`tenant_id`/`version` 三列固定打头 ——
 *    Java 侧 `insertedId()` 就是取参数列表的第 0 个，所以这里把 id 一并返回给调用方，
 *    不去解析 SQL 文本。
 */
export function buildInsert(
  tableName: string,
  allowedColumns: string[],
  data: Record<string, unknown> | null,
  tenantId: string,
): { query: RawBuilder<unknown>; id: string } {
  const safeData = filterData(allowedColumns, data)
  const id = randomBytes(16).toString('hex')

  const columns: RawBuilder<unknown>[] = [sql`id`, sql`tenant_id`, sql`version`]
  const values: unknown[] = [id, tenantId, 1]
  for (const [key, value] of Object.entries(safeData)) {
    columns.push(sql.ref(key))
    values.push(value)
  }
  const query = sql`INSERT INTO ${sql.table(tableName)} (${sql.join(columns, sql`, `)}) VALUES (${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )})`
  return { query, id }
}

/**
 * 生成 UPDATE（对齐 Java `buildUpdate`：乐观锁 + `version` 自增 + `updated_at = NOW()`）。
 *
 * ⚠️ 更新内容为空时 Java 抛 `IllegalArgumentException("更新内容不能为空")` →
 *    **HTTP 400**；注意 `updateGeneric` **没有**把它包成 `BusinessException`，
 *    所以这里也抛 `IllegalArgumentException` 形态而不是业务异常。
 */
export function buildUpdate(
  tableName: string,
  allowedColumns: string[],
  data: Record<string, unknown> | null,
  tenantId: string,
  id: string,
  version: number,
): RawBuilder<unknown> {
  const safeData = filterData(allowedColumns, data)
  if (Object.keys(safeData).length === 0) {
    const err = new Error('更新内容不能为空')
    err.name = 'IllegalArgumentException'
    throw err
  }
  const assignments: RawBuilder<unknown>[] = Object.entries(safeData).map(
    ([key, value]) => sql`${sql.ref(key)} = ${value}`,
  )
  // version 自增与 updated_at 固定追加在末尾（顺序与 Java 一致）
  assignments.push(sql`version = version + 1`, sql`updated_at = NOW()`)
  return sql`UPDATE ${sql.table(tableName)} SET ${sql.join(assignments, sql`, `)}
             WHERE id = ${id} AND tenant_id = ${tenantId} AND version = ${version}`
}

/** 生成 DELETE（对齐 Java `buildDelete`：租户范围限定）。 */
export function buildDelete(
  tableName: string,
  tenantId: string,
  id: string,
): RawBuilder<unknown> {
  return sql`DELETE FROM ${sql.table(tableName)} WHERE id = ${id} AND tenant_id = ${tenantId}`
}
