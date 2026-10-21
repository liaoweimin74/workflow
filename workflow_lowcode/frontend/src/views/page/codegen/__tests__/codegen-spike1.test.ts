// ----- spike 1：出码器自动产出产物 + 登记表，回导零空洞 -----
// npx vitest run src/views/page/codegen

import { describe, it, expect } from 'vitest'
import { generatePage, type GeneratedManifest } from '../generate'
import { reverseToSchema } from '../reverse'
import schema from './fixtures/test_page.schema.json'
import spikeManifest from './spike-contract/manifest.json'
import spikeSource from './spike-contract/TestPage.vue?raw'

const META = { pageKey: 'test_page', pageName: '测试页面', exportedAt: '2026-10-20' }
const SRC = 'TestPage.vue'

function run() {
  const gen = generatePage(schema as any, META)
  return { gen, rev: reverseToSchema(schema as any, gen.files[SRC], gen.manifest) }
}

describe('出码 spike 1：generate → reverse 闭环', () => {
  it('契约表覆盖 fixture 全部键：unsupported 为空', () => {
    expect(generatePage(schema as any, META).manifest.unsupported).toEqual([])
  })

  it('回导零契约空洞：产物读回来与源 schema 逐键一致', () => {
    const { rev } = run()
    expect(rev.holes).toEqual([])
    expect(rev.renameChecks.filter((r) => !r.ok)).toEqual([])
  })

  it('登记表确实解释了大量差异（零空洞不是空对零）', () => {
    const { rev } = run()
    expect(rev.explained.drop).toBeGreaterThan(15)
    expect(rev.explained.defaults).toBeGreaterThan(5)
    expect(rev.explained.rename).toBeGreaterThan(10)
    expect(rev.explained.identity).toBeGreaterThanOrEqual(9)
    // 产物侧接线：三个事件 + externalActions（按钮语义交回产物）+ pageKey（现网由渲染器注入）。
    // 五个键 schema 里都没有，全靠登记表解释掉，少登记一个回导就报多造
    expect(rev.wireStripped.sort()).toEqual([
      'rule[0].props.buttonClick',
      'rule[0].props.externalActions',
      'rule[0].props.pageKey',
      'rule[0].props.rowClick',
      'rule[0].props.selectionChange',
    ])
  })

  it('锚点与具名常量都被回导读到', () => {
    const { gen, rev } = run()
    expect(rev.anchors).toHaveLength(gen.manifest.nodes.filter((n) => n.anchor).length)
    expect(rev.consts).toEqual(expect.arrayContaining(['ds', 'columns', 'searchFields', 'sortableFields', 'viewActions', 'viewDetail']))
  })

  it('篡改产物尺寸后回导报错：证明校验不是摆设', () => {
    const { gen } = run()
    const tampered = gen.files[SRC].replace('size="800px"', 'size="900px"')
    expect(tampered).not.toBe(gen.files[SRC])
    const rev = reverseToSchema(schema as any, tampered, gen.manifest)
    expect(rev.holes.some((h) => h.path === 'rule[1].props.dialogWidth')).toBe(true)
  })

  it('手改容器标签后派生登记失配：viewDetail.formMode 与产物形态对不上', () => {
    const { gen } = run()
    const tampered = gen.files[SRC].replace('<el-drawer v-model="containerVisible" title="编辑记录" size="800px">', '<el-dialog v-model="containerVisible" title="编辑记录" width="800px">').replace('</el-drawer>', '</el-dialog>')
    expect(tampered).not.toBe(gen.files[SRC])
    const rev = reverseToSchema(schema as any, tampered, gen.manifest)
    const bad = rev.renameChecks.find((r) => !r.ok && r.path === 'rule[0].props.viewDetail.formMode')
    expect(bad?.artifact).toBe('popup')
    expect(bad?.schema).toBe('drawer')
  })

  it('两处尺寸冲突不静默取一：登记 value-conflict 供人工裁定', () => {
    const conflict = JSON.parse(JSON.stringify(schema))
    conflict.rule[0].props.viewDetail.width = '900px'
    const gen = generatePage(conflict, META)
    const warn = gen.manifest.nodes
      .find((n) => n.type === 'formContainer')!
      .warnings.find((w) => w.kind === 'value-conflict')
    expect(warn?.message).toContain('以列表组件为准')
    expect(reverseToSchema(conflict, gen.files[SRC], gen.manifest).holes).toEqual([])
  })

  it('整块出码的列里，登记丢弃的点击链会被剥掉', () => {
    const withChain = JSON.parse(JSON.stringify(schema))
    withChain.rule[0].props.columns[0].onCellClick = {
      actions: [{ type: 'open-container', params: [{ key: 'target', value: 'ds_mu2jhb3n' }] }],
    }
    const gen = generatePage(withChain, META)
    const drop = gen.manifest.nodes
      .find((n) => n.rulePath === 'rule[0]')!
      .warnings.find((w) => w.path === 'props.columns[0].onCellClick')
    expect(drop?.kind).toBe('not-in-artifact')
    expect(JSON.stringify(gen.files[SRC])).not.toContain('onCellClick')
    expect(reverseToSchema(withChain, gen.files[SRC], gen.manifest).holes).toEqual([])
  })
})

describe('出码 spike 1：产物形状', () => {
  it('SFC 可编译，取数层 refId 内联', () => {
    const gen = generatePage(schema as any, META)
    const file = Object.keys(gen.files).find((f) => f.startsWith('api/'))!
    expect(gen.files[file]).toContain(`const REF_ID = '${schema.dataSources[0].refId}'`)
    expect(gen.files[file]).not.toContain('$lc')
  })

  it('容器标签由数据表格的展示方式决定（drawer → el-drawer + size）', () => {
    const { gen } = run()
    const container = gen.manifest.nodes.find((n) => n.type === 'formContainer')!
    expect(container.host.tag).toBe('el-drawer')
    expect(container.displayModeSource).toContain('viewDetail.formMode')
    expect(gen.files[SRC]).toContain('<el-drawer v-model="containerVisible" title="编辑记录" size="800px"')
  })

  it('非默认值不被静默省略：容器标题改文案后必须显式出码', () => {
    const changed = JSON.parse(JSON.stringify(schema))
    changed.rule[0].props.viewDetail.formMode = 'popup'
    const gen = generatePage(changed, META)
    const container = gen.manifest.nodes.find((n) => n.type === 'formContainer')!
    expect(container.host.tag).toBe('el-dialog')
    expect(gen.files[SRC]).toContain('<el-dialog v-model="containerVisible" title="编辑记录" width="800px"')
    expect(reverseToSchema(changed, gen.files[SRC], gen.manifest).holes).toEqual([])
  })
})

describe('回导器与 spike 0 手写产物对齐（TS 化未改变判定）', () => {
  it('手写契约 v1 产物 + 手写登记表仍回导零空洞', () => {
    const rev = reverseToSchema(schema as any, spikeSource, spikeManifest as unknown as GeneratedManifest)
    expect(rev.holes).toEqual([])
    expect(rev.renameChecks.filter((r) => !r.ok)).toEqual([])
  })
})
