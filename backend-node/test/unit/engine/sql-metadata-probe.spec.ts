import { describe, expect, it } from 'vitest'
import { SqlMetadataProbe } from '../../../src/engine/form/bizdata/sql-metadata-probe'
import type { FieldPacket } from 'mysql2'

/**
 * SQL 列元数据探测（`explore-sql`）的单测。
 *
 * 契约场景「SQL 列元数据探测」已经端到端钉住了三条校验消息与**六列的类型/精度/可空**
 * （VARCHAR 255、JSON→VARCHAR 536870911、INT 10、BIGINT 19、DATETIME 19，
 * 以及 bad table 的 500 消息）。
 *
 * 这里补契约网够不到的两类：
 *   ① **占位符替换** —— 探测把 `:name` 全部换成 `NULL`（golden 只能证明"能跑通"，
 *      证明不了替换本身），断言的是真正发给连接池的 SQL 文本；
 *   ② **类型映射表的边界** —— 契约场景只覆盖到 6 种型别码，这里把其余分支
 *      （字符集折算、大对象固定精度、可空位）逐条钉住。
 *
 * 用假连接池即可：探测只读 `FieldPacket`（列元数据），不读数据行。
 */

interface Stub {
  sql: string | null
}

function probeWith(fields: FieldPacket[] | Error): { probe: SqlMetadataProbe; stub: Stub } {
  const stub: Stub = { sql: null }
  const pool = {
    promise: () => ({
      query: async (sql: string) => {
        stub.sql = sql
        if (fields instanceof Error) throw fields
        return [[], fields]
      },
    }),
  }
  return { probe: new SqlMetadataProbe(pool as never), stub }
}

/**
 * 造假字段。
 *
 * ⚠️ 参数类型**不能**写成 `Partial<FieldPacket>`：`FieldPacket` 上有个字面量类型的
 *    `constructor: 'FieldPacket'`，`Partial<>` 之后与对象字面量不兼容（tsc 报
 *    「types of 'constructor.name' are incompatible」）。用宽松记录再断言成 FieldPacket。
 */
function field(partial: Record<string, unknown>): FieldPacket {
  return {
    name: 'c',
    columnType: 253,
    columnLength: 1020,
    characterSet: 255,
    flags: 1,
    decimals: 0,
    ...partial,
  } as unknown as FieldPacket
}

async function messageOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('预期抛错，但没有抛')
}

describe('SqlMetadataProbe / 入参校验', () => {
  it('空 / 空白 / null → 400「SQL 不能为空」', async () => {
    const { probe } = probeWith([])
    expect(await messageOf(() => probe.probe(null))).toBe('SQL 不能为空')
    expect(await messageOf(() => probe.probe('   '))).toBe('SQL 不能为空')
  })

  it('不以 SELECT 开头 → 400「仅支持 SELECT 查询」（大小写不敏感、允许前导空白）', async () => {
    const { probe } = probeWith([])
    expect(await messageOf(() => probe.probe("UPDATE t SET a='x'"))).toBe('仅支持 SELECT 查询')
    // 前导空白要先 trim：Java 是 `trimmed.regionMatches(...)`
    expect(await messageOf(() => probe.probe('   DELETE FROM t'))).toBe('仅支持 SELECT 查询')
    // 小写 select 合法（Java 的 regionMatches 传了 ignoreCase=true）
    const ok = probeWith([])
    await expect(ok.probe.probe('select 1')).resolves.toEqual([])
  })

  it('多语句 → 400「仅支持单条 SELECT 查询」；末尾分号会被剥掉', async () => {
    const { probe } = probeWith([])
    expect(await messageOf(() => probe.probe('SELECT a FROM t; DELETE FROM t'))).toBe(
      '仅支持单条 SELECT 查询',
    )
    // 只是以分号结尾（没有第二条语句）不该被拒，而且包装前要先去掉它
    const trailing = probeWith([])
    await trailing.probe.probe('SELECT a FROM t;')
    expect(trailing.stub.sql).toBe('SELECT * FROM (SELECT a FROM t) _probe LIMIT 1')
  })
})

describe('SqlMetadataProbe / 包装与占位符', () => {
  it('包装成 SELECT * FROM (<sql>) _probe LIMIT 1，且 :占位符全部换成 NULL', async () => {
    const { probe, stub } = probeWith([])
    await probe.probe('SELECT code FROM wf_biz_person WHERE code LIKE :kw AND name = :nm')
    expect(stub.sql).toBe(
      'SELECT * FROM (SELECT code FROM wf_biz_person WHERE code LIKE NULL AND name = NULL) _probe LIMIT 1',
    )
  })

  it('查询报错 → 消息逐字是 Java 的 `PreparedStatementCallback; bad SQL grammar []`（不带原始原因）', async () => {
    const { probe } = probeWith(new Error("Table 'x' doesn't exist"))
    expect(await messageOf(() => probe.probe('SELECT * FROM nope'))).toBe(
      'PreparedStatementCallback; bad SQL grammar []',
    )
  })
})

