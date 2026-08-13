// ----- TDD: lookupFetch 工具函数测试 -----
// npx vitest run src/components/business/__tests__/lookupFetch.test.ts

import { describe, it, expect } from 'vitest'
import { buildSnapshot, readCellValue, getByPath } from '../lookupFetch'
import type { TableColumn } from '../types'

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
