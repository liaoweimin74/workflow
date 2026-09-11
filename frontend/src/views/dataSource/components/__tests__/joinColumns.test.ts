// ----- TDD: joinColumns 字段候选提取（目标表单含系统列 id） -----
// extractFormColumns：从 schema rule 提取业务字段（不含系统列）
// targetFormColumns：目标表单候选 = 业务字段 + 系统列 id（用于按目标表主键 id 关联）
// npx vitest run frontend/src/views/dataSource/components/__tests__/joinColumns.test.ts

import { describe, it, expect } from 'vitest'
import { extractFormColumns, targetFormColumns } from '../joinColumns'

describe('joinColumns 字段候选提取', () => {
  const schema = JSON.stringify([
    { field: 'name', title: '姓名' },
    { field: 'dept', title: '部门' },
  ])

  it('extractFormColumns 仅提取业务字段，不含系统列 id', () => {
    const cols = extractFormColumns(schema)
    expect(cols.map((c) => c.key)).toEqual(['name', 'dept'])
    expect(cols.some((c) => c.key === 'id')).toBe(false)
  })

  it('targetFormColumns 在业务字段基础上追加系统列 id', () => {
    const cols = targetFormColumns(schema)
    expect(cols.map((c) => c.key)).toEqual(['name', 'dept', 'id'])
    expect(cols.find((c) => c.key === 'id')?.label).toBe('主键 id')
  })

  it('targetFormColumns 对空 schema 仍返回系统列 id（可手输/选择 id 关联）', () => {
    const cols = targetFormColumns('[]')
    expect(cols.map((c) => c.key)).toEqual(['id'])
  })

  it('targetFormColumns 对 null/非法 schema 返回空或仅系统列，不抛错', () => {
    expect(targetFormColumns(null)).toEqual([])
    expect(targetFormColumns('not-json')).toEqual([])
  })

  it('targetFormColumns 对 schema 含 id 字段时不重复追加', () => {
    const withId = JSON.stringify([
      { field: 'id', title: 'ID' },
      { field: 'name', title: '姓名' },
    ])
    const keys = targetFormColumns(withId).map((c) => c.key)
    expect(keys.filter((k) => k === 'id')).toHaveLength(1)
  })
})