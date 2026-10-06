/**
 * 计算表达式可视化编辑器纯逻辑层（Task 145）。
 *
 * 从 FormulaExpressionEditor.vue 抽出可单测的纯函数与常量：
 * - FORMULA_FUNCTIONS / FORMULA_OPERATORS：面板按钮元数据（与 formulaEval 函数集一致）
 * - insertAtCursor：光标处插入文本（支持替换选区、闭合括号回退光标）
 * - parseDraft：表达式实时校验 + 依赖收集（复用 formulaEval）
 * - formatPreview：试算结果展示格式
 */

import { parseFormula, FormulaParseError } from './formulaEval'

export interface FormulaFnMeta {
  name: string
  /** 参数签名说明 */
  args: string
  desc: string
}

/** 函数面板（顺序即展示顺序；name 必须都在 formulaEval.FUNCTIONS 白名单内） */
export const FORMULA_FUNCTIONS: FormulaFnMeta[] = [
  { name: 'SUM', args: 'a, b, …', desc: '求和' },
  { name: 'AVG', args: 'a, b, …', desc: '平均值' },
  { name: 'MIN', args: 'a, b, …', desc: '最小值' },
  { name: 'MAX', args: 'a, b, …', desc: '最大值' },
  { name: 'ABS', args: 'a', desc: '绝对值' },
  { name: 'ROUND', args: 'a, 小数位', desc: '四舍五入' },
  { name: 'FLOOR', args: 'a', desc: '向下取整' },
  { name: 'CEIL', args: 'a', desc: '向上取整' },
]

/** 运算符 / 括号面板 */
export const FORMULA_OPERATORS: string[] = ['+', '-', '*', '/', '%', '(', ')']

/** 数字 / 小数点面板 */
export const FORMULA_DIGITS: string[] = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.']

/**
 * 在 [start, end) 选区处插入 insert（无选区时即光标处插入）。
 * cursorBack：插入完成后光标相对插入串末尾回退的字符数（如插入 "MIN()" 后
 * 光标应落在两个括号之间 → cursorBack = 1）。
 */
export function insertAtCursor(
  src: string,
  start: number,
  end: number,
  insert: string,
  cursorBack = 0,
): { text: string; cursor: number } {
  const len = src.length
  const s = Math.max(0, Math.min(Number.isFinite(start) ? start : len, len))
  const e = Math.max(s, Math.min(Number.isFinite(end) ? end : s, len))
  const text = src.slice(0, s) + insert + src.slice(e)
  return { text, cursor: s + insert.length - Math.max(0, cursorBack) }
}

/** 表达式草稿实时校验：返回依赖字段与错误消息（空表达式不算错误） */
export function parseDraft(expr: string): { deps: string[]; error: string } {
  const src = (expr ?? '').trim()
  if (!src) return { deps: [], error: '' }
  try {
    return { deps: parseFormula(src).deps, error: '' }
  } catch (e) {
    return { deps: [], error: e instanceof FormulaParseError ? e.message : String(e) }
  }
}

/** 试算结果展示：非有限值 → '—'；整数原样；小数最多 6 位并去尾零 */
export function formatPreview(v: number): string {
  if (!Number.isFinite(v)) return '—'
  if (Number.isInteger(v)) return String(v)
  return v.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}
