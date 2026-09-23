import { EngineException } from '../../common/exception/engine-exception'

/**
 * 流程条件表达式求值。
 *
 * 支持 BPMN 连线上的常见写法：`${amount > 100}`、`${type == 'A' && level >= 2}`。
 *
 * 安全设计：**不使用 eval / new Function / node:vm**。
 * 表达式来自流程设计器，属于不可信输入，手写递归下降解析器可以精确控制
 * 能做什么（比较、逻辑、取值），不能做什么（调用、赋值、访问原型）。
 *
 * 支持：
 *   - 字面量：数字、单/双引号字符串、true / false / null
 *   - 变量：按名字取值（缺失 → undefined，参与比较时为 null 语义）
 *   - 比较：== != === !== > >= < <=
 *   - 逻辑：&& || !
 *   - 括号
 *   - 成员访问：a.b（只读，不调用）
 */

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'ident'; value: string }
  | { kind: 'punct'; value: string }
  | { kind: 'eof' }

const PUNCTUATORS = [
  '===',
  '!==',
  '==',
  '!=',
  '>=',
  '<=',
  '&&',
  '||',
  '>',
  '<',
  '!',
  '(',
  ')',
  '.',
]

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }

    if (ch === "'" || ch === '"') {
      const quote = ch
      let out = ''
      i++
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\' && i + 1 < input.length) {
          out += input[i + 1]
          i += 2
          continue
        }
        out += input[i]
        i++
      }
      if (i >= input.length) throw new EngineException(`条件表达式字符串未闭合: ${input}`)
      i++ // 跳掉收尾引号
      tokens.push({ kind: 'string', value: out })
      continue
    }

    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(input[i + 1] ?? ''))) {
      let out = ch
      i++
      while (i < input.length && /[0-9.]/.test(input[i])) {
        out += input[i]
        i++
      }
      tokens.push({ kind: 'number', value: Number(out) })
      continue
    }

    if (/[A-Za-z_$]/.test(ch)) {
      let out = ch
      i++
      while (i < input.length && /[A-Za-z0-9_$]/.test(input[i])) {
        out += input[i]
        i++
      }
      tokens.push({ kind: 'ident', value: out })
      continue
    }

    const punct = PUNCTUATORS.find((p) => input.startsWith(p, i))
    if (punct !== undefined) {
      tokens.push({ kind: 'punct', value: punct })
      i += punct.length
      continue
    }

    throw new EngineException(`条件表达式中存在无法识别的字符 "${ch}": ${input}`)
  }
  tokens.push({ kind: 'eof' })
  return tokens
}

/** 去除 `${...}` 外壳；没有外壳则原样返回。 */
export function unwrapExpression(expression: string): string {
  const trimmed = expression.trim()
  const m = /^\$\{([\s\S]*)\}$/.exec(trimmed)
  return m !== null ? m[1].trim() : trimmed
}

class Parser {
  private pos = 0

  constructor(
    private readonly tokens: Token[],
    private readonly vars: Record<string, unknown>,
    private readonly source: string,
  ) {}

  private peek(): Token {
    return this.tokens[this.pos]
  }

  private eatPunct(value: string): boolean {
    const token = this.peek()
    if (token.kind === 'punct' && token.value === value) {
      this.pos++
      return true
    }
    return false
  }

  private expectPunct(value: string): void {
    if (!this.eatPunct(value)) {
      throw new EngineException(`条件表达式缺少 "${value}": ${this.source}`)
    }
  }

  /** 入口：解析完整表达式并求值。 */
  parse(): unknown {
    const value = this.parseOr()
    if (this.peek().kind !== 'eof') {
      throw new EngineException(`条件表达式存在多余内容: ${this.source}`)
    }
    return value
  }

  private parseOr(): unknown {
    let left = this.parseAnd()
    while (this.eatPunct('||')) {
      const right = this.parseAnd()
      left = truthy(left) || truthy(right)
    }
    return left
  }

  private parseAnd(): unknown {
    let left = this.parseEquality()
    while (this.eatPunct('&&')) {
      const right = this.parseEquality()
      left = truthy(left) && truthy(right)
    }
    return left
  }

