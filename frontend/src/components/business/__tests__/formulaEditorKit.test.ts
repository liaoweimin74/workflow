import { describe, expect, it } from 'vitest'
import {
  FORMULA_FUNCTIONS,
  FORMULA_OPERATORS,
  formatPreview,
  insertAtCursor,
  parseDraft,
} from '../formulaEditorKit'
import { parseFormula } from '../formulaEval'
import { collectFormulaRefFields, type RuleLike } from '@/views/form/formRuleWalk'

/**
 * 计算表达式可视化编辑器纯逻辑单测（Task 145）
 * 覆盖：光标插入（含选区替换/尾括号回退）、草稿校验、试算格式化、
 * 公式可引用字段收集（穿透布局 / 排除自身与子表内部）、函数面板与求值器白名单一致性
 */
describe('formulaEditorKit.insertAtCursor', () => {
  it('空串追加（无 textarea 时的兜底路径）', () => {
    expect(insertAtCursor('', 0, 0, '${a}')).toEqual({ text: '${a}', cursor: 4 })
  })

  it('末尾追加', () => {
    expect(insertAtCursor('1 + 2', 5, 5, ' * 3')).toEqual({ text: '1 + 2 * 3', cursor: 9 })
  })

  it('中间插入并后移光标', () => {
    expect(insertAtCursor('1 + 2', 1, 1, '2', 0)).toEqual({ text: '12 + 2', cursor: 2 })
  })

  it('选区被替换', () => {
    // 选中 " + "（1..4）替换为 "*"
    expect(insertAtCursor('1 + 2', 1, 4, '*', 0)).toEqual({ text: '1*2', cursor: 2 })
  })

  it('cursorBack 使光标落在函数尾括号之前', () => {
    const r = insertAtCursor('', 0, 0, 'MIN()', 1)
    expect(r.text).toBe('MIN()')
    expect(r.cursor).toBe(4) // MIN( 后
  })

  it('越界 start/end 被钳制', () => {
    expect(insertAtCursor('ab', 99, 99, 'c')).toEqual({ text: 'abc', cursor: 3 })
    expect(insertAtCursor('ab', -5, -1, 'c')).toEqual({ text: 'cab', cursor: 1 })
    expect(insertAtCursor('ab', NaN, NaN, 'c')).toEqual({ text: 'abc', cursor: 3 })
  })
})

describe('formulaEditorKit.parseDraft', () => {
  it('空表达式不算错误', () => {
    expect(parseDraft('')).toEqual({ deps: [], error: '' })
    expect(parseDraft('   ')).toEqual({ deps: [], error: '' })
  })

  it('合法表达式返回去重依赖', () => {
    expect(parseDraft('${a} + ${a} * ${b}')).toEqual({ deps: ['a', 'b'], error: '' })
  })

  it('语法错误返回消息', () => {
    const r = parseDraft('1 +')
    expect(r.error).not.toBe('')
    expect(r.deps).toEqual([])
  })

  it('未知函数返回错误提示', () => {
    expect(parseDraft('FOO(1)').error).toContain('FOO')
  })
})

describe('formulaEditorKit.formatPreview', () => {
  it('非有限值 → 占位符', () => {
    expect(formatPreview(NaN)).toBe('—')
    expect(formatPreview(Infinity)).toBe('—')
  })

  it('整数与小数', () => {
    expect(formatPreview(30)).toBe('30')
    expect(formatPreview(2.5)).toBe('2.5')
    expect(formatPreview(1 / 3)).toBe('0.333333')
    expect(formatPreview(2.5)).toBe('2.5')
    expect(formatPreview(-0.5)).toBe('-0.5')
  })

  it('尾零被裁剪', () => {
    expect(formatPreview(2.5000000001)).toBe('2.5')
  })
})

describe('formulaEditorKit.FORMULA_FUNCTIONS 一致性', () => {
  it('每个面板函数都能被求值器解析（占位参数 1）', () => {
    for (const fn of FORMULA_FUNCTIONS) {
      expect(() => parseFormula(`${fn.name}(1)`)).not.toThrow()
    }
  })

  it('面板无重复且含 8 个函数', () => {
    const names = FORMULA_FUNCTIONS.map(f => f.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toHaveLength(8)
  })

  it('运算符面板与求值器支持一致', () => {
    expect(FORMULA_OPERATORS).toEqual(['+', '-', '*', '/', '%', '(', ')'])
  })
})

describe('formRuleWalk.collectFormulaRefFields', () => {
  const tree: RuleLike[] = [
    {
      type: 'row',
      children: [
        { type: 'inputNumber', field: 'price', title: '单价', props: {} },
        {
          type: 'col',
          children: [{ type: 'inputNumber', field: 'count', title: '数量', props: {} }],
        },
      ],
    },
    { type: 'FormulaField', field: 'formula1', title: '计算公式', props: {} },
    {
      type: 'subForm',
      field: 'sub1',
      props: { rule: [{ type: 'inputNumber', field: 'inner', title: '子表单字段' }] },
    },
    {
      type: 'tableForm',
      field: 'tbl1',
      props: { columns: [{ rule: [{ type: 'inputNumber', field: 'cell', title: '子表字段' }] }] },
    },
  ]

  it('收集同层字段（穿透布局 children）', () => {
    const out = collectFormulaRefFields(tree)
    const fields = out.map(o => o.field)
    expect(fields).toContain('price')
    expect(fields).toContain('count')
    expect(out.map(o => o.title)).toContain('单价')
  })

  it('排除 FormulaField 自身（禁止自引用）', () => {
    expect(collectFormulaRefFields(tree).map(o => o.field)).not.toContain('formula1')
  })

  it('不进子表单/子表内部（第一版仅支持同层引用）', () => {
    const fields = collectFormulaRefFields(tree).map(o => o.field)
    expect(fields).not.toContain('inner')
    expect(fields).not.toContain('cell')
  })

  it('空输入安全', () => {
    expect(collectFormulaRefFields(undefined)).toEqual([])
    expect(collectFormulaRefFields([])).toEqual([])
  })
})
