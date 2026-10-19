// ----- TDD: manifest.meta → 属性面板控件映射（remote-materials 5.3）-----
// npx vitest run src/platform/__tests__/materialMetaRules.test.ts

import { describe, it, expect } from 'vitest'
import { parseMaterialMeta, metaToRules, metaDefaults } from '../materialMetaRules'

const META = {
  title: { label: '标题', type: 'text', default: '库存趋势' },
  refreshInterval: { label: '刷新秒数', type: 'number', default: 30 },
  autoRefresh: { label: '自动刷新', type: 'switch', default: false },
  theme: {
    label: '主题',
    type: 'select',
    options: [
      { label: '浅色', value: 'light' },
      { label: '深色', value: 'dark' },
    ],
    default: 'light',
  },
  remark: { label: '备注', type: 'textarea' },
}

function ruleOf(field: string) {
  return metaToRules(META).find((r: any) => r.field === field)
}

describe('parseMaterialMeta', () => {
  it('按声明顺序展开为配置项，字段名取 meta 的键', () => {
    expect(parseMaterialMeta(META).map((f) => f.field)).toEqual([
      'title',
      'refreshInterval',
      'autoRefresh',
      'theme',
      'remark',
    ])
  })

  it('缺 label 时回落字段名，缺 default 时为 undefined', () => {
    const fields = parseMaterialMeta({ code: { type: 'text' } })
    expect(fields[0].label).toBe('code')
    expect(fields[0].default).toBeUndefined()
  })

  it('非法 meta（非对象/条目非对象/无控件类型）被忽略', () => {
    expect(parseMaterialMeta(null)).toEqual([])
    expect(parseMaterialMeta('x')).toEqual([])
    expect(parseMaterialMeta({ a: 1, b: { label: '无类型' }, c: { type: 'text' } })).toHaveLength(1)
  })

  it('select 的可选项缺 label 时用 value 兜底，非数组选项忽略', () => {
    const fields = parseMaterialMeta({
      theme: { type: 'select', options: [{ value: 'light' }, 'x'] },
    })
    expect(fields[0].options).toEqual([{ label: 'light', value: 'light' }])
  })

  it('接口下发的有序数组形态（后端把 meta 转数组避免键被重排）同样解析', () => {
    const fields = parseMaterialMeta([
      { field: 'title', label: '标题', type: 'text', default: '本月新增' },
      { field: 'trend', type: 'select', options: [{ label: '上升', value: 'up' }] },
      { label: '没有字段名', type: 'text' },
      'x',
    ])
    expect(fields.map((f) => f.field)).toEqual(['title', 'trend'])
    expect(fields[1].label).toBe('trend')
    expect(fields[1].hasDefault).toBe(false)
    expect(metaToRules([{ field: 'trend', type: 'select', options: [{ label: '上升', value: 'up' }] }])).toEqual([
      { field: 'trend', title: 'trend', type: 'select', options: [{ label: '上升', value: 'up' }], props: { clearable: true } },
    ])
    expect(metaDefaults([{ field: 'title', type: 'text', default: '本月新增' }])).toEqual({ title: '本月新增' })
  })
})

describe('metaToRules', () => {
  it('五种控件类型映射到 form-create 规则', () => {
    expect(ruleOf('title').type).toBe('input')
    expect(ruleOf('refreshInterval').type).toBe('inputNumber')
    expect(ruleOf('autoRefresh').type).toBe('switch')
    expect(ruleOf('theme').type).toBe('select')
    expect(ruleOf('remark').type).toBe('input')
    expect(ruleOf('remark').props).toMatchObject({ type: 'textarea' })
  })

  it('标题取 meta 的 label，默认值写入规则 value', () => {
    expect(ruleOf('title').title).toBe('标题')
    expect(ruleOf('title').value).toBe('库存趋势')
    expect(ruleOf('refreshInterval').value).toBe(30)
  })

  it('未声明默认值的配置项不写 value（避免覆盖节点已有 props）', () => {
    expect('value' in ruleOf('remark')).toBe(false)
  })

  it('select 携带静态选项', () => {
    expect(ruleOf('theme').options).toEqual([
      { label: '浅色', value: 'light' },
      { label: '深色', value: 'dark' },
    ])
  })

  it('未识别控件类型降级为文本输入且不阻塞其他项', () => {
    const rules = metaToRules({
      colorPalette: { label: '配色', type: 'color-palette', default: '#fff' },
      title: { label: '标题', type: 'text' },
    })
    expect(rules).toHaveLength(2)
    expect(rules[0]).toMatchObject({ type: 'input', field: 'colorPalette', value: '#fff' })
  })
})

describe('metaDefaults', () => {
  it('仅收集声明了默认值的项，作为新建节点的 props 初值', () => {
    expect(metaDefaults(META)).toEqual({
      title: '库存趋势',
      refreshInterval: 30,
      autoRefresh: false,
      theme: 'light',
    })
  })

  it('meta 为空返回空对象', () => {
    expect(metaDefaults(null)).toEqual({})
  })
})