  private parseEquality(): unknown {
    let left = this.parseComparison()
    for (;;) {
      if (this.eatPunct('===')) left = strictEquals(left, this.parseComparison())
      else if (this.eatPunct('!==')) left = !strictEquals(left, this.parseComparison())
      else if (this.eatPunct('==')) left = looseEquals(left, this.parseComparison())
      else if (this.eatPunct('!=')) left = !looseEquals(left, this.parseComparison())
      else return left
    }
  }

  private parseComparison(): unknown {
    let left = this.parseUnary()
    for (;;) {
      if (this.eatPunct('>=')) left = compare(left, this.parseUnary()) >= 0
      else if (this.eatPunct('<=')) left = compare(left, this.parseUnary()) <= 0
      else if (this.eatPunct('>')) left = compare(left, this.parseUnary()) > 0
      else if (this.eatPunct('<')) left = compare(left, this.parseUnary()) < 0
      else return left
    }
  }

  private parseUnary(): unknown {
    if (this.eatPunct('!')) return !truthy(this.parseUnary())
    return this.parsePostfix()
  }

  private parsePostfix(): unknown {
    let value = this.parsePrimary()
    while (this.eatPunct('.')) {
      const token = this.peek()
      if (token.kind !== 'ident') {
        throw new EngineException(`条件表达式的成员访问缺少属性名: ${this.source}`)
      }
      this.pos++
      // 只读属性访问；不做原型链穿透之外的事情
      if (value === null || value === undefined) {
        value = undefined
      } else if (typeof value === 'object') {
        value = (value as Record<string, unknown>)[token.value]
      } else {
        value = undefined
      }
    }
    return value
  }

  private parsePrimary(): unknown {
    const token = this.peek()

    if (token.kind === 'number' || token.kind === 'string') {
      this.pos++
      return token.value
    }

    if (token.kind === 'ident') {
      this.pos++
      switch (token.value) {
        case 'true':
          return true
        case 'false':
          return false
        case 'null':
          return null
        case 'undefined':
          return undefined
        default:
          // 未定义变量返回 undefined，交由比较逻辑按 null 语义处理
          return this.vars[token.value]
      }
    }

    if (this.eatPunct('(')) {
      const value = this.parseOr()
      this.expectPunct(')')
      return value
    }

    throw new EngineException(`条件表达式无法解析: ${this.source}`)
  }
}

/** JS 真值语义，但把 undefined 视为 false（Java 侧变量不存在时也不会是 true）。 */
function truthy(value: unknown): boolean {
  return Boolean(value)
}

function strictEquals(a: unknown, b: unknown): boolean {
  return a === b
}

/** `==` 做宽松比较：数字与数字字符串相等（对齐 Java 里变量值来自 JSON 的场景）。 */
function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || a === undefined) return b === null || b === undefined
  if (b === null || b === undefined) return false
  if (typeof a === 'number' && typeof b === 'string') return a === Number(b)
  if (typeof a === 'string' && typeof b === 'number') return Number(a) === b
  return false
}

function compare(a: unknown, b: unknown): number {
  const na = toComparable(a)
  const nb = toComparable(b)
  if (na === nb) return 0
  return na < nb ? -1 : 1
}

function toComparable(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string') {
    const n = Number(value)
    return Number.isNaN(n) ? Number.NEGATIVE_INFINITY : n
  }
  if (value === null || value === undefined) return Number.NEGATIVE_INFINITY
  return Number.NEGATIVE_INFINITY
}

/**
 * 求值一个条件表达式，返回布尔。
 *
 * 表达式非法时抛 EngineException —— 与 Java 侧 Flowable 的行为一致：
 * 条件写错应当在流转时报错并回滚，而不是静默当成 false 把流程带错分支。
 */
export function evaluateCondition(expression: string, vars: Record<string, unknown>): boolean {
  const body = unwrapExpression(expression)
  // 空表达式视为「无条件命中」，用于默认分支之外的宽松写法
  if (body === '') return true
  const tokens = tokenize(body)
  return truthy(new Parser(tokens, vars, body).parse())
}
