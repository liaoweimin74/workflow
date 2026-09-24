import { describe, expect, it } from 'vitest'
import {
  buildCount,
  buildSelect,
  validate,
  validateTargets,
  type JoinConfig,
  type QueryColumn,
} from '../../../src/engine/form/bizdata/join-sql-generator'

/**
 * `JoinSqlGenerator` 的单测（对齐 Java 366 行）。
 *
 * 契约网看不到这一层：SQL 文本只在服务器内部流转，golden 里只有**结果行**。
 * 而这里恰恰是 config 模式的注入防线（列/表/排序白名单、值全绑定），
 * 所以只能用单测钉死。三层关注点：
 *
 *   1. **引用解析**：主表列 → `m.<key>`、虚拟列 → `<alias>.<joinField>`、
 *      内置列 → `m.<内置>`（即使不在 columns 里）、JSON 关联列 → `JSON_EXTRACT` 取首元素。
 *   2. **白名单**：非法列 / 不可排序列 / 不可筛选列 / 非法排序方向 / 关键词空列。
 *   3. **与 `SqlTemplateEngine` 的真实分歧**：单片段结构化筛选**始终套括号**。
 */

const JOINS: JoinConfig[] = [
  {
    alias: 'c',
    targetFormKey: 'customer',
    localField: 'customer_id',
    foreignField: 'id',
    joinField: 'name',
    virtualKey: 'customer_name',
    label: '客户',
    sortable: true,
    filterable: true,
  },
]

const COLUMNS: QueryColumn[] = [
  { key: 'order_no', ref: 'm.order_no', columnType: 'VARCHAR', sortable: true, filterable: true },
  { key: 'amount', ref: 'm.amount', columnType: 'DECIMAL', sortable: true, filterable: true },
  { key: 'customer_id', ref: 'm.customer_id', columnType: 'JSON', sortable: false, filterable: true },
  {
    key: 'customer_name',
    ref: 'c.name',
    columnType: 'VARCHAR',
    sortable: true,
    filterable: true,
  },
  { key: 'secret', ref: 'm.secret', columnType: 'VARCHAR', sortable: false, filterable: false },
]

function messageOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('预期抛错，但没有抛')
}

function errorNameOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return (error as Error).name
  }
  throw new Error('预期抛错，但没有抛')
}

/** 不带筛选/关键词/排序的基线调用。 */
function select(
  overrides: Partial<{
    joins: JoinConfig[]
    filters: Record<string, unknown> | null
    keyword: string | null
    keywordColumn: string | null
    sort: string | null
    order: string | null
    page: number
    size: number
  }> = {},
): { sql: string; params: unknown[] } {
  return buildSelect(
    'wf_biz_order',
    'default',
    overrides.joins ?? JOINS,
    COLUMNS,
    overrides.filters ?? null,
    overrides.keyword ?? null,
    overrides.keywordColumn ?? null,
    overrides.sort ?? null,
    overrides.order ?? null,
    overrides.page ?? 0,
    overrides.size ?? 10,
  )
}

