import { describe, it, expect } from 'vitest'
import {
  resolveFieldStyle,
  normalizeColumnStyle,
  parseCssString,
  type FieldStyle,
  type NormalizedColumnStyle,
} from '../fieldStyle'

describe('parseCssString — 解析 CSS 字符串到对象', () => {
  it('解析单个属性', () => {
    expect(parseCssString('color:red')).toEqual({ color: 'red' })
  })

  it('解析多个属性用分号分隔并转驼峰键', () => {
    expect(parseCssString('color:red; font-size:12px; font-weight:bold')).toEqual({
      color: 'red',
      fontSize: '12px',
      fontWeight: 'bold',
    })
  })

  it('解析带空格的属性值', () => {
    expect(parseCssString('font-family: "Times New Roman"')).toEqual({
      fontFamily: '"Times New Roman"',
    })
  })

  it('解析非内置属性也转为驼峰键', () => {
    expect(parseCssString('text-decoration:underline')).toEqual({
      textDecoration: 'underline',
    })
  })

  it('空字符串返回空对象', () => {
    expect(parseCssString('')).toEqual({})
    expect(parseCssString('   ')).toEqual({})
  })

  it('无冒号的片段被忽略', () => {
    expect(parseCssString('color red;; background:blue')).toEqual({
      background: 'blue',
    })
  })
})

describe('resolveFieldStyle — 合并字段样式', () => {
  it('字段级优先于基础级', () => {
    const result = resolveFieldStyle({ color: 'black' }, { color: 'red' }, { id: 1 })
    expect(result.style).toEqual({ color: 'red' })
    expect(result.className).toBeUndefined()
  })

  it('无条件样式时返回合并后的样式（字段级覆盖基础级同名字段）', () => {
    const base: FieldStyle = { color: 'black', backgroundColor: 'white', fontSize: 12 }
    const col: FieldStyle = { fontSize: 14, fontWeight: 'bold', color: 'blue' }
    const result = resolveFieldStyle(base, col, { id: 1 })
    // 返回值是 Record<string, string>，number 转为字符串
    expect(result.style).toEqual({
      color: 'blue',
      backgroundColor: 'white',
      fontSize: '14',
      fontWeight: 'bold',
    })
  })

  it('条件命中覆盖字段级', () => {
    const base: FieldStyle = { fontSize: 12 }
    const col: FieldStyle = {
      color: 'black',
      dynamic: [{ when: '$row.status === "异常"', style: { color: 'red' } }],
    }
    const result = resolveFieldStyle(base, col, { status: '异常', id: 1 })
    expect(result.style).toEqual({
      fontSize: '12',
      color: 'red',
    })
  })

  it('多条规则首个命中 break（第二条虽命中也不生效）', () => {
    const col: FieldStyle = {
      dynamic: [
        { when: '$row.status === "异常"', style: { color: 'red' } },
        { when: 'true', style: { color: 'blue', fontWeight: 'bold' } },
      ],
    }
    const result = resolveFieldStyle(undefined, col, { status: '异常', id: 1 })
    // 第二条命中但不应生效
    expect(result.style).toEqual({ color: 'red' })
    expect(result.style).not.toContainEqual(['blue', 'bold'])
    expect(result.style.fontWeight).toBeUndefined()
  })

  it('无命中保持基础样式', () => {
    const base: FieldStyle = { color: 'black', fontSize: 12 }
    const col: FieldStyle = {
      dynamic: [{ when: '$row.status === "异常"', style: { color: 'red' } }],
    }
    const result = resolveFieldStyle(base, col, { status: '正常', id: 1 })
    // 不叠加任何条件样式
    expect(result.style).toEqual({ color: 'black', fontSize: '12' })
    expect(result.style).not.toEqual(expect.objectContaining({ color: 'red' }))
  })

  it('条件 when 返回 CSS 字符串（旧 styleExpr 迁移场景）按 CSS 解析合并', () => {
    const base: FieldStyle = { color: 'black', fontSize: 12 }
    const col: FieldStyle = {
      dynamic: [
        { when: '$row.status === "异常" ? "color:red" : ""', style: {} },
      ],
    }
    const result = resolveFieldStyle(base, col, { status: '异常', id: 1 })
    // 表达式返回 "color:red" 命中，解析后覆盖 base.color
    expect(result.style).toEqual({ color: 'red', fontSize: '12' })
  })

  it('条件 when 返回 CSS 字符串解析多属性', () => {
    const base: FieldStyle = { color: 'black' }
    const col: FieldStyle = {
      dynamic: [
        {
          when: '$row.status === "异常" ? "color:red; font-weight:bold" : ""',
          style: {},
        },
      ],
    }
    const result = resolveFieldStyle(base, col, { status: '异常', id: 1 })
    expect(result.style).toEqual({ color: 'red', fontWeight: 'bold' })
  })

  it('条件 when 返回 CSS 字符串为空字符串时不命中', () => {
    const base: FieldStyle = { color: 'black' }
    const col: FieldStyle = {
      dynamic: [{ when: '$row.status === "异常" ? "color:red" : ""', style: {} }],
    }
    const result = resolveFieldStyle(base, col, { status: '正常', id: 1 })
    expect(result.style).toEqual({ color: 'black' })
  })

  it('条件命中记录 className（并覆盖静态 className）', () => {
    const base: FieldStyle = { className: 'base-class' }
    const col: FieldStyle = {
      className: 'col-class',
      dynamic: [
        { when: 'true', style: { color: 'red' }, className: 'dyn-class' },
      ],
    }
    const result = resolveFieldStyle(base, col, { id: 1 })
    expect(result.style).toEqual({ color: 'red' })
    // 条件 className 优先于字段级静态 className
    expect(result.className).toBe('dyn-class')
  })

  it('无 dynamic 时返回字段级静态 className', () => {
    const base: FieldStyle = { className: 'base-class' }
    const col: FieldStyle = { className: 'col-class' }
    const result = resolveFieldStyle(base, col, { id: 1 })
    expect(result.className).toBe('col-class')
  })

  it('row.data 嵌套结构取值正常', () => {
    // 模拟 PageRenderer BizDataVO 结构 { id, data: { status } }
    const row = { id: 1, data: { status: '异常' } }
    const col: FieldStyle = {
      color: 'black',
      dynamic: [{ when: "$row.status === '异常'", style: { color: 'red' } }],
    }
    const result = resolveFieldStyle(undefined, col, row)
    expect(result.style).toEqual({ color: 'red' })
  })
})

