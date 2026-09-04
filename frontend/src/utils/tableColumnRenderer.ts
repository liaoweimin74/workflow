/**
 * 数据表格列渲染公共模块。
 *
 * 统一 PageRenderer / PageDataTable 的列取值、模板插值、内容渲染、样式承载，
 * 保证两条渲染链路行为一致。以纯数据（config + row）驱动，可测试。
 */
import { formatCellValue } from './formatters'
import { evalCellExpression } from './scriptSandbox'
import { resolveFieldStyle, resolveStyleRules, type FieldStyle } from './fieldStyle'
import { h, type VNode } from 'vue'

/**
 * 统一列取值：兼容 `row.data` 内层结构与扁平结构。
 * 优先取 `row.data?.[key]`（PageRenderer BizDataVO 结构），回退 `row[key]`（PageDataTable 扁平结构）。
 */
export function getCellValue(row: Record<string, any> | null | undefined, key: string): unknown {
  if (row == null) return undefined
  if (row.data != null && typeof row.data === 'object' && key in row.data) {
    return row.data[key]
  }
  return row[key]
}

/**
 * 模板插值：将 ${...} 占位符替换为行数据的字段值（支持多级字段）。
 * 支持两种语法（与表达式统一）：
 *   - ${name}         → 从 row 取 name
 *   - ${$row.name}    → 自动去掉 $row. 前缀，从 row 取 name
 */
export function interpolateTemplate(tpl: string, row: Record<string, any>): string {
  if (typeof tpl !== 'string' || !tpl) return ''
  return tpl.replace(/\$\{([^}]+)\}/g, (_m, path: string) => {
    // 统一语法：${$row.xxx} → 自动去掉 $row. 前缀
    const resolved = path.trim().replace(/^\$row\./, '')
    const val = resolved
      .split('.')
      .reduce((acc: any, k: string) => (acc == null ? undefined : acc[k]), row)
    return val == null ? '' : String(val)
  })
}

export interface CellContentConfig {
  /** 列字段 key（无真实字段时可为空；仅原始值取值时需要） */
  key?: string
  /** 内容类型：expression（JS 表达式）/ template（${字段} 插值） */
  contentType?: 'expression' | 'template'
  /** 内容值（与 contentType 配对） */
  contentValue?: string
  /** @deprecated 兼容旧数据：模板 */
  template?: string
  /** @deprecated 兼容旧数据：表达式 */
  expression?: string
  /** @deprecated 兼容旧数据：格式化器 */
  formatter?: string
}

/** 空值占位符 */
const EMPTY_PLACEHOLDER = '—'

/**
 * 统一内容值（新字段优先，回退旧字段）：
 * contentType/contentValue > expression > template > formatter
 */
function resolveContent(config: CellContentConfig): { type?: string; value?: string } {
  if (config.contentType && config.contentValue) {
    return { type: config.contentType, value: config.contentValue }
  }
  if (config.expression) return { type: 'expression', value: config.expression }
  if (config.template) return { type: 'template', value: config.template }
  if (config.formatter) return { type: 'formatter', value: config.formatter }
  return {}
}

/**
 * 按内容类型产出列内容字符串。
 * 自动处理 row.data 嵌套结构：表达式 $row.xxx 和模板 ${xxx} 直接访问字段，
 * 无需关心数据是扁平还是嵌套在 data 内。
 * - expression：沙箱求值，结果非空即采用（结果仅作文本）
 * - template：模板插值（expression 为空时回退）
 * - formatter：对 `getCellValue(row, key)` 的原始值应用格式化
 * - 否则：原始值字符串；原始值为 null/undefined 显示 '—'
 */
export function renderCellContent(config: CellContentConfig, row: Record<string, any>): string {
  // 展开嵌套结构：{ id, data: { name } } → { name }（供表达式/模板直接访问字段）
  const dataRow = row?.data && typeof row.data === 'object' ? row.data : row
  const { type, value } = resolveContent(config)
  if (type === 'expression' && value) {
    const v = evalCellExpression(value, { $row: dataRow, row: dataRow })
    if (v != null && String(v) !== '') return String(v)
    // expression 求值为空时，回退到 template（如果同时配置了）
    if (config.template) {
      const t = interpolateTemplate(config.template, dataRow)
      if (t) return t
    }
  } else if (type === 'template' && value) {
    const t = interpolateTemplate(value, dataRow)
    if (t) return t
    return EMPTY_PLACEHOLDER
  }
  const raw = getCellValue(row, config.key ?? '')
  if (type === 'formatter' && value) {
    return formatCellValue(raw, value) || EMPTY_PLACEHOLDER
  }
  if (raw == null || raw === '') return EMPTY_PLACEHOLDER
  return String(raw)
}

export interface CellStyleConfig {
  className?: string
  styleExpr?: string
  /** 统一字段样式（结构化，替代 styleExpr） */
  style?: FieldStyle
}

/**
 * 构建列 render 函数：返回可注入 TableColumn.render 的 (row) => VNode。
 * 内部承载内容并把 className / styleExpr / FieldStyle 应用到包裹的 span 上。
 */
export function buildCellRender(
  config: CellContentConfig & CellStyleConfig,
): (row: Record<string, any>) => VNode {
  return (row: Record<string, any>) => {
    const content = renderCellContent(config, row)
    const dataRow = row?.data && typeof row.data === 'object' ? row.data : row

    // 统一样式解析：优先使用 FieldStyle，回退到旧 styleExpr
    let style: Record<string, string> | undefined
    let className = config.className

    if (config.style) {
      // 使用统一 FieldStyle 解析；新规则模型直接按 CELL 的值求值
      const result = config.style.base || config.style.rules
        ? resolveStyleRules(config.style.base, config.style.rules, dataRow, getCellValue(row, config.key ?? ''))
        : resolveFieldStyle(undefined, config.style, row)
      style = Object.keys(result.style).length > 0 ? result.style : undefined
      if (result.className) {
        className = className ? `${className} ${result.className}` : result.className
      }
    } else if (config.styleExpr != null && config.styleExpr !== '') {
      // 兼容旧 styleExpr：求值结果可能是 CSS 字符串或对象
      const result = evalCellExpression(config.styleExpr, { $row: dataRow, row: dataRow, value: getCellValue(row, config.key ?? '') })
      if (result != null && result !== '') {
        if (typeof result === 'string') {
          // CSS 字符串：解析为对象
          const parsed: Record<string, string> = {}
          for (const entry of result.split(';')) {
            const trimmed = entry.trim()
            if (!trimmed) continue
            const colonIdx = trimmed.indexOf(':')
            if (colonIdx <= 0) continue
            const key = trimmed.slice(0, colonIdx).trim()
            const value = trimmed.slice(colonIdx + 1).trim()
            if (key && value) {
              parsed[key.replace(/-([a-z])/g, (_, l) => l.toUpperCase())] = value
            }
          }
          style = Object.keys(parsed).length > 0 ? parsed : undefined
        } else if (typeof result === 'object') {
          // 对象：直接使用
          style = result as Record<string, string>
        }
      }
    }

    return h(
      'span',
      {
        class: className,
        style,
      },
      content,
    )
  }
}