describe('JoinSqlGenerator.buildSelect', () => {
  it('主表别名 m、虚拟列 AS、LEFT JOIN 与 JSON 外键提取、缺省排序 created_at desc', () => {
    const out = select()
    expect(out.sql).toBe(
      'SELECT m.*, c.name AS customer_name FROM wf_biz_order m' +
        ' LEFT JOIN wf_biz_customer c ON c.id = JSON_UNQUOTE(JSON_EXTRACT(m.customer_id,\'$[0]\'))' +
        ' WHERE m.tenant_id = ?' +
        ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?',
    )
    expect(out.params).toEqual(['default', 10, 0])
  })

  it('非 JSON 关联列直接等值连接；多个 JOIN 按声明顺序', () => {
    const plain: JoinConfig[] = [
      { ...JOINS[0], localField: 'order_no', virtualKey: 'customer_name' },
      {
        ...JOINS[0],
        alias: 'u',
        targetFormKey: 'user',
        localField: 'customer_id',
        virtualKey: 'owner_name',
        joinField: 'name',
      },
    ]
    const out = select({ joins: plain })
    expect(out.sql).toContain('LEFT JOIN wf_biz_customer c ON c.id = m.order_no')
    expect(out.sql).toContain(
      'LEFT JOIN wf_biz_user u ON u.id = JSON_UNQUOTE(JSON_EXTRACT(m.customer_id,\'$[0]\'))',
    )
    expect(out.sql).toContain('SELECT m.*, c.name AS customer_name, u.name AS owner_name')
  })

  it('分页：offset = page * size；size<=0 时不加 LIMIT/OFFSET', () => {
    expect(select({ page: 2, size: 20 }).params).toEqual(['default', 20, 40])
    const all = select({ size: 0 })
    expect(all.sql).not.toContain('LIMIT')
    expect(all.params).toEqual(['default'])
  })

  it('排序：虚拟列走 ref，内置列走主表别名，方向白名单', () => {
    expect(select({ sort: 'customer_name' }).sql).toContain('ORDER BY c.name DESC')
    expect(select({ sort: 'id', order: 'asc' }).sql).toContain('ORDER BY m.id ASC')
    expect(select({ sort: 'created_at' }).sql).toContain('ORDER BY m.created_at DESC')
    expect(messageOf(() => select({ sort: 'secret' }))).toBe('该列不可排序: secret')
    expect(messageOf(() => select({ sort: 'nope' }))).toBe('非法排序字段: nope')
    expect(messageOf(() => select({ sort: 'amount', order: 'sideways' }))).toBe(
      '非法排序方向: sideways',
    )
  })

  it('筛选：JSON 列走 JSON_CONTAINS、普通列等值、null 值仍先校验列名', () => {
    const json = select({ filters: { customer_id: ['01'] } })
    expect(json.sql).toContain('AND JSON_CONTAINS(m.customer_id, ?)')
    expect(json.params).toContain('["01"]')

    const plain = select({ filters: { order_no: 'A001' } })
    expect(plain.sql).toContain('AND m.order_no = ?')
    expect(plain.params).toEqual(['default', 'A001', 10, 0])

    // 值 null 被跳过，但列名仍然过白名单
    const skipped = select({ filters: { order_no: null } })
    expect(skipped.sql).not.toContain('order_no = ?')
    expect(messageOf(() => select({ filters: { nope: null } }))).toBe('非法筛选字段: nope')
    expect(messageOf(() => select({ filters: { secret: 'x' } }))).toBe('该列不可筛选字段: secret')
  })

  it('结构化筛选：eq/ne/like/in/range/isempty/isnotempty，logic 缺省 AND', () => {
    const out = select({
      filters: {
        conditions: [
          { column: 'order_no', op: 'eq', value: 'A' },
          { column: 'amount', op: 'ne', value: 1 },
          { column: 'order_no', op: 'like', value: 'x' },
          { column: 'amount', op: 'in', value: [1, 2] },
          { column: 'amount', op: 'range', value: [1, 9] },
          { column: 'order_no', op: 'isempty' },
          { column: 'order_no', op: 'isnotempty' },
        ],
      },
    })
    expect(out.sql).toContain(
      'AND (m.order_no = ? AND m.amount <> ? AND m.order_no LIKE ? AND m.amount IN (?, ?)' +
        ' AND (m.amount >= ? AND m.amount <= ?)' +
        " AND (m.order_no IS NULL OR m.order_no = '')" +
        " AND (m.order_no IS NOT NULL AND m.order_no <> ''))",
    )

    const or = select({
      filters: { logic: 'or', conditions: [{ column: 'order_no', op: 'eq', value: 'A' }, { column: 'amount', op: 'eq', value: 2 }] },
    })
    expect(or.sql).toContain('AND (m.order_no = ? OR m.amount = ?)')

    expect(
      messageOf(() =>
        select({ filters: { conditions: [{ column: 'order_no', op: 'regex' }] } }),
      ),
    ).toBe('非法筛选运算符: regex')
    expect(
      messageOf(() => select({ filters: { conditions: [{ column: 'secret', op: 'eq', value: 1 }] } })),
    ).toBe('该列不可筛选字段: secret')
  })

  it('⚠️ 与 SqlTemplateEngine 的真实分歧：单片段结构化筛选**始终**套括号', () => {
    // SqlTemplateEngine 输出 "AND x = ?"；JoinSqlGenerator 输出 "AND (x = ?)"
    const out = select({ filters: { conditions: [{ column: 'order_no', op: 'eq', value: 'A' }] } })
    expect(out.sql).toContain('AND (m.order_no = ?)')
    expect(out.sql).not.toContain('AND m.order_no = ?')
  })

  it('关键词：逗号分隔多列 OR LIKE；空列拒绝', () => {
    const one = select({ keyword: 'kw', keywordColumn: 'order_no' })
    expect(one.sql).toContain('AND m.order_no LIKE ?')
    expect(one.params).toContain('%kw%')

    const many = select({ keyword: 'kw', keywordColumn: 'order_no, customer_name' })
    expect(many.sql).toContain('AND (m.order_no LIKE ? OR c.name LIKE ?)')
    expect(many.params).toEqual(['default', '%kw%', '%kw%', 10, 0])

    expect(messageOf(() => select({ keyword: 'kw', keywordColumn: '' }))).toBe(
      '关键词匹配列不能为空',
    )
    expect(messageOf(() => select({ keyword: 'kw', keywordColumn: ', ,' }))).toBe(
      '关键词匹配列不能为空',
    )
    // 关键词列走**筛选**能力（filterable），不是 sortable
    expect(messageOf(() => select({ keyword: 'kw', keywordColumn: 'secret' }))).toBe(
      '该列不可关键词匹配列: secret',
    )
  })

  it('非法参数抛 IllegalArgumentException 形态（HTTP 400），不是业务异常', () => {
    expect(errorNameOf(() => select({ sort: 'nope' }))).toBe('IllegalArgumentException')
    expect(errorNameOf(() => select({ keyword: 'kw', keywordColumn: '' }))).toBe(
      'IllegalArgumentException',
    )
  })
})

