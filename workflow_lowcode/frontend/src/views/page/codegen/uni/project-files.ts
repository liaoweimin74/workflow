/**
 * uni-app 工程文件生成（Task 3.1）：pages.json / manifest.json / App.vue。
 *
 * 清单即真相：pages.json 的页清单原样采用调用方传入的启用清单（已按启用与 sort
 * 过滤排序，首项即首页——uni-app 约定 pages[0] 为启动页），emit 不做二次过滤、
 * 不做 home 提升。条目级 nav（来源 ClientPage.navConfigJson，即 navigation_json）
 * 原样合并进该页 style，供 navigationStyle 等逐页覆盖（标题缺省仍由 title 提供，
 * nav 显式给出时以 nav 为准——调用方显式配置优先）。
 */

export interface UniClientPageEntry {
  /** 页面 key：pages/gen/<key> 路径段（调用方按启用清单 pageId 解析） */
  key: string
  /** 页面名称 → navigationBarTitleText 缺省 */
  title: string
  /** 条目级导航配置（navigation_json）：原样合并进该页 style */
  nav?: Record<string, unknown> | null
  /**
   * 分包根（Task 7.3）：非空 → 该页落 `pagesChart/gen/<key>`，进 subPackages 分组
   * （图表页体积大——echarts 全家桶——分包避免拖慢主包启动；uni-shell pages.json 同款形状）
   */
  subRoot?: string
}

export interface UniClientConfig {
  /** 客户端标识（工程命名空间，manifest description 等） */
  key: string
  /** 客户端显示名 → manifest.name 与 globalStyle.navigationBarTitleText */
  name?: string
  /** 微信小程序 appid（占位；Task 3.3 构建配置消费） */
  appid?: string
  /** 启用页面清单：已过滤已排序，首项即首页（uni-app pages[0] 约定） */
  pages: UniClientPageEntry[]
}

/** easycom 默认规则（uni-ui）：uni-* → @dcloudio/uni-ui/lib/uni-$1/uni-$1.vue */
const UNI_UI_EASYCOM = {
  autoscan: true,
  custom: { '^uni-(.*)': '@dcloudio/uni-ui/lib/uni-$1/uni-$1.vue' },
}

/**
 * pages.json：页清单原样采用（清单即真相）+ globalStyle（client 名作标题）。
 * 分包（Task 7.3）：带 subRoot 的页面按 root 分组进 subPackages（保持清单顺序），
 * 其余进主包 pages；主包页路径仍为 `pages/gen/<key>`。
 *
 * easycom（Task 10.1 缺陷 E）：必须显式写出 uni-ui 默认规则——easycom 的 custom
 * 规则**只从 pages.json 读**（@dcloudio/uni-cli-shared/dist/easycom.js:47
 * `custom: (easycom && easycom.custom) || {}`，无内置默认规则）。不写这段，产物里
 * uni-popup / uni-forms-item / uni-easyinput / uni-card / uni-number-box 等
 * 全是**未解析裸标签**：输入框根本不存在（表单容器无法录入）、label 不渲染、
 * popup 不是弹层（内容常驻 DOM、`ref.open` 不是函数）。
 */
export function buildPagesJson(client: UniClientConfig): string {
  const pageOf = (p: UniClientPageEntry) => ({
    path: p.subRoot ? `${p.subRoot}/gen/${p.key}` : `pages/gen/${p.key}`,
    style: {
      navigationBarTitleText: p.title,
      ...(p.nav ?? {}),
    },
  })
  const mainPages = client.pages.filter((p) => !p.subRoot).map(pageOf)
  const subRoots: string[] = []
  for (const p of client.pages) {
    if (p.subRoot && !subRoots.includes(p.subRoot)) subRoots.push(p.subRoot)
  }
  const subPackages = subRoots.map((root) => ({
    root,
    pages: client.pages.filter((p) => p.subRoot === root).map(pageOf),
  }))
  return JSON.stringify(
    {
      easycom: UNI_UI_EASYCOM,
      pages: mainPages,
      ...(subPackages.length ? { subPackages } : {}),
      globalStyle: {
        navigationBarTextStyle: 'black',
        navigationBarTitleText: client.name ?? client.key,
        navigationBarBackgroundColor: '#FFFFFF',
      },
    },
    null,
    2,
  )
}

/** manifest.json：按 client build_config 落 appid/名称（uni-app 工程基线配置） */
export function buildManifestJson(client: UniClientConfig): string {
  const name = client.name ?? client.key
  return JSON.stringify(
    {
      name,
      appid: '',
      description: `${client.key} 低代码出码工程`,
      versionName: '1.0.0',
      versionCode: '100',
      uniStatistics: { enable: false },
      'mp-weixin': {
        appid: client.appid ?? '',
        setting: { urlCheck: false },
        usingComponents: true,
        // 分包优化（Task 7.3）：图表页落 subPackages 后按需注入
        optimization: { subPackages: true },
      },
      h5: {
        title: name,
        router: { mode: 'hash' },
      },
    },
    null,
    2,
  )
}

/** App.vue：全局壳骨架（全局样式与运行期适配接线由 Task 3.2/3.3 落地） */
export function buildAppVue(): string {
  return `<script setup lang="ts">
// 全局壳（Task 3.1 骨架）：全局样式与运行期适配接线由 Task 3.2/3.3 落地
import { onLaunch } from '@dcloudio/uni-app'

onLaunch(() => {})
</script>

<style>
/* 全局样式：@lc/runtime-uni 基础样式在 Task 3.2 引入 */
</style>
`
}
