import { describe, it, expect } from 'vitest'
import { CARD_THEMES } from '../ListCards.themes'
import { mergeCardStyle, buildCardCssVars } from '../ListCards.styles'
import type { CardStyle, CardTheme } from '../ListCards.types'

describe('CARD_THEMES — 内置主题', () => {
  const themeNames: CardTheme[] = ['default', 'compact', 'loose', 'dark', 'borderless']

  it.each(themeNames)('主题 "%s" 存在且字段完整', (name) => {
    const theme = CARD_THEMES[name]
    expect(theme).toBeDefined()
    // 必须有背景/圆角/间距/字体相关字段
    expect(theme.backgroundColor).toBeDefined()
    expect(theme.borderRadius).toBeDefined()
    expect(theme.gap).toBeDefined()
    expect(theme.titleFontSize).toBeDefined()
    expect(theme.fieldFontSize).toBeDefined()
  })

  it('compact 主题间距比 default 小', () => {
    const defaultGap = Number(CARD_THEMES.default.gap)
    const compactGap = Number(CARD_THEMES.compact.gap)
    expect(compactGap).toBeLessThan(defaultGap)
  })

  it('dark 主题背景色为深色', () => {
    const bg = CARD_THEMES.dark.backgroundColor
    expect(bg).toMatch(/^#[0-9a-f]{6}$/i)
    // 深色背景：RGB 值较低
    const r = parseInt(bg.slice(1, 3), 16)
    expect(r).toBeLessThan(100)
  })
})

describe('mergeCardStyle — 主题与样式合并', () => {
  it('style 覆盖主题属性', () => {
    const theme: CardStyle = { backgroundColor: '#fff', gap: 16 }
    const style: CardStyle = { backgroundColor: '#000' }
    const merged = mergeCardStyle(theme, style)
    expect(merged.backgroundColor).toBe('#000')
    expect(merged.gap).toBe(16) // 主题保留
  })

  it('无 style 时返回主题', () => {
    const theme: CardStyle = { backgroundColor: '#fff', gap: 16 }
    const merged = mergeCardStyle(theme, undefined)
    expect(merged.backgroundColor).toBe('#fff')
    expect(merged.gap).toBe(16)
  })

  it('无主题时返回 style', () => {
    const style: CardStyle = { backgroundColor: '#000' }
    const merged = mergeCardStyle(undefined, style)
    expect(merged.backgroundColor).toBe('#000')
  })

  it('fields 子对象深度合并', () => {
    const theme: CardStyle = {
      fields: { layout: 'grid', columns: 2, gap: 8 },
    }
    const style: CardStyle = {
      fields: { columns: 3 },
    }
    const merged = mergeCardStyle(theme, style)
    expect(merged.fields?.layout).toBe('grid') // 主题保留
    expect(merged.fields?.columns).toBe(3) // style 覆盖
    expect(merged.fields?.gap).toBe(8) // 主题保留
  })
})

describe('buildCardCssVars — CSS 变量注入', () => {
  it('生成 CSS 变量映射', () => {
    const cssVars = buildCardCssVars({
      backgroundColor: '#fff',
      borderRadius: 8,
      gap: 16,
      titleFontSize: 16,
    })
    expect(cssVars['--card-bg']).toBe('#fff')
    expect(cssVars['--card-radius']).toBe('8px')
    expect(cssVars['--card-gap']).toBe('16px')
    expect(cssVars['--card-title-font-size']).toBe('16px')
  })

  it('数字值自动加 px', () => {
    const cssVars = buildCardCssVars({ padding: 12 })
    expect(cssVars['--card-padding']).toBe('12px')
  })

  it('字符串值原样保留', () => {
    const cssVars = buildCardCssVars({ padding: '1rem' })
    expect(cssVars['--card-padding']).toBe('1rem')
  })

  it('undefined 值不生成变量', () => {
    const cssVars = buildCardCssVars({})
    expect(Object.keys(cssVars)).toHaveLength(0)
  })
})
