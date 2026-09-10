import { describe, it, expect } from 'vitest'
import { normalizeColumnStyle } from '@/utils/fieldStyle'

describe('ColumnAdvancedConfig — 统一样式结构', () => {
  it('normalizeColumnStyle 收敛旧字段到 style', () => {
    const result = normalizeColumnStyle({
      fontFamily: 'monospace',
      fontSize: 14,
      fontWeight: 600,
      fontColor: '#f00',
      align: 'center',
    })
    expect(result.style).toBeDefined()
    expect(result.style?.fontFamily).toBe('monospace')
    expect(result.style?.fontSize).toBe(14)
    expect(result.style?.fontWeight).toBe(600)
    expect(result.style?.color).toBe('#f00')
  })

  it('normalizeColumnStyle 保留已有 style.color', () => {
    const result = normalizeColumnStyle({
      style: { color: '#0f0' },
      fontColor: '#f00',
    })
    expect(result.style?.color).toBe('#0f0') // 已有值优先
  })

  it('normalizeColumnStyle 收敛 className', () => {
    const result = normalizeColumnStyle({
      className: 'col-highlight',
    })
    expect(result.style?.className).toBe('col-highlight')
  })

  it('normalizeColumnStyle 收敛 styleExpr', () => {
    const result = normalizeColumnStyle({
      styleExpr: "$row.status === '异常' ? 'color:red' : ''",
    })
    expect(result.style?.dynamic).toHaveLength(1)
    expect(result.style?.dynamic?.[0].when).toBe("$row.status === '异常' ? 'color:red' : ''")
  })
})
