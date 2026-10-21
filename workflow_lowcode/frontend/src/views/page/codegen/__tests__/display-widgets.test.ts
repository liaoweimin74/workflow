// ----- 页面展示组件登记：page-chart / page-detail / page-steps -----
// 与 dash 族同属展示组件（走栅格、不出 v-model），但标题载体不同：
//   PageRendererPage.vue:519 的置空名单只含 dash 族，page-* 这三类的节点 title 照旧被
//   form-create 当成 el-form-item 的 label 渲染 —— 所以它们的 self.title 必须登记成
//   attr on el-form-item，而不是 dash 那样的 drop。
// 另一处不同：page-chart / page-detail 在 PageRendererPage.vue:552 的数据组件名单里，
//   渲染器给它们注入 props.pageKey（PageDataChartPage 的 pageKey 必填），产物要自己传。
// 语料：page_detail_steps_demo（三节点 = page-steps + page-table + page-detail）、
//       tmp_size_align_verify（rule[2..3] 两个 page-chart，col.span=12、height 一固定一自适应）。
// 跑：npx vitest run src/views/page/codegen/__tests__/display-widgets.test.ts

import { describe, expect, it } from 'vitest'

import PageChart from '@lc/runtime/page-chart'
import PageDetail from '@lc/runtime/page-detail'
import PageSteps from '@lc/runtime/page-steps'

import { TYPE_CONTRACTS, widgetOf } from '../contract'
import { generatePage } from '../generate'
import { reverseToSchema } from '../reverse'
import demoPage from './fixtures/corpus/page_detail_steps_demo.json'
import sizePage from './fixtures/corpus/tmp_size_align_verify.json'

const DISPLAY_TYPES = ['page-chart', 'page-detail', 'page-steps']

function run(schema: Record<string, any>, key: string) {
  const gen = generatePage(schema as any, { pageKey: key, pageName: key, exportedAt: 'display-widgets' })
  const vue = Object.keys(gen.files).find((f) => f.endsWith('.vue'))!
  const source = gen.files[vue]
  const rev = reverseToSchema(schema as any, source, gen.manifest)
  return { gen, source, holes: rev.holes, badRenames: rev.renameChecks.filter((r) => !r.ok) }
}

/** 只取两个 page-chart 节点：同页前两个 dash-chart 已登记，留着正好验「连续展示组件并成一段栅格」 */
const displayOnly = () => JSON.parse(JSON.stringify(sizePage))

