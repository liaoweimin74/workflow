// ----- FormulaField（计算字段）出码契约：runtime 组件 + 公式求值的语义债登记 -----
// npx vitest run src/views/page/codegen/__tests__/formula-field.test.ts

import { describe, expect, it } from 'vitest'

import { TYPE_CONTRACTS } from '../contract'
import { generatePage } from '../generate'
import { reverseToSchema } from '../reverse'

const schema = JSON.parse(
  JSON.stringify({
    rule: [
      {
        type: 'formContainer',
        field: 'detail',
        title: '容器',
        props: {
          dataSourceId: 'ds_1',
          tabTitle: '编辑',
          dialogWidth: '800px',
          displayMode: 'popup',
          rule: [
            { type: 'input', field: 'order_amount', title: '订单金额', props: {} },
            { type: 'input', field: 'discount_rate', title: '折扣率', props: {} },
            {
              type: 'FormulaField',
              field: 'due_amount',
              title: '应收金额',
              display: true,
              hidden: false,
              props: { expression: 'ROUND(${order_amount} * (1 - ${discount_rate}), 2)', precision: 2, prefix: '¥', placeholder: '—', disabled: false },
            },
          ],
        },
      },
    ],
    option: {},
    dataSources: [{ id: 'ds_1', refId: 'ref-1', name: '订单 数据源' }],
    actions: [],
  }),
) as Record<string, any>

const META = { pageKey: 'formula_field_case', pageName: '计算字段', exportedAt: 'spike3' }

function run() {
  const gen = generatePage(schema as any, META)
  const vue = Object.keys(gen.files).find((f) => f.endsWith('.vue'))!
  return { gen, source: gen.files[vue], rev: reverseToSchema(schema as any, gen.files[vue], gen.manifest) }
}

const nodeOf = (gen: ReturnType<typeof run>['gen']) =>
  gen.manifest.nodes.find((n) => n.type === 'FormulaField')!

describe('FormulaField 出码契约', () => {
  it('能力表登记了它，且是保留 runtime 标签的字段控件', () => {
    const c = TYPE_CONTRACTS.FormulaField
    expect(c).toBeDefined()
    expect(c.runtime).toBe(true)
    expect(c.field).toBe(true)
    expect(c.props.expression).toEqual({ emit: 'prop' })
  })

  it('出成真标签：v-model 绑自身字段，表达式与显式前缀落模板，等于组件默认值的键省略', () => {
    const { gen, source } = run()
    expect(source).toContain(`import FormulaField from '@lc/runtime/FormulaField'`)
    expect(source).toMatch(/<FormulaField[^>]*v-model="form\.due_amount"/)
    expect(source).toContain('expression=')
    expect(source).toContain('prefix=')
    // precision 2 / placeholder '—' / disabled false 都是组件默认值，不该占模板
    expect(source).not.toMatch(/<FormulaField[^>]*precision=/)
    expect(source).not.toMatch(/<FormulaField[^>]*disabled=/)
    const node = nodeOf(gen)
    expect(node.warnings.filter((w) => w.kind === 'default-elided').map((w) => w.path).sort()).toEqual([
      'props.disabled',
      'props.placeholder',
      'props.precision',
    ])
  })

  it('回读零空洞：省略的默认值按登记补回，非默认的 prefix 显式还原', () => {
    const { rev } = run()
    expect(rev.holes, JSON.stringify(rev.holes)).toEqual([])
    const back = (rev.rebuilt as any).rule[0].props.rule[2].props
    expect(back).toEqual(expect.objectContaining({ precision: 2, disabled: false, prefix: '¥' }))
  })

  it('公式求值是语义债，按节点记账而不是假装能跑', () => {
    const { gen } = run()
    const debt = gen.manifest.unsupported.filter((u) => u.type === 'FormulaField')
    expect(debt.map((d) => d.key)).toEqual(['expression'])
    expect(debt[0].message).toContain('formCreateInject')
    expect(debt[0].path).toContain('props.expression')
  })

  it('语料里 FormulaField 不再是"类型未登记"', () => {
    const { gen } = run()
    expect(gen.manifest.unsupported.some((u) => u.message.includes('无出码契约') && u.type === 'FormulaField')).toBe(false)
  })

  it('清单与产物一致：嵌在容器里的 runtime 控件都算依赖，也都真有 import', () => {
    const { gen, source } = run()
    const comps = gen.manifest.runtime.components
    expect(comps, JSON.stringify(comps)).toContain('FormulaField')
    const imported = [...source.matchAll(/^import (\w+) from '@lc\/runtime\/(.+)'$/gm)].map((m) => m[2])
    expect([...comps].sort()).toEqual(imported.sort())
  })
})
