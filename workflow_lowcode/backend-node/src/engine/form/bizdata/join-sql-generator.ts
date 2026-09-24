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
 *   SELECT m.*, j1.name AS customer_name FROM wf_biz_order m
 *     LEFT JOIN wf_biz_customer j1 ON j1.id = JSON_UNQUOTE(JSON_EXTRACT(m.customer_id,'$[0]'))
 *       AND j1.tenant_id = ?
 *     WHERE m.tenant_id = ? [AND 白名单筛选] ORDER BY <ref> DESC LIMIT ? OFFSET ?
 * ```
 *
 * 【分组】同连接条件 `(localField, targetFormKey, foreignField)` 的多条 join 合并为**一条**
 * `LEFT JOIN` + 组内多个 SELECT 虚拟列（对齐 Java `JoinGroup`/`group()`）。alias 由系统按组
 * 自动分配 `j1..jN`（组序），`JoinConfig.alias` 一律忽略（存量兼容保留字段）——消除同表
 * 重复 JOIN 在 foreignField 非唯一时的结果集乘法膨胀。
 *
 * 【租户过滤】FORM 目标（`wf_biz_*`）在 ON 子句追加 `AND {alias}.tenant_id = ?`
 * （LEFT JOIN 语义下必须放 ON 而不是 WHERE，否则无匹配行会被过滤成 INNER JOIN）；
 * 内建系统表（sys_*）无 tenant_id 列（全局共享数据），不加。
 *
 * 【标识符安全】localField 解析为主表列引用前先过**列白名单**（columns 中存在且 ref 为
 * 主表前缀），foreignField/joinField/virtualKey 拼接前先过**标识符模式**——值仍全部参数
 * 绑定，杜绝存量脏数据/管理员直写 params 带来的标识符注入面。
 *
 * 主表固定别名 `m`；`localField` 为 JSON 列（dataPicker 外键数组）时走 `JSON_EXTRACT`
 * 提取首元素匹配（多选 dataPicker 仅匹配首个关联值，属既定语义，前端有提示），普通列
 * 直接等值连接。
 */

/** 内置可排序/可查询列（主表系统列，始终解析为主表别名引用）。 */
const BUILTIN_COLUMNS = new Set(['id', 'created_at', 'updated_at'])

const ALLOWED_ORDER = new Set(['asc', 'desc'])

/**
 * JOIN 标识符模式（列名/虚拟列 key 通用，对齐 Java 新版 `JOIN_FIELD_PATTERN`）。
 * 首字符允许下划线（与 `ensureAlias` 一致），上限 64 字符（物理标识符限制）。
 */
const JOIN_FIELD_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/

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

/**
 * 分组后的 JOIN 单元：共享连接条件，携带组内字段成员。
 * `alias` 由 {@link groupJoins} 按组序自动分配（j1, j2, ...）。
 */
export interface JoinGroup {
  alias: string
  targetFormKey: string
  localField: string
  foreignField: string
  members: JoinConfig[]
}

/** 查询列映射（key → SQL 引用 + 类型 + 能力标记）；ref 形如 `"m.order_no"` / `"j1.name"`。 */
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
 * 按 `(localField, targetFormKey, foreignField)` 分组；保序，组序即 alias 序号（j1, j2, ...）。
 * `JoinConfig.alias` 一律忽略（存量兼容），以分组分配的 alias 为准（对齐 Java `group`）。
 */
export function groupJoins(joins: JoinConfig[]): JoinGroup[] {
  const byKey = new Map<string, JoinGroup>()
  const ordered: JoinGroup[] = []
  let idx = 0
  for (const join of joins) {
    const key = `${String(join.localField)}|${String(join.targetFormKey)}|${String(join.foreignField)}`
    let group = byKey.get(key)
    if (group === undefined) {
      idx++
      group = {
        alias: `j${idx}`,
        targetFormKey: String(join.targetFormKey),
        localField: String(join.localField),
        foreignField: String(join.foreignField),
        members: [],
      }
      byKey.set(key, group)
      ordered.push(group)
    }
    group.members.push(join)
  }
  return ordered
}

/** columns 中是否存在指定 key（用于判断是否带出 `<virtualKey>_text` 冗余列）。 */
function hasColumn(columns: QueryColumn[], key: string): boolean {
  return columns.some((c) => c.key === key)
}

/**
 * 生成单组 ON 子句片段：`ON {alias}.{foreignField} = {localRef}`，
 * FORM 目标追加 ` AND {alias}.tenant_id = ?`（租户过滤参数推入 params）。
 */
function joinOnClause(group: JoinGroup, columns: QueryColumn[], params: unknown[], tenantId: string): string {
  requireIdentifier(group.foreignField, '目标表关联字段')
  requireIdentifier(group.localField, '主表关联字段')
  let sql = ` LEFT JOIN ${resolveJoinTargetTable(group.targetFormKey)} ${group.alias}`
  sql += ` ON ${group.alias}.${group.foreignField} = ${localRef(group.localField, columns)}`
  if (!isJoinTargetSystemKey(group.targetFormKey)) {
    // FORM 目标物理表带 tenant_id —— LEFT JOIN 语义下过滤必须放 ON（放 WHERE 会退化为 INNER JOIN）
    sql += ` AND ${group.alias}.tenant_id = ?`
    params.push(tenantId)
  }
  return sql
}

/**
 * 生成分页 SELECT：主表 `m.*` + 虚拟列，按组 LEFT JOIN，注入白名单筛选/排序/分页/租户。
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
  const groups = groupJoins(joins)
  for (const group of groups) {
    for (const member of group.members) {
      requireIdentifier(member.joinField, '显示字段')
      requireIdentifier(member.virtualKey, '虚拟列 key')
      sql += `, ${group.alias}.${member.joinField} AS ${member.virtualKey}`
      // 目标列为 dataPicker 引用列（含 <virtualKey>_text 冗余文本 QueryColumn）：SELECT 一并带出
      if (hasColumn(columns, `${String(member.virtualKey)}_text`)) {
        sql += `, ${group.alias}.${member.joinField}_text AS ${String(member.virtualKey)}_text`
      }
    }
  }
  sql += ` FROM ${mainTable} m`
  const params: unknown[] = []
  for (const group of groups) {
    sql += joinOnClause(group, columns, params, tenantId)
  }
  sql += ' WHERE m.tenant_id = ?'
  params.push(tenantId)

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
 * JOIN 链不可省略：foreignField 非唯一时 SELECT 会行膨胀，COUNT 必须与之同构。
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
  const params: unknown[] = []
  for (const group of groupJoins(joins)) {
    sql += joinOnClause(group, columns, params, tenantId)
  }
  sql += ' WHERE m.tenant_id = ?'
  params.push(tenantId)

  sql += appendFilters(params, filters, access(columns), FILTER_OPTIONS)
  sql += appendKeyword(params, keyword, keywordColumn, access(columns), FILTER_OPTIONS)
  return { sql, params }
}

/**
 * 保存/运行时共用校验：必填字段、标识符格式、virtualKey 唯一、virtualKey 不与主表列冲突。
 * 注：alias 由系统按组自动分配（`groupJoins`），输入值一律忽略（存量兼容，对齐 Java 新版）。
 *
 * @param joins       关联声明列表
 * @param mainColumns 主表列 key 列表（含 id —— `SELECT m.*` 已带主键，虚拟列同名会重复列报错）
 */
export function validate(joins: JoinConfig[] | null, mainColumns: string[] | null): void {
  if (joins === null || joins.length === 0) return
  const virtualKeys = new Set<string>()
  for (const join of joins) {
    requireText(join.targetFormKey, '关联目标表')
    requireText(join.localField, '主表关联字段')
    requireText(join.foreignField, '目标表关联字段')
    requireText(join.joinField, '目标表展示字段')
    requireText(join.virtualKey, '虚拟列 key')
    requireIdentifier(join.localField, '主表关联字段')
    requireIdentifier(join.foreignField, '目标表关联字段')
    requireIdentifier(join.joinField, '显示字段')
    requireIdentifier(join.virtualKey, '虚拟列 key')
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

/** 标识符格式校验（列名/虚拟列 key；拼接进 SQL 前的最后防线）。 */
function requireIdentifier(value: string | null, label: string): void {
  if (value === null || !JOIN_FIELD_PATTERN.test(value)) {
    throw illegal(`${label}非法: ${String(value)}`)
  }
}

/**
 * JOIN 匹配的 `localField` 引用：JSON 列提取首元素，普通列直接引用。
 *
 * ⚠️ 白名单前置：`localField` 必须在 columns 中存在**且为主表列**（ref 主表前缀），
 * 否则拒绝拼接 —— 既防手输错列名运行时才爆 SQL 错，也封死存量脏 params 的标识符注入面。
 */
function localRef(localField: string, columns: QueryColumn[]): string {
  // 内置系统列始终属于主表（id/created_at/updated_at，DDL 必有）
  if (BUILTIN_COLUMNS.has(localField)) {
    return `m.${localField}`
  }
  const column = columns.find((c) => c.key === localField)
  if (column === undefined || !column.ref.startsWith('m.')) {
    throw illegal(`主表关联字段不存在: ${localField}`)
  }
  if (column.columnType.toUpperCase() === 'JSON') {
    return `JSON_UNQUOTE(JSON_EXTRACT(m.${localField},'$[0]'))`
  }
  return `m.${localField}`
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
    isJson: (key) => {
      const column = columns.find((c) => c.key === key)
      return column === undefined ? false : column.columnType.toUpperCase() === 'JSON'
    },
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
