/**
 * ListCards 样式工具。
 *
 * 提供主题与样式合并、CSS 变量注入、区域布局解析等工具函数。
 */

import type { CardStyle } from './ListCards.types'

/**
 * 合并主题与用户样式（用户样式优先）。
 *
 * 深度合并 fields/regions 子对象，其余属性浅合并。
 */
export function mergeCardStyle(
  theme: CardStyle | undefined,
  style: CardStyle | undefined,
): CardStyle {
  if (!theme) return style ?? {}
  if (!style) return theme

  // 浅合并顶层属性（style 优先）
  const merged: CardStyle = { ...theme, ...style }

  // 深度合并 fields
  if (theme.fields || style.fields) {
    merged.fields = { ...theme.fields, ...style.fields }
  }

  // 深度合并 regions
  if (theme.regions || style.regions) {
    merged.regions = {
      ...theme.regions,
      ...style.regions,
      // 子对象也需深度合并
      ...(theme.regions?.header || style.regions?.header
        ? { header: { ...theme.regions?.header, ...style.regions?.header } }
        : {}),
      ...(theme.regions?.actions || style.regions?.actions
        ? { actions: { ...theme.regions?.actions, ...style.regions?.actions } }
        : {}),
      ...(theme.regions?.tags || style.regions?.tags
        ? { tags: { ...theme.regions?.tags, ...style.regions?.tags } }
        : {}),
    }
  }

  return merged
}

/**
 * 将 CardStyle 转为 CSS 变量映射（camelCase 键 → 值）。
 *
 * 数字值自动加 px，字符串值原样保留，undefined 值不生成变量。
 */
export function buildCardCssVars(style: CardStyle): Record<string, string> {
  const vars: Record<string, string> = {}

  const mappings: [string, string | number | undefined, string][] = [
    ['--card-bg', style.backgroundColor, ''],
    ['--card-border-color', style.borderColor, ''],
    ['--card-hover-shadow', style.hoverShadowColor, ''],
    ['--card-radius', style.borderRadius, 'px'],
    ['--card-padding', style.padding, 'px'],
    ['--card-gap', style.gap, 'px'],
    ['--card-title-font-size', style.titleFontSize, 'px'],
    ['--card-title-font-weight', style.titleFontWeight, ''],
    ['--card-title-color', style.titleColor, ''],
    ['--card-field-font-size', style.fieldFontSize, 'px'],
    ['--card-field-label-color', style.fieldLabelColor, ''],
    ['--card-field-value-color', style.fieldValueColor, ''],
  ]

  for (const [varName, value, unit] of mappings) {
    if (value != null) {
      vars[varName] = typeof value === 'number' ? `${value}${unit}` : String(value)
    }
  }

  return vars
}

/**
 * 解析字段区域样式为 CSS 变量映射。
 */
export function buildFieldsCssVars(fields: CardStyle['fields']): Record<string, string> {
  if (!fields) return {}
  const vars: Record<string, string> = {}

  if (fields.layout) vars['--fields-layout'] = fields.layout
  if (fields.columns != null) vars['--fields-columns'] = String(fields.columns)
  if (fields.gap != null) vars['--fields-gap'] = typeof fields.gap === 'number' ? `${fields.gap}px` : String(fields.gap)
  if (fields.labelPosition) vars['--fields-label-position'] = fields.labelPosition
  if (fields.labelWidth != null) vars['--fields-label-width'] = typeof fields.labelWidth === 'number' ? `${fields.labelWidth}px` : String(fields.labelWidth)
  if (fields.showLabel != null) vars['--fields-show-label'] = fields.showLabel ? '1' : '0'

  return vars
}

/**
 * 将主题（CardStyle）转为可编辑的 CSS 声明文本。
 *
 * 生成人类可读、可直接编辑的卡片样式脚本（如 "background-color: #1d1e1f;
 * border-radius: 8px;"），作为配置面板"预制样式"选中后的预设脚本内容。
 * 数字尺寸自动加 px，字符串尺寸原样保留，undefined/null 值跳过。
 */
export function themeToCssScript(style: CardStyle): string {
  const decls: string[] = []
  const push = (prop: string, value: string | number | undefined, unit = '') => {
    if (value != null) {
      decls.push(`${prop}: ${typeof value === 'number' ? `${value}${unit}` : value};`)
    }
  }

  push('background-color', style.backgroundColor)
  push('border-color', style.borderColor)
  push('border-radius', style.borderRadius, 'px')
  push('padding', style.padding, 'px')
  push('gap', style.gap, 'px')
  push('font-size', style.titleFontSize, 'px')
  push('font-weight', style.titleFontWeight)
  push('color', style.titleColor)
  push('--card-field-font-size', style.fieldFontSize, 'px')
  push('--card-field-label-color', style.fieldLabelColor)
  push('--card-field-value-color', style.fieldValueColor)

  return decls.join('\n')
}
