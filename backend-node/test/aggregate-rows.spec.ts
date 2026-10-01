/**
 * 内存聚合器单测（Task 119 仪表盘）。
 *
 * 覆盖：五种聚合函数、时间桶（日/周/月/ISO 周）、__all__ 保留维度、
 * 排序与 limit、非数值跳过语义（对齐 SQL 忽略 NULL）。
 */
import { describe, it, expect } from 'vitest'
import { aggregateRowsInMemory, bucketKey, applyInMemoryFilter, splitGroupColumns } from '../src/engine/datasource/aggregate-rows'

const rows = [
  { type: '事假', days: 1, city: '上海' },
  { type: '事假', days: 2, city: '北京' },
  { type: '年假', days: 3, city: '上海' },
  { type: '年假', days: null, city: '' },
]

describe('aggregateRowsInMemory', () => {
  it('count 计行数', () => {
    const out = aggregateRowsInMemory(rows, { group: 'type', agg: 'count', metric: null, timeGrain: null, sort: 'key', order: 'asc', limit: 0 })
    expect(out).toEqual([
      { key: '事假', value: 2 },
      { key: '年假', value: 2 },
    ])
  })

  it('sum/avg/max/min 跳过 null 与空串', () => {
    const sum = aggregateRowsInMemory(rows, { group: 'type', agg: 'sum', metric: 'days', timeGrain: null, sort: 'key', order: 'asc', limit: 0 })
    expect(sum).toEqual([
      { key: '事假', value: 3 },
      { key: '年假', value: 3 },
    ])
    const avg = aggregateRowsInMemory(rows, { group: 'type', agg: 'avg', metric: 'days', timeGrain: null, sort: 'key', order: 'asc', limit: 0 })
    expect(avg.find((r) => r.key === '事假')?.value).toBe(1.5)
    expect(avg.find((r) => r.key === '年假')?.value).toBe(3)
  })

  it('全非数值键给 0 而不是 NaN', () => {
    const out = aggregateRowsInMemory([{ a: 'x', b: '' }, { a: 'x', b: 'oops' }], { group: 'a', agg: 'sum', metric: 'b', timeGrain: null, sort: 'key', order: 'asc', limit: 0 })
    expect(out).toEqual([{ key: 'x', value: 0 }])
  })

  it('__all__ 保留维度整表聚合成单值', () => {
    const out = aggregateRowsInMemory(rows, { group: '__all__', agg: 'sum', metric: 'days', timeGrain: null, sort: 'key', order: 'asc', limit: 0 })
    expect(out).toEqual([{ key: '__all__', value: 6 }])
  })

  it('value 排序 + desc + limit（Top N）', () => {
    const out = aggregateRowsInMemory(rows, { group: 'type', agg: 'count', metric: null, timeGrain: null, sort: 'value', order: 'desc', limit: 1 })
    expect(out).toHaveLength(1)
    expect(out[0].value).toBe(2)
  })

  it('非法排序字段抛错', () => {
    expect(() => aggregateRowsInMemory(rows, { group: 'type', agg: 'count', metric: null, timeGrain: null, sort: 'bogus', order: 'asc', limit: 0 })).toThrow('非法聚合排序字段')
  })
})

describe('bucketKey', () => {
  it('day/month 截断', () => {
    expect(bucketKey('2026-09-30 14:30:00', 'day')).toBe('2026-09-30')
    expect(bucketKey('2026-09-30 14:30:00', 'month')).toBe('2026-09')
  })

  it('week 产出 ISO 周（%x-W%v 语义）', () => {
    // 2026-09-30 是周三，属于 2026 年第 40 周
    expect(bucketKey('2026-09-30 14:30:00', 'week')).toBe('2026-W40')
  })

  it('非法日期原样返回', () => {
    expect(bucketKey('not-a-date', 'week')).toBe('not-a-date')
  })
})

describe('applyInMemoryFilter', () => {
  it('结构化 eq 过滤', () => {
    const out = applyInMemoryFilter(rows, JSON.stringify({ logic: 'AND', conditions: [{ column: 'city', op: 'eq', value: '上海' }] }))
    expect(out).toHaveLength(2)
  })

  it('旧格式等值 AND', () => {
    const out = applyInMemoryFilter(rows, JSON.stringify({ type: '事假' }))
    expect(out).toHaveLength(2)
  })

  it('range 数值区间', () => {
    const out = applyInMemoryFilter(rows, JSON.stringify({ logic: 'AND', conditions: [{ column: 'days', op: 'range', value: [2, 3] }] }))
    expect(out).toHaveLength(2)
  })

  it('空 filter 原样返回', () => {
    expect(applyInMemoryFilter(rows, null)).toBe(rows)
  })
})

describe('splitGroupColumns（Task 120 双维度）', () => {
  it('单列原样返回', () => {
    expect(splitGroupColumns('city')).toEqual(['city'])
  })

  it('双列拆分并去空格', () => {
    expect(splitGroupColumns('city , type')).toEqual(['city', 'type'])
  })

  it('空列报错', () => {
    expect(() => splitGroupColumns(' , ')).toThrow('分组字段不能为空')
  })

  it('超过两列报错', () => {
    expect(() => splitGroupColumns('a,b,c')).toThrow('最多支持两个维度')
  })

  it('重复列报错', () => {
    expect(() => splitGroupColumns('a,a')).toThrow('分组字段重复')
  })
})

describe('双维度内存聚合（Task 120）', () => {
  const dualRows = [
    { city: '上海', type: '事假', days: 2 },
    { city: '上海', type: '事假', days: 3 },
    { city: '上海', type: '病假', days: 1 },
    { city: '北京', type: '事假', days: 5 },
  ]

  it('双维度 count：key 用 | 拼接', () => {
    const out = aggregateRowsInMemory(dualRows, { group: 'city,type', agg: 'count', metric: null, timeGrain: null, sort: 'key', order: 'asc', limit: 0 })
    expect(out).toEqual([
      { key: '上海|事假', value: 2 },
      { key: '上海|病假', value: 1 },
      { key: '北京|事假', value: 1 },
    ])
  })

  it('双维度 sum：metric 对第二维度组合求和', () => {
    const out = aggregateRowsInMemory(dualRows, { group: 'city,type', agg: 'sum', metric: 'days', timeGrain: null, sort: 'value', order: 'desc', limit: 0 })
    expect(out.find((r) => r.key === '北京|事假')?.value).toBe(5)
    expect(out.find((r) => r.key === '上海|事假')?.value).toBe(5)
    expect(out.find((r) => r.key === '上海|病假')?.value).toBe(1)
  })

  it('timeGrain 只作用于第一列', () => {
    const timeRows = [
      { day: '2026-09-30 10:00:00', city: '上海' },
      { day: '2026-09-30 11:00:00', city: '上海' },
      { day: '2026-09-29 10:00:00', city: '北京' },
    ]
    const out = aggregateRowsInMemory(timeRows, { group: 'day,city', agg: 'count', metric: null, timeGrain: 'day', sort: 'key', order: 'asc', limit: 0 })
    expect(out).toEqual([
      { key: '2026-09-29|北京', value: 1 },
      { key: '2026-09-30|上海', value: 2 },
    ])
  })

  it('任一维度为 null 的行被跳过（与单列语义一致）', () => {
    const withNull = [...dualRows, { city: null, type: '事假', days: 9 }]
    const out = aggregateRowsInMemory(withNull, { group: 'city,type', agg: 'count', metric: null, timeGrain: null, sort: 'key', order: 'asc', limit: 0 })
    expect(out.find((r) => r.key.includes('null'))).toBeUndefined()
  })
})
