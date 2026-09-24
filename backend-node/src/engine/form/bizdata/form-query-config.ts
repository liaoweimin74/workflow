import { newColumnConfig, type ColumnConfig } from '../../../common/domain/column-config'
import type { JoinConfig } from './join-sql-generator'

/**
 * FORM 数据源查询模式配置（对齐 Java `com.workflow.engine.form.bizdata.FormQueryConfig`）。
 *
 * 从 FORM 数据源 `params` JSON 中提取可选 `queryMode` 段（与既有 list/create/get/update/delete
 * action 配置共存于同一 JSON，互不冲突）：
 * ```
 *   config：{"queryMode":"config","joins":[{alias,targetFormKey,localField,foreignField,
 *            joinField,virtualKey,label,sortable,filterable}]}
 *   sql：   {"queryMode":"sql","query":"...","columns":[{key,label,columnType,sortable,filterable}],
 *            "params":["startTime"]}
 *   visual：{"queryMode":"visual","query":"...","columns":[...],"params":[...]}
 * ```
 *
 * 缺省（无 queryMode / queryMode 未知 / config 且 joins 为空 / sql 且 query 空白）→
 * 三个 `isXxxMode` 均为 false，调用方回退原单表查询，保持向后兼容。
 */
export interface FormQueryConfig {
  queryMode: string | null
  joins: JoinConfig[]
  query: string | null
  columns: ColumnConfig[]
  declaredParams: string[]
}

/** `config`（声明式 JOIN）模式生效：`queryMode=config` 且 `joins` 非空。 */
export function isConfigMode(config: FormQueryConfig): boolean {
  return config.queryMode === 'config' && config.joins.length > 0
}

/** `sql`（管理员模板 + 参数透传）模式生效：`queryMode=sql` 且 `query` 非空白。 */
export function isSqlMode(config: FormQueryConfig): boolean {
  return config.queryMode === 'sql' && isNotBlank(config.query)
}

/** `visual`（可视化构建器）模式生效：`queryMode=visual` 且 `query` 非空白。 */
export function isVisualMode(config: FormQueryConfig): boolean {
  return config.queryMode === 'visual' && isNotBlank(config.query)
}

function isNotBlank(value: string | null): boolean {
  return value !== null && value.trim() !== ''
}

function empty(): FormQueryConfig {
  return { queryMode: null, joins: [], query: null, columns: [], declaredParams: [] }
}

/**
 * 解析 FORM 数据源 `params` JSON。
 *
 * null/空白 → 默认配置；非法 JSON → 400（对齐 Java 文案）。
 * 非对象根（数组/标量）→ 400「数据源 params 必须是 JSON 对象」。
 */