describe('SqlMetadataProbe / JDBC 元数据映射', () => {
  it('字符类：按字符集最大字节数把 columnLength 折算回**字符数**', async () => {
    // utf8mb4（collation 255）下 VARCHAR(255) 的 columnLength 是 1020
    const { probe } = probeWith([field({ name: 'code', columnType: 253, columnLength: 1020 })])
    expect(await probe.probe('SELECT code FROM t')).toEqual([
      { key: 'code', label: 'code', columnType: 'VARCHAR', length: 255, scale: null, nullable: false },
    ])
    // latin1：columnLength 就是字符数
    const latin = probeWith([
      field({ name: 'code', columnType: 253, columnLength: 255, characterSet: 8 }),
    ])
    expect((await latin.probe.probe('SELECT code FROM t'))[0].length).toBe(255)
  })

  it('整数类：用 Connector/J 的显示宽度，而不是 columnLength', async () => {
    const { probe } = probeWith([
      field({ name: 'i', columnType: 3, columnLength: 11 }),
      field({ name: 'b', columnType: 8, columnLength: 20 }),
      field({ name: 's', columnType: 2, columnLength: 6 }),
      field({ name: 't', columnType: 1, columnLength: 4 }),
    ])
    const out = await probe.probe('SELECT i, b, s, t FROM t')
    expect(out.map((c) => [c.columnType, c.length])).toEqual([
      ['INT', 10],
      ['INT', 19],
      ['INT', 5],
      ['INT', 3],
    ])
  })

  it('时间类：DATETIME / TIMESTAMP → 19，DATE → 10；decimal 用 columnLength', async () => {
    const { probe } = probeWith([
      field({ name: 'dt', columnType: 12, columnLength: 19 }),
      field({ name: 'ts', columnType: 7, columnLength: 19 }),
      field({ name: 'd', columnType: 10, columnLength: 10 }),
      field({ name: 'dec', columnType: 246, columnLength: 18, decimals: 2 }),
    ])
    const out = await probe.probe('SELECT dt, ts, d, dec FROM t')
    expect(out.map((c) => [c.columnType, c.length, c.scale])).toEqual([
      ['DATETIME', 19, null],
      ['DATETIME', 19, null],
      ['DATE', 10, null],
      ['DECIMAL', 18, 2],
    ])
  })

  it('JSON → VARCHAR + 536870911（Connector/J 的类型名不在白名单里，走 default）', async () => {
    const { probe } = probeWith([
      field({ name: 'dept', columnType: 245, columnLength: 4294967295, flags: 0 }),
    ])
    expect(await probe.probe('SELECT dept FROM t')).toEqual([
      {
        key: 'dept',
        label: 'dept',
        columnType: 'VARCHAR',
        length: 536870911,
        scale: null,
        nullable: true,
      },
    ])
  })

  it('大对象类：精度按族取固定值，但**类型名走 default → VARCHAR**（Java 白名单里没有 BLOB 族）', async () => {
    const { probe } = probeWith([
      field({ name: 'a', columnType: 251 }),
      field({ name: 'b', columnType: 252 }),
      field({ name: 'c', columnType: 250 }),
      field({ name: 'd', columnType: 249 }),
    ])
    const out = await probe.probe('SELECT a, b, c, d FROM t')
    // ⚠️ Java 的 normalizeType 白名单只有 LONGVARCHAR/CLOB → TEXT、LONGNVARCHAR/NCLOB → LONGTEXT，
    //    **LONGBLOB / BLOB / MEDIUMBLOB / TINYBLOB 都不在其中** ⇒ 走 default → VARCHAR。
    //    精度仍然按大对象族的固定值给（这一条来自 Connector/J 的 getPrecision）。
    expect(out.map((x) => [x.columnType, x.length])).toEqual([
      ['VARCHAR', 536870911],
      ['VARCHAR', 65535],
      ['VARCHAR', 16777215],
      ['VARCHAR', 255],
    ])
  })

  it('可空性由 NOT_NULL_FLAG(1) 决定；未知型别码 → VARCHAR', async () => {
    const { probe } = probeWith([
      field({ name: 'a', flags: 1 }),
      field({ name: 'b', flags: 0 }),
      field({ name: 'c', columnType: 999 }),
    ])
    const out = await probe.probe('SELECT a, b, c FROM t')
    expect(out.map((c) => [c.nullable, c.columnType])).toEqual([
      [false, 'VARCHAR'],
      [true, 'VARCHAR'],
      [false, 'VARCHAR'],
    ])
  })
})
