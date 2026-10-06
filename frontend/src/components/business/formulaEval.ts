/**
 * 计算公式安全求值器（Task 144）。
 *
 * 为 FormulaField 组件提供表达式解析与求值：
 * - 语法：`${field}` 字段引用、数字字面量、+ - * / %、括号、一元 +/-、
 *   函数 MIN/MAX/SUM/AVG/ABS/ROUND/FLOOR/CEIL（ROUND 第二参为小数位）
 * - 语义：空值(null/undefined/''/非数字)→ NaN 并向结果传播；除以 0 → NaN；
 *   求值结果恒为有限数值或 NaN
 * - 安全：纯 tokenizer + 递归下降解析，不使用 eval/new Function，无作用域泄漏
 *
 * 示例：
 *   parseFormula('${price} * ${count}').evaluate({ price: 10, count: 3 }) // 30
 */

/** 解析失败错误（消息面向设计者，属性面板 title 展示） */
export class FormulaParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FormulaParseError'
  }
}

type Token =
  | { type: 'num'; value: string }
  | { type: 'ref'; field: string }
  | { type: 'op'; value: string }
  | { type: 'lparen'; value: '(' }
  | { type: 'rparen'; value: ')' }
  | { type: 'comma'; value: ',' }

type Node =
  | { kind: 'num'; value: number }
  | { kind: 'ref'; field: string }
  | { kind: 'un'; op: '+' | '-'; arg: Node }
  | { kind: 'bin'; op: '+' | '-' | '*' | '/' | '%'; left: Node; right: Node }
  | { kind: 'call'; fn: string; args: Node[] }

export interface Formula {
  /** 表达式引用的字段名（按出现顺序去重） */
  deps: string[]
  /** 依赖字段值 → 数值结果（非有限值统一归 NaN） */
  evaluate(values: Record<string, unknown>): number
}

/** 支持的函数与元数约束（[最小参数个数, 最大参数个数]，-1 = 不限） */
const FUNCTIONS: Record<string, [number, number]> = {
  MIN: [1, -1],
  MAX: [1, -1],
  SUM: [1, -1],
  AVG: [1, -1],
  ABS: [1, 1],
  ROUND: [1, 2],
  FLOOR: [1, 1],
  CEIL: [1, 1],
}

const MATH_OPS = '+-*/%'

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    // 字段引用 ${field}
    if (ch === '$' && src[i + 1] === '{') {
      const end = src.indexOf('}', i + 2)
      if (end === -1) throw new FormulaParseError(`字段引用缺少右花括号（位置 ${i + 1}）`)
      const field = src.slice(i + 2, end).trim()
      if (!field) throw new FormulaParseError(`字段引用为空（位置 ${i + 1}）`)
      tokens.push({ type: 'ref', field })
      i = end + 1
      continue
    }
    // 数字字面量（含小数）
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i
      while (j < src.length && /[0-9.]/.test(src[j])) j++
      const raw = src.slice(i, j)
      if (!/^(\d+(\.\d*)?|\.\d+)$/.test(raw)) throw new FormulaParseError(`非法数字「${raw}」`)
      tokens.push({ type: 'num', value: raw })
      i = j
      continue
    }
    if (MATH_OPS.includes(ch)) {
      tokens.push({ type: 'op', value: ch })
      i++
      continue
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen', value: '(' })
      i++
      continue
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ')' })
      i++
      continue
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ',' })
      i++
      continue
    }
    // 函数名（大小写不敏感）
    if (/[A-Za-z_]/.test(ch)) {
      let j = i
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++
      const name = src.slice(i, j).toUpperCase()
      if (!FUNCTIONS[name]) {
        throw new FormulaParseError(`未知函数「${src.slice(i, j)}」（支持 ${Object.keys(FUNCTIONS).join(' / ')}）`)
      }
      tokens.push({ type: 'op', value: `fn:${name}` })
      i = j
      continue
    }
    throw new FormulaParseError(`无法识别的字符「${ch}」（位置 ${i + 1}）`)
  }
  return tokens
}

