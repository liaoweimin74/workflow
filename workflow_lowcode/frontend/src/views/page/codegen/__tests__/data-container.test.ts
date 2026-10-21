// ----- 数据容器 page-data-container：子树是「数据」，产物不摊成模板 -----
// 依据全取自运行期消费者，不看设计器配置面：
//  · dataContainer.ts:1-14 写明三种形态 —— 画布态 fcRow+children / 保存态 props.rule /
//    运行态 props.childRules + children:[]。页面 schema 落盘的是保存态，渲染吃的是运行态。
//  · PageRendererPage.vue:496-517 宿主归一：normalizeDataContainerForRender 把 props.rule 改名成
//    props.childRules（:497），并置空节点 title/info（:499-500，「标题由容器自己渲染」）——
//    所以 self.title 只能是 drop，可见标题来自 props.title（PageDataContainer.vue:4 的 pdc-head）。
//  · PageDataContainer.vue:9、:89 子树由容器内部再起一个 form-create 渲染，{rows}/{row} 作用域插值
//    是数据到达后由 applyScopeToRules 现场改写子规则的。产物若把这棵子树摊成真模板，就是把
//    「运行期取值」提前成「出码期取值」，容器注释里明写这条会让联动失效 —— 所以 v1 原样透传，
//    并把它记成语义债（要摊平得先解决作用域与寻址，属 P2 出码骨架）。
// 语料：tmp_data_container_verify（rule = dash-filter + 两个容器，容器子树含 div 文本与 dash-kpi）
// 跑：npx vitest run src/views/page/codegen/__tests__/data-container.test.ts

import { describe, expect, it } from 'vitest'

import PageDataContainer from '@lc/runtime/page-data-container'

import { TYPE_CONTRACTS, widgetOf } from '../contract'
import { generatePage } from '../generate'
import { reverseToSchema } from '../reverse'
import page from './fixtures/corpus/tmp_data_container_verify.json'

const clone = () => JSON.parse(JSON.stringify(page)) as Record<string, any>

function run(schema: Record<string, any>) {
  const gen = generatePage(schema as any, { pageKey: 'tmp_data_container_verify', pageName: 'tmp_data_container_verify', exportedAt: 'data-container' })
  const vue = Object.keys(gen.files).find((f) => f.endsWith('.vue'))!
  const source = gen.files[vue]
  const rev = reverseToSchema(schema as any, source, gen.manifest)
  return { gen, source, holes: rev.holes, badRenames: rev.renameChecks.filter((r) => !r.ok) }
}

const declared = (c: unknown): Set<string> => {
  const p = (c as any).props
  return new Set<string>(Array.isArray(p) ? p : Object.keys(p || {}))
}

describe('数据容器登记', () => {
  it('根据要站得住：组件真吃 childRules，节点 title 被宿主置空（不同于 page-detail 的 label 载体）', () => {
    expect(declared(PageDataContainer).has('childRules'), '组件不吃 childRules，改名就是错位 emit').toBe(true)
    const contract = TYPE_CONTRACTS['page-data-container']
    expect(contract, 'page-data-container 未登记').toBeTruthy()
    expect(widgetOf('page-data-container'), '容器也是展示组件，要走栅格').toBe(true)
    expect(contract!.props.rule).toMatchObject({ emit: 'prop', as: 'childRules' })
    expect(contract!.self?.title?.emit).toBe('drop')
    expect(TYPE_CONTRACTS['page-detail']!.self?.title?.emit, '对照组：详情组件的节点 title 是真的 label').toBe('attr')
  })

  it('整页三节点回读零空洞：子树作为 childRules 数据原样往返，不比 schema 少一个字', () => {
    const { holes, badRenames } = run(clone())
    expect(holes, JSON.stringify(holes)).toEqual([])
    expect(badRenames, JSON.stringify(badRenames)).toEqual([])
  })

  it('子树不摊平：产物里没有容器内那台 dash-kpi 的标签，登记表里也没有它的节点条目（一份真相）', () => {
    const { gen, source } = run(clone())
    expect(source).not.toContain('<dash-kpi')
    expect(source.match(/<page-data-container/g)).toHaveLength(2)
    // 递归只在契约把 rule 登记成 children 时发生；这里登记成 prop，子节点不该同时进 plan 又进常量
    expect(gen.manifest.nodes.filter((n) => n.rulePath.includes('props.rule['))).toEqual([])
  })

  it('改名要登记：props.rule → props.childRules 进重命名表，回导靠它而不是靠猜', () => {
    const { gen } = run(clone())
    const renames = gen.manifest.nodes.filter((n) => n.type === 'page-data-container').flatMap((n) => n.renames)
    for (const from of ['props.rule', 'props.dataSourceId']) {
      expect(renames.some((r) => r.from === from), `缺 ${from} 的登记`).toBe(true)
    }
  })

  it('取数身份与镜像键：ds-ref-id 走数据源常量表，span/height 是组件内部留白，col.span 落栅格', () => {
    const { source } = run(clone())
    expect(source).toMatch(/<page-data-container[^>]*:ds-ref-id="ds\.refId"/)
    expect(source).toMatch(/<page-data-container[^>]*title="客户概览（list）"/)
    expect(source).toMatch(/<page-data-container[^>]*query-mode="list"/)
    expect(source).toMatch(/<page-data-container[^>]*page-size="5"/)
    expect(source).toMatch(/<page-data-container[^>]*span="24"/)
    expect(source.match(/<el-col class="fc-form-col" :span="24">/g)!.length).toBeGreaterThanOrEqual(3)
    // designMode 是设计器画布态，产物恒运行态：不进模板
    expect(source).not.toMatch(/<page-data-container[^>]*design-mode/)
  })

  it('语义债按节点记账：子树仍由容器内嵌 form-create 解释，产物没有这层就得留下线索', () => {
    const { gen } = run(clone())
    const debt = gen.manifest.unsupported.filter((u) => u.type === 'page-data-container')
    expect(debt.map((d) => d.key)).toEqual(['childRules', 'childRules'])
    expect(debt[0].message).toContain('form-create')
    expect(debt[0].message).toMatch(/rows|row/)
  })

  it('组件声明面自证：登记成 prop 的键组件都得真收（虚报能力会被错位 emit 静态面打死）', () => {
    const contract = TYPE_CONTRACTS['page-data-container']!
    for (const [key, entry] of Object.entries(contract.props)) {
      if (key === 'rule' || key.includes('.') || entry.emit !== 'prop') continue
      expect(declared(PageDataContainer).has(key), `组件没声明 ${key}`).toBe(true)
    }
    expect(declared(PageDataContainer).has('designMode'), 'designMode 组件确实声明了，但它属运行期注入面').toBe(true)
  })
})