describe('JoinSqlGenerator.buildCount', () => {
  it('COUNT(1)、JOIN 与筛选条件同 buildSelect，无排序/分页', () => {
    const out = buildCount('wf_biz_order', 'default', JOINS, COLUMNS, { order_no: 'A' }, 'kw', 'order_no')
    expect(out.sql).toBe(
      'SELECT COUNT(1) FROM wf_biz_order m' +
        ' LEFT JOIN wf_biz_customer c ON c.id = JSON_UNQUOTE(JSON_EXTRACT(m.customer_id,\'$[0]\'))' +
        ' WHERE m.tenant_id = ? AND m.order_no = ? AND m.order_no LIKE ?',
    )
    expect(out.params).toEqual(['default', 'A', '%kw%'])
  })
})

describe('JoinSqlGenerator.validate / validateTargets', () => {
  it('别名格式与重复、必填字段、虚拟列重复与主表冲突', () => {
    expect(messageOf(() => validate([{ ...JOINS[0], alias: '1c' }], null))).toBe(
      '关联别名非法: 1c',
    )
    expect(messageOf(() => validate([JOINS[0], { ...JOINS[0] }], null))).toBe('关联别名重复: c')
    expect(messageOf(() => validate([{ ...JOINS[0], targetFormKey: ' ' }], null))).toBe(
      '关联目标表不能为空',
    )
    expect(messageOf(() => validate([{ ...JOINS[0], localField: null }], null))).toBe(
      '主表关联字段不能为空',
    )
    expect(messageOf(() => validate([{ ...JOINS[0], foreignField: null }], null))).toBe(
      '目标表关联字段不能为空',
    )
    expect(messageOf(() => validate([{ ...JOINS[0], joinField: null }], null))).toBe(
      '目标表展示字段不能为空',
    )
    expect(messageOf(() => validate([{ ...JOINS[0], virtualKey: null }], null))).toBe(
      // Java `requireText(virtualKey, "虚拟列 key")` 拼出来没有空格（label 自带空格由调用方控制）
      '虚拟列 key不能为空',
    )
    const other: JoinConfig = { ...JOINS[0], alias: 'd', virtualKey: 'customer_name' }
    expect(messageOf(() => validate([JOINS[0], other], null))).toBe('虚拟列 key 重复: customer_name')
    expect(messageOf(() => validate([JOINS[0]], ['customer_name']))).toBe(
      '虚拟列 key 与主表列冲突: customer_name',
    )
    // 空列表直接放行
    expect(() => validate([], null)).not.toThrow()
    expect(() => validate(null, null)).not.toThrow()
  })

  it('validateTargets：物理表不存在时拒绝（表名由 targetFormKey 推导）', () => {
    const seen: string[] = []
    expect(() =>
      validateTargets(JOINS, (table) => {
        seen.push(table)
        return true
      }),
    ).not.toThrow()
    expect(seen).toEqual(['wf_biz_customer'])
    expect(messageOf(() => validateTargets(JOINS, () => false))).toBe('关联表单不存在: customer')
  })
})
