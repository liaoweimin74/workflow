/**
 * ListCards 类型定义。
 *
 * 卡片整体样式（CardStyle）、内置主题（CardTheme）、
 * 以及扩展的卡片列配置（ListCardsColumn）。
 */

import type { FieldStyle, ConditionalStyle } from '@/utils/fieldStyle'
import type { VNode } from 'vue'

/** 内置主题名称 */
export type CardTheme = 'default' | 'compact' | 'loose' | 'dark' | 'borderless'

/** 卡片整体样式 */
export interface CardStyle {
  // 颜色
  backgroundColor?: string
  borderColor?: string
  hoverShadowColor?: string

  // 尺寸
  borderRadius?: number | string
  padding?: number | string
  gap?: number | string

  // 字体
  titleFontSize?: number | string
  titleFontWeight?: number | string
  titleColor?: string
  fieldFontSize?: number | string
  fieldLabelColor?: string
  fieldValueColor?: string

  // 字段区域样式
  fields?: {
    layout?: 'grid' | 'list'
    columns?: number
    gap?: number | string
    labelPosition?: 'left' | 'right' | 'top'
    labelWidth?: number | string
    showLabel?: boolean
    /** 卡片级字段默认样式 */
    fieldStyle?: FieldStyle
  }

  // 区域布局
  regions?: {
    header?: {
      show?: boolean
      icon?: string | { name: string; color?: string; size?: number }
      iconPosition?: 'left' | 'right'
      height?: number | string
    }
    actions?: {
      position?: 'top' | 'bottom' | 'right'
      gap?: number | string
      justify?: 'start' | 'center' | 'end'
      buttonStyle?: Record<string, string>
    }
    tags?: {
      gap?: number | string
      size?: 'small' | 'default'
    }
  }

  // CSS 逃生舱（作用于每张卡片的原始 CSS 字符串，如 "border: 2px dashed red"）
  css?: string

  // 条件样式（卡片整体，根据行数据切换外观）
  dynamic?: ConditionalStyle[]
}

/** 扩展的卡片列配置（在 CardColumn 基础上增加样式与布局字段） */
export interface ListCardsColumn {
  /** 列字段 key */
  prop?: string
  /** 列显示标签 */
  label?: string

  // 角色与布局
  /** 卡片渲染角色 */
  role?: 'title' | 'subtitle' | 'tag' | 'metric' | 'field'
  /** 栅格跨度（12 列系统：12=整行，6=半行，4=三分之一） */
  span?: number
  /** 排序权重（小在前） */
  order?: number
  /** 标签位置覆盖 */
  labelPosition?: 'left' | 'right' | 'top'
  /** 是否显示标签 */
  showLabel?: boolean

  // 样式（统一入口）
  /** 字段样式（结构化，卡片与表格共用） */
  style?: FieldStyle

  // 动态内容
  contentType?: 'expression' | 'template'
  contentValue?: string

  // 图标
  icon?: string | { name: string; color?: string; size?: number }
  prefixIcon?: string
  suffixIcon?: string

  // 自定义渲染（覆盖率极低场景）
  render?: (row: any, column: ListCardsColumn) => VNode

  // 兼容旧字段（由 normalizeColumnStyle 迁移）
  fontFamily?: string
  fontSize?: number
  fontWeight?: string | number
  fontColor?: string
  /** @deprecated 旧 CSS 字符串，迁移为 style.css */
  className?: string
  /** @deprecated 旧 CSS 字符串，迁移为 style.css */
  styleExpr?: string
  /** @deprecated 旧 CSS 字符串，迁移为 style.css */
  css?: string

  // 其他保留字段
  hidden?: boolean
  valueType?: 'string' | 'number' | 'date' | 'boolean'
  width?: number | string
  minWidth?: number | string
  align?: 'left' | 'center' | 'right'
  fixed?: 'left' | 'right'
  sortable?: boolean
  formatter?: (row: any, column: any, cellValue: any, index?: number) => any
  showOverflowTooltip?: boolean
  cellClassName?: string
  tagConfig?: { type?: 'default' | 'primary' | 'success' | 'warning' | 'info' | 'danger'; text?: string }
  template?: string
  expression?: string
}
