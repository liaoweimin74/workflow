/**
 * sqlScript.ts 纯函数单测：切分（引号/注释感知）、类型识别、别名提取、变量收集、预览结构。
 */
import { describe, expect, it } from 'vitest'
import {
  parseSqlScriptPreview,
  sqlStatementKind,
  sqlStatementName,
  sqlStatementVars,
  splitSqlStatements,
} from '../sqlScript'

describe('splitSqlStatements', () => {
  it('按分号切分基础多语句', () => {
    const out = splitSqlStatements('UPDATE a SET x = 1; DELETE FROM b; SELECT 1')
    expect(out).toHaveLength(3)
    expect(out[0]).toBe('UPDATE a SET x = 1')
  })

  it('字符串字面量内的分号不切分（双写与反斜杠转义）', () => {
    expect(splitSqlStatements("INSERT INTO t VALUES ('a;b');SELECT 1")).toHaveLength(2)
    expect(splitSqlStatements("INSERT INTO t VALUES ('it''s;a');SELECT 1")).toHaveLength(2)
    expect(splitSqlStatements("INSERT INTO t VALUES ('a\\;b');SELECT 1")).toHaveLength(2)
  })

  it('行注释/块注释/反引号内分号不切分', () => {
    expect(splitSqlStatements('-- c;omment\nSELECT 1; # x;y\nUPDATE t SET a=1')).toHaveLength(2)
    expect(splitSqlStatements('/* ; */SELECT 1')).toHaveLength(1)
    expect(splitSqlStatements('SELECT `a;b` FROM t;UPDATE x SET y=1')).toHaveLength(2)
  })

  it('剔除空语句（含仅注释语句）', () => {
    expect(splitSqlStatements('SELECT 1;; ;  -- 注释\n; ')).toEqual(['SELECT 1'])
    expect(splitSqlStatements('')).toEqual([])
    expect(splitSqlStatements('   ')).toEqual([])
  })

  it('未闭合引号抛错', () => {
    expect(() => splitSqlStatements("SELECT 'abc")).toThrow(/未闭合/)
    expect(() => splitSqlStatements('SELECT 1 /* 未闭合')).toThrow(/未闭合/)
  })
})

describe('sqlStatementKind', () => {
  it('识别查询/写入/更新类型', () => {
    expect(sqlStatementKind('SELECT * FROM t')).toBe('QUERY')
    expect(sqlStatementKind('-- q\nSHOW TABLES')).toBe('QUERY')
    expect(sqlStatementKind('WITH x AS (SELECT 1) SELECT * FROM x')).toBe('QUERY')
    expect(sqlStatementKind('INSERT INTO t VALUES (1)')).toBe('INSERT')
    expect(sqlStatementKind('REPLACE INTO t VALUES (1)')).toBe('INSERT')
    expect(sqlStatementKind('UPDATE t SET a=1')).toBe('DML')
    expect(sqlStatementKind('DELETE FROM t')).toBe('DML')
  })

  it('拒绝 DDL 与管理命令', () => {
    expect(() => sqlStatementKind('DROP TABLE t')).toThrow(/仅支持/)
    expect(() => sqlStatementKind('CREATE TABLE t(id INT)')).toThrow(/仅支持/)
  })
})

describe('sqlStatementName / sqlStatementVars', () => {
  it('提取前置注释别名', () => {
    expect(sqlStatementName('-- name: upsert_user\nINSERT INTO t VALUES (1)')).toBe('upsert_user')
    expect(sqlStatementName('# name=abc\nUPDATE t SET a=1')).toBe('abc')
    expect(sqlStatementName('SELECT 1 -- name: late')).toBeUndefined()
    expect(sqlStatementName('SELECT 1')).toBeUndefined()
  })

  it('收集去重保序的变量引用', () => {
    expect(sqlStatementVars('UPDATE t SET a={{v}} WHERE id={{order.id}} AND b={{v}}')).toEqual([
      'v',
      'order.id',
    ])
  })
})

describe('parseSqlScriptPreview', () => {
  it('输出逐条预览（类型徽标/别名/摘录）', () => {
    const p = parseSqlScriptPreview(
      '-- name: new_row\nINSERT INTO t(a) VALUES ({{v}}); SELECT id FROM t WHERE a = {{v}};'
    )
    expect(p.error).toBeUndefined()
    expect(p.statements).toHaveLength(2)
    expect(p.statements[0]).toMatchObject({
      index: 0,
      name: 'new_row',
      kind: 'INSERT',
      kindLabel: '写入',
      vars: ['v'],
    })
    expect(p.statements[1]).toMatchObject({ index: 1, kind: 'QUERY', name: undefined })
    expect(p.statements[1].excerpt).toContain('SELECT id FROM t')
  })

  it('解析错误进 error 字段而不抛出', () => {
    const p = parseSqlScriptPreview("SELECT '未闭合")
    expect(p.error).toContain('未闭合')
    expect(p.statements).toHaveLength(0)

    const p2 = parseSqlScriptPreview('DROP TABLE t;')
    expect(p2.error).toContain('仅支持')
  })

  it('空文本返回空预览', () => {
    expect(parseSqlScriptPreview('')).toEqual({ statements: [] })
  })
})
