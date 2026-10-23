// ----- Task 3.1: pages.json / manifest.json 工程文件（plan Step 1 RED 第二条）-----
// 「pages.json 页清单 === 传入启用清单」：调用方传入已按启用与 sort 过滤排序的清单，
// emit 原样采用（清单即真相，emit 不做二次过滤）；条目级 navConfig（navigation_json，
// ClientPage.navConfigJson）原样合并进该页 style。manifest 按 client build_config。
// npx vitest run src/views/page/codegen/__tests__/uni/pages-json.test.ts

import { describe, expect, it } from 'vitest'

import { generatePageUni } from '../../uni/emit-uni'
import { CLIENT } from './client-fixture'

const EMPTY_SCHEMA = { rule: [], option: {}, dataSources: [], actions: [] }
const META = { pageKey: 'orders', pageName: '我的订单', client: CLIENT }

describe('project-files — pages.json（Task 3.1）', () => {
  it('页清单 === 传入启用清单：路径与标题逐项对应、顺序保持（清单即真相）', () => {
    const { files } = generatePageUni(EMPTY_SCHEMA, META)
    const pagesJson = JSON.parse(files['src/pages.json'])
    expect(pagesJson.pages.map((p: any) => p.path)).toEqual(['pages/gen/home', 'pages/gen/orders'])
    expect(pagesJson.pages.map((p: any) => p.style.navigationBarTitleText)).toEqual(['首页', '我的订单'])
  })

  it('navConfig（navigation_json）原样合并进该页 style，不覆盖标题缺省', () => {
    const client = {
      ...CLIENT,
      pages: [{ key: 'home', title: '首页', nav: { navigationStyle: 'custom' } }],
    }
    const { files } = generatePageUni(EMPTY_SCHEMA, { ...META, client })
    const entry = JSON.parse(files['src/pages.json']).pages[0]
    expect(entry.style.navigationStyle).toBe('custom')
    expect(entry.style.navigationBarTitleText).toBe('首页')
  })

  it('manifest.json 按 client build_config：name / mp-weixin.appid 落位', () => {
    const { files } = generatePageUni(EMPTY_SCHEMA, META)
    const manifest = JSON.parse(files['src/manifest.json'])
    expect(manifest.name).toBe('会员端')
    expect(manifest['mp-weixin'].appid).toBe('wx1234')
  })
})
