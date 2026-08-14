// ----- TDD: lookupFetch 工具函数测试 -----
// npx vitest run src/components/business/__tests__/lookupFetch.test.ts

import { describe, it, expect } from 'vitest'
import { buildSnapshot, readCellValue, getByPath, resolveFilter } from '../lookupFetch'
import type { TableColumn, LookupFilterConfig } from '../types'

describe('buildSnapshot — 快照构建', () => {
  it('BizDataVO 内层行：提取 id + displayField + 配置列，剔除脏字段', () => {
    const row = { id: 'u1', data: { name: '张三', dept: '研发部', level: 'P7' }, version: 1, createdAt: 'x' }
    const columns: TableColumn[] = [{ prop: 'name', label: '姓名' }, { prop: 'dept', label: '部门' }]
    expect(buildSnapshot(row, 'name', columns)).toEqual({
      id: 'u1',
      name: '张三',
      dept: '研发部',
    })
  })

  it('平铺行：兼容 row[key] 顶层取值', () => {
    const row = { id: 'u2', name: '李四', dept: '市场部' }
    const columns: TableColumn[] = [{ prop: 'name', label: '姓名' }, { prop: 'dept', label: '部门' }]
    expect(buildSnapshot(row, 'name', columns)).toEqual({ id: 'u2', name: '李四', dept: '市场部' })
  })

  it('displayField 不在 columns 中时仍强制包含', () => {
    const row = { id: 'u3', data: { name: '王五', dept: '财务部' } }
    const columns: TableColumn[] = [{ prop: 'dept', label: '部门' }]
    expect(buildSnapshot(row, 'name', columns)).toEqual({ id: 'u3', name: '王五', dept: '财务部' })
  })

  it('id 缺失时省略 id 键', () => {
    const row = { data: { name: '赵六' } }
    expect(buildSnapshot(row, 'name', [])).toEqual({ name: '赵六' })
  })

  it('displayField 值缺失时为 undefined（键仍存在，调用方可判断）', () => {
    const row = { id: 'u4', data: { dept: '行政部' } }
    expect(buildSnapshot(row, 'name', [])).toEqual({ id: 'u4', name: undefined })
  })

  it('columns 为 undefined 时仅含 id + displayField', () => {
    const row = { id: 'u5', data: { name: '钱七' } }
    expect(buildSnapshot(row, 'name')).toEqual({ id: 'u5', name: '钱七' })
  })

  it('配置列含 id 或 displayField 时不重复写入', () => {
    const row = { id: 'u6', data: { name: '孙八' } }
    const columns: TableColumn[] = [{ prop: 'id', label: 'ID' }, { prop: 'name', label: '姓名' }]
    expect(buildSnapshot(row, 'name', columns)).toEqual({ id: 'u6', name: '孙八' })
  })
})

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
