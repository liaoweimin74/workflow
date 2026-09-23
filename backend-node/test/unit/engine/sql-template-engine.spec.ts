import { describe, expect, it } from 'vitest'
import {
  extractPlaceholders,
  extractSelectOutputs,
  indexOfKeyword,
  validate,
  wrap,
  type QueryColumn,
} from '../../../src/engine/form/bizdata/sql-template-engine'
import { wrapSubquery } from '../../../src/engine/form/bizdata/sql-query-engine'

/**
 * SQL 模板引擎的单测（对齐 Java `SqlTemplateEngine` 453 行 + `SqlQueryEngine.wrapSubquery`）。
 *
 * ⚠️ 这一层**现在还没有接线**（`queryMode=sql` / 可视化 SQL 的适配器分支与 data-sources
 *    校验都还没打开），所以契约网一行都覆盖不到它。而它恰恰是**注入防线**所在：
 *    列名白名单、排序方向白名单、占位符绑定、JSON 列走函数比较 ——
 *    少一个校验就是一个注入面。按本仓库既有做法（见 `helpers/compile-sql.ts`），
 *    这类纯 SQL 生成逻辑只能靠单测验证。
 */

const COLUMNS: QueryColumn[] = [
  { key: 'code', ref: 'code', filterable: true, sortable: true, columnType: 'VARCHAR' },
  { key: 'amount', ref: 'amount', filterable: true, sortable: true, columnType: 'DECIMAL' },
  { key: 'dept', ref: 'dept', filterable: true, sortable: false, columnType: 'JSON' },
  { key: 'secret', ref: 'secret', filterable: false, sortable: false, columnType: 'VARCHAR' },
]

const TEMPLATE = 'SELECT code, amount, dept, secret FROM wf_biz_x WHERE tenant_id = :tenantId'

function messageOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('预期抛错，但没有抛')
}

/** 断言抛的是 `IllegalArgumentException` 形态（HTTP 400），不是业务异常（HTTP 200）。 */
function errorNameOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return (error as Error).name
  }
  throw new Error('预期抛错，但没有抛')
}

describe('SqlTemplateEngine.validate', () => {
  it('五条校验与消息逐字对齐', () => {
    expect(messageOf(() => validate(null, COLUMNS))).toBe('SQL 模板不能为空')
    expect(messageOf(() => validate('   ', COLUMNS))).toBe('SQL 模板不能为空')
    expect(messageOf(() => validate('UPDATE t SET a=1', COLUMNS))).toBe('仅允许 SELECT 查询')
    expect(messageOf(() => validate('SELECT 1 FROM t', COLUMNS))).toBe(
      'SQL 模板必须包含 :tenantId 占位符',
    )
    expect(messageOf(() => validate(TEMPLATE, []))).toBe('columns 不能为空')
    expect(messageOf(() => validate(TEMPLATE, null))).toBe('columns 不能为空')
    expect(messageOf(() => validate('SELECT code FROM t WHERE t = :tenantId', COLUMNS))).toBe(
      '声明列不在查询结果中: amount',
    )
  })

  it('SELECT * 时跳过声明列匹配；大小写与别名都认', () => {
    expect(() => validate('select * from t where x = :tenantId', COLUMNS)).not.toThrow()
    expect(() =>
      validate('SELECT a AS code, b AS amount, c AS dept, d AS secret FROM t WHERE y = :tenantId', COLUMNS),
    ).not.toThrow()
    // 带表名限定与反引号
    expect(() =>
      validate(
        'SELECT t.`code` AS code, t.amount AS amount, t.dept AS dept, t.secret AS secret FROM t WHERE y = :tenantId',
        COLUMNS,
      ),
    ).not.toThrow()
  })

  it('参数白名单：名字必须是合法标识符，模板里的其余占位符必须命中白名单', () => {
    expect(messageOf(() => validate(TEMPLATE, COLUMNS, ['1bad']))).toBe('参数名非法: 1bad')
    expect(messageOf(() => validate(`${TEMPLATE} AND x = :extra`, COLUMNS, []))).toBe(
      'SQL 模板包含未声明参数: :extra',
    )
    expect(() => validate(`${TEMPLATE} AND x = :extra`, COLUMNS, ['extra'])).not.toThrow()
  })

  it('所有校验错误都是 IllegalArgumentException 形态（HTTP 400，不是业务 200）', () => {
    expect(errorNameOf(() => validate(null, COLUMNS))).toBe('IllegalArgumentException')
    expect(errorNameOf(() => validate('UPDATE t', COLUMNS))).toBe('IllegalArgumentException')
  })
})

