import { describe, expect, it } from 'vitest'
import {
  buildCount,
  buildSelect,
  columnTypeMapOf,
} from '../../../src/engine/form/bizdata/biz-data-query-builder'
import type { ColumnConfig } from '../../../src/common/domain/column-config'
import { newColumnConfig } from '../../../src/common/domain/column-config'
import { compile } from '../helpers/compile-sql'

/**
 * 动态 SQL 生成器的单测。
 *
 * 这些分支**不可能**由契约回归覆盖（golden 只有 `person` 表单、无筛选无排序），
 * 而它们恰恰是安全边界所在：列名白名单、排序白名单、JSON 列走函数比较。
 * 少一个 `validateColumn`，就是一个 SQL 注入面。
 */

const COLUMNS = ['code', 'name', 'dept']
const TYPES = new Map([
  ['code', 'VARCHAR'],
  ['name', 'VARCHAR'],
  ['dept', 'JSON'],
])
const TABLE = 'wf_biz_person'
const TENANT = 'default'

function select(
  overrides: Partial<{
    filters: Record<string, unknown>
    keyword: string | null
    keywordColumn: string | null
    sort: string | null
    order: string | null
    page: number
    size: number
  }> = {},
): { sql: string; params: unknown[] } {
  return compile(
    buildSelect(
      TABLE,
      COLUMNS,
      TYPES,
      TENANT,
      overrides.filters ?? {},
      overrides.keyword ?? null,
      overrides.keywordColumn ?? null,
      overrides.sort ?? null,
      overrides.order ?? null,
      overrides.page ?? 0,
      overrides.size ?? 20,
    ),
  )
}

describe('buildSelect', () => {
  it('无筛选时只按租户过滤，默认按 created_at 倒序分页', () => {
    const { sql, params } = select()
    expect(sql).toBe(
      'SELECT * FROM `wf_biz_person` WHERE tenant_id = ? ORDER BY `created_at` DESC LIMIT ? OFFSET ?',
    )
    expect(params).toEqual([TENANT, 20, 0])
  })

  it('offset 由 page（0 基）× size 得出', () => {
    expect(select({ page: 2, size: 10 }).params).toEqual([TENANT, 10, 20])
  })

  it('size <= 0 表示不分页取全部（不带 LIMIT/OFFSET）', () => {
    const { sql, params } = select({ size: 0 })
    expect(sql).not.toContain('LIMIT')
    expect(params).toEqual([TENANT])
  })

  it('普通列走标量等值比较', () => {
    const { sql, params } = select({ filters: { code: '001' } })
    expect(sql).toContain('AND `code` = ?')
    expect(params).toEqual([TENANT, '001', 20, 0])
  })

  it('JSON 列走 JSON_CONTAINS，且筛选值被序列化成 JSON 片段', () => {
    const { sql, params } = select({ filters: { dept: '2' } })
    expect(sql).toContain('AND JSON_CONTAINS(`dept`, ?)')
    // '"2"' —— 带引号的 JSON 标量，不是裸的 2
    expect(params[1]).toBe('"2"')
  })

  it('筛选值为 null 时跳过该条件（对齐 Java）', () => {
    const { sql, params } = select({ filters: { code: null } })
    expect(sql).not.toContain('`code`')
    expect(params).toEqual([TENANT, 20, 0])
  })

  it('排序字段必须在白名单内', () => {
    expect(() => select({ sort: 'version; DROP TABLE x' })).toThrow(/非法排序字段/)
  })

  it('排序方向必须在 asc/desc 内', () => {
    expect(() => select({ order: 'sideways' })).toThrow(/非法排序方向/)
  })

  it('排序方向大小写不敏感，并统一渲染成大写', () => {
    expect(select({ sort: 'code', order: 'asc' }).sql).toContain('ORDER BY `code` ASC')
  })

  it('筛选字段必须在白名单内（注入面就在这里）', () => {
    expect(() => select({ filters: { "code' OR '1'='1": 'x' } })).toThrow(/非法筛选字段/)
  })

  it('内置列 created_at / updated_at / id 可直接排序（不在 column_config 里）', () => {
    expect(select({ sort: 'updated_at' }).sql).toContain('ORDER BY `updated_at` DESC')
    expect(select({ sort: 'id' }).sql).toContain('ORDER BY `id` DESC')
  })
})

