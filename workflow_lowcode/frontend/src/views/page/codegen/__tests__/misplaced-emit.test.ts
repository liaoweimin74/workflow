// ----- 错位 emit 口径：产物写在 runtime 标签上的属性，组件必须真声明这个 prop -----
// 语料体检的 C 桶只算「丢了什么 / 多造了什么」，看不见另一种错：值写到了组件根本不认的属性名上。
// 撞见的第一条 —— 卡片节点出成 <page-list-cards title="卡片列表">，而 PageDataCards 没有 title prop。
// 渲染器不往组件传节点 title（form-create 自己拿它当 el-form-item 的 label，真机上标题本来看得见），
// 所以这个写法只在产物里成立：值落到组件根 DOM 变成浏览器原生 tooltip，回读却照样零差异。
// 这条口径要靠组件自己说话，不能靠契约表的注释：
//   用例2 静态面 —— 契约里登记成 prop/attr 的键，逐个查组件运行时 props 表（不依赖语料有没有配）
//   用例3 产物面 —— 语料 + test_page 真出码，扫模板里 runtime 标签上的属性名（抓契约之外多写的）
// npx vitest run src/views/page/codegen/__tests__/misplaced-emit.test.ts

import { describe, expect, it } from 'vitest'

import DataPicker from '@lc/runtime/dataPicker'
import FormulaField from '@lc/runtime/FormulaField'
import LookupPicker from '@lc/runtime/LookupPicker'
import PageListCards from '@lc/runtime/page-list-cards'
import PageTable from '@lc/runtime/page-table'

import { TYPE_CONTRACTS } from '../contract'
import { generatePage } from '../generate'
import corpusTestPage from './fixtures/test_page.schema.json'

const corpus = import.meta.glob('./fixtures/corpus/*.json', { eager: true, import: 'default' }) as Record<
  string,
  Record<string, any>
>

// test_page 不在语料里，但它是唯一带按钮的 page-table 载体（同 external-wiring.test.ts 的取舍）
const pages = [
  ...Object.entries(corpus).map(([p, schema]) => ({ key: p.split('/').pop()!.replace('.json', ''), schema })),
  { key: 'test_page', schema: corpusTestPage },
]
  .sort((a, b) => a.key.localeCompare(b.key))

/** runtime 标签 → 组件（@lc/runtime 还没成包，这里走 src/lc-runtime/ 的 shim，指向的就是真组件） */
const RUNTIME_COMPONENTS: Record<string, unknown> = {
  'page-table': PageTable,
  'page-list-cards': PageListCards,
  dataPicker: DataPicker,
  LookupPicker,
  FormulaField,
}

const camelize = (s: string) => s.replace(/-(\w)/g, (_m, c) => String(c).toUpperCase())

/** 组件声明的 prop 名（script setup 的 defineProps 编译后就是运行时 props 表） */
function declaredProps(component: unknown): Set<string> {
  const props = (component as { props?: Record<string, unknown> | string[] }).props
  if (!props) throw new Error('组件没有运行时 props，口径失效')
  const keys = Array.isArray(props) ? props : Object.keys(props)
  return new Set(keys.map(camelize))
}

/** 产物模板里某个 runtime 标签上写的配置属性名（事件、指令、ref 不是配置，不参与核对） */
function emittedAttrs(source: string, tag: string): string[] {
  const out = new Set<string>()
  const re = new RegExp(`<${tag}\\b([^>]*?)/?>`, 'g')
  for (const m of source.matchAll(re)) {
    for (const a of m[1].matchAll(/([A-Za-z_:@#][\w:.-]*)(?:="[^"]*")?/g)) {
      const raw = a[1]
      if (raw.startsWith('@') || raw.startsWith('#') || raw.startsWith('v-')) continue
      const name = raw.startsWith(':') ? raw.slice(1) : raw
      if (['ref', 'key', 'class', 'style'].includes(name)) continue
      out.add(camelize(name))
    }
  }
  return [...out]
}

/** 全语料跑一遍，返回每条错位：页面 / 标签 / 属性 */
function misplaced(): Array<{ page: string; tag: string; attr: string }> {
  const bad: Array<{ page: string; tag: string; attr: string }> = []
  for (const { key, schema } of pages) {
    const gen = generatePage(schema as any, { pageKey: key, pageName: key, exportedAt: 'misplaced-emit' })
    const vue = Object.keys(gen.files).find((f) => f.endsWith('.vue'))!
    const source = gen.files[vue]
    for (const [tag, component] of Object.entries(RUNTIME_COMPONENTS)) {
      const declared = declaredProps(component)
      for (const attr of emittedAttrs(source, tag)) {
        if (!declared.has(attr)) bad.push({ page: key, tag, attr })
      }
    }
  }
  return bad
}

describe('错位 emit 口径', () => {
  it('根据要站得住：两个列表组件确实没声明 title，标题落到模板上就是错位', () => {
    expect(declaredProps(PageListCards).has('title')).toBe(false)
    expect(declaredProps(PageTable).has('title')).toBe(false)
  })

  it('契约表不许虚报能力：登记成 prop/attr 的键，组件必须真声明（不看语料有没有配）', () => {
    const bad: Array<{ type: string; key: string }> = []
    for (const [type, contract] of Object.entries(TYPE_CONTRACTS)) {
      if (!contract.runtime) continue
      const declared = declaredProps(RUNTIME_COMPONENTS[contract.tag])
      for (const [key, entry] of Object.entries({ ...contract.self, ...contract.props })) {
        // 深层键（viewDetail.formMode）是父块的派生说明，落点由父键承担
        if (key.includes('.')) continue
        if (entry.emit !== 'prop' && entry.emit !== 'attr') continue
        if (entry.emit === 'attr' && entry.on) continue
        const leaf = camelize(entry.as ?? key.split('[].').pop()!)
        if (!declared.has(leaf)) bad.push({ type, key })
      }
    }
    expect(bad, JSON.stringify(bad)).toEqual([])
  })

  it('组件属性面就是契约面：产物写出去的每个属性都得在组件 props 里', () => {
    const bad = misplaced()
    expect(bad, JSON.stringify(bad)).toEqual([])
  })

  it('丢弃要有归属：消掉错位 emit 的类型，其 title 必须进登记（不许静默丢）', () => {
    for (const type of ['page-table', 'page-list-cards']) {
      const entry = TYPE_CONTRACTS[type].self?.title
      expect(entry, `${type} 的 title 落点未登记`).toBeTruthy()
      expect(entry!.emit, `${type} 的 title 仍会在非默认值时落模板`).toBe('drop')
    }
  })
})
