/**
 * 统一字段渲染样式模型。
 *
 * 卡片（ListCards）与表格（PageRenderer/PageDataTable）共用同一套样式解析，
 * 消除两套样式体系（className/styleExpr vs fontFamily/fontColor）的矛盾。
 */

import { evalCellExpression } from './scriptSandbox'

/** 条件样式规则 */
export interface ConditionalStyle {
  /** 条件表达式（沙箱求值，上下文 $row/value） */
  when: string
  /** 命中时应用的样式（CSS 属性 → 值，camelCase 键） */
  style?: Record<string, string>
  /** 命中时附加的类名 */
  className?: string
}

/** 统一样式规则；when 为空表示始终生效。 */
export interface StyleRule {
  enabled: boolean
  when?: string
  css: string
  className?: string
}

/** 字段渲染样式（卡片 + 表格统一） */
export interface FieldStyle {
  /** 始终生效的字段样式规则 */
  base?: StyleRule
  /** 按当前字段值或数据行命中的字段样式规则 */
  rules?: StyleRule[]

  // 结构化视觉（静态）
  color?: string
  backgroundColor?: string
  fontFamily?: string
  fontSize?: number | string
  fontWeight?: number | string
  align?: 'left' | 'center' | 'right'

  // 逃生舱
  className?: string
  css?: string

  // 条件样式
  dynamic?: ConditionalStyle[]
}

/** resolveFieldStyle 返回结果 */
export interface ResolvedStyle {
  /** 最终 CSS 属性映射（camelCase 键 → 字符串值） */
  style: Record<string, string>
  /** 最终类名（空格分隔） */
  className?: string
}

/**
 * 解析统一样式规则。
 * 基础规则先应用，随后按顺序合并所有命中的启用规则。
 */
export function resolveStyleRules(
  base: StyleRule | undefined,
  rules: StyleRule[] | undefined,
  row: Record<string, any>,
  value?: unknown,
): ResolvedStyle {
  const result: Record<string, string> = {}
  const classNames: string[] = []
  const apply = (rule: StyleRule) => {
    if (!rule.enabled) return
    Object.assign(result, parseCssString(rule.css))
    if (rule.className?.trim()) classNames.push(rule.className.trim())
  }

  if (base) apply(base)
  for (const rule of rules || []) {
    if (!rule.enabled || !rule.when?.trim()) continue
    const matched = evalCellExpression(rule.when, { $row: row, row, $value: value, value })
    if (matched) apply(rule)
  }

  return {
    style: result,
    className: classNames.length > 0 ? classNames.join(' ') : undefined,
  }
}

/**
 * 解析 CSS 字符串为 camelCase 键值对。
 * 支持 "color:red; font-size:12px" → { color: 'red', fontSize: '12px' }
 */
export function parseCssString(css: string): Record<string, string> {
  if (!css || typeof css !== 'string') return {}
  const result: Record<string, string> = {}
  for (const entry of css.split(';')) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx <= 0) continue
    const key = trimmed.slice(0, colonIdx).trim()
    const value = trimmed.slice(colonIdx + 1).trim()
    if (!key || !value) continue
    // kebab-case → camelCase
    const camelKey = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    result[camelKey] = value
  }
  return result
}

/**
 * 将 FieldStyle 结构化属性转为 CSS 属性映射（camelCase 键 → 字符串值）。
 */
function fieldStyleToCssMap(fs: FieldStyle): Record<string, string> {
  const map: Record<string, string> = {}
  if (fs.color != null) map.color = String(fs.color)
  if (fs.backgroundColor != null) map.backgroundColor = String(fs.backgroundColor)
  if (fs.fontFamily != null) map.fontFamily = String(fs.fontFamily)
  if (fs.fontSize != null) map.fontSize = typeof fs.fontSize === 'number' ? `${fs.fontSize}px` : String(fs.fontSize)
  if (fs.fontWeight != null) map.fontWeight = String(fs.fontWeight)
  if (fs.align != null) map.textAlign = String(fs.align)
  return map
}

/**
 * 统一字段样式解析。
 *
 * 合并优先级：条件命中（dynamic）> 字段级 columnStyle > 基础级 base > 默认值。
 * 条件求值复用 evalCellExpression（scriptSandbox），首个命中生效（break）。
 *
 * @param base 基础样式（卡片/表格级默认）
 * @param columnStyle 字段级样式（列配置）
 * @param row 行数据（支持 row.data 嵌套结构）
 * @returns 最终样式（style 映射 + className）
 */
