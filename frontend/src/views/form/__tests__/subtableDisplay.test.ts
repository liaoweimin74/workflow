// ----- TDD: 子表单列表展示辅助（parseSubRows） -----
// npx vitest run src/views/form/__tests__/subtableDisplay.test.ts

import { describe, it, expect } from 'vitest'
import { parseSubRows } from '../subtableDisplay'

describe('subtableDisplay — parseSubRows', () => {
  it('解析 JSON 数组字符串返回行数组', () => {
    const raw = '[{"sub_lookup":"王五","amount":1},{"sub_lookup":"张三","amount":2}]'
    const rows = parseSubRows(raw)
    expect(rows).toHaveLength(2)
    expect(rows[0].sub_lookup).toBe('王五')
    expect(rows[1].amount).toBe(2)
  })

  it('已解析数组直接返回', () => {
    const rows = parseSubRows([{ sub_lookup: '李四' }])
    expect(rows).toHaveLength(1)
    expect(rows[0].sub_lookup).toBe('李四')
  })

  it('空值返回空数组', () => {
    expect(parseSubRows(null)).toEqual([])
    expect(parseSubRows(undefined)).toEqual([])
    expect(parseSubRows('')).toEqual([])
  })

  it('非法 JSON 字符串返回空数组', () => {
    expect(parseSubRows('not-json')).toEqual([])
    expect(parseSubRows('{"a":1}')).toEqual([])
  })
})
