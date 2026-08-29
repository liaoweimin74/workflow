import { describe, it, expect } from 'vitest'
import { getCellValue, interpolateTemplate, renderCellContent, buildCellRender } from '../tableColumnRenderer'

describe('getCellValue — 统一列取值', () => {
  it('优先取内层 data 结构', () => {
    expect(getCellValue({ data: { name: '张工' } }, 'name')).toBe('张工')
  })
  it('回退扁平结构', () => {
    expect(getCellValue({ name: '张工' }, 'name')).toBe('张工')
  })
  it('内层与扁平均存在时优先内层', () => {
    expect(getCellValue({ data: { name: '内层' }, name: '扁平' }, 'name')).toBe('内层')
  })
  it('均无返回 undefined', () => {
    expect(getCellValue({}, 'name')).toBeUndefined()
  })
  it('row 为 null 返回 undefined', () => {
    expect(getCellValue(null as any, 'name')).toBeUndefined()
  })
})

describe('interpolateTemplate — 模板插值', () => {
  it('替换单字段', () => {
    expect(interpolateTemplate('${name}', { name: '张工' })).toBe('张工')
  })
  it('替换多级字段并保留静态文本', () => {
    expect(interpolateTemplate('${user.name}(${status})', { user: { name: '张工' }, status: '在职' })).toBe('张工(在职)')
  })
  it('不存在的字段替换为空字符串', () => {
    expect(interpolateTemplate('${missing}', { name: 'x' })).toBe('')
  })
  it('空 template 返回空字符串', () => {
    expect(interpolateTemplate('', {})).toBe('')
  })
})

describe('renderCellContent — 列内容渲染', () => {
  it('expression 优先于 formatter', () => {
    expect(renderCellContent({ key: 'a', expression: '$row.a > 1 ? "X" : "Y"', formatter: 'currency' }, { a: 5 })).toBe('X')
  })
  it('template 优先于 formatter', () => {
    expect(renderCellContent({ key: 'name', template: '${name}', formatter: 'currency' }, { name: '张工' })).toBe('张工')
  })
  it('formatter 对列 key 对应的原始值生效', () => {
    expect(renderCellContent({ key: 'amount', formatter: 'currency' }, { amount: 1234.56 })).toBe('¥1,234.56')
  })
  it('expression 求值为空值时回退模板', () => {
    expect(renderCellContent({ key: 'n', expression: '$row.n', template: 'fallback' }, { n: null })).toBe('fallback')
  })
  it('空值且无动态内容显示占位符', () => {
    expect(renderCellContent({ key: 'name' }, { name: null })).toBe('—')
  })
  it('无 formatter 时直接取原始值字符串', () => {
    expect(renderCellContent({ key: 'code' }, { code: 'A001' })).toBe('A001')
  })
})

describe('buildCellRender — 构建列 render 函数', () => {
  it('返回函数并在 render 内包 span 携带 class', () => {
    const render = buildCellRender({ key: 'amount', className: 'col-highlight', formatter: 'currency' })
    const vnode = render({ amount: 1234.56 })
    expect(vnode.type).toBe('span')
    expect(vnode.props.class).toBe('col-highlight')
    expect(vnode.children).toBe('¥1,234.56')
  })
  it('styleExpr 按行求值应用 style', () => {
    const render = buildCellRender({ key: 'status', styleExpr: '$row.status === "异常" ? "color:red" : ""' })
    const vnode = render({ status: '异常' })
    expect(vnode.props.style).toContain('color:red')
  })
  it('无样式时 style 为 undefined', () => {
    const render = buildCellRender({ key: 'code' })
    const vnode = render({ code: 'A1' })
    expect(vnode.props.style).toBeUndefined()
  })
})
