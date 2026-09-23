import type { ColumnConfig } from '../../../common/domain/column-config'

/**
 * 受控 DDL 语句生成器（对齐 Java `com.workflow.engine.form.column.DdlBuilder`，
 * 含 `ColumnTypeMapper` 里与 DDL 相关的两个判定）。
 *
 * 设计约束（照抄 Java，一条都不能松）：
 *   - 只有**增列、改列宽/精度（只加不减）、改必填、加索引**；
 *   - **禁止删列** —— `desired` 里没有的现有列直接忽略（防丢数据）；
 *   - **禁止类型跨大类变更**（`isCrossTypeChange`）：字符串类 / 整数类 / 小数类 / 日期类之间互切都不允许；
 *   - 所有标识符（表名后缀、列名）都过白名单正则，**杜绝 SQL 注入**。
 *
 * ⚠️ 错误一律用 `IllegalArgumentException` 形态（`err.name` 决定 HTTP 状态）：
 *    Java 抛的是 `IllegalArgumentException`，被全局处理器映射成
 *    **HTTP 400 + body `{code:400, msg}`**。写成普通 `Error` 会变成 HTTP 500，
 *    而写成 `BusinessException` 会变成 HTTP 200 + body code —— 三种都不一样。
 *    契约场景 `POST /form-definitions/{id}/publish` 的非法列配置分支会钉住它。
 */

/** 列名 / 表单 key 白名单：字母开头，字母数字下划线，最长 64。 */
const IDENTIFIER_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/

/** 主表固定列保留字，不允许业务列占用。 */
const RESERVED_COLUMNS = new Set([
  'id',
  'tenant_id',
  'version',
  'created_by',
  'created_at',
  'updated_at',
])

/** 子表固定列保留字（比主表多 biz_id / sort_no）。 */
const SUB_RESERVED_COLUMNS = new Set([
  'id',
  'biz_id',
  'tenant_id',
  'sort_no',
  'version',
  'created_by',
  'created_at',
  'updated_at',
])

/** VARCHAR 长度上限。 */
export const MAX_VARCHAR_LENGTH = 255

