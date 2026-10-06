import { describe, expect, it } from 'vitest'
import { collectFormulaDeps, FormulaParseError, parseFormula } from '../formulaEval'

/**
 * 计算公式求值器单测（Task 144）
 * 覆盖：四则优先级、字段引用、函数、错误语法、空值 NaN 传播
 */
describe('formulaEval', () => {
  it('数字字面量与四则优先级', () => {
    expect(parseFormula('1 + 2 * 3').evaluate({})).toBe(7)
    expect(parseFormula('(1 + 2) * 3').evaluate({})).toBe(9)
    expect(parseFormula('10 / 4').evaluate({})).toBe(2.5)
    expect(parseFormula('10 % 3').evaluate({})).toBe(1)
    expect(parseFormula('2.5 * 2').evaluate({})).toBe(5)
  })

  it('一元正负号', () => {
    expect(parseFormula('-3 + 5').evaluate({})).toBe(2)
    expect(parseFormula('2 * -3').evaluate({})).toBe(-6)
    expect(parseFormula('+5').evaluate({})).toBe(5)
  })

  it('字段引用与依赖收集', () => {
    const f = parseFormula('${price} * ${count} + ${discount}')
    expect(f.deps).toEqual(['price', 'count', 'discount'])
    expect(f.evaluate({ price: 10, count: 3, discount: 1 })).toBe(31)
  })

  it('依赖按出现顺序去重', () => {
    expect(parseFormula('${a} + ${a} * ${b}').deps).toEqual(['a', 'b'])
  })

  it('重复引用参与运算', () => {
    expect(parseFormula('${a} + ${a}').evaluate({ a: 4 })).toBe(8)
  })

  it('字符串数字自动转换', () => {
    expect(parseFormula('${a} * 2').evaluate({ a: '6' })).toBe(12)
    expect(parseFormula('${a} * 2').evaluate({ a: ' 6.5 ' })).toBe(13)
  })

  it('空值 → NaN（不静默当 0）', () => {
    expect(parseFormula('${a} + 1').evaluate({})).toBeNaN()
    expect(parseFormula('${a} + 1').evaluate({ a: null })).toBeNaN()
    expect(parseFormula('${a} + 1').evaluate({ a: '' })).toBeNaN()
    expect(parseFormula('${a} + 1').evaluate({ a: 'abc' })).toBeNaN()
  })

  it('NaN 向结果传播', () => {
    expect(parseFormula('SUM(${a}, 2) * ${b}').evaluate({ a: null, b: 3 })).toBeNaN()
  })

  it('除以 0 → NaN（展示层显示占位符）', () => {
    expect(parseFormula('10 / ${a}').evaluate({ a: 0 })).toBeNaN()
  })

  it('函数 MIN/MAX/SUM/AVG', () => {
    expect(parseFormula('MIN(${a}, ${b}, 5)').evaluate({ a: 3, b: 8 })).toBe(3)
    expect(parseFormula('MAX(${a}, ${b}, 5)').evaluate({ a: 3, b: 8 })).toBe(8)
    expect(parseFormula('SUM(${a}, ${b}, 1)').evaluate({ a: 2, b: 3 })).toBe(6)
    expect(parseFormula('AVG(${a}, ${b})').evaluate({ a: 2, b: 4 })).toBe(3)
  })

  it('函数名大小写不敏感', () => {
    expect(parseFormula('min(3, 8)').evaluate({})).toBe(3)
    expect(parseFormula('Round(1.5)').evaluate({})).toBe(2)
  })

  it('ROUND/FLOOR/CEIL/ABS', () => {
    expect(parseFormula('ROUND(${a}, 2)').evaluate({ a: 3.14159 })).toBe(3.14)
    expect(parseFormula('ROUND(${a})').evaluate({ a: 3.5 })).toBe(4)
    expect(parseFormula('ROUND(${a}, -1)').evaluate({ a: 27 })).toBe(30)
    expect(parseFormula('FLOOR(2.9)').evaluate({})).toBe(2)
    expect(parseFormula('CEIL(2.1)').evaluate({})).toBe(3)
    expect(parseFormula('ABS(-5)').evaluate({})).toBe(5)
  })

  it('嵌套函数与括号混合', () => {
    expect(parseFormula('ROUND(MIN(${a} * 3, 100) / ${b}, 1)').evaluate({ a: 8, b: 6 })).toBe(4)
  })

  it('语法错误抛 FormulaParseError', () => {
    expect(() => parseFormula('')).toThrow(FormulaParseError)
    expect(() => parseFormula('${a} +')).toThrow(FormulaParseError)
    expect(() => parseFormula('${a')).toThrow(FormulaParseError)
    expect(() => parseFormula('${} + 1')).toThrow(FormulaParseError)
    expect(() => parseFormula('(1 + 2')).toThrow(FormulaParseError)
    expect(() => parseFormula('1 + 2)')).toThrow(FormulaParseError)
    expect(() => parseFormula('FOO(1)').toThrow(FormulaParseError))
    expect(() => parseFormula('MIN 1, 2)').toThrow(FormulaParseError))
    expect(() => parseFormula('ABS()').toThrow(FormulaParseError))
    expect(() => parseFormula('ROUND(1, 2, 3)').toThrow(FormulaParseError))
    expect(() => parseFormula('1 @ 2')).toThrow(FormulaParseError)
  })

  it('collectFormulaDeps：合法取依赖，非法返回空', () => {
    expect(collectFormulaDeps('${x} + ${y} * 2')).toEqual(['x', 'y'])
    expect(collectFormulaDeps('broken +')).toEqual([])
  })
})
