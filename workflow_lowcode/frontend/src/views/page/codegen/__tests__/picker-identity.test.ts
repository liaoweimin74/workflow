// ----- 选择器的取数身份：绑定 id 递不出产物，写进模板就是死接线 -----
// dataPicker / LookupPicker 的 props.dataSourceId 存的是「页面级数据源绑定 id」（ds_xxx），
// 组件运行期拿它去 activeDsBindings 查 refId 才取到数：
//   · DataPicker.vue:259-265  binding?.refId || props.globalDataSourceId || ''
//   · LookupPicker.vue:111-117 binding?.refId || ''（没有第二条入口）
// activeDsBindings 是模块级单例（utils/formDsBindingsStore.ts:19），只有 FormRenderer.vue:333-341、
// PageRendererPage.vue:300 和设计器会写。出码产物是独立页、不挂渲染器，这张表恒空 ——
// 把 ds_xxx 原样写进产物，选择器点开是一片空列表，配置看着接上了其实没接。
// 所以 dataSourceId 不许透传，要换算成 refId 递进组件已有的入口（DataPicker 的 globalDataSourceId）。
// LookupPicker 本轮不动：它没有可用入口，组件侧不表态就出不了诚实的产物（见 spike 7F）。
// 语料：cardlist_test / cardlistpage / cardviewlist 各 2 个 dataPicker + 1 个 LookupPicker，
//       绑的都是非首个数据源 —— 正好验「逐节点查产物常量表」，不能沿用第一源的 ds.refId。
// 附带结论（不在本轮做）：DataPicker 的 filter/filters/dependOn 里 field 型条件走
//       formCreateInject.api.getValue（DataPicker.vue:399、:539），只 inject 不读 prop，独立页
//       伪造不了；语料里这三个键一个都没配（0 现网样本），先记在这里，别为它造接线。
// 跑：npx vitest run src/views/page/codegen/__tests__/picker-identity.test.ts

import { describe, expect, it } from 'vitest'

import DataPicker from '@lc/runtime/dataPicker'
import LookupPicker from '@lc/runtime/LookupPicker'

import { TYPE_CONTRACTS } from '../contract'
import { generatePage } from '../generate'
import { reverseToSchema } from '../reverse'
import page from './fixtures/corpus/cardlist_test.json'

const clone = () => JSON.parse(JSON.stringify(page)) as Record<string, any>

function run(schema: Record<string, any>) {
  const gen = generatePage(schema as any, {
    pageKey: 'cardlist_test',
    pageName: 'cardlist_test',
    exportedAt: 'picker-identity',
  })
  const vue = Object.keys(gen.files).find((f) => f.endsWith('.vue'))!
  const source = gen.files[vue]
  const rev = reverseToSchema(schema as any, source, gen.manifest)
  return { gen, source, holes: rev.holes, renames: rev.renameChecks }
}

const declared = (c: unknown): Set<string> => {
  const p = (c as any).props
  return new Set<string>(Array.isArray(p) ? p : Object.keys(p || {}))
}

/** 容器里那个绑仓库档案的 dataPicker（rule[1].props.rule[6]） */
const DP_PATH = 'rule[1].props.rule[6]'
const DP_DS = 'ds_mvck4gv92'
const DP_REF = '58c300fb631946c799ab07b8198a2a2b'

describe('选择器取数身份', () => {
  it('根据要站得住：DataPicker 有 globalDataSourceId 逃生口，LookupPicker 没有', () => {
    expect(declared(DataPicker).has('globalDataSourceId'), '组件没这个 prop，改名就是错位 emit').toBe(true)
    // 这条断言是 spike 7F 的前置：哪天给 LookupPicker 补了入口，它会红，提醒一起改登记
    expect(declared(LookupPicker).has('globalDataSourceId'), 'LookupPicker 补了入口，本轮登记要跟着改').toBe(false)
  })

  it('dataPicker 出 refId 不出绑定 id：查产物常量表，各节点各源', () => {
    const { source } = run(clone())
    expect(source).toMatch(new RegExp(`<dataPicker[^>]*:global-data-source-id="dataSources\\['${DP_DS}'\\]"`))
    // 注意别写成 data-source-id=：global-data-source-id 也含这段，必须要求它前面是空格
    expect(source).not.toMatch(new RegExp(`<dataPicker[^>]*\\sdata-source-id=`))
    // 登记面同步表态：透传入口已经没了，契约里 dataSourceId 必须是 derived
    expect(TYPE_CONTRACTS.dataPicker!.props.dataSourceId).toMatchObject({ emit: 'derived', by: 'globalDataSourceId' })
    expect(TYPE_CONTRACTS.dataPicker!.requires?.find((r) => r.key === 'dataSourceId'), '身份已解决，不许再挂死债').toBeUndefined()
  })

  it('绑首个源的也查表：不给「第一个数据源」开后门，同页多源时才不会全页共用一个 refId', () => {
    const schema = clone()
    schema.rule[1].props.rule[6].props.dataSourceId = 'ds_mvck4gv9'
    const { source } = run(schema)
    expect(source).toMatch(new RegExp(`<dataPicker[^>]*:global-data-source-id="dataSources\\['ds_mvck4gv9'\\]"`))
  })

  it('回读：refId 反查回绑定 id，dataSourceId 这条键往返不差', () => {
    const { holes, renames } = run(clone())
    const mine = (p: string) => String(p).startsWith(DP_PATH) && String(p).includes('dataSourceId')
    expect(holes.filter((h) => mine(String(h.path))), JSON.stringify(holes.filter((h) => mine(String(h.path))))).toEqual([])
    const check = renames.find((r) => mine(String(r.path)))
    expect(check, '没有这条改名核对，回读就是没验证据').toBeTruthy()
    expect(check!.ok, JSON.stringify(check)).toBe(true)
    expect(check!.to).toBe('derived:globalDataSourceId')
    // 核对的是「反查回来的值」等于 schema 的绑定 id：证据链走产物常量表
    // （dataSources['ds_mvck4gv92'] → 58c300... → 反查回 ds_mvck4gv92），
    // 表里的 refId 被手改就反查不到源，回读立刻报差异。
    expect(check!.artifact).toBe(DP_DS)
    expect(check!.schema).toBe(DP_DS)
    expect(run(clone()).source).toContain(`'${DP_DS}': '${DP_REF}'`)
  })

  it('LookupPicker 无入口：继续透传绑定成语义债，不许假接线', () => {
    const { gen, source } = run(clone())
    // 现状照实出：产物里就是那个查不到东西的绑定 id
    expect(source).toMatch(/<LookupPicker[^>]*data-source-id="ds_mvck4gv91"/)
    const debt = gen.manifest.unsupported.filter((u) => u.type === 'LookupPicker' && u.key === 'dataSourceId')
    expect(debt.length).toBeGreaterThan(0)
    expect(debt[0].message).toContain('globalDataSourceId')
  })
})
