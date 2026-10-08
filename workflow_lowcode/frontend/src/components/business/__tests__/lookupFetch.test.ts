// ----- TDD: lookupFetch 工具函数测试 -----
// npx vitest run src/components/business/__tests__/lookupFetch.test.ts

import { describe, it, expect } from 'vitest'
import { readCellValue, getByPath, resolveFilter } from '../lookupFetch'
import type { LookupFilterConfig } from '../types'

describe('resolveFilter — 筛选解析', () => {
  it('静态条件：返回结构化 filter，value 用固定值', () => {
    const filter: LookupFilterConfig = {
      logic: 'AND',
      conditions: [{ column: 'status', op: 'eq', value: 'PAID' }],
    }
    expect(resolveFilter(filter, () => undefined)).toEqual({
      logic: 'AND',
      conditions: [{ column: 'status', op: 'eq', value: 'PAID' }],
    })
  })

  it('动态条件：value 取表单字段值', () => {
    const filter: LookupFilterConfig = {
      conditions: [{ column: 'dept_id', op: 'eq', field: 'emp_dept' }],
    }
    expect(resolveFilter(filter, (f) => (f === 'emp_dept' ? 'rd-001' : undefined))).toEqual({
      logic: 'AND',
      conditions: [{ column: 'dept_id', op: 'eq', value: 'rd-001' }],
    })
  })

  it('动态字段值缺失：value 置 null（列表为空）', () => {
    const filter: LookupFilterConfig = {
      conditions: [{ column: 'dept_id', op: 'eq', field: 'emp_dept' }],
    }
    expect(resolveFilter(filter, () => undefined)).toEqual({
      logic: 'AND',
      conditions: [{ column: 'dept_id', op: 'eq', value: null }],
    })
  })

  it('isEmpty/isNotEmpty 条件不含 value 键', () => {
    const filter: LookupFilterConfig = {
      logic: 'OR',
      conditions: [
        { column: 'remark', op: 'isEmpty' },
        { column: 'remark', op: 'isNotEmpty' },
      ],
    }
    expect(resolveFilter(filter, () => undefined)).toEqual({
      logic: 'OR',
      conditions: [
        { column: 'remark', op: 'isEmpty' },
        { column: 'remark', op: 'isNotEmpty' },
      ],
    })
  })

  it('多条件保留 AND/OR 与 in 值数组', () => {
    const filter: LookupFilterConfig = {
      logic: 'OR',
      conditions: [
        { column: 'level', op: 'in', value: ['P6', 'P7'] },
        { column: 'status', op: 'ne', value: 'CLOSED' },
      ],
    }
    expect(resolveFilter(filter, () => undefined)).toEqual({
      logic: 'OR',
      conditions: [
        { column: 'level', op: 'in', value: ['P6', 'P7'] },
        { column: 'status', op: 'ne', value: 'CLOSED' },
      ],
    })
  })

  it('filter 为空/无条件时返回 undefined', () => {
    expect(resolveFilter(undefined, () => undefined)).toBeUndefined()
    expect(resolveFilter({ conditions: [] }, () => undefined)).toBeUndefined()
  })
})
