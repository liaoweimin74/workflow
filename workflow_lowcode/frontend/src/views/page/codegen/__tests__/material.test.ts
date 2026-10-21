// ----- spike M：material 节点出码形态摸底 -----
// 物料是运行时动态类型（type=material:<key>），props 面来自后端 manifest.meta，
// 不在静态契约表里；产物若要支持，必须新增“动态载体 + 整块 props”的出码与回读语义。
// 现网口径（2026-10-21 活库）：16 页仅 tmp_widget_verify 引用 material:stat-card（探测页），
// 物料表只有 1 个启用 WIDGET（stat-card），真实业务页面零引用。
// 结论：延后到出现真实页面引用；当前整节点降级如实计入 A 桶。
// npx vitest run src/views/page/codegen/__tests__/material.test.ts

import { describe, expect, it } from 'vitest'

import { TYPE_CONTRACTS } from '../contract'
import { generatePage } from '../generate'
import { reverseToSchema } from '../reverse'
import widgetPage from './fixtures/corpus/tmp_widget_verify.json'

const corpus = import.meta.glob('./fixtures/corpus/*.json', { eager: true, import: 'default' }) as Record<
  string,
  Record<string, any>
>
const pages = Object.entries(corpus).map(([p, schema]) => ({
  key: p.split('/').pop()!.replace('.json', ''),
  schema,
}))

const META = { pageKey: 'tmp_widget_verify', pageName: 'tmp_widget_verify', exportedAt: 'material' }

function run(schema: Record<string, any>) {
  const gen = generatePage(schema as any, META)
  const vue = Object.keys(gen.files).find((f) => f.endsWith('.vue'))!
  return { gen, source: gen.files[vue], rev: reverseToSchema(schema as any, gen.files[vue], gen.manifest) }
}

const materialNodes = (nodes: any[] = []): any[] =>
  nodes.flatMap((n) => [
    ...(typeof n?.type === 'string' && n.type.startsWith('material:') ? [n] : []),
    ...materialNodes(n?.children || []),
  ])

describe('material 样本面：现网真实页面零引用', () => {
  it('语料里只有探测页一个 material 节点，且类型是 material:<key> 动态约定', () => {
    const hits = pages.flatMap(({ key, schema }) => materialNodes(schema.rule).map((n) => ({ key, type: n.type })))
    expect(hits).toEqual([{ key: 'tmp_widget_verify', type: 'material:stat-card' }])
    expect(pages.some(({ schema }) => materialNodes(schema.rule).length)).toBe(true)
  })

  it('动态 key 不进静态契约表：物料种类来自后端，不能逐 key 登记', () => {
    expect(Object.keys(TYPE_CONTRACTS).some((t) => t.startsWith('material:'))).toBe(false)
    expect(TYPE_CONTRACTS['material:stat-card']).toBeUndefined()
  })

  it('props 是物料自定义的（meta 面），包含契约表无法预知的设计器字段', () => {
    const node = materialNodes(widgetPage.rule)[0]
    expect(Object.keys(node.props).sort()).toEqual(
      ['accent', 'autoRefresh', 'refreshInterval', 'remark', 'title', 'trend', 'unit', 'value'].sort(),
    )
  })
})

describe('当前出码：整节点降级，且不掩盖丢失', () => {
  it('生成不抛错，登记 unsupported（类型名带 key，A 桶可归因）', () => {
    const { gen } = run(widgetPage as any)
    const u = gen.manifest.unsupported.find((x) => x.path === 'rule[0]')!
    expect(u.type).toBe('material:stat-card')
    expect(u.message).toContain('无出码契约')
  })

  it('产物不留假元素：只有 lc:todo 注释，没有物料标签或加载器引用', () => {
    const { source } = run(widgetPage as any)
    expect(source).toContain('<!-- lc:todo node=n1 type=material:stat-card')
    expect(source).not.toContain('<material:')
    expect(source).not.toContain('materialComponents')
    expect(source).not.toContain('loadWidgetComponent')
  })

  it('回读如实报丢失：未出码的 props 逐键进 holes，不被 unsupported 洗白', () => {
    const { rev } = run(widgetPage as any)
    const lost = rev.holes.filter((h) => h.path.startsWith('rule[0].props.')).map((h) => h.path).sort()
    expect(lost).toEqual(
      [
        'rule[0].props.accent',
        'rule[0].props.autoRefresh',
        'rule[0].props.refreshInterval',
        'rule[0].props.remark',
        'rule[0].props.title',
        'rule[0].props.trend',
        'rule[0].props.unit',
        'rule[0].props.value',
      ].sort(),
    )
  })
})
