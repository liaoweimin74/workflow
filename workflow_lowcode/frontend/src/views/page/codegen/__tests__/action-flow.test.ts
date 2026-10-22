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

  it('按钮链逐步判不了：产物不生成该按钮的 case（点击落空），也不还原兜底', () => {
    const { gen, source } = run(withChain())
    const us = gen.manifest.unsupported.filter((x) => x.path.includes('buttons(edit).events'))
    // 阶段 4 起按步登记（哪一步判不了就说哪一步），不再是一整条 key=按钮名
    expect(us.map((u) => u.key)).toEqual(['set-filter', 'refresh'])
    expect(us.every((u) => u.message.includes('不接线'))).toBe(true)
    // 链消费点击：卡片拿不到实例，兜底也不能当这个按钮的语义
    expect(source).not.toMatch(/case 'edit':/)
    // 打开容器的执行函数仍会因 delete 之外的内建按钮或容器生成，但 edit 不再是入口
    expect(source).toContain("@button-click=\"onButtonClick\"")
  })

  it('链配置本身仍随 viewActions 透传：是“行为丢失”，不是配置丢失', () => {
    const { source } = run(withChain())
    expect(source).toContain("type: 'set-filter'")
    expect(source).toContain("value: '$row.status'")
  })

  it('列点击链编不进产物时整块不出码：登记 not-in-artifact 后回读不报丢失', () => {
    const schema = clone(testPageSchema)
    // 卡片没有 handleCellClick 那层分发器：列级链配了也没人执行
    const cards = clone(cardlist)
    listNode(cards).props.columns = [
      { prop: 'customer_name', label: '客户', onCellClick: { actions: [{ type: 'open-link', params: [{ key: 'url', value: '/x' }] }] } },
    ]
    const { gen, source, rev } = run(cards, 'cardlist_cell_chain')
    expect(gen.manifest.unsupported.some((x) => x.message.includes('onCellClick'))).toBe(true)
    expect(source).not.toContain('@cell-click')
    expect(rev.holes).toEqual([])
    // 同一支链在 page-table 上是丢弃登记（阶段 4 的透传面见 action-chain.test.ts）
    const plain = run(schema, 'test_page_cell_chain')
    expect(plain.gen.manifest.nodes.find((n) => n.rulePath === 'rule[0]')!.warnings.some((w) => w.path === 'props.columns[0].onCellClick')).toBe(false)
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
