// ----- Task 3.1: pages.json / manifest.json 工程文件（plan Step 1 RED 第二条）-----
// 「pages.json 页清单 === 传入启用清单」：调用方传入已按启用与 sort 过滤排序的清单，
// emit 原样采用（清单即真相，emit 不做二次过滤）；条目级 navConfig（navigation_json，
// ClientPage.navConfigJson）原样合并进该页 style。manifest 按 client build_config。
// npx vitest run src/views/page/codegen/__tests__/uni/pages-json.test.ts

import { existsSync } from 'node:fs'
import { join, resolve as resolvePath } from 'node:path'

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

describe('project-files — 分包（Task 7.3：图表页落 pagesChart 分包）', () => {
  it('buildPagesJson 按 root 分组：mainPages 出主包，subPackages 聚合分包', () => {
    const client = {
      ...CLIENT,
      pages: [
        { key: 'home', title: '首页' },
        { key: 'chart_a', title: '图表A', subRoot: 'pagesChart' },
        { key: 'chart_b', title: '图表B', subRoot: 'pagesChart' },
      ],
    }
    const { files } = generatePageUni(EMPTY_SCHEMA, { ...META, client })
    const pagesJson = JSON.parse(files['src/pages.json'])
    expect(pagesJson.pages.map((p: any) => p.path)).toEqual(['pages/gen/home'])
    expect(pagesJson.subPackages).toEqual([
      {
        root: 'pagesChart',
        pages: [
          { path: 'pagesChart/gen/chart_a', style: { navigationBarTitleText: '图表A' } },
          { path: 'pagesChart/gen/chart_b', style: { navigationBarTitleText: '图表B' } },
        ],
      },
    ])
  })

  it('manifest：mp-weixin.optimization.subPackages=true（分包优化随分包开启）', () => {
    const { files } = generatePageUni(EMPTY_SCHEMA, META)
    const manifest = JSON.parse(files['src/manifest.json'])
    expect(manifest['mp-weixin'].optimization).toEqual({ subPackages: true })
  })
})

describe('project-files — easycom（Task 10.1 缺陷 E：uni-ui 组件解析）', () => {
  it('pages.json 输出 easycom 默认规则：uni-* → @dcloudio/uni-ui/lib/uni-$1/uni-$1.vue', () => {
    const { files } = generatePageUni(EMPTY_SCHEMA, META)
    const pagesJson = JSON.parse(files['src/pages.json'])
    // easycom 的 custom 规则只从 pages.json 读（@dcloudio/uni-cli-shared/dist/easycom.js:47
    // `custom: (easycom && easycom.custom) || {}`，无内置默认规则）。不输出这段，产物里
    // uni-easyinput/uni-forms-item/uni-popup/uni-card 全是**未解析裸标签**：
    // 输入框不存在（input=0）、label 不渲染、popup 不是弹层、formPopup.open 不是函数。
    expect(pagesJson.easycom).toEqual({
      autoscan: true,
      custom: { '^uni-(.*)': '@dcloudio/uni-ui/lib/uni-$1/uni-$1.vue' },
    })
  })

  it('规则覆盖产物真正用到的组件（目标文件在 @dcloudio/uni-ui/lib 下真实存在）', () => {
    // 测试文件在 frontend/src/views/page/codegen/__tests__/uni/ → 上溯 6 层 = frontend
    const uniUiRoot = resolvePath(__dirname, '../../../../../../uni-shell/node_modules')
    const rule: Record<string, string> = { '^uni-(.*)': '@dcloudio/uni-ui/lib/uni-$1/uni-$1.vue' }
    const emitted = [
      'uni-popup',
      'uni-search-bar',
      'uni-card',
      'uni-tag',
      'uni-forms-item',
      'uni-easyinput',
      'uni-number-box',
      'uni-datetime-picker',
      'uni-table',
      'uni-tr',
      'uni-th',
      'uni-td',
      'uni-steps',
      'uni-icons',
    ]
    const resolve = (name: string) => {
      for (const [pat, target] of Object.entries(rule)) {
        const re = new RegExp(pat)
        if (re.test(name)) return name.replace(re, target)
      }
      return null
    }
    for (const name of emitted) {
      const resolved = resolve(name)
      expect(resolved, `${name} 必须能被 easycom 规则解析`).toBeTruthy()
      const abs = join(uniUiRoot, resolved as string)
      expect(existsSync(abs), `${name} → ${resolved} 在 uni-ui 包里不存在（解析失败＝裸标签）`).toBe(true)
    }
  })
})
