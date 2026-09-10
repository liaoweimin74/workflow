import { describe, it, expect } from 'vitest'
import type { LookupFilterConfig } from '@/components/business/types'
import { resolveFilterFieldReferences } from '../filterResolve'

describe('resolveFilterFieldReferences', () => {
  it('field 条件的 value 替换为 formData 中的字段值', () => {
    const filter: LookupFilterConfig = {
      logic: 'AND',
      conditions: [{ column: 'status', op: 'eq', field: 'orderStatus' }],
    }
    const result = resolveFilterFieldReferences(filter, { orderStatus: 'active' })
    expect(result.conditions[0].value).toBe('active')
  })

  it('无 field 的条件保留原 value', () => {
    const filter: LookupFilterConfig = {
      logic: 'AND',
      conditions: [{ column: 'type', op: 'eq', value: 'static-value' }],
    }
    const result = resolveFilterFieldReferences(filter, { status: 'active' })
    expect(result.conditions[0].value).toBe('static-value')
  })

  it('field 在 formData 中不存在时该条件被剔除', () => {
    const filter: LookupFilterConfig = {
      logic: 'AND',
      conditions: [
        { column: 'status', op: 'eq', field: 'nonexistent' },
        { column: 'type', op: 'eq', value: 'B' },
      ],
    }
    const result = resolveFilterFieldReferences(filter, { status: 'active' })
    expect(result.conditions).toHaveLength(1)
    expect(result.conditions[0].column).toBe('type')
  })

  it('field 值为 null/undefined/空串时条件被剔除（避免无效查询）', () => {
    const filter: LookupFilterConfig = {
      logic: 'OR',
      conditions: [
        { column: 'a', op: 'eq', field: 'nullField' },
        { column: 'b', op: 'eq', field: 'undefField' },
        { column: 'c', op: 'eq', field: 'emptyField' },
        { column: 'd', op: 'eq', value: 'kept' },
      ],
    }
    const formData = { nullField: null, undefField: undefined, emptyField: '' }
    const result = resolveFilterFieldReferences(filter, formData)
    expect(result.conditions).toHaveLength(1)
    expect(result.conditions[0].column).toBe('d')
  })

  it('混合静态与动态条件全部正确解析', () => {
    const filter: LookupFilterConfig = {
      logic: 'AND',
      conditions: [
        { column: 'type', op: 'eq', value: 'static-type' },
        { column: 'status', op: 'eq', field: 'status' },
        { column: 'priority', op: 'in', field: 'prioList' },
      ],
    }
    const result = resolveFilterFieldReferences(filter, {
      status: 'pending',
      prioList: ['P1', 'P2'],
    })
    expect(result.conditions).toHaveLength(3)
    expect(result.conditions[0].value).toBe('static-type')
    expect(result.conditions[1].value).toBe('pending')
    expect(result.conditions[2].value).toEqual(['P1', 'P2'])
  })

  it('返回新对象，不修改原始 filter', () => {
    const filter: LookupFilterConfig = {
      logic: 'AND',
      conditions: [{ column: 'status', op: 'eq', field: 'status' }],
    }
    const result = resolveFilterFieldReferences(filter, { status: 'active' })
    expect(result).not.toBe(filter)
    expect(result.conditions).not.toBe(filter.conditions)
    expect(result.conditions[0]).not.toBe(filter.conditions[0])
    expect(filter.conditions[0].value).toBeUndefined()
    expect(result.conditions[0].value).toBe('active')
  })

  it('空 conditions 返回空 conditions，logic 保留', () => {
    const filter: LookupFilterConfig = { logic: 'OR', conditions: [] }
    const result = resolveFilterFieldReferences(filter, {})
    expect(result.logic).toBe('OR')
    expect(result.conditions).toEqual([])
  })

  it('filter 为 undefined 时返回 undefined', () => {
    expect(resolveFilterFieldReferences(undefined, {})).toBeUndefined()
  })
})
