/**
 * ListCards 内置主题。
 *
 * 5 个预设主题：default / compact / loose / dark / borderless。
 * 用户可通过 import CARD_THEMES 扩展自定义主题。
 */

import type { CardStyle, CardTheme } from './ListCards.types'

export const CARD_THEMES: Record<CardTheme, CardStyle> = {
  default: {
    backgroundColor: '#ffffff',
    borderColor: '#e4e7ed',
    hoverShadowColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 8,
    padding: 16,
    gap: 16,
    titleFontSize: 16,
    titleFontWeight: 600,
    titleColor: '#303133',
    fieldFontSize: 14,
    fieldLabelColor: '#909399',
    fieldValueColor: '#303133',
    fields: {
      layout: 'grid',
      columns: 2,
      gap: 8,
      labelPosition: 'left',
      showLabel: true,
    },
    regions: {
      header: { show: false, iconPosition: 'left' },
      actions: { position: 'bottom', gap: 8, justify: 'start' },
      tags: { gap: 8, size: 'default' },
    },
  },

  compact: {
    backgroundColor: '#ffffff',
    borderColor: '#e4e7ed',
    hoverShadowColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 6,
    padding: 12,
    gap: 12,
    titleFontSize: 14,
    titleFontWeight: 600,
    titleColor: '#303133',
    fieldFontSize: 13,
    fieldLabelColor: '#909399',
    fieldValueColor: '#303133',
    fields: {
      layout: 'grid',
      columns: 2,
      gap: 6,
      labelPosition: 'left',
      showLabel: true,
    },
    regions: {
      header: { show: false, iconPosition: 'left' },
      actions: { position: 'bottom', gap: 6, justify: 'start' },
      tags: { gap: 6, size: 'small' },
    },
  },

  loose: {
    backgroundColor: '#ffffff',
    borderColor: '#e4e7ed',
    hoverShadowColor: 'rgba(0, 0, 0, 0.12)',
    borderRadius: 12,
    padding: 24,
    gap: 24,
    titleFontSize: 18,
    titleFontWeight: 600,
    titleColor: '#303133',
    fieldFontSize: 15,
    fieldLabelColor: '#606266',
    fieldValueColor: '#303133',
    fields: {
      layout: 'grid',
      columns: 1,
      gap: 12,
      labelPosition: 'top',
      showLabel: true,
    },
    regions: {
      header: { show: false, iconPosition: 'left' },
      actions: { position: 'bottom', gap: 12, justify: 'start' },
      tags: { gap: 12, size: 'default' },
    },
  },

  dark: {
    backgroundColor: '#1d1e1f',
    borderColor: '#414243',
    hoverShadowColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    padding: 16,
    gap: 16,
    titleFontSize: 16,
    titleFontWeight: 600,
    titleColor: '#e5eaf3',
    fieldFontSize: 14,
    fieldLabelColor: '#a3a6ad',
    fieldValueColor: '#e5eaf3',
    fields: {
      layout: 'grid',
      columns: 2,
      gap: 8,
      labelPosition: 'left',
      showLabel: true,
    },
    regions: {
      header: { show: false, iconPosition: 'left' },
      actions: { position: 'bottom', gap: 8, justify: 'start' },
      tags: { gap: 8, size: 'default' },
    },
  },

  borderless: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    hoverShadowColor: 'rgba(0, 0, 0, 0.04)',
    borderRadius: 0,
    padding: 12,
    gap: 12,
    titleFontSize: 16,
    titleFontWeight: 600,
    titleColor: '#303133',
    fieldFontSize: 14,
    fieldLabelColor: '#909399',
    fieldValueColor: '#303133',
    fields: {
      layout: 'grid',
      columns: 2,
      gap: 8,
      labelPosition: 'left',
      showLabel: true,
    },
    regions: {
      header: { show: false, iconPosition: 'left' },
      actions: { position: 'bottom', gap: 8, justify: 'start' },
      tags: { gap: 8, size: 'default' },
    },
  },

  techBlue: {
    backgroundColor: '#0f2747',
    borderColor: '#1677ff',
    hoverShadowColor: 'rgba(22, 119, 255, 0.45)',
    borderRadius: 8,
    padding: 16,
    gap: 16,
    titleFontSize: 16,
    titleFontWeight: 600,
    titleColor: '#e6f4ff',
    fieldFontSize: 14,
    fieldLabelColor: '#91caff',
    fieldValueColor: '#ffffff',
    fields: {
      layout: 'grid',
      columns: 2,
      gap: 8,
      labelPosition: 'left',
      showLabel: true,
    },
    regions: {
      header: { show: false, iconPosition: 'left' },
      actions: { position: 'bottom', gap: 8, justify: 'start' },
      tags: { gap: 8, size: 'default' },
    },
  },
}
