// ----- spike A：动作流验真（合成样本）-----
// 现网口径（2026-10-21 活库 16 页 / 仓库语料 12 页一致）：
//   总线 actions 只有一种用法 —— row-edit → open-container，且页面都带内建 edit 按钮；
//   按钮链、列链、组件链 0 样本。
// 这组测试钉住产物对三种动作入口的真实能力，避免把 manifest 的“登记了”读成“执行了”。
// npx vitest run src/views/page/codegen/__tests__/action-flow.test.ts

import { describe, expect, it } from 'vitest'

import { generatePage } from '../generate'
import { reverseToSchema } from '../reverse'
import testPageSchema from './fixtures/test_page.schema.json'
import cardlist from './fixtures/corpus/cardlist_test.json'

const corpus = import.meta.glob('./fixtures/corpus/*.json', { eager: true, import: 'default' }) as Record<
  string,
  Record<string, any>
>
const pages = Object.entries(corpus).map(([p, schema]) => ({
  key: p.split('/').pop()!.replace('.json', ''),
  schema,
}))

const META = (key: string) => ({ pageKey: key, pageName: key, exportedAt: 'action-flow' })

function run(schema: Record<string, any>, key = 'action_flow') {
  const gen = generatePage(schema as any, META(key))
  const vue = Object.keys(gen.files).find((f) => f.endsWith('.vue'))!
  return { gen, source: gen.files[vue], rev: reverseToSchema(schema as any, gen.files[vue], gen.manifest) }
}

const clone = (v: unknown) => JSON.parse(JSON.stringify(v))
const listNode = (schema: any) => schema.rule.find((n: any) => n.props?.viewActions)

describe('现网唯一形态：总线 row-edit → open-container', () => {
  it('manifest 记录动作；产物没有总线执行分支，只有原形态注释', () => {
    const { gen, source } = run(clone(cardlist))
    const b = gen.manifest.behaviors.find((x) => x.origin === 'actions[0]')!
    expect(b.trigger).toBe('row-edit')
    expect(b.steps).toEqual([{ op: 'open-container', target: 'ds_mvck4gv9' }])
    expect(source).toContain('// 原形态：')
    // 总线触发器不是产物的 switch case：产物只认按钮 key
    expect(source).not.toContain("case 'row-edit':")
  })

  it('现网页面的行为靠内建 edit 按钮兜底：case edit → openContainer，且回读零空洞', () => {
    const { source, rev } = run(clone(cardlist))
    expect(source).toMatch(/case 'edit':\s*\n\s*void openContainer/)
    expect(rev.holes).toEqual([])
  })

  it('无按钮承载时不许宣称已实现：manifest 不再指认 onButtonClick/edit', () => {
    const schema = clone(cardlist)
    delete listNode(schema).props.viewActions.buttons
    const { gen, source } = run(schema)
    const b = gen.manifest.behaviors.find((x) => x.origin === 'actions[0]')!
    expect(b.implementedBy, '产物里没有 edit case，implementedBy 却在指认它').toBeUndefined()
    expect(b.warnings.some((w) => w.kind === 'not-wired')).toBe(true)
    expect(
      gen.manifest.unsupported.some((u) => u.type === 'bus' && u.path === 'actions[0]'),
      '无按钮承载的总线动作必须登记为不接线',
    ).toBe(true)
    expect(source).not.toMatch(/case 'edit':/)
  })

  it('步骤参数只保真 op/target：displayMode 登记丢弃而不是悄悄消失', () => {
    const { gen } = run(clone(testPageSchema), 'test_page')
    const b = gen.manifest.behaviors.find((x) => x.origin === 'actions[0]')!
    expect(b.steps).toEqual([{ op: 'open-container', target: 'ds_mu2jhb3n' }])
    const dropped = b.warnings.find((w) => w.kind === 'step-param-dropped')!
    expect(dropped.path).toBe('actions[0].steps[0].displayMode')
    expect(dropped.message).toContain('无落点')
  })
})

describe('组件级动作链：现网 0 样本，产物当前不执行', () => {
  const withChain = () => {
    const schema = clone(cardlist)
    const edit = listNode(schema).props.viewActions.buttons.find((b: any) => b.key === 'edit')
    edit.events = [
      {
        trigger: 'click',
        actions: [
          { type: 'set-filter', params: [{ key: 'status', value: '$row.status' }] },
          { type: 'refresh', params: [] },
        ],
      },
    ]
    return schema
  }

  it('按钮链登记 unsupported，产物不生成该按钮的 case（点击落空）', () => {
    const { gen, source } = run(withChain())
    const u = gen.manifest.unsupported.find((x) => x.path.includes('buttons(edit).events'))!
    expect(u.key).toBe('edit')
    expect(u.message).toContain('不接线')
    expect(source).not.toMatch(/case 'edit':/)
    // 打开容器的执行函数仍会因 delete 之外的内建按钮或容器生成，但 edit 不再是入口
    expect(source).toContain("@button-click=\"onButtonClick\"")
  })

  it('链配置本身仍随 viewActions 透传：是“行为丢失”，不是配置丢失', () => {
    const { source } = run(withChain())
    expect(source).toContain("type: 'set-filter'")
    expect(source).toContain("value: '$row.status'")
  })

  it('列点击链整块不出码：产物无 onCellClick，登记 not-in-artifact 后回读不报丢失', () => {
    const schema = clone(testPageSchema)
    schema.rule[0].props.columns[0].onCellClick = {
      actions: [{ type: 'open-link', params: [{ key: 'url', value: '/detail/$row.id' }] }],
    }
    const { gen, source, rev } = run(schema, 'test_page_cell_chain')
    const drop = gen.manifest.nodes
      .find((n) => n.rulePath === 'rule[0]')!
      .warnings.find((w) => w.path === 'props.columns[0].onCellClick')!
    expect(drop.kind).toBe('not-in-artifact')
    expect(source).not.toContain('onCellClick')
    expect(rev.holes).toEqual([])
  })
})

describe('现网样本面：动作流只有总线一档，链入口零样本', () => {
  it('语料统计与活库一致：总线 5 页且全是 row-edit→open-container，链全 0', () => {
    const bus = pages.filter(({ schema }) => (schema.actions || []).length)
    expect(bus.length).toBe(5)
    for (const { key, schema } of bus) {
      for (const a of schema.actions) {
        expect(a.trigger, key).toBe('row-edit')
        expect(a.steps, key).toEqual([{ op: 'open-container', target: a.steps[0].target }])
      }
    }

    let buttonChains = 0
    let cellChains = 0
    let componentChains = 0
    const walk = (nodes: any[] = []) => {
      for (const n of nodes) {
        if (!n || typeof n !== 'object') continue
        for (const b of n.props?.viewActions?.buttons || []) {
          buttonChains += (b.events || []).flatMap((e: any) => e.actions || []).length
        }
        for (const c of n.props?.columns || []) cellChains += c.onCellClick?.actions?.length || 0
        componentChains += (n.events || []).flatMap((e: any) => e.actions || []).length
        walk(n.children)
      }
    }
    pages.forEach(({ schema }) => walk(schema.rule))
    expect({ buttonChains, cellChains, componentChains }).toEqual({
      buttonChains: 0,
      cellChains: 0,
      componentChains: 0,
    })
  })
})
