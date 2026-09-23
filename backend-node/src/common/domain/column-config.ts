/**
 * 数据源元数据与列定义 —— 契约 DTO，对齐 Java 侧
 * `com.workflow.engine.form.column.ColumnConfig` 与 `com.workflow.api.dto.DataSourceMetadata`。
 *
 * 放在 common 是因为两个平级模块都要产出它：
 *   - engine（数据源 SPI 的 `metadata` 方法）
 *   - api（`/api/v1/internal/system/{dept-tree,users}/metadata` 内置数据源）
 * 而边界规则禁止 api 依赖 engine 的内部类型。它是纯数据形状，属于 common。
 */

/**
 * 列定义。
 *
 * ⚠️ 字段名与 Java 完全一致，**一个都不能省** —— Java 侧是一个 POJO，
 *    Jackson 会把没赋值的字段也序列化成 `null`/`false`。
 *    少写一个字段，契约比对就会报「字段缺失」。
 */
export interface ColumnConfig {
  key: string | null
  label: string | null
  columnType: string | null
  length: number | null
  scale: number | null
  required: boolean
  unique: boolean
  indexed: boolean
  hidden: boolean
  pickerConfig: string | null
  /** 默认值 'JSON'（Java 侧的字段初始化器）。 */
  storageMode: string
  componentType: string | null
  sortable: boolean | null
  filterable: boolean | null
  matchType: string | null
  subColumns: ColumnConfig[] | null
  subMode: string | null
}

/**
 * 新建列定义。
 *
 * ⚠️ `componentType` 必须显式赋 `null`：TypeScript 的可选属性在
 *    `JSON.stringify` 时会被**整个丢掉**，而 Java 侧会输出 `"componentType": null`。
 *    两者在契约比对里一个是「字段缺失」、一个是「字段为 null」—— 不一样。
 */
export function newColumnConfig(): ColumnConfig {
  return {
    key: null,
    label: null,
    columnType: null,
    length: null,
    scale: null,
    required: false,
    unique: false,
    indexed: false,
    hidden: false,
    pickerConfig: null,
    storageMode: 'JSON',
    componentType: null,
    sortable: null,
    filterable: null,
    matchType: null,
    subColumns: null,
    subMode: null,
  }
}

/** 只填 key / label 的列定义（对齐 Java `SystemInternalController.columnConfig`）。 */
export function columnConfig(key: string, label: string): ColumnConfig {
  const config = newColumnConfig()
  config.key = key
  config.label = label
  return config
}

/** 数据源元数据（统一 SPI 的 `metadata` 返回）。 */
export interface DataSourceMetadata {
  columns: ColumnConfig[]
  /** 是否支持增删改（只读数据源 false）。 */
  writable: boolean
  /** 绑定表单 formKey（FORM/WORKFLOW 数据源；SYSTEM/API 为空）。 */
  formKey: string | null
}

export function dataSourceMetadata(columns: ColumnConfig[], writable: boolean): DataSourceMetadata {
  return { columns, writable, formKey: null }
}

/**
 * 物理表列信息，对齐 Java `com.workflow.engine.form.column.ColumnInfo`
 * （`/api/v1/data-sources/db/tables/{table}/columns` 的返回元素）。
 */
export interface ColumnInfo {
  key: string
  columnType: string
  length: number | null
  scale: number | null
  nullable: boolean
  unique: boolean
}

/**
 * 列元数据（探测结果元素），对齐 Java `com.workflow.api.dto.ColumnMeta`。
 *
 * ⚠️ **不是** `ColumnInfo`：那个来自 `information_schema`（物理表列），
 *    这个来自**执行结果集的元数据**（`ResultSetMetaData` / mysql2 `FieldPacket`），
 *    字段是 `key/label/columnType/length/scale/nullable`（无 `unique`）。
 *    两个类型不能互换，端点也不同（`explore-sql` vs `db/tables/{t}/columns`）。
 */
export interface ColumnMeta {
  key: string
  label: string
  columnType: string
  length: number | null
  scale: number | null
  nullable: boolean
}

/** `information_schema.DATA_TYPE` → 大写白名单类型（对齐 DynamicTableManager.normalizeType）。 */
export function normalizeColumnType(dataType: string | null): string {
  if (dataType === null) return 'UNKNOWN'
  switch (dataType.toLowerCase()) {
    case 'varchar':
      return 'VARCHAR'
    case 'text':
    case 'mediumtext':
    case 'tinytext':
      return 'TEXT'
    case 'longtext':
      return 'LONGTEXT'
    case 'int':
    case 'integer':
    case 'bigint':
    case 'smallint':
    case 'mediumint':
      return 'INT'
    case 'decimal':
    case 'numeric':
      return 'DECIMAL'
    case 'date':
      return 'DATE'
    case 'datetime':
    case 'timestamp':
      return 'DATETIME'
    case 'tinyint':
      return 'TINYINT'
    case 'json':
      return 'JSON'
    default:
      return dataType.toUpperCase()
  }
}