describe('buildSelect 关键词搜索', () => {
  it('单列时原样 LIKE（不加括号，对齐 Java 的向后兼容分支）', () => {
    const { sql, params } = select({ keyword: '张', keywordColumn: 'name' })
    expect(sql).toContain('AND `name` LIKE ?')
    // 断言「没有 OR 分组」要认括号，不能断言 `not.toContain('OR')` ——
    // `ORDER BY` 里就含 `OR` 两个字母（这个断言第一次写就踩了）
    expect(sql).not.toContain('(')
    expect(params).toContain('%张%')
  })

  it('多列（逗号分隔）时 OR 组合并加括号', () => {
    const { sql, params } = select({ keyword: 'x', keywordColumn: 'code, name' })
    expect(sql).toContain('AND (`code` LIKE ? OR `name` LIKE ?)')
    expect(params.filter((p) => p === '%x%')).toHaveLength(2)
  })

  it('关键词匹配列也要过白名单', () => {
    expect(() => select({ keyword: 'x', keywordColumn: 'name, secret' })).toThrow(
      /非法关键词匹配列/,
    )
  })

  it('给了 keyword 却没给列 → 报错（对齐 Java 的「不能为空」）', () => {
    expect(() => select({ keyword: 'x', keywordColumn: null })).toThrow(/关键词匹配列不能为空/)
  })

  it('keyword 为空白时不生成任何条件', () => {
    const { sql } = select({ keyword: '   ', keywordColumn: 'name' })
    expect(sql).not.toContain('LIKE')
  })
})

describe('buildSelect 结构化筛选', () => {
  it('conditions + logic=AND', () => {
    const { sql, params } = select({
      filters: {
        logic: 'AND',
        conditions: [
          { column: 'code', op: 'eq', value: '001' },
          { column: 'name', op: 'like', value: '张' },
        ],
      },
    })
    expect(sql).toContain('AND (`code` = ? AND `name` LIKE ?)')
    expect(params).toEqual([TENANT, '001', '%张%', 20, 0])
  })

  it('logic=OR', () => {
    const { sql } = select({
      filters: {
        logic: 'OR',
        conditions: [
          { column: 'code', op: 'eq', value: 'a' },
          { column: 'name', op: 'eq', value: 'b' },
        ],
      },
    })
    expect(sql).toContain('AND (`code` = ? OR `name` = ?)')
  })

  it('JSON 列的 in 走 JSON_OVERLAPS（数组有交集即命中）', () => {
    const { sql, params } = select({
      filters: { conditions: [{ column: 'dept', op: 'in', value: ['2', '3'] }] },
    })
    expect(sql).toContain('JSON_OVERLAPS(`dept`, ?)')
    expect(params[1]).toBe('["2","3"]')
  })

  it('普通列的 in 展开成多个占位符', () => {
    const { sql, params } = select({
      filters: { conditions: [{ column: 'code', op: 'in', value: ['a', 'b'] }] },
    })
    expect(sql).toContain('`code` IN (?, ?)')
    expect(params.slice(1, 3)).toEqual(['a', 'b'])
  })

  it('isEmpty / isNotEmpty 忽略 value', () => {
    expect(
      select({ filters: { conditions: [{ column: 'code', op: 'isEmpty' }] } }).sql,
    ).toContain("(`code` IS NULL OR `code` = '')")
    expect(
      select({ filters: { conditions: [{ column: 'code', op: 'isNotEmpty' }] } }).sql,
    ).toContain("(`code` IS NOT NULL AND `code` <> '')")
  })

  it('未识别运算符直接报错，而不是静默忽略条件', () => {
    expect(() =>
      select({ filters: { conditions: [{ column: 'code', op: 'regexp', value: 'x' }] } }),
    ).toThrow(/非法筛选运算符/)
  })

  it('空的 conditions 不产生条件片段', () => {
    const { sql } = select({ filters: { conditions: [] } })
    expect(sql).not.toContain('AND (')
  })
})

describe('buildCount', () => {
  it('计数查询带 total 别名（Kysely 只能按列名取值）', () => {
    const { sql, params } = compile(
      buildCount(TABLE, COLUMNS, TYPES, TENANT, {}, null, null),
    )
    expect(sql).toBe('SELECT COUNT(1) AS total FROM `wf_biz_person` WHERE tenant_id = ?')
    expect(params).toEqual([TENANT])
  })

  it('筛选条件与 SELECT 完全一致', () => {
    const { sql, params } = compile(
      buildCount(TABLE, COLUMNS, TYPES, TENANT, { dept: '2' }, null, null),
    )
    expect(sql).toContain('AND JSON_CONTAINS(`dept`, ?)')
    expect(params).toEqual([TENANT, '"2"'])
  })
})

describe('columnTypeMapOf', () => {
  it('把 columnType 转大写，缺失时给空串', () => {
    const column = (key: string, columnType: string | null): ColumnConfig => ({
      ...newColumnConfig(),
      key,
      columnType,
    })
    const map = columnTypeMapOf([column('a', 'json'), column('b', null)])
    expect(map.get('a')).toBe('JSON')
    expect(map.get('b')).toBe('')
  })
})
