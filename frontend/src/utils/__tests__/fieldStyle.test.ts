import { describe, it, expect } from 'vitest'
import { resolveFieldStyle, normalizeColumnStyle } from '../fieldStyle'

describe('resolveFieldStyle — 统一字段样式解析', () => {
  // 合并优先级：字段级 > 基础级
  it('字段级样式覆盖基础级', () => {
    const result = resolveFieldStyle(
      { color: 'black', fontSize: '12px' },
      { color: 'red' },
      { status: '正常' },
    )
    expect(result.style.color).toBe('red')
    expect(result.style.fontSize).toBe('12px') // 基础级保留
  })

  // 条件命中覆盖字段级
  it('条件命中覆盖字段级样式', () => {
    const result = resolveFieldStyle(
      {},
      {
        color: 'black',
        dynamic: [
          { when: "$row.status === '异常'", style: { color: 'red' } },
        ],
      },
      { status: '异常' },
    )
    expect(result.style.color).toBe('red')
  })

  // 多条规则首个命中 break
  it('多条规则仅首个命中生效', () => {
    const result = resolveFieldStyle(
      {},
      {
        dynamic: [
          { when: "true", style: { color: 'red' } },
          { when: "true", style: { color: 'blue' } },
        ],
      },
      {},
    )
    expect(result.style.color).toBe('red')
  })

  // 无命中保持基础样式
  it('无条件命中保持基础样式', () => {
    const result = resolveFieldStyle(
      { color: 'gray' },
      {
        color: 'black',
        dynamic: [
          { when: "false", style: { color: 'red' } },
        ],
      },
      { status: '正常' },
    )
    expect(result.style.color).toBe('black') // 字段级生效，条件未命中
  })

  // 条件 when 返回 CSS 字符串（旧 styleExpr 迁移场景）
  it('条件 when 返回 CSS 字符串时按 CSS 解析应用', () => {
    const result = resolveFieldStyle(
      {},
      {
        dynamic: [
          { when: "$row.status === '异常' ? 'color:red; font-size:14px' : ''" },
        ],
      },
      { status: '异常' },
    )
    expect(result.style.color).toBe('red')
    expect(result.style.fontSize).toBe('14px')
  })

  // 条件 className 附加
  it('条件命中时附加 className', () => {
    const result = resolveFieldStyle(
      {},
      {
        dynamic: [
          { when: "true", className: 'highlight' },
        ],
      },
      {},
    )
    expect(result.className).toContain('highlight')
  })

  // row.data 嵌套结构取值正常
  it('支持 row.data 嵌套结构', () => {
    const result = resolveFieldStyle(
      {},
      {
        dynamic: [
          { when: "$row.status === '异常'", style: { color: 'red' } },
        ],
      },
      { data: { status: '异常' } },
    )
    expect(result.style.color).toBe('red')
  })
})

describe('normalizeColumnStyle — 旧字段收敛', () => {
  // fontColor → color
  it('fontColor 迁移为 style.color', () => {
    const result = normalizeColumnStyle({ fontColor: '#f00' })
    expect(result.style?.color).toBe('#f00')
  })

  // className → style.className
  it('className 迁移为 style.className', () => {
    const result = normalizeColumnStyle({ className: 'col-highlight' })
    expect(result.style?.className).toBe('col-highlight')
  })

  // fontFamily/fontSize/fontWeight 收敛
  it('字体属性收敛到 style', () => {
    const result = normalizeColumnStyle({
      fontFamily: 'monospace',
      fontSize: 14,
      fontWeight: 600,
    })
    expect(result.style?.fontFamily).toBe('monospace')
    expect(result.style?.fontSize).toBe(14)
    expect(result.style?.fontWeight).toBe(600)
  })

  // 旧 style（CSS 字符串）→ style.css
  it('旧 style CSS 字符串迁移为 style.css', () => {
    const result = normalizeColumnStyle({ style: 'color:red; font-size:12px' })
    expect(result.style?.css).toBe('color:red; font-size:12px')
  })

  // styleExpr → style.dynamic
  it('styleExpr 迁移为 style.dynamic', () => {
    const result = normalizeColumnStyle({
      styleExpr: "$row.status === '异常' ? 'color:red' : ''",
    })
    expect(result.style?.dynamic).toHaveLength(1)
    expect(result.style?.dynamic?.[0].when).toBe("$row.status === '异常' ? 'color:red' : ''")
  })

  // 幂等：重复调用结果一致
  it('幂等：重复调用结果一致', () => {
    const col = { fontColor: '#f00', className: 'highlight' }
    const r1 = normalizeColumnStyle(col)
    const r2 = normalizeColumnStyle(col)
    expect(r1).toEqual(r2)
  })

  // 已有结构化 style.color 不被 fontColor 覆盖
  it('已有 style.color 不被 fontColor 覆盖', () => {
    const result = normalizeColumnStyle({
      style: { color: '#0f0' },
      fontColor: '#f00',
    })
    expect(result.style?.color).toBe('#0f0') // 已有值优先
  })
})
