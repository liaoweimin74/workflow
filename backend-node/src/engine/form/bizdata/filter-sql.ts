/**
 * 筛选 / 关键词 SQL 片段生成器（共享实现）。
 *
 * Java 侧 `SqlTemplateEngine`（453 行）与 `JoinSqlGenerator`（366 行）各自复制了一份
 * `appendFilters` / `appendStructuredFilters` / `appendKeyword` / `jsonValue` / `isJsonColumn`，
 * 两份**只差两点**：
 *
 *   1. **列引用**：`SqlTemplateEngine.resolveKey` 返回声明列 `key`（子查询输出列名）；
 *      `JoinSqlGenerator.resolveRef` 返回 `QueryColumn.ref`（`m.order_no` / `c.name`），
 *      并对内置列 `id`/`created_at`/`updated_at` 强制走主表别名。
 *   2. **单片段括号**：结构化筛选只剩一个片段时，`SqlTemplateEngine` 输出
 *      `AND x = ?`（不套括号），`JoinSqlGenerator` 输出 `AND (x = ?)`（**始终**套括号）。
 *
 * 第 2 点是**真实行为差异**（不是笔误）：两种模式共用同一份 filter 协议，
 * 前端只看结果不看 SQL，但 SQL 文本进了 JDBC 就无法在两个实现之间互相「纠正」。
 * 因此这里用 `parensOnSingleStructured` 参数保留两份语义，而不是合并成一种。
 *
 * 引用解析通过 `ColumnAccess` 注入 —— 两个调用方的白名单与错误文案各自保留在本地，
 * 保证错误消息逐字可控。
 */

/** 列引用解析（各自实现白名单校验与错误文案）。 */
export interface ColumnAccess {
  /**
   * 筛选/关键词用：白名单校验 + `filterable` 校验，返回 SQL 引用或列 key。
   * 未声明 → `非法<label>: x`；`filterable=false` → `该列不可<label>: x`。
   */
  filterRef(column: string | null, label: string): string

  /** JSON 列判定（按**原始** column key，而不是解析后的引用）。 */
  isJson(key: string): boolean
}

export interface FilterEmitOptions {
  /**
   * 结构化筛选只剩一个片段时是否仍套括号。
   * `SqlTemplateEngine` = false，`JoinSqlGenerator` = true（对齐各自 Java 实现）。
   */
  parensOnSingleStructured: boolean

  /** 抛错工厂：使用方各自保证是 `IllegalArgumentException` 形态（HTTP 400）。 */
  illegal: (message: string) => Error
}

/**
 * 生成筛选片段（含前导 `" AND "`），参数按出现顺序推入 `params`。
 *
 * 对齐 Java：**先解析列引用再判空值** —— 非法列即使值为 null 也要抛错，
 * 否则前端传 `{nope: null}` 会被静默放过，绕过白名单校验。
 */
export function appendFilters(
  params: unknown[],
  filters: Record<string, unknown> | null,
  access: ColumnAccess,
  options: FilterEmitOptions,
): string {
  if (filters === null || Object.keys(filters).length === 0) return ''
  if (Array.isArray(filters.conditions)) {
    return appendStructuredFilters(params, filters.conditions, normalizeLogic(filters), access, options)
  }
  let sql = ''
  for (const [rawKey, value] of Object.entries(filters)) {
    const ref = access.filterRef(rawKey, '筛选字段')
    if (value === null || value === undefined) continue
    if (access.isJson(rawKey)) {
      sql += ` AND JSON_CONTAINS(${ref}, ?)`
      params.push(jsonValue(value))
    } else {
      sql += ` AND ${ref} = ?`
      params.push(value)
    }
  }
  return sql
}

