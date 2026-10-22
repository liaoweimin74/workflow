/**
 * fcTable（布局表格）出码与几何回读。
 *
 * 运行期组件 src/vendor/components/table/Table.vue 的语义：props.rule 是
 * { row, col, style, class, layout }，layout 每项 {top,left,row,col} 从 (top,left) 起合并；
 * 子节点在 node.children 且带 slot:"行:列" 地址（可落在被合并覆盖的格里，由 home 格渲染）。
 * 产物出静态 <table>，几何回读靠 td 坐标 + colspan/rowspan 反推 layout。
 *
 * 真机 A/B（2026-10-22，worktree dev :3200）：
 *   现网 /dashboard vs 产物 /codegen-probe，同一份 dashboard 语料（2 行 3 列，layout 1:1 跨 2 列）。
 *   结构：两边都是 2 行 5 个可见格，row1 col1 为 colspan=2，逐格文本一致，5 个 dash 组件各就其位。
 *   几何：固定列宽 327/270 与行高 183/309 完全一致；table 总高 493 vs 492（±1px 取整）。
 *   剩余差异：末列 186 vs 195、表宽 784 vs 792 —— 探测页与现网页面的外层容器宽度不同（左沿差 5px），
 *   余量列吸收该差值，不是表格几何错误。
 *   本轮查出并修掉：产物曾给整张表多包一层 el-form-item，命中 EP 的
 *   `.el-form-item .el-form-item { margin-bottom: 0 }`，格内组件下边距被吃掉，每行矮 18px。
 *   现网 fcTable 外层只有 el-col（rule 无 field，form-create 不包壳），契约里 title 因此按丢弃登记。
 */
import { describe, expect, it } from 'vitest'

import { generatePage } from '../generate'
import { reverseToSchema } from '../reverse'

import rich from './fixtures/fc-table/rich.json'
import plain from './fixtures/fc-table/plain.json'
import dashboard from './fixtures/corpus/dashboard.json'

const gen = (schema: any, key = 'fc_table_rich') =>
  generatePage(JSON.parse(JSON.stringify(schema)), { pageKey: key, pageName: key, exportedAt: 'fixture' })

const vueOf = (schema: any, key?: string) => {
  const res = gen(schema, key)
  const name = Object.keys(res.files).find((f) => f.endsWith('.vue'))!
  return { res, vue: res.files[name] }
}

const tdBlocks = (vue: string): string[] => vue.match(/<td\b[^>]*>[\s\S]*?<\/td>/g) || []
/** td 开标签本身：格内子组件也会带 class（el-col.fc-form-col），判格属性不能扫整块 */
const tdOpen = (block: string): string => block.match(/^<td\b[^>]*>/)?.[0] ?? ''

describe('fcTable 几何出码（3×4：跨行跨列合并 + 空单元格 + 被覆盖格有子节点）', () => {
  it('按 row/col 铺 tr/td，合并格带 colspan/rowspan，空单元格也出', () => {
    const { vue } = vueOf(rich)
    expect((vue.match(/<tr>/g) || []).length).toBe(3)
    const tds = tdBlocks(vue)
    // 可见格：row0 三格（home 2×2 + 0:2 + 0:3）、row1 两格（1:2、1:3）、row2 一格（1×4）
    expect(tds.length).toBe(6)
    expect(tds.filter((x) => x.includes('colspan="2"') && x.includes('rowspan="2"')).length).toBe(1)
    expect(tds.filter((x) => x.includes('colspan="4"')).length).toBe(1)
  })

  it('列宽与格样式落 td，合并 home 的 style/class 按 "行:列" 取', () => {
    const { vue } = vueOf(rich)
    const home = tdBlocks(vue).find((x) => x.includes('colspan="2"') && x.includes('rowspan="2"'))!
    expect(home).toContain('style="width: 200px; height: 120px"')
    expect(home).toContain('class="hero-cell"')
    const empty = tdBlocks(vue).find((x) => x.includes('colspan="1"') && x.includes('rowspan="1"') && x.includes('style="width: 120px"'))
    expect(empty).toBeTruthy()
  })

  it('子节点按 slot 入格：被合并覆盖的 1:1 归到 home 格，且在 home 子的后面', () => {
    const { vue } = vueOf(rich)
    const home = tdBlocks(vue).find((x) => x.includes('colspan="2"') && x.includes('rowspan="2"'))!
    expect(home).toContain('type=dash-todo')
    expect(home).toContain('type=dash-kpi')
    expect(home.indexOf('type=dash-todo')).toBeLessThan(home.indexOf('type=dash-kpi'))
    // 每个子节点都保留 lc:node 地址与 slot 锚点
    expect(home).toContain('lc:node="n1.f1"')
    expect(home).toContain('slot=1:1')
    const wide = tdBlocks(vue).find((x) => x.includes('colspan="4"'))!
    expect(wide).toContain('type=dash-notice')
  })

  it('manifest 登记 fcTable 与全部 slot 子节点，runtime 依赖含子组件', () => {
    const { res } = vueOf(rich)
    expect(res.manifest.nodes.filter((n) => n.rulePath.startsWith('rule')).map((n) => n.type)).toEqual([
      'fcTable',
      'dash-todo',
      'dash-kpi',
      'dash-chart',
      'dash-notice',
    ])
    expect(res.manifest.runtime.components).toEqual(['dash-todo', 'dash-kpi', 'dash-chart', 'dash-notice'])
    const anchors = res.manifest.nodes.map((n) => n.anchor)
    expect(anchors[1]).toContain('slot=0:0')
    expect(anchors[2]).toContain('slot=1:1')
    expect(res.manifest.unsupported.filter((u) => u.type === 'fcTable')).toEqual([])
  })

  it('回读零空洞，几何与 slot 逐键还原', () => {
    const { res, vue } = vueOf(rich)
    const back = reverseToSchema(JSON.parse(JSON.stringify(rich)), vue, res.manifest)
    expect(back.holes).toEqual([])
    expect(back.renameChecks.filter((r) => !r.ok)).toEqual([])
    expect(back.rebuilt.rule[0].props.rule).toEqual(rich.rule[0].props.rule)
    expect(back.rebuilt.rule[0].children.map((c: any) => c.slot)).toEqual(['0:0', '1:1', '0:3', '2:2'])
  })
})