function makeParser(tokens: Token[]) {
  let pos = 0
  const peek = (): Token | undefined => tokens[pos]
  const next = (): Token | undefined => tokens[pos++]
  const expect = (pred: (t: Token | undefined) => boolean, message: string): Token => {
    const t = next()
    if (!pred(t)) throw new FormulaParseError(message)
    return t as Token
  }

  /** 加减（最低优先级） */
  function parseExpr(): Node {
    let left = parseTerm()
    while (peek()?.type === 'op' && '+-'.includes((peek() as { value: string }).value)) {
      const op = (next() as { value: string }).value as '+' | '-'
      left = { kind: 'bin', op, left, right: parseTerm() }
    }
    return left
  }

  /** 乘除模 */
  function parseTerm(): Node {
    let left = parseUnary()
    while (peek()?.type === 'op' && '*/%'.includes((peek() as { value: string }).value)) {
      const op = (next() as { value: string }).value as '*' | '/' | '%'
      left = { kind: 'bin', op, left, right: parseUnary() }
    }
    return left
  }

  /** 一元正负 */
  function parseUnary(): Node {
    const t = peek()
    if (t?.type === 'op' && (t.value === '-' || t.value === '+')) {
      next()
      return { kind: 'un', op: t.value as '+' | '-', arg: parseUnary() }
    }
    return parsePrimary()
  }

  /** 数字 / 字段引用 / 函数调用 / 括号 */
  function parsePrimary(): Node {
    const t = next()
    if (!t) throw new FormulaParseError('表达式意外结束')
    if (t.type === 'num') return { kind: 'num', value: Number(t.value) }
    if (t.type === 'ref') return { kind: 'ref', field: t.field }
    if (t.type === 'lparen') {
      const inner = parseExpr()
      expect(u => u?.type === 'rparen', '括号不匹配：缺少右括号')
      return inner
    }
    if (t.type === 'op' && t.value.startsWith('fn:')) {
      const fn = t.value.slice(3)
      expect(u => u?.type === 'lparen', `函数 ${fn} 后需要左括号`)
      const args: Node[] = []
      if (peek()?.type !== 'rparen') {
        args.push(parseExpr())
        while (peek()?.type === 'comma') {
          next()
          args.push(parseExpr())
        }
      }
      expect(u => u?.type === 'rparen', `函数 ${fn} 缺少右括号`)
      const [min, max] = FUNCTIONS[fn]
      if (args.length < min) throw new FormulaParseError(`函数 ${fn} 至少需要 ${min} 个参数`)
      if (max !== -1 && args.length > max) throw new FormulaParseError(`函数 ${fn} 最多接受 ${max} 个参数`)
      return { kind: 'call', fn, args }
    }
    throw new FormulaParseError(`意外的符号「${t.value}」`)
  }

  return { parseExpr, done: () => pos === tokens.length, rest: () => tokens[pos] }
}

function collectDeps(node: Node, out: string[]): void {
  switch (node.kind) {
    case 'ref':
      if (!out.includes(node.field)) out.push(node.field)
      break
    case 'un':
      collectDeps(node.arg, out)
      break
    case 'bin':
      collectDeps(node.left, out)
      collectDeps(node.right, out)
      break
    case 'call':
      node.args.forEach(a => collectDeps(a, out))
      break
    default:
      break
  }
}

/** 字段值 → 数值：空/非数字 → NaN（NaN 沿表达式传播） */
function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (v === null || v === undefined || v === '') return NaN
  if (typeof v === 'string') {
    const s = v.trim()
    if (s === '') return NaN
    return Number(s)
  }
  if (typeof v === 'boolean') return v ? 1 : 0
  return NaN
}

function evalNode(node: Node, values: Record<string, unknown>): number {
  switch (node.kind) {
    case 'num':
      return node.value
    case 'ref':
      return toNumber(values[node.field])
    case 'un': {
      const v = evalNode(node.arg, values)
      return node.op === '-' ? -v : v
    }
    case 'bin': {
      const l = evalNode(node.left, values)
      const r = evalNode(node.right, values)
      switch (node.op) {
        case '+':
          return l + r
        case '-':
          return l - r
        case '*':
          return l * r
        case '/':
          return r === 0 ? NaN : l / r
        case '%':
          return r === 0 ? NaN : l % r
      }
      break
    }
    case 'call': {
      const args = node.args.map(a => evalNode(a, values))
      switch (node.fn) {
        case 'MIN':
          return Math.min(...args)
        case 'MAX':
          return Math.max(...args)
        case 'SUM':
          return args.reduce((s, v) => s + v, 0)
        case 'AVG':
          return args.reduce((s, v) => s + v, 0) / args.length
        case 'ABS':
          return Math.abs(args[0])
        case 'ROUND': {
          const p = args.length > 1 ? Math.trunc(args[1]) : 0
          const f = Math.pow(10, p)
          return Math.round(args[0] * f) / f
        }
        case 'FLOOR':
          return Math.floor(args[0])
        case 'CEIL':
          return Math.ceil(args[0])
      }
      break
    }
  }
  return NaN
}

/** 解析表达式；语法错误抛 FormulaParseError */
export function parseFormula(expr: string): Formula {
  const src = (expr ?? '').trim()
  if (!src) throw new FormulaParseError('表达式为空')
  const tokens = tokenize(src)
  if (tokens.length === 0) throw new FormulaParseError('表达式为空')
  const parser = makeParser(tokens)
  const ast = parser.parseExpr()
  if (!parser.done()) throw new FormulaParseError(`存在多余内容「${parser.rest()!.value}」`)
  const deps: string[] = []
  collectDeps(ast, deps)
  return {
    deps,
    evaluate(values: Record<string, unknown>): number {
      const v = evalNode(ast, values)
      return Number.isFinite(v) ? v : NaN
    },
  }
}

/** 仅提取依赖字段（供属性面板提示等场景，不关心求值） */
export function collectFormulaDeps(expr: string): string[] {
  try {
    return parseFormula(expr).deps
  } catch {
    return []
  }
}
