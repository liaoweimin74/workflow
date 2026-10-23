// ----- Task 3.1: emitUniApp 骨架（M2）-----
// 交付「编排 + 工程文件」：复用 parse→IR，产出相对 uni-shell 路径的四类产物
// （src/pages/gen/<key>.vue、src/pages.json、src/manifest.json、src/App.vue）；
// 组件级模板出码由 Task 5.x/7.x 按 component-map 逐族落地（design G3/D5）。
// npx vitest run src/views/page/codegen/__tests__/uni/

import { describe, expect, it } from 'vitest'

import { generatePageUni } from '../../uni/emit-uni'
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

    // 页面 SFC 骨架：uni-app 合法 SFC（view 根组件 + 页面名注入）
    const sfc = files['src/pages/gen/test_page.vue']
    expect(sfc).toContain('<template>')
    expect(sfc).toContain('<view')
    expect(sfc).toContain('测试页面')
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