/** 结构化多条件筛选（复用 filter 协议：eq/ne/like/in/range/isempty/isnotempty）。 */
function appendStructuredFilters(
  params: unknown[],
  conditions: unknown[],
  logic: string,
  access: ColumnAccess,
  options: FilterEmitOptions,
): string {
  const fragments: string[] = []
  for (const raw of conditions) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue
    const condition = raw as Record<string, unknown>
    const column = String(condition.column)
    const ref = access.filterRef(column, '筛选字段')
    const op =
      condition.op === null || condition.op === undefined ? 'eq' : String(condition.op).toLowerCase()
    const json = access.isJson(column)
    switch (op) {
      case 'eq': {
        if (condition.value === null || condition.value === undefined) continue
        if (json) {
          fragments.push(`JSON_CONTAINS(${ref}, ?)`)
          params.push(jsonValue(condition.value))
        } else {
          fragments.push(`${ref} = ?`)
          params.push(condition.value)
        }
        break
      }
      case 'ne': {
        if (condition.value === null || condition.value === undefined) continue
        if (json) {
          fragments.push(`NOT JSON_CONTAINS(${ref}, ?)`)
          params.push(jsonValue(condition.value))
        } else {
          fragments.push(`${ref} <> ?`)
          params.push(condition.value)
        }
        break
      }
      case 'like': {
        if (condition.value === null || condition.value === undefined) continue
        fragments.push(`${ref} LIKE ?`)
        params.push(`%${String(condition.value)}%`)
        break
      }
      case 'in': {
        const value = condition.value
        if (!Array.isArray(value) || value.length === 0) continue
        if (json) {
          fragments.push(`JSON_OVERLAPS(${ref}, ?)`)
          params.push(jsonValue(value))
        } else {
          fragments.push(`${ref} IN (${value.map(() => '?').join(', ')})`)
          params.push(...value)
        }
        break
      }
      case 'range': {
        const value = condition.value
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
        fragments.push(`(${ref} >= ? AND ${ref} <= ?)`)
        params.push(value[0], value[1])
        break
      }
      case 'isempty':
        fragments.push(`(${ref} IS NULL OR ${ref} = '')`)
        break
      case 'isnotempty':
        fragments.push(`(${ref} IS NOT NULL AND ${ref} <> '')`)
        break
      default:
        throw options.illegal(`非法筛选运算符: ${op}`)
    }
  }
  if (fragments.length === 0) return ''
  if (fragments.length > 1 || options.parensOnSingleStructured) {
    return ` AND (${fragments.join(` ${logic} `)})`
  }
  return ` AND ${fragments[0]}`
}

/** 关键词搜索：`keywordColumn` 支持逗号分隔多列（OR LIKE），只允许 filterable 列。 */
export function appendKeyword(
  params: unknown[],
  keyword: string | null,
  keywordColumn: string | null,
  access: ColumnAccess,
  options: FilterEmitOptions,
): string {
  if (keyword === null || keyword === undefined || keyword.trim() === '') return ''
  const cols = keywordColumn === null || keywordColumn.trim() === '' ? [] : keywordColumn.split(',')
  const likeFragments: string[] = []
  for (const col of cols) {
    const trimmed = col.trim()
    if (trimmed === '') continue
    const ref = access.filterRef(trimmed, '关键词匹配列')
    likeFragments.push(`${ref} LIKE ?`)
    params.push(`%${keyword}%`)
  }
  if (likeFragments.length === 0) {
    throw options.illegal('关键词匹配列不能为空')
  }
  if (likeFragments.length === 1) return ` AND ${likeFragments[0]}`
  return ` AND (${likeFragments.join(' OR ')})`
}

/** JSON 值序列化（对齐 Java `jsonValue`：`writeValueAsString` 失败时回落 `String.valueOf`）。 */
export function jsonValue(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/**
 * 结构化筛选的 `logic` 归一化：Java `"AND".equalsIgnoreCase(...)`，
 * 非 `and`（含 null/缺失）一律按 `OR` —— 与 `filters.logic` 的默认值 `"AND"` 配合后，
 * 缺省是 AND，显式传别的才是 OR。
 */
export function normalizeLogic(filters: Record<string, unknown>): string {
  return String(filters.logic ?? 'AND').toLowerCase() === 'and' ? 'AND' : 'OR'
}
