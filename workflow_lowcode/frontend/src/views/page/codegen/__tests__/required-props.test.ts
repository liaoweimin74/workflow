// ----- 组件必填输入面：产物必须把声明成 required 的 prop 传齐 -----
// 错位 emit 管的是「写到了组件不认的属性名上」，这一头是同一枚硬币的反面：
// 「组件认而且必需的属性，产物压根没写」。撞见的第一条 ——
//   <page-table> 出码时没传 page-key，而 PageDataTable.vue:185-187 的 pageKey 是
//   必填且无默认值，:723 还拿它拼 Excel 导入导出的 URL。现网不会露，因为
//   PageRendererPage.vue:553 对数据组件统一注入 props.pageKey；产物没有这层注入，
//   漏传就是运行时缺参告警 + 导出指向空页面 key。
// 值也要钉：pageKey 不在 schema 里（属产物侧接线，走 wireOnly 归属登记），
// 回读器不会比它的值，所以「传了但传成别的页面」得由本文件的口径来管。
// npx vitest run src/views/page/codegen/__tests__/required-props.test.ts

import { describe, expect, it } from 'vitest'

import DataPicker from '@lc/runtime/dataPicker'
import DashChart from '@lc/runtime/dash-chart'
import DashFilter from '@lc/runtime/dash-filter'
import DashKpi from '@lc/runtime/dash-kpi'
import DashNotice from '@lc/runtime/dash-notice'
import DashTodo from '@lc/runtime/dash-todo'
import FormulaField from '@lc/runtime/FormulaField'
import LookupPicker from '@lc/runtime/LookupPicker'
import PageChart from '@lc/runtime/page-chart'
import PageDetail from '@lc/runtime/page-detail'
import PageListCards from '@lc/runtime/page-list-cards'
import PageSteps from '@lc/runtime/page-steps'
import PageTable from '@lc/runtime/page-table'

import { TYPE_CONTRACTS } from '../contract'
import { generatePage } from '../generate'

const corpus = import.meta.glob('./fixtures/corpus/*.json', { eager: true, import: 'default' }) as Record<
  string,
  Record<string, any>
>

const pages = Object.entries(corpus)
  .map(([p, schema]) => ({ key: p.split('/').pop()!.replace('.json', ''), schema }))
  .sort((a, b) => a.key.localeCompare(b.key))

/** runtime 标签 → 组件（与 misplaced-emit 同一份 shim 口径） */
const RUNTIME_COMPONENTS: Record<string, unknown> = {
  'page-table': PageTable,
  'page-list-cards': PageListCards,
  'dash-filter': DashFilter,
  'dash-kpi': DashKpi,
  'dash-chart': DashChart,
  'dash-notice': DashNotice,
  'dash-todo': DashTodo,
  'page-chart': PageChart,
  'page-detail': PageDetail,
  'page-steps': PageSteps,
  dataPicker: DataPicker,
  LookupPicker,
  FormulaField,
}

const camelize = (s: string) => s.replace(/-(\w)/g, (_m, c) => String(c).toUpperCase())

/** 组件声明的必填 prop（defineProps 编译后 required: true，没有默认值才会是 true） */
function requiredProps(component: unknown): Set<string> {
  const props = (component as { props?: Record<string, any> | string[] }).props
  if (!props) throw new Error('组件没有运行时 props，口径失效')
  const entries = Array.isArray(props) ? props.map((k) => [k, {}] as const) : Object.entries(props)
  return new Set(entries.filter(([, d]) => (d as any).required === true).map(([k]) => camelize(k)))
}

/**
 * 函数型 prop 不在产物可造面内：schema 里存不下函数，产物侧也没有能序列化出来的取值。
 * 唯一撞到的例子是 LookupPicker 的 fetchApi —— 它声明成必填，但低代码链路从不传它
 * （组件内 fetchData 走 dataSourceApi.queryData(dsRefId)，全程没读过 props.fetchApi，
 * LookupPicker.vue:220-254），传它的是 PageListPage 这类手写页面。
 * 所以这条不是出码的活，是组件侧的声明该改成可选；本口径把它显式排除，别让它把产物逼成假接线。
 */
function functionTypedProps(component: unknown): Set<string> {
  const props = (component as { props?: Record<string, any> }).props
  if (!props) return new Set()
  const fn = (v: any) => {
    const t = v?.type
    return t === Function || (Array.isArray(t) && t.includes(Function))
  }
  return new Set(Object.entries(props).filter(([, d]) => fn(d)).map(([k]) => camelize(k)))
}

