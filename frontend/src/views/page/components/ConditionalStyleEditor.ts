/**
 * 条件样式规则编辑器工具。
 *
 * 提供条件表达式生成与解析，支持字段+运算符+值的结构化编辑。
 */

/** 条件规则结构 */
export interface ConditionRule {
  field: string
  operator: '===' | '!==' | '>' | '>=' | '<' | '<=' | 'includes' | 'startsWith' | 'endsWith'
  value: string
}

/** 命中效果 */
export interface HitEffect {
  style?: Record<string, string>
  className?: string
}

/** 完整条件样式规则 */
export interface ConditionalStyleRule {
  condition: ConditionRule
  effect: HitEffect
}

/**
 * 生成条件表达式。
 *
 * @param rule 条件规则
 * @returns 表达式字符串，如 `$row.status === '异常'`
 */
export function generateWhenExpression(rule: ConditionRule): string {
  const { field, operator, value } = rule

  // 数值运算符：值尝试转为数字
  if (['>', '>=', '<', '<='].includes(operator)) {
    const numValue = Number(value)
    if (!isNaN(numValue)) {
      return `$row.${field} ${operator} ${numValue}`
    }
  }

  // 包含/前缀/后缀
  if (operator === 'includes') {
    return `$row.${field}.includes('${value}')`
  }
  if (operator === 'startsWith') {
    return `$row.${field}.startsWith('${value}')`
  }
  if (operator === 'endsWith') {
    return `$row.${field}.endsWith('${value}')`
  }

  // 等值/不等：字符串加引号
  return `$row.${field} ${operator} '${value}'`
}

/**
 * 解析条件表达式。
 *
 * @param expr 表达式字符串
 * @returns 条件规则，无法解析时返回 null
 */
export function parseWhenExpression(expr: string): ConditionRule | null {
  if (!expr || typeof expr !== 'string') return null

  const trimmed = expr.trim()

  // 匹配 $row.field op 'value' 或 $row.field op number
  const eqMatch = trimmed.match(/^\$row\.(\w+)\s*(===|!==|==|!=)\s*['"](.*)['"]$/)
  if (eqMatch) {
    return { field: eqMatch[1], operator: eqMatch[2] as '===' | '!==', value: eqMatch[3] }
  }

  const numMatch = trimmed.match(/^\$row\.(\w+)\s*(>|>=|<|<=)\s*(\d+\.?\d*)$/)
  if (numMatch) {
    return { field: numMatch[1], operator: numMatch[2] as '>' | '>=' | '<' | '<=', value: numMatch[3] }
  }

  const includesMatch = trimmed.match(/^\$row\.(\w+)\.includes\(['"](.*)['"]\)$/)
  if (includesMatch) {
    return { field: includesMatch[1], operator: 'includes', value: includesMatch[2] }
  }

  const startsWithMatch = trimmed.match(/^\$row\.(\w+)\.startsWith\(['"](.*)['"]\)$/)
  if (startsWithMatch) {
    return { field: startsWithMatch[1], operator: 'startsWith', value: startsWithMatch[2] }
  }

  const endsWithMatch = trimmed.match(/^\$row\.(\w+)\.endsWith\(['"](.*)['"]\)$/)
  if (endsWithMatch) {
    return { field: endsWithMatch[1], operator: 'endsWith', value: endsWithMatch[2] }
  }

  return null
}
