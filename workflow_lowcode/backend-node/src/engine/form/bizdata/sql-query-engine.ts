import { Inject, Injectable } from '@nestjs/common'
import type { RowDataPacket } from 'mysql2'
import type { Pool } from 'mysql2'
import { bizDataPageVO, type BizDataPageVO, type BizDataVO } from '../../../common/domain/biz-data'
import { MYSQL_POOL } from '../../../framework/database/database.module'

/** SQL 片段 + 绑定参数（对齐 Java `BizDataQueryBuilder.SqlAndParams`）。 */
export interface SqlAndParams {
  sql: string
  params: unknown[]
}

/** 行查询与 COUNT 查询对（对齐 Java `SqlQueryEngine.WrappedQuery`）。 */
export interface WrappedQuery {
  select: SqlAndParams
  count: SqlAndParams
}

/**
 * 把内层 SQL 包裹成分页子查询（对齐 Java `SqlQueryEngine.wrapSubquery`）。
 *
 * ```sql
 *   SELECT * FROM (<inner>) _qs {filterFragment} {orderByFragment} [LIMIT ? OFFSET ?]
 *   SELECT COUNT(*) FROM (<inner>) _qs {filterFragment}
 * ```
 *
 * 参数顺序：**内层参数 → 筛选参数 →（仅行查询）分页参数**；`size <= 0` 表示不分页取全部。
 */
export function wrapSubquery(
  inner: SqlAndParams,
  filterFragment: string,
  filterParams: unknown[],
  orderByFragment: string,
  page: number,
  size: number,
): WrappedQuery {
  const baseParams = [...inner.params, ...filterParams]

  let rowSql = `SELECT * FROM (${inner.sql}) _qs${filterFragment}${orderByFragment}`
  const rowParams = [...baseParams]
  if (size > 0) {
    rowSql += ' LIMIT ? OFFSET ?'
    rowParams.push(size, (Math.max(page, 1) - 1) * size)
  }

  const countSql = `SELECT COUNT(*) FROM (${inner.sql}) _qs${filterFragment}`
  return {
    select: { sql: rowSql, params: rowParams },
    count: { sql: countSql, params: baseParams },
  }
}

/**
 * SQL 执行引擎（对齐 Java `SqlQueryEngine`，84 行）。
 *
 * ## 为什么用原始连接池而不是 Kysely
 * 本引擎执行的 SQL 是**字符串 + `?` 占位符 + 参数数组**，来源是
 * `SqlTemplateEngine.wrap` / `JoinSqlGenerator.buildSelect|buildCount`
 * （以及管理员自己写的 SELECT 模板）。这与 Kysely 的片段模型相反：
 * Kysely 从一开始就把参数持在 AST 里，而这里文本已经生成完毕。
 *
 * 把「字符串 + `?` + 参数」重新装回 Kysely 需要一个按 `?` 切分的转换器 ——
 * 而那个转换器**在 SQL 文本里出现字符串字面量 `?` 时就会错位**
 * （例如管理员模板 `... WHERE note = 'why?'`：JDBC 的 `PreparedStatement`
 * 知道引号里的 `?` 不是占位符，切分器不知道）。mysql2 的 `query(sql, values)`
 * 自己解析引号，与 JDBC 语义一致，所以这里直接用连接池。
 *
 * ⚠️ **总数按「第一列」读取**（`Object.values(row)[0]`），不按列名 ——
 *    JDBC 的 `queryForObject(sql, Long.class)` 就是按位置取值，
 *    而 `SELECT COUNT(*)` 的列标签在 MySQL 里是 `COUNT(*)` 这种不可依赖的拼法。
 */
@Injectable()
export class SqlQueryEngine {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  /** 执行 COUNT 查询，返回第一列的值。 */
  async count(fragment: SqlAndParams): Promise<number> {
    const [rows] = await this.pool.promise().query<RowDataPacket[]>(fragment.sql, fragment.params)
    const first = rows[0] === undefined ? undefined : Object.values(rows[0])[0]
    return first === null || first === undefined ? 0 : Number(first)
  }

  /** 执行行查询，返回全部行。 */
  async rows(fragment: SqlAndParams): Promise<Record<string, unknown>[]> {
    const [rows] = await this.pool.promise().query<RowDataPacket[]>(fragment.sql, fragment.params)
    return rows as unknown as Record<string, unknown>[]
  }

  /**
   * 执行分页查询：先 COUNT 得出总数，再 SELECT 取当前页，按 `rowMapper` 映射行后组装分页结果。
   *
   * `rowMapper` 允许返回 Promise —— Node 侧的 `toVO`/`toJoinVO` 要异步解析 picker 显示文本，
   * 而 Java 是同步的（`Function<Map, BizDataVO>`）。顺序语义不变：**先全部映射完再返回**。
   */
  async execPage(
    page: number,
    size: number,
    count: SqlAndParams,
    select: SqlAndParams,
    rowMapper: (row: Record<string, unknown>) => Promise<BizDataVO> | BizDataVO,
  ): Promise<BizDataPageVO> {
    const total = await this.count(count)
    const rows = await this.rows(select)
    const records: BizDataVO[] = []
    for (const row of rows) records.push(await rowMapper(row))
    return bizDataPageVO(records, total, page, size)
  }
}