export function resolveFieldStyle(
  base: FieldStyle | undefined,
  columnStyle: FieldStyle | undefined,
  row: Record<string, any>,
): ResolvedStyle {
  // 展开嵌套结构：{ id, data: { name } } → { name }
  const dataRow = row?.data && typeof row.data === 'object' ? row.data : row

  // 1. 合并基础级与字段级（字段级优先）
  const merged: FieldStyle = { ...base, ...columnStyle }

  // 2. 提取静态样式
  const staticMap = fieldStyleToCssMap(merged)

  // 3. 解析 css 逃生舱
  if (merged.css) {
    Object.assign(staticMap, parseCssString(merged.css))
  }

  // 4. 条件样式求值（首个命中生效）
  let dynamicClassName: string | undefined
  if (merged.dynamic && merged.dynamic.length > 0) {
    // 动态导入 evalCellExpression（避免循环依赖）
    // 使用 Function 构造器直接求值（与 scriptSandbox 相同的安全模型）
    for (const rule of merged.dynamic) {
      if (!rule.when) continue
      try {
        // 构建沙箱上下文
        const sandbox = new Proxy({ $row: dataRow, row: dataRow, value: undefined }, {
          has() { return true },
          get(target, key) {
            if (typeof key === 'symbol') return undefined
            if (key in target) return (target as any)[key]
            // 白名单全局
            const globals = ['Math', 'Date', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'parseInt', 'parseFloat', 'isNaN', 'isFinite']
            if (globals.includes(key)) return (globalThis as any)[key]
            return undefined
          },
        })
        const fn = new Function('__sandbox', `with (__sandbox) { return (${rule.when}) }`)
        const result = fn(sandbox)

        // 命中判断：truthy 值
        if (result) {
          // 合并命中样式
          if (rule.style) {
            Object.assign(staticMap, rule.style)
          }
          // 若 rule.style 为空但结果是 CSS 字符串（旧 styleExpr 迁移场景），解析 CSS
          if (!rule.style && typeof result === 'string' && result.includes(':')) {
            Object.assign(staticMap, parseCssString(result))
          }
          // 附加 className
          if (rule.className) {
            dynamicClassName = dynamicClassName
              ? `${dynamicClassName} ${rule.className}`
              : rule.className
          }
          break // 首个命中生效
        }
      } catch {
        // 求值失败静默跳过（与 scriptSandbox 行为一致）
      }
    }
  }

  // 5. 合并 className
  const classNames = [merged.className, dynamicClassName].filter(Boolean).join(' ') || undefined

  return {
    style: staticMap,
    className: classNames,
  }
}

/**
 * 旧字段收敛迁移（幂等）。
 *
 * 将旧分散字段（fontFamily/fontSize/fontWeight/fontColor/className/style(字符串)/styleExpr）
 * 收敛到统一 FieldStyle 结构。已有结构化值不被旧值覆盖。
 *
 * @param column 旧格式列配置
 * @returns 收敛后的 { style?: FieldStyle }
 */
export function normalizeColumnStyle(column: Record<string, any>): { style?: FieldStyle } {
  if (!column) return {}

  // 已有结构化 style（对象形式）→ 作为基础，旧字段仅补充缺失项
  const existingStyle: FieldStyle = (column.style && typeof column.style === 'object')
    ? { ...column.style }
    : {}

  // 旧字段 → style（仅当对应键不存在时才补充）
  if (column.fontFamily != null && existingStyle.fontFamily == null) {
    existingStyle.fontFamily = column.fontFamily
  }
  if (column.fontSize != null && existingStyle.fontSize == null) {
    existingStyle.fontSize = column.fontSize
  }
  if (column.fontWeight != null && existingStyle.fontWeight == null) {
    existingStyle.fontWeight = column.fontWeight
  }
  if (column.fontColor != null && existingStyle.color == null) {
    existingStyle.color = column.fontColor
  }
  if (column.className != null && existingStyle.className == null) {
    existingStyle.className = column.className
  }

  // 旧 style（CSS 字符串）→ style.css
  if (column.style != null && typeof column.style === 'string' && existingStyle.css == null) {
    existingStyle.css = column.style
  }

  // styleExpr → style.dynamic
  if (column.styleExpr != null && existingStyle.dynamic == null) {
    existingStyle.dynamic = [{ when: column.styleExpr }]
  }

  // 若没有任何样式字段，返回空
  const hasFields = Object.keys(existingStyle).some(k => (existingStyle as any)[k] != null)
  return hasFields ? { style: existingStyle } : {}
}
