import { describe, it, expect } from 'vitest'
import type { LookupFilterConfig } from '@/components/business/types'
import { mergeFilters } from '../filterMerge'

describe('mergeFilters', () => {
  it('两层都为空时返回 undefined', () => {
    expect(mergeFilters(undefined, undefined)).toBeUndefined()
  })

  it('仅数据源级 filter 时原样返回', () => {
    const dsFilter: LookupFilterConfig = {
      logic: 'AND',
      conditions: [{ column: 'status', op: 'eq', value: 'PAID' }],
    }
    expect(mergeFilters(dsFilter, undefined)).toEqual(dsFilter)
  })

  it('仅组件级 filter 时原样返回', () => {
    const compFilter: LookupFilterConfig = {
      logic: 'OR',
      conditions: [{ column: 'type', op: 'eq', value: 'A' }],
    }
    expect(mergeFilters(undefined, compFilter)).toEqual(compFilter)
  })

  it('两层都有时以 AND 合并 conditions', () => {
    const dsFilter: LookupFilterConfig = {
      logic: 'AND',
      conditions: [{ column: 'status', op: 'eq', value: 'PAID' }],
    }
    const compFilter: LookupFilterConfig = {
      logic: 'OR',
      conditions: [
        { column: 'amount', op: 'gt' as never, value: 100 },
        { column: 'region', op: 'eq', value: 'north' },
      ],
    }
    const merged = mergeFilters(dsFilter, compFilter)
    expect(merged).toBeDefined()
    expect(merged!.logic).toBe('AND')
    expect(merged!.conditions).toHaveLength(3)
    expect(merged!.conditions[0]).toEqual({ column: 'status', op: 'eq', value: 'PAID' })
    expect(merged!.conditions[1]).toEqual({ column: 'amount', op: 'gt', value: 100 })
    expect(merged!.conditions[2]).toEqual({ column: 'region', op: 'eq', value: 'north' })
  })

  it('合并时不修改原始 filter 对象', () => {
    const dsFilter: LookupFilterConfig = {
      logic: 'AND',
      conditions: [{ column: 'status', op: 'eq', value: 'PAID' }],
    }
    const compFilter: LookupFilterConfig = {
      logic: 'AND',
      conditions: [{ column: 'type', op: 'eq', value: 'B' }],
    }
    const merged = mergeFilters(dsFilter, compFilter)
    expect(merged).not.toBe(dsFilter)
    expect(merged!.conditions).not.toBe(dsFilter.conditions)
    expect(dsFilter.conditions).toHaveLength(1)
    expect(compFilter.conditions).toHaveLength(1)
  })

  it('某层 conditions 为空数组时视为无该层条件', () => {
    const dsFilter: LookupFilterConfig = { logic: 'AND', conditions: [] }
    const compFilter: LookupFilterConfig = {
      logic: 'AND',
      conditions: [{ column: 'type', op: 'eq', value: 'B' }],
    }
    const merged = mergeFilters(dsFilter, compFilter)
    expect(merged).toBeDefined()
    expect(merged!.conditions).toHaveLength(1)
    expect(merged!.conditions[0].column).toBe('type')
  })
})