describe('fcTable 无合并形态', () => {
  it('1×2 空 layout 不产出合并属性，td 上也没有 style/class', () => {
    const { vue } = vueOf(plain, 'fc_table_plain')
    const tds = tdBlocks(vue)
    expect(tds.length).toBe(2)
    expect(tds.every((x) => x.includes('colspan="1"') && x.includes('rowspan="1"'))).toBe(true)
    expect(tds.some((x) => tdOpen(x).includes('style=') || tdOpen(x).includes('class='))).toBe(false)
  })

  it('回读零空洞，layout/style/class 还原成空容器', () => {
    const { res, vue } = vueOf(plain, 'fc_table_plain')
    const back = reverseToSchema(JSON.parse(JSON.stringify(plain)), vue, res.manifest)
    expect(back.holes).toEqual([])
    expect(back.rebuilt.rule[0].props.rule).toEqual({ row: 1, col: 2, style: {}, class: {}, layout: [] })
  })
})

describe('fcTable 变异用例：产物被改坏必须报差异', () => {
  it('改错 slot：锚点地址与几何格不一致时报值不一致', () => {
    const { res, vue } = vueOf(rich)
    const bad = vue.replace('slot=0:3', 'slot=0:2')
    expect(bad).not.toBe(vue)
    const back = reverseToSchema(JSON.parse(JSON.stringify(rich)), bad, res.manifest)
    expect(back.holes.some((h) => h.path === 'rule[0].children[2].slot')).toBe(true)
  })

  it('改错 colspan：合并几何与 layout 登记对不上', () => {
    const { res, vue } = vueOf(rich)
    const bad = vue.replace('colspan="2" rowspan="2"', 'colspan="1" rowspan="2"')
    expect(bad).not.toBe(vue)
    const back = reverseToSchema(JSON.parse(JSON.stringify(rich)), bad, res.manifest)
    expect(back.holes.some((h) => h.path.startsWith('rule[0].props.rule.layout'))).toBe(true)
  })

  it('删掉单元格：行列几何或缺格被照出来', () => {
    const { res, vue } = vueOf(rich)
    const wide = tdBlocks(vue).find((x) => x.includes('colspan="4"'))!
    const bad = vue.replace(wide, '')
    expect(bad).not.toBe(vue)
    const back = reverseToSchema(JSON.parse(JSON.stringify(rich)), bad, res.manifest)
    expect(back.holes.length).toBeGreaterThan(0)
    expect(back.holes.some((h) => h.path.startsWith('rule[0].props.rule.layout') || h.path.startsWith('rule[0].children[3]'))).toBe(true)
  })
})

describe('dashboard 语料：fcTable 整页可出码', () => {
  it('不再把 fcTable 整节点记为 unsupported，回读零空洞', () => {
    const { res, vue } = vueOf(dashboard, 'dashboard')
    expect(res.manifest.unsupported.filter((u) => u.type === 'fcTable')).toEqual([])
    expect(res.manifest.nodes.filter((n) => n.rulePath.startsWith('rule')).map((n) => n.type)).toEqual([
      'fcTable',
      'dash-todo',
      'dash-kpi',
      'dash-kpi',
      'dash-chart',
      'dash-chart',
    ])
    const back = reverseToSchema(JSON.parse(JSON.stringify(dashboard)), vue, res.manifest)
    expect(back.holes).toEqual([])
  })
})
