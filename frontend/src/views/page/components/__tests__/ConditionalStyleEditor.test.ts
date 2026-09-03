import { describe, it, expect } from 'vitest'
import { generateWhenExpression, parseWhenExpression } from '../ConditionalStyleEditor'

describe('ConditionalStyleEditor — 条件样式规则编辑器', () => {
  describe('generateWhenExpression', () => {
    it('生成等值条件表达式', () => {
      const expr = generateWhenExpression({ field: 'status', operator: '===', value: '异常' })
      expect(expr).toBe("$row.status === '异常'")
    })

    it('生成数值比较表达式', () => {
      const expr = generateWhenExpression({ field: 'amount', operator: '>', value: '1000' })
      expect(expr).toBe('$row.amount > 1000')
    })

    it('生成包含表达式', () => {
      const expr = generateWhenExpression({ field: 'name', operator: 'includes', value: '测试' })
      expect(expr).toBe("$row.name.includes('测试')")
    })
  })

  describe('parseWhenExpression', () => {
    it('解析等值条件', () => {
      const result = parseWhenExpression("$row.status === '异常'")
      expect(result).toEqual({ field: 'status', operator: '===', value: '异常' })
    })

    it('解析数值比较', () => {
      const result = parseWhenExpression('$row.amount > 1000')
      expect(result).toEqual({ field: 'amount', operator: '>', value: '1000' })
    })

    it('解析包含条件', () => {
      const result = parseWhenExpression("$row.name.includes('测试')")
      expect(result).toEqual({ field: 'name', operator: 'includes', value: '测试' })
    })

    it('无法解析时返回 null', () => {
      const result = parseWhenExpression('invalid expression')
      expect(result).toBeNull()
    })
  })
})
