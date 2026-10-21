// ----- 仪表盘组件族（dash-*）出码登记：栅格载体 + 逐节点取数身份 -----
// 语料事实（__tests__/fixtures/corpus/tmp_*.json，现网验证页）：
//   · 每个 dash 节点同时带 rule.col.span（form-create 栅格真身）和 props.span（组件并排留白镜像），
//     PageDesigner.vue:819-823 双写，恒等但载体不同 —— 产物两侧都要出，出一侧就等于丢配置。
//   · 渲染器给 dash 节点置空 rule.title/info（PageRendererPage.vue:522-523），可见标题是 props.title；
//     但它照样被 form-create 套了 el-col.fc-form-col > el-form-item > __content —— 撑满档
//     （props.height='100%'）就靠这条链传高度（dash-fill-height.css:16-19），产物少了这层就静默退化。
//   · 同类型多实例（tmp_notice_verify 两个 dash-notice、tmp_size_align_verify 两个 dash-chart）
//     必须在产物里各回各的元素，否则回读拿第一个元素的属性套所有同类节点，零空洞是假的。
// 跑：npx vitest run src/views/page/codegen/__tests__/dash-widgets.test.ts

import { describe, expect, it } from 'vitest'

import { TYPE_CONTRACTS, widgetOf } from '../contract'
import { generatePage, type GeneratedManifest } from '../generate'
import { reverseToSchema } from '../reverse'
import noticePage from './fixtures/corpus/tmp_notice_verify.json'
import sizePage from './fixtures/corpus/tmp_size_align_verify.json'
import todoPage from './fixtures/corpus/tmp_dash_todo_verify.json'

const DASH_TYPES = ['dash-filter', 'dash-kpi', 'dash-chart', 'dash-notice', 'dash-todo']

/**
 * tmp_size_align_verify 后半段是 page-chart（仍未登记，整节点广度债）。
 * 只取前两个 dash-chart 节点做用例，免得把 A 桶的必然空洞混进本文件的零断言之里。
 */
const dashChartsOnly = () => {
  const schema = JSON.parse(JSON.stringify(sizePage))
  schema.rule = schema.rule.slice(0, 2)
  return schema
}

function run(schema: Record<string, any>, key: string): { source: string; manifest: GeneratedManifest; holes: unknown[]; badRenames: unknown[] } {
  const gen = generatePage(schema as any, { pageKey: key, pageName: key, exportedAt: 'dash-widgets' })
  const vue = Object.keys(gen.files).find((f) => f.endsWith('.vue'))!
  const rev = reverseToSchema(schema as any, gen.files[vue], gen.manifest)
  return {
    source: gen.files[vue],
    manifest: gen.manifest,
    holes: rev.holes,
    badRenames: rev.renameChecks.filter((r) => !r.ok),
  }
}