describe('页面展示组件登记', () => {
  it('三类都是展示组件，而且标题落 el-form-item 的 label（不是 dash 那种 drop）', () => {
    for (const type of DISPLAY_TYPES) {
      const contract = TYPE_CONTRACTS[type]
      expect(contract, `${type} 未登记`).toBeTruthy()
      expect(widgetOf(type), `${type} 没声明成展示组件`).toBe(true)
      expect(contract!.field, `${type} 不能当字段控件出 v-model`).toBeUndefined()
      expect(contract!.self?.title?.emit, `${type} 的节点 title 落点不对`).toBe('attr')
      expect(contract!.self?.title?.on).toBe('el-form-item')
    }
    // 对照组：dash 族的节点 title 被渲染器置空，登记必须是 drop
    expect(TYPE_CONTRACTS['dash-kpi']!.self!.title!.emit).toBe('drop')
    // 组件自己有没有 title prop 与节点 title 的落点无关：PageDataChartPage 两者都有
    expect((PageChart as any).props.title).toBeTruthy()
    expect((PageSteps as any).props.title).toBeUndefined()
  })

  it('page_detail_steps_demo 三节点全登记：回读零空洞，标题出成 label', () => {
    const { source, holes, badRenames } = run(demoPage as any, 'page_detail_steps_demo')
    expect(holes, JSON.stringify(holes)).toEqual([])
    expect(badRenames, JSON.stringify(badRenames)).toEqual([])
    expect(source).toContain('<el-form-item label="客户服务流程">')
    expect(source).toContain('<el-form-item label="客户档案详情">')
    expect(source).toContain('<page-steps')
    expect(source).toContain('direction="horizontal"')
    // 步骤项与详情列都是数组/对象配置：具名常量，不裸写进属性
    expect(source).toMatch(/const items = \[/)
    expect(source).toMatch(/:items="items"/)
    expect(source).toMatch(/const columns = \[/)
    // page-detail 的详情列里带中文 label，值不能出现在模板属性里当裸字符串截断
    expect(source).toContain('Fyczmv3ks22dabc')
  })

  it('连续展示组件并成一段栅格：page-chart 与 dash-chart 同 row 各占 12', () => {
    const { source, holes, badRenames } = run(displayOnly(), 'tmp_size_align_verify')
    expect(holes, JSON.stringify(holes)).toEqual([])
    expect(badRenames, JSON.stringify(badRenames)).toEqual([])
    // 四个节点（两 dash-chart + 两 page-chart）都在同一段 el-row 里，各占一个 12 列
    const row = source.match(/<el-row>([\s\S]*?)<\/el-row>/)![1]
    expect(row.match(/<el-col class="fc-form-col" :span="12">/g)).toHaveLength(4)
    expect(row).toContain('<page-chart')
    expect(row).toContain('<dash-chart')
    // 显示高度是组件自己的 props：固定档落 300px，自适应档等于默认值省略不写
    expect(source).toMatch(/<page-chart[^>]*height="300px"/)
    expect(source.match(/<page-chart/g)).toHaveLength(2)
  })

  it('两个标题各出各的：节点 title 进 label，props.title 进组件标题行，互不覆盖', () => {
    const schema = displayOnly()
    schema.rule[2].title = '页面标题位'
    schema.rule[2].props.title = '组件标题行'
    const { source, holes, badRenames } = run(schema, 'tmp_size_align_verify')
    expect(holes, JSON.stringify(holes)).toEqual([])
    expect(badRenames, JSON.stringify(badRenames)).toEqual([])
    expect(source).toContain('<el-form-item label="页面标题位">')
    expect(source).toMatch(/<page-chart[^>]*title="组件标题行"/)
  })

  it('取数身份与页面 key：page-chart 走 ds-ref-id，page-detail 走 page-key（渲染器注入的输入面）', () => {
    const { source } = run(demoPage as any, 'page_detail_steps_demo')
    expect(source).toMatch(/<page-detail[^>]*:ds-ref-id="ds\.refId"/)
    expect(source).toMatch(/<page-detail[^>]*page-key="page_detail_steps_demo"/)
    expect(source).toMatch(/<page-table[^>]*page-key="page_detail_steps_demo"/)
    // page-steps 不取数：渲染器的数据组件名单里没有它，产物也不该给它塞身份槽位
    expect(source).not.toMatch(/<page-steps[^>]*ds-ref-id/)
    expect(TYPE_CONTRACTS['page-steps']!.props.dataSourceId).toBeUndefined()
  })

  it('语义债记账：详情的记录来源靠表格行点击联动 load(record)，产物没有这层必须登记出来', () => {
    const { gen } = run(demoPage as any, 'page_detail_steps_demo')
    const linkage = gen.manifest.unsupported.filter((u) => u.type === 'page-detail')
    expect(linkage.map((u) => u.key)).toEqual(['recordLinkage'])
    expect(linkage[0].message).toContain('load')
  })

  it('等于组件默认值的键省略不写，但仍进登记表（回读要补回来）', () => {
    const { source, gen, holes } = run(displayOnly(), 'tmp_size_align_verify')
    // 第二个 page-chart 的 height 是空串 = 自适应 = 组件默认（PageDataChartPage withDefaults）
    expect(source).not.toMatch(/<page-chart[^>]*height=""/)
    const elided = gen.manifest.nodes
      .filter((n) => n.type === 'page-chart')
      .flatMap((n) => n.warnings)
      .filter((w) => w.kind === 'default-elided')
    // 语料里只有 rule[3] 的 height 是空串（自适应 = 组件默认），props.title 这类键压根没配，
    // 所以省略登记只有一条 —— 配了非默认值时必须显式出码，见上一条用例
    expect(elided.map((w) => w.path)).toEqual(['props.height'])
    expect(holes, JSON.stringify(holes)).toEqual([])
  })

  it('三类都真声明了自己登记的 prop（错位 emit 静态面的前置，别拿契约虚报能力）', () => {
    const declared = (c: unknown) => {
      const p = (c as any).props
      return new Set<string>(Array.isArray(p) ? p : Object.keys(p || {}))
    }
    const map: Record<string, unknown> = { 'page-chart': PageChart, 'page-detail': PageDetail, 'page-steps': PageSteps }
    for (const [type, component] of Object.entries(map)) {
      const keys = Object.keys(TYPE_CONTRACTS[type]!.props).filter((k) => !k.includes('.') && k !== 'dataSourceId')
      for (const k of keys) {
        if (TYPE_CONTRACTS[type]!.props[k].emit !== 'prop') continue
        expect(declared(component).has(k), `${type} 没声明 ${k}`).toBe(true)
      }
    }
  })
})