/** 允许的列类型白名单。 */
const ALLOWED_TYPES = new Set([
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
 * 物理表列信息（来自 `information_schema`）。
 * 与 `DataSourceRepository.findTableColumns` 的返回形状一致，可直接互通。
 */
export interface ColumnInfo {
  key: string
  columnType: string
  length: number | null
  scale: number | null
  nullable: boolean
  unique: boolean
}

/** 抛 `IllegalArgumentException` 形态的错（→ HTTP 400 + body code 400）。 */
function illegalArgument(message: string): never {
  const err = new Error(message)
  err.name = 'IllegalArgumentException'
  throw err
}

/** 校验表单 key（表名后缀白名单）。 */
export function validateFormKey(formKey: string | null): void {
  if (formKey === null || !IDENTIFIER_PATTERN.test(formKey)) {
    illegalArgument(
      `非法表单 key（仅允许字母开头，含字母/数字/下划线，最长 64）: ${String(formKey)}`,
    )
  }
}

/** 校验子表字段名（子表名后缀白名单）。 */
export function validateSubField(field: string | null): void {
  if (field === null || !IDENTIFIER_PATTERN.test(field)) {
    illegalArgument(
      `非法子表字段名（仅允许字母开头，含字母/数字/下划线，最长 64）: ${String(field)}`,
    )
  }
}

/** 列类型是否在白名单内（`ColumnTypeMapper.isAllowedColumnType`）。 */
export function isAllowedColumnType(columnType: string | null): boolean {
  return columnType !== null && ALLOWED_TYPES.has(columnType)
}

/**
 * 列类型归大类（`ColumnTypeMapper.categoryOf`）。
 *
 * ⚠️ 归类结果看起来有点怪但必须照抄：**TINYINT 与 JSON 都归到「字符串」大类**，
 *    所以 `VARCHAR → TINYINT`、`JSON → VARCHAR` 会被判为**同大类、允许变更**；
 *    而 `INT` 单独一类（`INT → VARCHAR` 是跨类、禁止）。
 */
function categoryOf(type: string | null): string {
  if (type === null) return 'UNKNOWN'
  switch (type) {
    case 'VARCHAR':
    case 'TEXT':
    case 'LONGTEXT':
    case 'TINYINT':
    case 'JSON':
      return 'STRING'
    case 'INT':
      return 'INT'
    case 'DECIMAL':
      return 'DECIMAL'
    case 'DATE':
    case 'DATETIME':
      return 'DATE'
    default:
      return 'UNKNOWN'
  }
}

/** 是否为跨大类变更（不允许）。 */
export function isCrossTypeChange(oldType: string | null, newType: string | null): boolean {
  return categoryOf(oldType) !== categoryOf(newType)
}

/** 子表占位字段判定：`subColumns` 非空即为占位，不生成主表列定义。 */
function isSubtableField(column: ColumnConfig): boolean {
  return column.subColumns !== null && column.subColumns.length > 0
}

/** 列定义 SQL 片段（类型 + NOT NULL）。 */
function columnDefinition(column: ColumnConfig): string {
  let type: string
  switch (column.columnType) {
    case 'VARCHAR':
      type = `VARCHAR(${column.length ?? 255})`
      break
    case 'TEXT':
      type = 'TEXT'
      break
    case 'LONGTEXT':
      type = 'LONGTEXT'
      break
    case 'INT':
      type = 'INT'
      break
    case 'DECIMAL':
      type = `DECIMAL(${column.length ?? 18},${column.scale ?? 0})`
      break
    case 'DATE':
      type = 'DATE'
      break
    case 'DATETIME':
      type = 'DATETIME'
      break
    case 'TINYINT':
      type = 'TINYINT(1)'
      break
    case 'JSON':
      type = 'JSON'
      break
    default:
      return illegalArgument(`非法列类型: ${String(column.columnType)}`)
  }
  return column.required ? `${type} NOT NULL` : type
}

/** 校验子表列（复用主表校验 + 额外禁止子表固定列）。 */
function validateSubColumns(columns: ColumnConfig[]): void {
  validateColumns(columns)
  for (const column of columns) {
    if (column.key !== null && SUB_RESERVED_COLUMNS.has(column.key)) {
      illegalArgument(`子表列名 ${column.key} 为系统保留列，不允许作为业务列`)
    }
  }
}

/** 校验列映射列表：列名合法、非保留字、类型白名单、长度合法。 */
function validateColumns(columns: ColumnConfig[]): void {
  for (const column of columns) {
    if (column.key === null || !IDENTIFIER_PATTERN.test(column.key)) {
      illegalArgument(
        `非法列名（仅允许字母开头，含字母/数字/下划线，最长 64）: ${String(column.key)}`,
      )
    }
    const key = column.key
    // 子表占位字段：自身无列类型，只校验字段名并递归校验子列
    if (isSubtableField(column)) {
      validateSubColumns(column.subColumns ?? [])
      continue
    }
    if (RESERVED_COLUMNS.has(key)) {
      illegalArgument(`列名 ${key} 为系统保留列，不允许作为业务列`)
    }
    if (!isAllowedColumnType(column.columnType)) {
      illegalArgument(`非法列类型: ${String(column.columnType)}`)
    }
    if (column.columnType === 'VARCHAR') {
      const len = column.length ?? MAX_VARCHAR_LENGTH
      if (len < 1 || len > MAX_VARCHAR_LENGTH) {
        illegalArgument(`VARCHAR 长度必须在 1~255 之间: ${key}`)
      }
    }
    if (column.columnType === 'DECIMAL') {
      const len = column.length ?? 18
      const scale = column.scale ?? 0
      if (len < 1 || len > 30 || scale < 0 || scale > len) {
        illegalArgument(`DECIMAL 长度/精度非法: ${key}`)
      }
    }
  }
}

/** 主表名。 */
export function tableName(formKey: string): string {
  return `wf_biz_${formKey}`
}

/** 子表名。 */
export function subTableName(formKey: string, field: string): string {
  return `wf_biz_${formKey}_${field}`
}

/**
 * 生成建表语句（`DdlBuilder.buildCreateTable`）。
 *
 * ⚠️ 列顺序即契约：`id` → `tenant_id` → 业务列（按 column_config 顺序，**跳过子表占位字段**）
 *    → `version` → `created_by` → `created_at` → `updated_at` → PRIMARY KEY → 唯一键/索引。
 *    改顺序会改变物理表结构（虽然多数场景无感，但没有理由不照抄）。
 */
export function buildCreateTable(formKey: string, columns: ColumnConfig[]): string {
  validateFormKey(formKey)
  validateColumns(columns)

  const table = tableName(formKey)
  // 逐语句累加，与 Java 的 StringBuilder 拼接**一一对应** ——
  // 不要改写成"数组 join"：逗号在 Java 里是**下一条的接缝**（`,\n    `），
  // 用 join(',\n') 很容易多出或漏掉逗号（这里踩过一次：全套行都变成 `,,`）。
  let sql = `CREATE TABLE IF NOT EXISTS ${table} (\n`
  sql += '    id VARCHAR(64) NOT NULL,\n'
  sql += '    tenant_id VARCHAR(64) NOT NULL,\n'
  for (const column of columns) {
    if (isSubtableField(column)) continue
    sql += `    ${column.key} ${columnDefinition(column)},\n`
  }
  sql += '    version INT NOT NULL DEFAULT 1,\n'
  sql += '    created_by VARCHAR(50),\n'
  sql += '    created_at DATETIME,\n'
  sql += '    updated_at DATETIME,\n'
  sql += '    PRIMARY KEY (id)'

  for (const column of columns) {
    if (isSubtableField(column)) continue
    if (column.unique) {
      sql += `,\n    UNIQUE KEY uk_${formKey}_${column.key} (tenant_id, ${column.key})`
    }
    if (column.indexed) {
      sql += `,\n    INDEX idx_${formKey}_${column.key} (${column.key})`
    }
  }

  return sql + '\n)'
}

/**
 * 子表建表语句（`buildCreateSubTable`）。
 * 子表固定列：id / biz_id / tenant_id / 业务列 / sort_no / version / created_by / created_at / updated_at，
 * 外加 `(tenant_id, biz_id)` 复合索引。
 */
export function buildCreateSubTable(
  formKey: string,
  field: string,
  subColumns: ColumnConfig[],
): string {
  validateFormKey(formKey)
  validateSubField(field)
  validateSubColumns(subColumns)

  const table = subTableName(formKey, field)
  let sql = `CREATE TABLE IF NOT EXISTS ${table} (\n`
  sql += '    id VARCHAR(64) NOT NULL,\n'
  sql += '    biz_id VARCHAR(64) NOT NULL,\n'
  sql += '    tenant_id VARCHAR(64) NOT NULL,\n'
  for (const column of subColumns) {
    sql += `    ${column.key} ${columnDefinition(column)},\n`
  }
  sql += '    sort_no INT NOT NULL DEFAULT 0,\n'
  sql += '    version INT NOT NULL DEFAULT 1,\n'
  sql += '    created_by VARCHAR(50),\n'
  sql += '    created_at DATETIME,\n'
  sql += '    updated_at DATETIME,\n'
  sql += '    PRIMARY KEY (id)'
  sql += `,\n    KEY idx_${formKey}_${field}_biz (tenant_id, biz_id)`

  for (const column of subColumns) {
    if (column.unique) {
      sql += `,\n    UNIQUE KEY uk_${formKey}_${field}_${column.key} (tenant_id, biz_id, ${column.key})`
    }
    if (column.indexed) {
      sql += `,\n    INDEX idx_${formKey}_${field}_${column.key} (${column.key})`
    }
  }

  return sql + '\n)'
}

/** 现有列按 key 建索引。 */
function byKey(existing: ColumnInfo[]): Map<string, ColumnInfo> {
  const map = new Map<string, ColumnInfo>()
  for (const info of existing) map.set(info.key, info)
  return map
}

/** 长度/精度是否在缩短（防数据截断）。 */
function isNarrowing(current: ColumnInfo, column: ColumnConfig): boolean {
  if (column.columnType === 'VARCHAR' || column.columnType === 'TINYINT') {
    const desiredLen = column.length ?? MAX_VARCHAR_LENGTH
    const currentLen = current.length ?? 0
    return desiredLen < currentLen
  }
  if (column.columnType === 'DECIMAL') {
    const desiredLen = column.length ?? 18
    const desiredScale = column.scale ?? 0
    const currentLen = current.length ?? 0
    const currentScale = current.scale ?? 0
    return desiredLen < currentLen || desiredScale < currentScale
  }
  return false
}

/** 结构是否完全相同（类型、可空性、长度/精度）。 */
function sameDefinition(current: ColumnInfo, column: ColumnConfig): boolean {
  if (
    current.columnType !== column.columnType ||
    current.nullable !== !column.required
  ) {
    return false
  }
  if (column.columnType === 'VARCHAR' || column.columnType === 'TINYINT') {
    const desiredLen = column.length ?? MAX_VARCHAR_LENGTH
    const currentLen = current.length ?? 0
    return desiredLen === currentLen
  }
  if (column.columnType === 'DECIMAL') {
    const desiredLen = column.length ?? 18
    const desiredScale = column.scale ?? 0
    const currentLen = current.length ?? 0
    const currentScale = current.scale ?? 0
    return desiredLen === currentLen && desiredScale === currentScale
  }
  return true
}

/**
 * 生成主表差异变更语句（`buildAlterStatements`）。
 *
 * ⚠️ 三条硬规则：跨大类变更 → 抛错；缩短长度/精度 → 抛错；
 *    `desired` 中不存在的现有列 → **忽略**（禁止 DROP COLUMN）。
 */
export function buildAlterStatements(
  formKey: string,
  desired: ColumnConfig[],
  existing: ColumnInfo[],
): string[] {
  validateFormKey(formKey)
  validateColumns(desired)

  const table = tableName(formKey)
  const existingMap = byKey(existing)
  const statements: string[] = []

  for (const column of desired) {
    if (isSubtableField(column)) continue
    const key = column.key ?? ''
    const current = existingMap.get(key)
    if (current === undefined) {
      statements.push(`ALTER TABLE ${table} ADD COLUMN ${key} ${columnDefinition(column)}`)
      if (column.unique) {
        statements.push(
          `ALTER TABLE ${table} ADD UNIQUE INDEX uk_${formKey}_${key} (tenant_id, ${key})`,
        )
      }
      if (column.indexed) {
        statements.push(`ALTER TABLE ${table} ADD INDEX idx_${formKey}_${key} (${key})`)
      }
      continue
    }

    if (isCrossTypeChange(current.columnType, column.columnType)) {
      illegalArgument(
        `列 ${key} 类型跨类变更不被支持: ${current.columnType} -> ${String(column.columnType)}`,
      )
    }
    if (isNarrowing(current, column)) {
      illegalArgument(`列 ${key} 不允许缩短长度/精度（防数据截断）`)
    }
    if (!sameDefinition(current, column)) {
      statements.push(
        `ALTER TABLE ${table} MODIFY COLUMN ${key} ${columnDefinition(column)}`,
      )
    }
    if (column.unique && !current.unique) {
      statements.push(
        `ALTER TABLE ${table} ADD UNIQUE INDEX uk_${formKey}_${key} (tenant_id, ${key})`,
      )
    }
  }
  return statements
}

/** 生成子表差异变更语句（`buildAlterSubTable`）。规则与主表一致，但**不加索引**。 */
export function buildAlterSubTable(
  formKey: string,
  field: string,
  desired: ColumnConfig[],
  existing: ColumnInfo[],
): string[] {
  validateFormKey(formKey)
  validateSubField(field)
  validateSubColumns(desired)

  const table = subTableName(formKey, field)
  const existingMap = byKey(existing)
  const statements: string[] = []

  for (const column of desired) {
    const key = column.key ?? ''
    const current = existingMap.get(key)
    if (current === undefined) {
      statements.push(`ALTER TABLE ${table} ADD COLUMN ${key} ${columnDefinition(column)}`)
      continue
    }
    if (isCrossTypeChange(current.columnType, column.columnType)) {
      illegalArgument(
        `子表列 ${key} 类型跨类变更不被支持: ${current.columnType} -> ${String(column.columnType)}`,
      )
    }
    if (isNarrowing(current, column)) {
      illegalArgument(`子表列 ${key} 不允许缩短长度/精度（防数据截断）`)
    }
    if (!sameDefinition(current, column)) {
      statements.push(
        `ALTER TABLE ${table} MODIFY COLUMN ${key} ${columnDefinition(column)}`,
      )
    }
  }
  return statements
}