describe('dash 组件族登记', () => {
  it('5 类都是展示组件：有契约、进栅格、不是字段控件（无 v-model）', () => {
    for (const type of DASH_TYPES) {
      const contract = TYPE_CONTRACTS[type]
      expect(contract, `${type} 未登记`).toBeTruthy()
      expect(widgetOf(type), `${type} 没声明成展示组件`).toBe(true)
      expect(contract!.field, `${type} 不能当字段控件出 v-model`).toBeUndefined()
      // 可见标题来自 props.title，节点 title 被渲染器置空
      expect(contract!.self?.title?.emit, `${type} 的节点 title 仍会落到标签上`).toBe('drop')
    }
  })

  it('栅格载体：el-row > el-col.fc-form-col :span=rule.col.span > 空 el-form-item > 组件', () => {
    const { source, holes, badRenames } = run(noticePage, 'tmp_notice_verify')
    expect(source).toContain('<el-row>')
    expect(source.match(/<el-col class="fc-form-col" :span="12">/g)).toHaveLength(2)
    expect(source).toContain('<el-col class="fc-form-col" :span="24">')
    // 三节点都是 dash，标题来自 props.title，所以 el-form-item 一律不带 label
    expect(source.match(/<el-form-item>/g)).toHaveLength(3)
    expect(source).not.toMatch(/<el-form-item label=/)
    expect(holes, JSON.stringify(holes)).toEqual([])
    expect(badRenames, JSON.stringify(badRenames)).toEqual([])
  })

  it('同类型两实例各自寻址：改错第二个的属性，回读必须报差异', () => {
    const { source, manifest } = run(noticePage, 'tmp_notice_verify')
    expect(source.match(/lc:node="n\d+"/g)).toHaveLength(3)
    const noticeNodes = manifest.nodes.filter((n) => n.type === 'dash-notice')
    expect(noticeNodes.map((n) => n.host.tag)).toEqual(['dash-notice', 'dash-notice'])
    // 列表卡与轮播卡的差异只在 interval（4000 vs 3000）与 display
    const tampered = source.replace(':interval="3000"', ':interval="4000"')
    expect(tampered).not.toBe(source)
    const rev = reverseToSchema(noticePage as any, tampered, manifest)
    expect(rev.holes.some((h) => h.path === 'rule[1].props.interval'), JSON.stringify(rev.holes)).toBe(true)
  })

  it('span 双载体各出各的：col.span 进栅格，props.span 进组件留白', () => {
    const { source } = run(noticePage, 'tmp_notice_verify')
    const colLine = source.match(/<el-col class="fc-form-col" :span="12">/)![0]
    const widgetLine = source.match(/<dash-notice[^>]*>/)![0]
    expect(colLine).toContain(':span="12"')
    expect(widgetLine).toContain(':span="12"')
  })

  it('无数据源的成员（待办清单/公告栏）不许出现取数身份槽位', () => {
    const { source, holes, badRenames, manifest } = run(todoPage, 'tmp_dash_todo_verify')
    expect(source).toContain('<dash-todo')
    expect(source).toContain('view="todo"')
    expect(source).toContain(':limit="5"')
    expect(source).toContain('order-by="priority"')
    expect(source).not.toContain('ds-ref-id')
    // 筛选器节点 title 被渲染器置空，可见标签是 props.label
    expect(source).not.toContain('筛选器"')
    expect(holes, JSON.stringify(holes)).toEqual([])
    expect(badRenames, JSON.stringify(badRenames)).toEqual([])
    // 唯一允许的语义债：广播接线在渲染器里，产物没有
    expect(
      manifest.unsupported.filter((u) => !(u.type === 'dash-filter' && u.key === 'autoBroadcast')),
      JSON.stringify(manifest.unsupported),
    ).toEqual([])
  })

  it('逐节点取数身份：绑第二个数据源的组件不许沿用第一个源的 ds.refId', () => {
    const schema = dashChartsOnly()
    schema.dataSources.push({ id: 'ds_b', refId: 'ref-bbbbbbbbbbbbbbbbbbbbbbbbbbbb' })
    schema.rule[1].props.dataSourceId = 'ds_b'
    const { source, holes, badRenames } = run(schema, 'tmp_size_align_verify')
    expect(source).toContain(':ds-ref-id="ds.refId"')
    expect(source).toContain(":ds-ref-id=\"dataSources['ds_b']\"")
    expect(holes, JSON.stringify(holes)).toEqual([])
    expect(badRenames, JSON.stringify(badRenames)).toEqual([])
  })

  it('组件级 filter 是 JSON 文本：含双引号的字符串不能裸写进属性，否则模板被截断', () => {
    const schema = dashChartsOnly()
    schema.rule[0].props.filter = '{"conditions": [{"column": "status", "op": "eq", "value": "running"}], "logic": "AND"}'
    const { source, holes, badRenames } = run(schema, 'tmp_size_align_verify')
    expect(source).toContain(':filter="filter"')
    expect(source).toMatch(/const filter = /)
    expect(source).not.toMatch(/\sfilter="/)
    expect(holes, JSON.stringify(holes)).toEqual([])
    expect(badRenames, JSON.stringify(badRenames)).toEqual([])
  })

  it('等于组件默认值的键省略不写，但仍进登记表（回读要补回来）', () => {
    // metric / timeGrain 的组件默认就是 null（DashChart.vue withDefaults）
    const { source, manifest, holes } = run(dashChartsOnly(), 'tmp_size_align_verify')
    expect(source).not.toMatch(/\smetric=/)
    expect(source).not.toMatch(/\stime-grain=/)
    const elided = manifest.nodes
      .filter((n) => n.type === 'dash-chart')
      .flatMap((n) => n.warnings)
      .filter((w) => w.kind === 'default-elided' && /metric|timeGrain/.test(w.path))
    expect(elided.map((w) => w.path).sort()).toEqual(['props.metric', 'props.metric', 'props.timeGrain', 'props.timeGrain'])
    expect(holes, JSON.stringify(holes)).toEqual([])
  })
})
