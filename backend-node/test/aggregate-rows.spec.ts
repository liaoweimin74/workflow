/**
 * 内存聚合器单测（Task 119 仪表盘）。
 *
 * 覆盖：五种聚合函数、时间桶（日/周/月/ISO 周）、__all__ 保留维度、
 * 排序与 limit、非数值跳过语义（对齐 SQL 忽略 NULL）。
 */
import { describe, it, expect } from 'vitest'
import { aggregateRowsInMemory, bucketKey, applyInMemoryFilter } from '../src/engine/datasource/aggregate-rows'

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
