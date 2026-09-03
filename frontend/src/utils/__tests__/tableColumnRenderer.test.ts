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
    expect(vnode.props.style).toEqual({ color: 'red' })
  })
  it('无样式时 style 为 undefined', () => {
    const render = buildCellRender({ key: 'code' })
    const vnode = render({ code: 'A1' })
    expect(vnode.props.style).toBeUndefined()
  })

  // 新增：统一 FieldStyle 测试
  it('FieldStyle 结构化样式生效', () => {
    const render = buildCellRender({
      key: 'name',
      style: { color: 'red', fontSize: '14px' },
    })
    const vnode = render({ name: '测试' })
    expect(vnode.props.style).toEqual({ color: 'red', fontSize: '14px' })
  })

  it('FieldStyle dynamic 条件样式按行生效', () => {
    const render = buildCellRender({
      key: 'status',
      style: {
        dynamic: [
          { when: "$row.status === '异常'", style: { color: 'red' } },
        ],
      },
    })
    const vnode1 = render({ status: '正常' })
    expect(vnode1.props.style).toBeUndefined() // 条件未命中，无样式
    const vnode2 = render({ status: '异常' })
    expect(vnode2.props.style).toEqual({ color: 'red' })
  })

  it('旧 styleExpr 兼容：返回 CSS 字符串时按 CSS 解析', () => {
    const render = buildCellRender({
      key: 'status',
      styleExpr: "$row.status === '异常' ? 'color:red; font-size:14px' : ''",
    })
    const vnode = render({ status: '异常' })
    expect(vnode.props.style).toEqual({ color: 'red', fontSize: '14px' })
  })

  it('className 与 style 可同时生效', () => {
    const render = buildCellRender({
      key: 'name',
      className: 'col-highlight',
      style: { color: 'red' },
    })
    const vnode = render({ name: '测试' })
    expect(vnode.props.class).toBe('col-highlight')
    expect(vnode.props.style).toEqual({ color: 'red' })
  })
})
