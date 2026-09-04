/**
 * 统一字段样式模型与解析工具
 *
 * 提供 FieldStyle / ConditionalStyle 类型与 resolveFieldStyle / normalizeColumnStyle 工具，
 * 卡片（ListCards）与表格（PageRenderer / PageDataTable）共用。
 */
import { evalCellExpression } from './scriptSandbox'

/** 条件样式规则 */
export interface ConditionalStyle {
  when: string // 条件表达式，如 $row.status === 'DONE'
  style?: Record<string, string> // 命中时应用的样式（CSS 属性 → 值）
  className?: string // 命中时附加的类名
}

/** 字段渲染样式（卡片 + 表格统一） */
export interface FieldStyle {
  // 结构化视觉（静态）
  color?: string
  backgroundColor?: string
  fontFamily?: string
  fontSize?: number | string
  fontWeight?: number | string
  align?: 'left' | 'center' | 'right'

  // 逃生舱
  className?: string // 静态 CSS 类名
  css?: string // 原生 CSS 字符串（替代旧 style）

  // 条件样式
  dynamic?: ConditionalStyle[]
}

/**
 * 旧列配置的字段（用于迁移）
 */
export interface ColumnLegacyFields {
  prop?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: string | number
  fontColor?: string
  className?: string
  style?: string | FieldStyle // CSS 字符串或已收敛的 style 对象
  styleExpr?: string
  dynamic?: ConditionalStyle[]
}

export interface NormalizedColumnStyle {
  style?: FieldStyle
}

/**
 * 解析 CSS 字符串为样式对象
 * @param css CSS 字符串，如 "color:red; font-size:12px"
 * @returns 样式对象，如 { color: 'red', fontSize: '12px' }
 */
export function parseCssString(css: string): Record<string, string> {
  if (typeof css !== 'string' || !css.trim()) {
    return {}
  }

  const result: Record<string, string> = {}

  // 解析每个声明
  const declarations = css.split(';')
  for (const decl of declarations) {
    const trimmed = decl.trim()
    if (!trimmed) continue

    const colonIndex = trimmed.indexOf(':')
    if (colonIndex === -1) continue

    const prop = trimmed.slice(0, colonIndex).trim()
    const value = trimmed.slice(colonIndex + 1).trim()

    if (!prop || !value) continue

    // 转换为 camelCase 键
    const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    result[camelProp] = value
  }

  return result
}

/**
 * 展开嵌套数据行（处理 row.data 结构）
 */
function expandDataRow(row: Record<string, any> | null | undefined): Record<string, any> {
  if (row?.data && typeof row.data === 'object') {
    return { ...row, ...row.data } as Record<string, any>
  }
  return row ?? {}
}

/**
 * 解析条件样式数组，返回匹配的样式
 */
function resolveConditional(
  baseStyle: Record<string, string>,
  dynamic: ConditionalStyle[] | undefined,
  row: Record<string, any>,
  value: unknown,
): { style: Record<string, string>; className?: string } {
  const result: Record<string, string> = { ...baseStyle }
  let matchedClassName: string | undefined

  if (!dynamic || dynamic.length === 0) {
    return { style: result, className: matchedClassName }
  }

  for (const rule of dynamic) {
    const { when, style, className } = rule

    // 求值条件表达式
    const conditionResult = evalCellExpression(when, {
      $row: row,
      row: row,
      value,
    })

    // 判定：truthy 即为命中；旧 styleExpr 可能直接返回 CSS 字符串
    const isHit = Boolean(conditionResult)

    if (!isHit) {
      continue
    }

    // 命中：合并样式。旧 styleExpr 的返回值本身就是 CSS 字符串。
    if (typeof conditionResult === 'string') {
      Object.assign(result, parseCssString(conditionResult))
    }
    if (style) {
      // 检查是否是 CSS 字符串结果（旧 styleExpr 场景：expression 返回 CSS 字符串）
      if (typeof style === 'string') {
        Object.assign(result, parseCssString(style))
      } else {
        Object.assign(result, style)
      }
    }

    // 记录 className（后续规则可能覆盖）
    if (className) {
      matchedClassName = className
    }

    // 首个命中 break
    break
  }

  return { style: result, className: matchedClassName }
}

/**
 * 解析字段样式
 * 合并 base 与 columnStyle，再叠加条件命中
 *
 * 合并优先级：条件命中（dynamic）> 字段级 columnStyle > 卡片/表格级 base > 默认值
 *
 * @returns { style: Record<string, string>, className?: string }
 */