describe('SqlTemplateEngine / 占位符与输出列解析', () => {
  it('extractPlaceholders 含 :tenantId 且保持出现顺序', () => {
    expect(extractPlaceholders('a = :tenantId AND b = :x AND c = :y AND d = :x')).toEqual([
      ':tenantId',
      ':x',
      ':y',
      ':x',
    ])
  })

  it('extractSelectOutputs：别名 / 表名限定 / 通配 / 去引号', () => {
    expect([...extractSelectOutputs('SELECT * FROM t')]).toEqual(['*'])
    expect([...extractSelectOutputs('SELECT t.* FROM t')]).toEqual(['*'])
    expect([...extractSelectOutputs('SELECT a, b AS name, t."c" FROM t')].sort()).toEqual([
      'a',
      'c',
      'name',
    ])
    expect([...extractSelectOutputs('SELECT COUNT(*) AS total FROM t')]).toEqual(['total'])
  })

  it('indexOfKeyword 要求前后不是字母数字（避免选中列名里的子串）', () => {
    expect(indexOfKeyword('aselect', 'SELECT')).toBe(-1)
    expect(indexOfKeyword('SELECT a FROM t', 'FROM')).toBe(9)
    expect(indexOfKeyword('select','SELECT')).toBe(0)
    // '_' 不是字母数字，故 select_from 这种下划线后缀仍算边界命中（与 Java 一致）
    expect(indexOfKeyword('select_from t', 'SELECT')).toBe(0)
  })
})

