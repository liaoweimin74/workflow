import { Inject, Injectable } from '@nestjs/common'
import type { FieldPacket, Pool } from 'mysql2'
import { BusinessException } from '../../../common/exception/business-exception'
import type { ColumnMeta } from '../../../common/domain/column-config'
import { MYSQL_POOL } from '../../../framework/database/database.module'

/** `:placeholder` 占位符（与 Java `SqlMetadataProbe.PLACEHOLDER` 同一模式）。 */
const PLACEHOLDER = /:[A-Za-z_][A-Za-z0-9_]*/g

/**
 * 多语句探测模式，对齐 Java 的 `MULTI_STATEMENT`：
 * `(?is).*;(\s*)(FROM|UPDATE|DELETE|INSERT|DROP|ALTER|CREATE|TRUNCATE).*`
 *
 * ⚠️ Java 用的是 `Matcher.matches()`（**全串匹配**），所以这里的正则要整段锚定。
 */
const MULTI_STATEMENT =
  /^[\s\S]*;\s*(?:FROM|UPDATE|DELETE|INSERT|DROP|ALTER|CREATE|TRUNCATE)[\s\S]*$/i

/**
 * SQL 列元数据探测器（对齐 Java `SqlMetadataProbe`，110 行）。
 *
 * 把完整 SQL 包成 `SELECT * FROM (<sql>) _probe LIMIT 1` 执行，**只读列结构、不返回数据行**，
 * 供设计器「探测字段」用。三条入参校验与消息逐字对齐 Java。
 *
 * ## ⚠️ 本文件最大的难点：JDBC 元数据 vs mysql2 字段元数据
 * Java 读的是 JDBC `ResultSetMetaData`，Node 读的是 mysql2 的 `FieldPacket`。三个字段的
 * **语义都不同**，必须逐类映射（golden 里六列的组合就是用来钉这张表的）：
 *
 * | 字段 | Java | mysql2 | 映射 |
 * |---|---|---|---|
 * | 类型名 | `getColumnTypeName` 给**类型名字符串**（`VARCHAR`/`LONG`/`LONGLONG`…） | 数值型别码（`VAR_STRING=253`…） | 先把码翻成 Connector/J 的名字，再走同一套白名单 |
 * | 精度 | `getPrecision`：字符串是**字符数**，整数是**显示宽度**，时间类型是**文本长度** | `columnLength` 是**字节数**（UTF-8 下 VARCHAR(255) 给 1020） | 按类型分别取：字符类除以字符集最大字节数，整数/时间类用 Connector/J 的固定值 |
 * | 可空 | `isNullable != columnNoNulls` | `flags` 位掩码 | `NOT_NULL_FLAG(1)` 置位 ⇒ 不可空 |
 *
 * ⚠️ 精度**不能**直接拿 `columnLength`：那会让 `VARCHAR(255)` 变成 1020、`INT` 变成 11。
 *    实测值（golden `mpProbe`）：VARCHAR→255、JSON/LONGTEXT→536870911、INT→10、
 *    BIGINT(COUNT)→19、DATETIME→19。
 */
@Injectable()
export class SqlMetadataProbe {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async probe(sql: string | null): Promise<ColumnMeta[]> {
    if (sql === null || sql.trim() === '') {
      throw new BusinessException(400, 'SQL 不能为空')
    }
    let trimmed = sql.trim()
    if (trimmed.endsWith(';')) {
      trimmed = trimmed.slice(0, -1)
    }
    if (!trimmed.slice(0, 6).toLowerCase().startsWith('select')) {
      throw new BusinessException(400, '仅支持 SELECT 查询')
    }
    if (MULTI_STATEMENT.test(trimmed)) {
      throw new BusinessException(400, '仅支持单条 SELECT 查询')
    }
    const wrapped = `SELECT * FROM (${trimmed}) _probe LIMIT 1`
    const bound = wrapped.replace(PLACEHOLDER, 'NULL')

    let fields: FieldPacket[] | undefined
    try {
      const result = await this.pool.promise().query(bound)
      fields = (result as unknown as [unknown, FieldPacket[]])[1]
    } catch (error) {
      /**
       * ⚠️ 消息**逐字**是 `PreparedStatementCallback; bad SQL grammar []` —— 后面**不带**
       *    数据库给的原始原因。Java 侧是 Spring 的 `BadSqlGrammarException.getMessage()`，
       *    而走到 `jdbcTemplate.query(PreparedStatementCreator, …)` 这条路径时它的 SQL
       *    片段**恒为空**（方括号里什么都没有），底层 SQLException 也没被拼进来。
       *    golden `mpProbeBadTable` 钉住了这一串；把 MySQL 的原始错误附在后面会立刻分叉。
       */
      throw new Error('PreparedStatementCallback; bad SQL grammar []', { cause: error })
    }
    return (fields ?? []).map((field) => toColumnMeta(field))
  }
}

/** mysql2 `FieldPacket` → `ColumnMeta`（对齐 Java `mapColumns`）。 */
function toColumnMeta(field: FieldPacket): ColumnMeta {
  const name = field.name
  return {
    key: name,
    label: name,
    columnType: normalizeType(javaTypeName(field.columnType ?? -1)),
    length: precisionOf(field),
    // mysql2 的 `decimals` 对非小数类型是 0 → Java 的 getScale 也是 0 → 都归成 null
    scale: field.decimals === undefined || field.decimals === 0 ? null : field.decimals,
    // NOT_NULL_FLAG 置位 ⇒ 不可空（Java 的 isNullable != columnNoNulls）
    nullable: (Number(field.flags ?? 0) & NOT_NULL_FLAG) === 0,
  }
}

/** mysql2 flags：`NOT_NULL_FLAG = 1`。 */
const NOT_NULL_FLAG = 1