export function parseFormQueryConfig(
  paramsJson: string | null,
  fail: (message: string) => Error,
): FormQueryConfig {
  if (paramsJson === null || paramsJson.trim() === '') return empty()

  let root: unknown
  try {
    root = JSON.parse(paramsJson)
  } catch (error) {
    throw fail(
      `数据源 params 不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (root === null || typeof root !== 'object' || Array.isArray(root)) {
    throw fail('数据源 params 必须是 JSON 对象')
  }

  const record = root as Record<string, unknown>
  const mode = text(record.queryMode)
  if (mode === 'config') {
    return { queryMode: mode, joins: parseJoins(record.joins), query: null, columns: [], declaredParams: [] }
  }
  if (mode === 'sql' || mode === 'visual') {
    return {
      queryMode: mode,
      joins: [],
      query: text(record.query),
      columns: parseColumns(record.columns),
      declaredParams: parseStrings(record.params),
    }
  }
  // 缺省/未知 queryMode：保留 mode，但三个 isXxxMode 均为 false
  return { queryMode: mode, joins: [], query: null, columns: [], declaredParams: [] }
}

/** `joins[]` 解析（对齐 Java `parseJoins`：非对象项跳过，布尔字段非布尔即 false）。
 *
 * alias 约定：前端不录入，缺失/空白时按序自动分配 `j1/j2/...`（保证唯一），
 * 与 FormJoinConfig「alias 由后端系统按组自动分配」的注释一致；传入的合法 alias 原样保留。 */
function parseJoins(node: unknown): JoinConfig[] {
  const out: JoinConfig[] = []
  if (!Array.isArray(node)) return out
  const used = new Set<string>()
  let idx = 0
  for (const item of node) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
    idx++
    const n = item as Record<string, unknown>
    out.push({
      alias: ensureAlias(text(n.alias), used, idx),
      targetFormKey: text(n.targetFormKey),
      localField: text(n.localField),
      foreignField: text(n.foreignField),
      joinField: text(n.joinField),
      virtualKey: text(n.virtualKey),
      label: text(n.label),
      sortable: bool(n.sortable),
      filterable: bool(n.filterable),
    })
  }
  return out
}

/**
 * alias 确定化：合法且未用 → 原样；否则按 `j${idx}` 起步找空位。
 * 保存侧（data-source-write.service）允许缺失，由本函数兜底，两端语义一致。
 * 导出供 previewJoinSql（不经 parseFormQueryConfig 的裸 joins）复用。
 */
export function ensureAlias(alias: string | null, used: Set<string>, idx: number): string {
  if (alias !== null && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) {
    if (!used.has(alias)) {
      used.add(alias)
      return alias
    }
  }
  let n = Math.max(idx, used.size + 1)
  let candidate = `j${n}`
  while (used.has(candidate)) {
    n++
    candidate = `j${n}`
  }
  used.add(candidate)
  return candidate
}

/**
 * `columns[]` 解析（对齐 Java `parseColumns`）。
 *
 * ⚠️ Java 只赋值 13 个字段，`pickerConfig`/`storageMode`/`subColumns`/`subMode` 保持 POJO
 *    初始化值 —— 因此这里必须从 `newColumnConfig()` 起手，不能手写对象字面量。
 */
function parseColumns(node: unknown): ColumnConfig[] {
  const out: ColumnConfig[] = []
  if (!Array.isArray(node)) return out
  for (const item of node) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
    const n = item as Record<string, unknown>
    const column = newColumnConfig()
    column.key = text(n.key)
    column.label = text(n.label)
    column.columnType = text(n.columnType)
    column.length = intVal(n.length)
    column.scale = intVal(n.scale)
    column.required = bool(n.required)
    column.unique = bool(n.unique)
    column.indexed = bool(n.indexed)
    column.hidden = bool(n.hidden)
    column.componentType = text(n.componentType)
    column.sortable = bool(n.sortable)
    column.filterable = bool(n.filterable)
    column.matchType = text(n.matchType)
    out.push(column)
  }
  return out
}

/** 字符串数组解析（对齐 Java `parseStrings`：仅收非空白文本项）。 */
function parseStrings(node: unknown): string[] {
  const out: string[] = []
  if (!Array.isArray(node)) return out
  for (const item of node) {
    if (typeof item === 'string' && item.trim() !== '') out.push(item)
  }
  return out
}

/** 文本字段：null/缺失 → null；非字符串按 Java `asText()` 语义转字符串。 */
function text(node: unknown): string | null {
  if (node === null || node === undefined) return null
  if (typeof node === 'string') return node
  if (typeof node === 'number' || typeof node === 'boolean') return String(node)
  // Jackson 的 asText() 对对象/数组返回空串
  return ''
}

/** Java `isBoolean() && asBoolean()`：非布尔一律 false（含 `"true"` 字符串）。 */
function bool(node: unknown): boolean {
  return node === true
}

/** Java `isNumber() ? asInt() : null`。 */
function intVal(node: unknown): number | null {
  return typeof node === 'number' && Number.isFinite(node) ? Math.trunc(node) : null
}