describe('SqlTemplateEngine.wrap / 白名单与注入防线', () => {
  it('基础包裹：占位符绑租户、分页参数顺序为 内层 → 筛选 → 分页', () => {
    const { select, count } = wrap(TEMPLATE, 'default', COLUMNS, null, null, null, null, null, 2, 10)
    expect(select.sql).toBe(
      'SELECT * FROM (SELECT code, amount, dept, secret FROM wf_biz_x WHERE tenant_id = ?) _qs' +
        ' ORDER BY code DESC LIMIT ? OFFSET ?',
    )
    expect(select.params).toEqual(['default', 10, 10])
    expect(count.sql).toBe(
      'SELECT COUNT(*) FROM (SELECT code, amount, dept, secret FROM wf_biz_x WHERE tenant_id = ?) _qs',
    )
    expect(count.params).toEqual(['default'])
  })

  it('筛选/关键词/排序只允许 filterable / sortable 列，其余一律拒绝', () => {
    expect(
      messageOf(() => wrap(TEMPLATE, 't', COLUMNS, { nope: 1 }, null, null, null, null, 1, 10)),
    ).toBe('非法筛选字段: nope')
    expect(
      messageOf(() => wrap(TEMPLATE, 't', COLUMNS, { secret: 1 }, null, null, null, null, 1, 10)),
    ).toBe('该列不可筛选字段: secret')
    expect(
      messageOf(() => wrap(TEMPLATE, 't', COLUMNS, null, null, null, 'secret', null, 1, 10)),
    ).toBe('该列不可排序: secret')
    expect(
      messageOf(() => wrap(TEMPLATE, 't', COLUMNS, null, null, null, 'nope', null, 1, 10)),
    ).toBe('该列不可排序: nope')
    expect(
      messageOf(() => wrap(TEMPLATE, 't', COLUMNS, null, null, null, 'code', 'sideways', 1, 10)),
    ).toBe('非法排序方向: sideways')
  })

  it('JSON 列走 JSON_CONTAINS / 结构化筛选的七个运算符', () => {
    const json = wrap(TEMPLATE, 't', COLUMNS, { dept: ['01'] }, null, null, null, null, 1, 10)
    expect(json.select.sql).toContain('WHERE JSON_CONTAINS(dept, ?)')
    expect(json.select.params).toContain('["01"]')

    const structured = wrap(
      TEMPLATE,
      't',
      COLUMNS,
      {
        logic: 'or',
        conditions: [
          { column: 'code', op: 'eq', value: 'A' },
          { column: 'amount', op: 'ne', value: 1 },
          { column: 'code', op: 'like', value: 'x' },
          { column: 'amount', op: 'in', value: [1, 2] },
          { column: 'amount', op: 'range', value: [1, 9] },
          { column: 'code', op: 'isempty' },
          { column: 'code', op: 'isnotempty' },
        ],
      },
      null,
      null,
      null,
      null,
      1,
      10,
    )
    const sql = structured.select.sql
    expect(sql).toContain('WHERE (code = ? OR amount <> ? OR code LIKE ? OR amount IN (?, ?)')
    expect(sql).toContain('(amount >= ? AND amount <= ?)')
    expect(sql).toContain("(code IS NULL OR code = '')")
    expect(sql).toContain("(code IS NOT NULL AND code <> '')")
    // 单条件不套括号
    const single = wrap(
      TEMPLATE,
      't',
      COLUMNS,
      { conditions: [{ column: 'code', op: 'eq', value: 'A' }] },
      null,
      null,
      null,
      null,
      1,
      10,
    )
    expect(single.select.sql).toContain('WHERE code = ?')
    expect(single.select.sql).not.toContain('WHERE (')
    // 多条件片段之间才是 " AND " 连接：筛选 + 关键词
    const mixed = wrap(TEMPLATE, 't', COLUMNS, { code: 'A' }, 'kw', 'amount', null, null, 1, 10)
    expect(mixed.select.sql).toContain('WHERE code = ? AND amount LIKE ?')
    expect(mixed.select.params).toEqual(['t', 'A', '%kw%', 10, 0])
  })

  it('非法运算符 / 结构化筛选里的非法列一并拒绝', () => {
    expect(
      messageOf(() =>
        wrap(TEMPLATE, 't', COLUMNS, { conditions: [{ column: 'code', op: 'regex' }] }, null, null, null, null, 1, 10),
      ),
    ).toBe('非法筛选运算符: regex')
    expect(
      messageOf(() =>
        wrap(TEMPLATE, 't', COLUMNS, { conditions: [{ column: 'secret', op: 'eq' }] }, null, null, null, null, 1, 10),
      ),
    ).toBe('该列不可筛选字段: secret')
  })

  it('关键词：多列 OR LIKE；没有可匹配列时拒绝', () => {
    const one = wrap(TEMPLATE, 't', COLUMNS, null, 'kw', 'code', null, null, 1, 10)
    expect(one.select.sql).toContain('WHERE code LIKE ?')
    expect(one.select.params).toContain('%kw%')

    const many = wrap(TEMPLATE, 't', COLUMNS, null, 'kw', 'code, amount', null, null, 1, 10)
    expect(many.select.sql).toContain('WHERE (code LIKE ? OR amount LIKE ?)')

    expect(messageOf(() => wrap(TEMPLATE, 't', COLUMNS, null, 'kw', '', null, null, 1, 10))).toBe(
      '关键词匹配列不能为空',
    )
  })

  it('参数透传：白名单外的运行时参数不会进 SQL，白名单内缺值则拒绝', () => {
    const withParams = `${TEMPLATE} AND created_at >= :startTime`
    const ok = wrap(
      withParams,
      't',
      COLUMNS,
      null,
      null,
      null,
      null,
      null,
      1,
      10,
      ['startTime'],
      { startTime: '2026-01-01', ignored: 'x' },
    )
    expect(ok.select.sql).toContain('created_at >= ?')
    expect(ok.select.params).toContain('2026-01-01')
    expect(ok.select.params).not.toContain('x')

    expect(
      messageOf(() => wrap(withParams, 't', COLUMNS, null, null, null, null, null, 1, 10, ['startTime'], {})),
    ).toBe('缺少运行时参数值: :startTime')
  })

  it('全部列不可排序时不附加 ORDER BY（SQL 数据源允许）', () => {
    const noSort: QueryColumn[] = [
      { key: 'code', ref: 'code', filterable: true, sortable: false, columnType: 'VARCHAR' },
    ]
    const { select } = wrap('SELECT code FROM t WHERE x = :tenantId', 't', noSort, null, null, null, null, null, 1, 10)
    expect(select.sql).not.toContain('ORDER BY')
  })
})

describe('wrapSubquery', () => {
  it('size<=0 时不分页；分页参数只进行查询、不进 COUNT；page 至少为 1', () => {
    const inner = { sql: 'SELECT 1', params: ['a'] }
    const all = wrapSubquery(inner, ' WHERE x = ?', [1], ' ORDER BY c DESC', 3, 0)
    expect(all.select.sql).toBe('SELECT * FROM (SELECT 1) _qs WHERE x = ? ORDER BY c DESC')
    expect(all.select.params).toEqual(['a', 1])

    const paged = wrapSubquery(inner, '', [], '', 0, 20)
    expect(paged.select.sql).toContain('LIMIT ? OFFSET ?')
    // page=0 归一成 1 ⇒ OFFSET 0
    expect(paged.select.params).toEqual(['a', 20, 0])
    expect(paged.count.params).toEqual(['a'])
  })
})