export function resolveFieldStyle(
  base: FieldStyle | undefined,
  columnStyle: FieldStyle | undefined,
  row: Record<string, any>,
): { style: Record<string, string>; className?: string } {
  // 展开嵌套数据行
  const expandedRow = expandDataRow(row)
  const value = expandedRow.value // 单元格值（如果有）

  // 合并静态样式：先收集 base 再收集 columnStyle（字段级覆盖）
  const baseStyle: Record<string, string> = {}
  const columnStyleObj: Record<string, string> = {}

  // 收集 base 样式
  if (base) {
    if (base.color) baseStyle.color = base.color
    if (base.backgroundColor) baseStyle.backgroundColor = base.backgroundColor
    if (base.fontFamily) baseStyle.fontFamily = base.fontFamily
    if (base.fontSize != null) baseStyle.fontSize = String(base.fontSize)
    if (base.fontWeight != null) baseStyle.fontWeight = String(base.fontWeight)
    if (base.align) baseStyle.textAlign = base.align
    // css 字符串解析合并
    if (base.css) {
      Object.assign(baseStyle, parseCssString(base.css))
    }
  }

  // 收集 columnStyle 样式（覆盖 base）
  if (columnStyle) {
    if (columnStyle.color) columnStyleObj.color = columnStyle.color
    if (columnStyle.backgroundColor) columnStyleObj.backgroundColor = columnStyle.backgroundColor
    if (columnStyle.fontFamily) columnStyleObj.fontFamily = columnStyle.fontFamily
    if (columnStyle.fontSize != null) columnStyleObj.fontSize = String(columnStyle.fontSize)
    if (columnStyle.fontWeight != null) columnStyleObj.fontWeight = String(columnStyle.fontWeight)
    if (columnStyle.align) columnStyleObj.textAlign = columnStyle.align
    // css 字符串解析合并
    if (columnStyle.css) {
      Object.assign(columnStyleObj, parseCssString(columnStyle.css))
    }
  }

  // 合并：先 base 后 columnStyle（字段级覆盖）
  const mergedStyle: Record<string, string> = { ...baseStyle, ...columnStyleObj }

  // 合并 dynamic：base 的在前，columnStyle 的在后（字段级优先）
  const baseDynamic = base?.dynamic
  const colDynamic = columnStyle?.dynamic

  const allDynamic: ConditionalStyle[] = []
  if (baseDynamic) allDynamic.push(...baseDynamic)
  if (colDynamic) allDynamic.push(...colDynamic)

  // 解析条件样式
  const resolved = resolveConditional(mergedStyle, allDynamic, expandedRow, value)

  // className：条件优先于字段级
  const className = resolved.className ?? columnStyle?.className ?? base?.className

  return {
    style: resolved.style,
    className,
  }
}

/**
 * 正规化列配置：收敛旧分散字段到统一的 style 结构
 *
 * 迁移映射：
 * - fontFamily → style.fontFamily
 * - fontSize → style.fontSize
 * - fontWeight → style.fontWeight
 * - fontColor → style.color
 * - className → style.className
 * - 旧 style（CSS 字符串）→ style.css
 * - styleExpr → style.dynamic
 *
 * 幂等：重复调用结果一致
 * 已有 style 字段的值优先（旧值让位给结构化值）
 */
export function normalizeColumnStyle(
  column: ColumnLegacyFields,
): NormalizedColumnStyle {
  // 初始化 style 对象
  let styleObj: FieldStyle = {}

  // 如果 style 已经是对象，拷贝其中的 dynamic 字段
  if (typeof column.style === 'object' && column.style !== null) {
    styleObj = { ...column.style } as FieldStyle
  }

  // 兼容旧列配置中的顶层 dynamic 字段
  if (column.dynamic && !styleObj.dynamic) {
    styleObj.dynamic = [...column.dynamic]
  }

  // 迁移: fontColor → style.color（仅在未设置时迁移）
  if (column.fontColor && !styleObj.color) {
    styleObj.color = column.fontColor
  }

  // 迁移: fontFamily → style.fontFamily
  if (column.fontFamily && !styleObj.fontFamily) {
    styleObj.fontFamily = column.fontFamily
  }

  // 迁移: fontSize → style.fontSize
  if (column.fontSize != null && !styleObj.fontSize) {
    styleObj.fontSize = column.fontSize
  }

  // 迁移: fontWeight → style.fontWeight
  if (column.fontWeight && !styleObj.fontWeight) {
    styleObj.fontWeight = column.fontWeight
  }

  // 迁移: className → style.className
  if (column.className && !styleObj.className) {
    styleObj.className = column.className
  }

  // 迁移: style（CSS 字符串）→ style.css
  // 只有当 css 尚未设置时才迁移（已有 css 优先）
  if (typeof column.style === 'string' && !styleObj.css) {
    styleObj.css = column.style
  }

  // 迁移: styleExpr → style.dynamic
  if (column.styleExpr) {
    if (!styleObj.dynamic) {
      styleObj.dynamic = []
    }
    styleObj.dynamic.push({
      when: column.styleExpr,
      style: {},
    })
  }

  return { style: styleObj }
}
