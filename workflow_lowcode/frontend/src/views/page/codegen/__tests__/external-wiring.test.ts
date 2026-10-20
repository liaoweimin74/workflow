// ----- 产物接管按钮语义：external-actions 与 @button-click 必须成对出现 -----
// 真机探测查出：卡片产物里点「编辑」弹的是 PageDataCards 自己的兜底表单（rule 取自数据源的业务表单，
// 不是页面配的容器），产物里那个按容器 schema 生成的 el-dialog 一个调用者都没有 —— 看着接了线，实际没接。
// 组件侧加了 externalActions（为真时按钮只 emit），产物侧必须同时把它打开并接住 button-click。
// npx vitest run src/views/page/codegen/__tests__/external-wiring.test.ts

import { describe, expect, it } from 'vitest'

import { TYPE_CONTRACTS } from '../contract'
import { generatePage } from '../generate'
import { reverseToSchema } from '../reverse'
import testPageSchema from './fixtures/test_page.schema.json'

const corpus = import.meta.glob('./fixtures/corpus/*.json', { eager: true, import: 'default' }) as Record<
  string,
  Record<string, any>
>

const pages = Object.entries(corpus)
  .map(([p, schema]) => ({ key: p.split('/').pop()!.replace('.json', ''), schema }))
  .sort((a, b) => a.key.localeCompare(b.key))

function run(schema: Record<string, any>, key: string) {
  const gen = generatePage(schema as any, { pageKey: key, pageName: key, exportedAt: 'external-wiring' })
  const vue = Object.keys(gen.files).find((f) => f.endsWith('.vue'))!
  return { gen, source: gen.files[vue], rev: reverseToSchema(schema as any, gen.files[vue], gen.manifest) }
}

const TAKEOVER = ':external-actions="true"'
const BUTTON_EVENT = '@button-click="onButtonClick"'

/** 语料里带列表组件 + 操作按钮的页面，才是这次改动真正的靶子 */
const buttonPages = pages.filter(({ schema }) =>
  schema.rule?.some(
    (n: any) => TYPE_CONTRACTS[n.type]?.list && (n.props?.viewActions?.buttons || []).length,
  ),
)

describe('按钮接管成对登记', () => {
  it('契约：接了 button-click 的列表组件必须同时开 externalActions（只绑事件不接管＝组件和自己各弹一次）', () => {
    for (const [type, contract] of Object.entries(TYPE_CONTRACTS)) {
      if (!contract.list) continue
      const wired = contract.list.events.some((e) => e.on === 'button-click')
      const takeover = contract.constAttrs?.externalActions === true
      expect(takeover, `${type} wired=${wired}`).toBe(wired)
    }
  })

  it('卡片产物：开接管、接事件、handler 里真有打开容器的分支', () => {
    const { key, schema } = pages.find((p) => p.key === 'cardlist_test')!
    const { source } = run(schema, key)
    expect(source).toContain(TAKEOVER)
    expect(source).toContain(BUTTON_EVENT)
    expect(source).toMatch(/case 'edit':\s*\n\s*void openContainer/)
  })

  it('表格产物：同样成对出现', () => {
    const { source } = run(testPageSchema, 'test_page')
    expect(source).toContain(TAKEOVER)
    expect(source).toContain(BUTTON_EVENT)
  })

  it('语料：凡接了 button-click 的产物都开了接管，反之不允许半接', () => {
    expect(buttonPages.length).toBeGreaterThan(0)
    for (const { key, schema } of buttonPages) {
      const { source } = run(schema, key)
      const hasEvent = source.includes(BUTTON_EVENT)
      const hasTakeover = source.includes(TAKEOVER)
      expect(hasTakeover, `${key} 绑了事件却没开接管`).toBe(hasEvent)
      if (hasEvent) expect(source, `${key} 有按钮却没生成 onButtonClick 分支`).toContain('function onButtonClick')
    }
  })

  it('回读不破：external-actions 是登记过的产物侧接线，回导不许报多造', () => {
    for (const { key, schema } of buttonPages) {
      const { rev } = run(schema, key)
      const bad = rev.holes.filter((h) => /externalActions|buttonClick/i.test(h.path))
      expect(bad, `${key} ${JSON.stringify(bad)}`).toEqual([])
    }
  })

  it('空事件链不冒充动作链：链里没配动作的按钮照常接线（对齐组件的 some(actions.length>0)）', () => {
    const { key, schema } = pages.find((p) => p.key === 'cardlist_test')!
    const edit = schema.rule
      .find((n: any) => TYPE_CONTRACTS[n.type]?.list)!
      .props.viewActions.buttons.find((b: any) => b.key === 'edit')
    expect(edit.events, '夹具得是「有 events 但链为空」这个真实形态').toEqual([{ trigger: 'click', actions: [] }])

    const { gen, source } = run(schema, key)
    expect(gen.manifest.unsupported.filter((u) => String(u.path).includes('buttons(edit)')), '空链不该报不接线').toEqual([])
    expect(source).toMatch(/case 'edit':/)
  })

  it('接管之后卡片也会生成 delete 分支：刷新占位不能让产物变成非法 TS', () => {
    const { key, schema } = pages.find((p) => p.key === 'cardlist_test')!
    expect(() => run(schema, key)).not.toThrow()
    const { source } = run(schema, key)
    expect(source).not.toMatch(/\.then\(\(\) =>\s*\/\*/)
  })

  it('组件不 emit 的事件不在产物里留空函数（vue-tsc 的 TS6133 孤儿 handler）', () => {
    const { key, schema } = pages.find((p) => p.key === 'cardlist_test')!
    const cards = run(schema, key).source
    expect(cards).toContain('function onRowClick')
    expect(cards, 'page-list-cards 没有 selection-change 出口，绑了也没人调').not.toContain('function onSelectionChange')

    const table = run(testPageSchema, 'test_page').source
    expect(table).toContain('function onSelectionChange')
  })
})