/**
 * mysql2 数值型别码 → Connector/J `getColumnTypeName` 的字符串。
 *
 * ⚠️ 只有走到 `normalizeType` 白名单里的名字才有意义；表里没列的码一律走 default。
 */
function javaTypeName(code: number): string | null {
  switch (code) {
    case 0:
      return 'DECIMAL'
    case 1:
      return 'TINYINT'
    case 2:
      return 'SMALLINT'
    case 3:
      return 'INTEGER'
    case 4:
      return 'FLOAT'
    case 5:
      return 'DOUBLE'
    case 7:
      return 'TIMESTAMP'
    case 8:
      return 'BIGINT'
    case 9:
      return 'MEDIUMINT'
    case 10:
      return 'DATE'
    case 11:
      return 'TIME'
    case 12:
      return 'DATETIME'
    case 13:
      return 'YEAR'
    case 15:
      return 'VARCHAR'
    case 16:
      return 'BIT'
    case 245:
      // JSON：Connector/J 报的类型名不在 Java 的白名单里 ⇒ 走 default → **VARCHAR**
      // （golden 实测：JSON 列的 columnType 是 VARCHAR、length 是 536870911）。
      // 返回 'JSON' 而不是先映射成 LONGTEXT：后者会得到 TEXT，与 Java 分叉。
      return 'JSON'
    case 246:
      return 'DECIMAL'
    case 247:
      return 'CHAR'
    case 248:
      return 'CHAR'
    case 249:
      return 'TINYBLOB'
    case 250:
      return 'MEDIUMBLOB'
    case 251:
      return 'LONGBLOB'
    case 252:
      return 'BLOB'
    case 253:
      return 'VARCHAR'
    case 254:
      return 'CHAR'
    default:
      return null
  }
}

/** JDBC 类型名 → 业务列类型白名单（逐字对齐 Java `normalizeType`）。 */
function normalizeType(typeName: string | null): string {
  if (typeName === null) return 'VARCHAR'
  switch (typeName.toUpperCase()) {
    case 'VARCHAR':
    case 'CHAR':
      return 'VARCHAR'
    case 'LONGVARCHAR':
    case 'CLOB':
      return 'TEXT'
    case 'LONGNVARCHAR':
    case 'NCLOB':
      return 'LONGTEXT'
    case 'INTEGER':
    case 'INT':
    case 'BIGINT':
    case 'SMALLINT':
    case 'TINYINT':
      return 'INT'
    case 'DECIMAL':
    case 'NUMERIC':
      return 'DECIMAL'
    case 'DATE':
      return 'DATE'
    case 'TIMESTAMP':
    case 'DATETIME':
      return 'DATETIME'
    case 'BOOLEAN':
    case 'BIT':
      return 'TINYINT'
    default:
      return 'VARCHAR'
  }
}

/**
 * `getPrecision` 的等价物。
 *
 * ⚠️ 各类型的口径完全不同，逐类写死（实测值见类注释里的表）：
 *   - 字符类：`columnLength` 是**字节**，UTF-8 下要按字符集最大字节数折算回**字符**；
 *     但 JSON / LONGTEXT 这类「大对象」Connector/J 报的是固定值 536870911 ——
 *     所以**不能**统一折算，必须按类型分开。
 *   - 整数类：Connector/J 报显示宽度（INT=10、BIGINT=19、SMALLINT=5、TINYINT=3），
 *     与 `columnLength`（11/20/6/4）不同。
 *   - 时间类：报文本长度（DATETIME/TIMESTAMP=19、DATE=10、TIME=8）。
 *   - 0 → null（Java 的 `precision == 0 ? null : precision`）。
 */
function precisionOf(field: FieldPacket): number | null {
  const code = Number(field.columnType ?? -1)
  const columnLength = Number(field.columnLength ?? 0)
  switch (code) {
    case 3:
      return 10 // INTEGER
    case 8:
      return 19 // BIGINT
    case 2:
      return 5 // SMALLINT
    case 1:
      return 3 // TINYINT
    case 9:
      return 7 // MEDIUMINT
    case 4:
      return 12 // FLOAT
    case 5:
      return 22 // DOUBLE
    case 10:
      return 10 // DATE
    case 11:
      return 8 // TIME
    case 7:
    case 12:
      return 19 // TIMESTAMP / DATETIME
    case 13:
      return 4 // YEAR
    case 245:
      return 536870911 // JSON
    case 251:
      return 536870911 // LONGBLOB / LONGTEXT
    case 250:
      return 16777215 // MEDIUMBLOB
    case 252:
      return 65535 // BLOB / TEXT
    case 249:
      return 255 // TINYBLOB
    case 253:
    case 254:
    case 247:
    case 248: {
      // 字符类：按字符集最大字节数折算回字符数
      const maxBytes = charsetMaxBytes(field.characterSet ?? 0)
      return maxBytes === 0 ? null : Math.floor(columnLength / maxBytes)
    }
    default:
      return columnLength === 0 ? null : columnLength
  }
}

/** MySQL 字符集 → 单字符最大字节数（只需覆盖 utf8mb4/utf8/latin1 三种）。 */
function charsetMaxBytes(collationId: number): number {
  // 255 = utf8mb4_0900_ai_ci、45 = utf8mb4_general_ci、224-247 = utf8mb4 家族
  if (collationId === 255 || collationId === 45 || (collationId >= 224 && collationId <= 247)) {
    return 4
  }
  // 33 = utf8_general_ci 等
  if (collationId === 33 || collationId === 83 || collationId === 192) return 3
  // latin1 / binary 及未知：按 1 处理（与 Connector/J 对单字节字符集的行为一致）
  return 1
}