describe('normalizeColumnStyle — 旧字段收敛', () => {
  it('收敛 fontFamily → style.fontFamily', () => {
    const result = normalizeColumnStyle({ prop: 'a', fontFamily: 'monospace' })
    expect(result.style?.fontFamily).toBe('monospace')
  })

  it('收敛 fontSize → style.fontSize', () => {
    const result = normalizeColumnStyle({ prop: 'a', fontSize: 14 })
    expect(result.style?.fontSize).toBe(14)
  })

  it('收敛 fontWeight → style.fontWeight', () => {
    const result = normalizeColumnStyle({ prop: 'a', fontWeight: 'bold' })
    expect(result.style?.fontWeight).toBe('bold')
  })

  it('收敛 fontColor → style.color', () => {
    const result = normalizeColumnStyle({ prop: 'a', fontColor: '#f00' })
    expect(result.style?.color).toBe('#f00')
  })

  it('收敛 className → style.className', () => {
    const result = normalizeColumnStyle({ prop: 'a', className: 'col-highlight' })
    expect(result.style?.className).toBe('col-highlight')
  })

  it('收敛旧 style（CSS 字符串）→ style.css', () => {
    const result = normalizeColumnStyle({ prop: 'a', style: 'color: red; font-weight: bold' })
    expect(result.style?.css).toBe('color: red; font-weight: bold')
  })

  it('收敛 styleExpr → style.dynamic（保留原表达式，命中后按 CSS 字符串解析）', () => {
    const result = normalizeColumnStyle({
      prop: 'a',
      styleExpr: '$row.status === "异常" ? "color:red" : ""',
    })
    expect(result.style?.dynamic).toEqual([
      { when: '$row.status === "异常" ? "color:red" : ""', style: {} },
    ])
  })

  it('已有 style.color 不被 fontColor 覆盖（旧值让位）', () => {
    const result = normalizeColumnStyle({
      prop: 'a',
      style: { color: '#0f0' } as unknown as string, // 模拟已收敛的结构化 style
      fontColor: '#f00',
    })
    expect(result.style?.color).toBe('#0f0')
  })

  it('已有 style.fontFamily 不被 fontFamily 覆盖', () => {
    const result = normalizeColumnStyle({
      prop: 'a',
      style: { fontFamily: 'Arial' } as unknown as string,
      fontFamily: 'monospace',
    })
    expect(result.style?.fontFamily).toBe('Arial')
  })

  it('style 是 CSS 字符串时收敛到 style.css', () => {
    const result = normalizeColumnStyle({
      prop: 'a',
      style: 'color: red; font-size: 14px',
    })
    expect(result.style?.css).toBe('color: red; font-size: 14px')
    // 字符串 style 不应出现在 style 对象上（只放在 css）
    expect((result.style as unknown as Record<string, unknown>)['style']).toBeUndefined()
  })

  it('幂等：repeat 调用结果一致', () => {
    const input = {
      prop: 'a',
      fontColor: '#f00',
      fontSize: 14,
      fontFamily: 'Arial',
      fontWeight: 'bold',
      className: 'hl',
      css: 'text-decoration:underline',
    }
    const first = normalizeColumnStyle(input as never)
    // 幂等：第二次调用（输入是第一次的输出形态）结果一致
    const second = normalizeColumnStyle(first as never)
    expect(second).toEqual(first)
  })

  it('已有 dynamic 不被覆盖', () => {
    const existing = { when: '$row.ok', style: { color: 'blue' } }
    const result = normalizeColumnStyle({
      prop: 'a',
      // @ts-expect-error dynamic 为运行时字段
      dynamic: [existing],
      fontColor: '#f00',
    } as never)
    expect(result).toEqual({
      style: {
        color: '#f00',
        dynamic: [existing],
      },
    })
  })

  it('返回 { style } 收敛结构', () => {
    const input = { prop: 'a', fontColor: '#f00' }
    const result: NormalizedColumnStyle = normalizeColumnStyle(input as never)
    expect(Object.keys(result)).toEqual(['style'])
    expect(typeof result.style?.color).toBe('string')
  })
})

describe('集成：normalize → resolveFieldStyle 旧 styleExpr 链路', () => {
  it('旧 styleExpr 经 normalize 收敛为 dynamic，resolveFieldStyle 命中后按 CSS 应用', () => {
    const input = {
      prop: 'a',
      styleExpr: '$row.status === "异常" ? "color:red" : ""',
    }
    const normalized = normalizeColumnStyle(input as never)
    const result = resolveFieldStyle(
      undefined,
      normalized.style,
      { status: '异常', id: 1 },
    )
    expect(result.style).toEqual({ color: 'red' })
    const notTriggered = resolveFieldStyle(
      undefined,
      normalized.style,
      { status: '正常', id: 1 },
    )
    expect(notTriggered.style).toEqual({})
  })
})
