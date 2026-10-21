// ----- FormulaField（计算字段）出码契约：runtime 组件 + 公式求值的显式接线 -----
// 组件的求值链逐依赖走 formCreateInject.api.getValue（FormulaField.vue:79-89）再 watchEffect 回写自身字段。
// spike 8 的接法：**不搬求值逻辑** —— formCreateInject 是组件声明过的运行时 prop（:53），
// 产物用 `const formulaApi = { api: { getValue: f => form[f] } }` 把它接上，
// 求值/舍入/显示继续由组件单点持有（真机 A/B 与现网表现一致，产物里不存在第二套公式引擎）。
// 表达式仍原样透传（回导机器一行不动）；formCreateInject 是产物有 schema 无的接线，进 wireOnly 剥离。
// npx vitest run src/views/page/codegen/__tests__/formula-field.test.ts

import { describe, expect, it } from 'vitest'

import FormulaField from '@lc/runtime/FormulaField'

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

  it('formCreateInject 是组件声明过的运行时 prop，产物递进去才不是错位 emit', () => {
    expect(Object.keys((FormulaField as any).props || {}), '组件没有这个 prop，产物写它就是死接线').toContain('formCreateInject')
    expect(TYPE_CONTRACTS.FormulaField!.injects).toMatchObject({ prop: 'formCreateInject', constName: 'formulaApi' })
  })

  it('产物接上注入面：元素带 :form-create-inject，脚本里 adapter 用 form 后端取依赖值', () => {
    const { gen, source } = run()
    expect(source).toMatch(/<FormulaField[^>]*:form-create-inject="formulaApi"/)
    expect(source).toContain('const formulaApi = { api: { getValue: (field: string) => form[field] } }')
    // 求值/舍入/显示仍由组件持有：产物里不该出现第二套公式引擎（parseFormula 不入产物）
    expect(source).not.toContain('parseFormula')
    expect(nodeOf(gen).wireOnly).toContain('formCreateInject')
  })

  it('求值债销账：容器内的 FormulaField 不再挂 unsupported，回读仍零空洞', () => {
    const { gen, rev } = run()
    expect(gen.manifest.unsupported.filter((u) => u.type === 'FormulaField'), '已显式接线，不许再挂死债').toEqual([])
    expect(rev.holes, JSON.stringify(rev.holes)).toEqual([])
  })

  it('容器外的 FormulaField 不假接线：没有 form 后端，保持 unsupported 记债', () => {
    const orphan = JSON.parse(JSON.stringify(schema)) as Record<string, any>
    const f = orphan.rule[0].props.rule[2]
    orphan.rule[0].props.rule.splice(2, 1)
    orphan.rule.push(f)
    const gen = generatePage(orphan as any, META)
    expect(gen.manifest.unsupported.some((u) => u.type === 'FormulaField' && u.key === 'formCreateInject')).toBe(true)
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
