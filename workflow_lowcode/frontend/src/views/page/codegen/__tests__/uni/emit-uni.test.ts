// ----- Task 3.1: emitUniApp 骨架（M2）-----
// 交付「编排 + 工程文件」：复用 parse→IR，产出相对 uni-shell 路径的四类产物
// （src/pages/gen/<key>.vue、src/pages.json、src/manifest.json、src/App.vue）；
// 组件级模板出码由 Task 5.x/7.x 按 component-map 逐族落地（design G3/D5）。
// npx vitest run src/views/page/codegen/__tests__/uni/

import { describe, expect, it } from 'vitest'

import { generatePageUni } from '../../uni/emit-uni'
import cardlist from '../fixtures/corpus/cardlist_test.json'
import testPage from '../fixtures/test_page.schema.json'
import { CLIENT } from './client-fixture'

describe('generatePageUni — 编排与四类产物（Task 3.1）', () => {
  it('语料页 schema → files 含四类产物（相对 uni-shell 路径）', () => {
    const { files } = generatePageUni(testPage as any, {
      pageKey: 'test_page',
      pageName: '测试页面',
      client: CLIENT,
    })
    expect(Object.keys(files)).toContain('src/pages/gen/test_page.vue')
    expect(Object.keys(files)).toContain('src/pages.json')
    expect(Object.keys(files)).toContain('src/manifest.json')
    expect(Object.keys(files)).toContain('src/App.vue')

    // 页面 SFC（Task 5.1 装配）：view 根容器 + 逐顶层节点分派；页面名不再注入 SFC
    // （标题由 pages.json navigationBarTitleText 承担）。未装配组件族以 lc:todo 挂点。
    const sfc = files['src/pages/gen/test_page.vue']
    expect(sfc).toContain('<template>')
    expect(sfc).toContain('<view class="lc-page">')
    expect(sfc).toContain('<!-- lc:todo node=n1 type=page-table')
    expect(sfc).not.toContain('测试页面')
  })

  it('报告为 uniapp 维度（复用 Task 2.4 per-target）：web-only 组件登记 unsupported、可出码率按端分母', () => {
    const schema = {
      rule: [
        { type: 'page-iframe', field: 'f1', props: {} },
        { type: 'input', field: 'f2', props: {} },
      ],
      option: {},
      dataSources: [],
      actions: [],
    }
    const { report } = generatePageUni(schema as any, {
      pageKey: 'uni_report',
      pageName: 'uni_report',
      client: CLIENT,
    })
    expect(report.unsupported.some((u) => u.type === 'page-iframe' && u.message.includes('仅 Web'))).toBe(true)
    expect(report.codegenRateByTarget.uniapp.totalNodes).toBe(2)
    expect(report.codegenRateByTarget.uniapp.emittableNodes).toBe(1)
  })
})

describe('generatePageUni — 列表页装配（Task 5.1）', () => {
  it('语料卡列表页：数据源常量 + useUniList 接线 + uni-card 模板进 SFC；容器族挂 lc:todo', () => {
    const schema = JSON.parse(JSON.stringify(cardlist))
    const { files, manifest } = generatePageUni(schema as any, {
      pageKey: 'cardlist',
      pageName: '卡片列表',
      client: CLIENT,
    })
    const sfc = files['src/pages/gen/cardlist.vue']
    // 数据源（Task 3.1 对位 web emit.ts 227-233）：首个源 + 逐源登记表
    expect(sfc).toContain("const ds = { id: 'ds_mvck4gv9', refId: '25e8df2b1f1241d0a79ef33d819d0f54' }")
    expect(sfc).toContain("const dataSources = {\n  'ds_mvck4gv9': '25e8df2b1f1241d0a79ef33d819d0f54',")
    // 列表片段：useUniList 接线 + 触底 + uni-card
    expect(sfc).toContain(`import { onReachBottom } from '@dcloudio/uni-app'`)
    expect(sfc).toContain(`import { useUniList } from '@lc/runtime-uni/list'`)
    expect(sfc).toContain('<uni-card v-for="row in cards1792036403314Rows"')
    expect(sfc).toContain('onReachBottom(() => cards1792036403314List.loadMore())')
    // 未装配的 formContainer 节点：lc:todo 挂点注释
    expect(sfc).toMatch(/<!-- lc:todo node=n\d+ type=formContainer/)
    // uni 侧 unsupported 合并进 manifest：容器族 + 详情弹窗
    expect(manifest.unsupported.some((u) => u.key === 'open-container' && u.type === 'page-list-cards')).toBe(true)
    expect(manifest.unsupported.some((u) => u.key === 'viewDetail')).toBe(true)
  })
})
