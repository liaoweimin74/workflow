import { BusinessException } from '../../../common/exception/business-exception'
import { newColumnConfig, type ColumnConfig } from '../../../common/domain/column-config'

/**
 * 表单 `column_config` 的解析、校验与能力推导。
 *
 * 对齐 Java 侧三处：
 *   - `FormDefinitionService.parseColumnConfig` + `validateColumnConfig`（解析与校验）
 *   - `FormSchemaColumnExtractor.extract`（反序列化）
 *   - `SortableResolver.resolve`（排序能力推导）
 */

/** 合法列名（对齐 Java `COL_PATTERN` / `FORM_KEY_PATTERN`）。 */
export const COLUMN_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/

/** 系统保留列，不允许作为业务列。 */
const RESERVED_COLUMNS = new Set([
  'id',
  'tenant_id',
  'version',
  'created_by',
  'created_at',
  'updated_at',
])

/** 允许的列类型（对齐 Java `validateColumnConfig` 的白名单）。 */
const ALLOWED_COLUMN_TYPES = new Set([
  'VARCHAR',
  'TEXT',
  'LONGTEXT',
  'INT',
  'DECIMAL',
  'DATE',
  'DATETIME',
  'TINYINT',
  'JSON',
])

/**
 * 把 JSON 里的一个列条目规整成完整的 `ColumnConfig`。
 *
 * ⚠️ **必须从 `newColumnConfig()` 起步再覆盖**，不能直接把解析结果当 ColumnConfig 用：
 *    前端持久化的 `column_config` 只写它关心的字段（例如 `person` 的 `code` 列只有
 *    key/label/scale/length/unique/indexed/required/columnType/componentType 九个），
 *    而 Java 侧是一个 POJO —— Jackson 会把没出现的字段也序列化成 `null`/`false`
 *    （`storageMode` 更是靠字段初始化器给出 `'JSON'`）。
 *    少一个字段，契约比对就会报「字段缺失」。
 */
function normalizeColumn(raw: Record<string, unknown>): ColumnConfig {
  const column = newColumnConfig()
  // 逐字段覆盖，只认 ColumnConfig 上真实存在的字段（Spring Boot 默认关闭
  // FAIL_ON_UNKNOWN_PROPERTIES，未知键被静默忽略 —— 这里保持一致）
  if ('key' in raw) column.key = asNullableString(raw.key)
  if ('label' in raw) column.label = asNullableString(raw.label)
  if ('columnType' in raw) column.columnType = asNullableString(raw.columnType)
  if ('length' in raw) column.length = asNullableNumber(raw.length)
  if ('scale' in raw) column.scale = asNullableNumber(raw.scale)
  if ('required' in raw) column.required = raw.required === true
  if ('unique' in raw) column.unique = raw.unique === true
  if ('indexed' in raw) column.indexed = raw.indexed === true
  if ('hidden' in raw) column.hidden = raw.hidden === true
  if ('pickerConfig' in raw) column.pickerConfig = asNullableString(raw.pickerConfig)
  if ('storageMode' in raw) {
    column.storageMode = asNullableString(raw.storageMode) ?? 'JSON'
  }
  if ('componentType' in raw) column.componentType = asNullableString(raw.componentType)
  if ('sortable' in raw) column.sortable = asNullableBoolean(raw.sortable)
  if ('filterable' in raw) column.filterable = asNullableBoolean(raw.filterable)
  if ('matchType' in raw) column.matchType = asNullableString(raw.matchType)
  if ('subColumns' in raw) {
    const subs = raw.subColumns
    column.subColumns =
      Array.isArray(subs) ? subs.map((s) => normalizeColumn(asRecord(s))) : null
  }
  if ('subMode' in raw) column.subMode = asNullableString(raw.subMode)
  return column
}

/**
 * 解析并校验业务表单的 `column_config`。
 *
 * 对齐 Java `FormDefinitionService.parseColumnConfig`，错误消息**逐字一致**：
 *   - 空白 → 400 `业务表单发布前必须配置列映射（column_config）`
 *   - 非法 JSON → 400 `业务表单列映射配置非法: <原因>`
 *   - 空数组 → 400 `业务表单列映射不能为空`
 *   - 单列非法 → 400 `非法列名: x` / `列名 x 为系统保留列` / `非法列类型: x`
 *   - `storageMode = SUB_TABLE` → 400 `子表存储模式暂未实现: x`
 */
export function parseBusinessColumnConfig(columnConfig: string | null): ColumnConfig[] {
  if (columnConfig === null || columnConfig.trim() === '') {
    throw new BusinessException(400, '业务表单发布前必须配置列映射（column_config）')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(columnConfig)
  } catch (error) {
    throw new BusinessException(
      400,
      `业务表单列映射配置非法: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (!Array.isArray(parsed)) {
    throw new BusinessException(400, '业务表单列映射配置非法: 应为数组')
  }

  const columns = parsed.map((item) => normalizeColumn(asRecord(item)))
  if (columns.length === 0) {
    throw new BusinessException(400, '业务表单列映射不能为空')
  }

  for (const column of columns) {
    validateColumnConfig(column)
    if (column.storageMode === 'SUB_TABLE') {
      throw new BusinessException(400, `子表存储模式暂未实现: ${String(column.key)}`)
    }
  }
  return columns
}

/** 单列校验（对齐 Java `validateColumnConfig`，含子列递归）。 */
export function validateColumnConfig(column: ColumnConfig): void {
  if (column.key === null || !COLUMN_NAME_PATTERN.test(column.key)) {
    throw new BusinessException(400, `非法列名: ${String(column.key)}`)
  }
  // 子表字段自身无列类型，递归校验子列后返回
  if (column.subColumns !== null && column.subColumns.length > 0) {
    for (const sub of column.subColumns) validateColumnConfig(sub)
    return
  }
  if (RESERVED_COLUMNS.has(column.key)) {
    throw new BusinessException(400, `列名 ${column.key} 为系统保留列`)
  }
  if (column.columnType === null || !ALLOWED_COLUMN_TYPES.has(column.columnType)) {
    throw new BusinessException(400, `非法列类型: ${String(column.columnType)}`)
  }
}

/** 不可排序的列类型（对齐 Java `SortableResolver.UNSORTABLE_TYPES`）。 */
const UNSORTABLE_TYPES = new Set(['JSON', 'TEXT'])
/** 不可排序的组件类型。 */
const UNSORTABLE_COMPONENTS = new Set(['colorPicker'])

/**
 * 就地填充未显式标注的 `sortable`（已标注的列不覆盖）。
 *
 * ⚠️ 这一步是 `dsMetadata` 与 `biz-data` 两组 golden 的差异来源之一：
 *    column_config 里**没有** sortable 字段，metadata 响应里却必须有值。
 */
export function resolveSortable(columns: ColumnConfig[]): void {
  for (const column of columns) {
    if (column.sortable === null) column.sortable = isSortable(column)
  }
}

function isSortable(column: ColumnConfig): boolean {
  if (column.subColumns !== null && column.subColumns.length > 0) return false
  const type = column.columnType
  if (type !== null && UNSORTABLE_TYPES.has(type.toUpperCase())) return false
  const component = column.componentType
  return component === null || !UNSORTABLE_COMPONENTS.has(component)
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return typeof value === 'string' ? value : String(value)
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function asNullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}