/** 产物模板里某个 runtime 标签上写的属性名（含 v-bind，指令/事件/节点地址不算） */
function attrsOnTag(source: string, tag: string): Set<string> {
  const out = new Set<string>()
  for (const m of source.matchAll(new RegExp(`<${tag}\\b([^>]*?)/?>`, 'g'))) {
    for (const a of m[1].matchAll(/([A-Za-z_:@#][\w:.-]*)(?:="[^"]*")?/g)) {
      const raw = a[1]
      if (raw.startsWith('@') || raw.startsWith('#') || raw.startsWith('v-')) continue
      const name = raw.startsWith(':') ? raw.slice(1) : raw
      if (name.startsWith('lc:')) continue
      out.add(camelize(name))
    }
  }
  return out
}

/** v-model 也算一个输入：字段控件的必填面在现网是 v-model 喂的 */
function vModelOnTag(source: string, tag: string): boolean {
  return new RegExp(`<${tag}\\b[^>]*v-model=`).test(source)
}

function missing(): Array<{ page: string; tag: string; prop: string }> {
  const bad: Array<{ page: string; tag: string; prop: string }> = []
  for (const { key, schema } of pages) {
    const gen = generatePage(schema as any, { pageKey: key, pageName: key, exportedAt: 'required-props' })
    const vue = Object.keys(gen.files).find((f) => f.endsWith('.vue'))!
    const source = gen.files[vue]
    for (const [tag, component] of Object.entries(RUNTIME_COMPONENTS)) {
      if (!source.includes(`<${tag}`)) continue
      const written = attrsOnTag(source, tag)
      const fns = functionTypedProps(component)
      for (const p of requiredProps(component)) {
        // 模型值由 v-model 提供，不要求产物再写一遍同名属性
        if (p === 'modelValue' && vModelOnTag(source, tag)) continue
        if (fns.has(p)) continue
        if (!written.has(p)) bad.push({ page: key, tag, prop: p })
      }
    }
  }
  return bad
}

describe('组件必填输入面', () => {
  it('根据站得住：page-table 的 pageKey 必填无默认，page-list-cards 的是可选，dash 族根本没声明', () => {
    expect(requiredProps(PageTable).has('pageKey')).toBe(true)
    expect(requiredProps(PageListCards).has('pageKey')).toBe(false)
    expect(requiredProps(DashKpi).has('pageKey')).toBe(false)
    // 渲染器注入 pageKey 的类型集合（PageRendererPage.vue:552-553）里，已登记的就这两个列表组件
    const withPageKey = Object.entries(TYPE_CONTRACTS)
      .filter(([, c]) => (c as any).needsPageKey)
      .map(([t]) => t)
      .sort()
    expect(withPageKey).toEqual(['page-chart', 'page-detail', 'page-list-cards', 'page-table'])
  })

  it('产物不许漏传组件必填 prop', () => {
    expect(missing(), JSON.stringify(missing())).toEqual([])
  })

  it('排除是有据的排除：函数型必填 prop 只有 LookupPicker 一个，且低代码链路本来就不传', () => {
    // 若哪天多了第二个函数型必填 prop，这条会红 —— 逼着眼看一遍是不是又在静默放水
    const fnRequired = Object.entries(RUNTIME_COMPONENTS)
      .flatMap(([tag, c]) => [...requiredProps(c)].filter((p) => functionTypedProps(c).has(p)).map((p) => `${tag}.${p}`))
      .sort()
    expect(fnRequired).toEqual(['LookupPicker.fetchApi'])
    expect(requiredProps(LookupPicker).has('fetchApi')).toBe(true)
  })

  it('传了还得传对：page-key 的值就是这个页面的 key', () => {
    // pageKey 属产物侧接线（schema 里没有），回读器不会比它的值，所以在这里钉死
    for (const { key, schema } of pages) {
      const gen = generatePage(schema as any, { pageKey: key, pageName: key, exportedAt: 'required-props' })
      const vue = Object.keys(gen.files).find((f) => f.endsWith('.vue'))!
      const values = [...gen.files[vue].matchAll(/<page-table\b[^>]*\bpage-key="([^"]*)"/g)].map((m) => m[1])
      if (!values.length) continue
      expect(values, key).toEqual(values.map(() => gen.manifest.source.pageKey))
    }
  })

  it('接线归属登记齐：pageKey 进 wireOnly，回读不会把它当多造', () => {
    for (const { key, schema } of pages) {
      const gen = generatePage(schema as any, { pageKey: key, pageName: key, exportedAt: 'required-props' })
      if (!Object.keys(gen.files).some((f) => gen.files[f].includes('<page-table'))) continue
      for (const n of gen.manifest.nodes) {
        if (n.host.tag === 'page-table' || n.host.tag === 'page-list-cards') {
          expect(n.wireOnly, `${key} ${n.host.tag} 的 pageKey 未登记归属`).toContain('pageKey')
        }
      }
    }
  })
})
