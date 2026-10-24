// ----- Task 8.2: uni 产物预览落盘+构建中间件（plan Step 1 RED，build-preview 链路） -----
// npx vitest run src/views/page/codegen/__tests__/uni/preview-middleware.test.ts
//
// 三条「静默失效」型断言（与 probe-writer 中间件同风格）：
//  · 落盘计划只收 generatePageUni 形态的产物（src/ 前缀 + 白名单后缀），路径穿越/越界拒绝；
//  · preview 通道按需触发构建（不在常驻 watch 里）；
//  · 版本令牌每次请求递增（preview=true 口径的重挂依据）。

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  PREVIEW_BUILD_PATH,
  PREVIEW_PORT,
  UNI_H5_BASE_ENV,
  UNI_PREVIEW_BASE,
  planUniPreviewWrite,
  startUniPreviewServer,
  uniBuildEnv,
  uniH5Base,
  uniPreviewUrl,
} from '../../../../../../vite.uni-preview'

const FILES = {
  'src/pages/gen/demo.vue': '<template><view class="lc-page">demo</view></template>',
  'src/pages.json': '{}',
  'src/manifest.json': '{}',
  'src/App.vue': '<template><view /></template>',
}

describe('vite.uni-preview 中间件（Task 8.2）', () => {
  it('planUniPreviewWrite：合法产物落 uni-shell/src/，written 清单按源名回', () => {
    const plan = planUniPreviewWrite({ pageKey: 'demo', client: { key: 'member', pages: [{ key: 'demo', title: '演示' }] }, files: FILES })
    expect(plan.ok).toBe(true)
    if (plan.ok) {
      expect(plan.writes.map((w) => w.rel).sort()).toEqual([
        'src/App.vue',
        'src/manifest.json',
        'src/pages.json',
        'src/pages/gen/demo.vue',
      ].map((rel) => `uni-shell/${rel}`))
      expect(plan.written).toEqual(Object.keys(FILES).sort())
    }
  })

  it('planUniPreviewWrite：files 缺失/非法文件名/路径穿越/正文超限 → 归因错误', () => {
    expect(planUniPreviewWrite({ pageKey: 'demo', files: undefined }).ok).toBe(false)
    expect(
      planUniPreviewWrite({ pageKey: 'demo', files: { '../evil.vue': 'x' } }).ok,
    ).toBe(false)
    expect(
      planUniPreviewWrite({ pageKey: 'demo', files: { 'src/pages/gen/ok.vue': 'x', 'src/pages/gen/bad.exe': 'x' } }).ok,
    ).toBe(false)
    expect(
      planUniPreviewWrite({ pageKey: 'demo', files: { 'src/pages/gen/big.vue': 'x'.repeat(600_000) } }).ok,
    ).toBe(false)
    // pageKey 也是文件名段：非法字符直接拒绝
    expect(planUniPreviewWrite({ pageKey: '../evil', files: FILES }).ok).toBe(false)
  })

  it('分包页（subRoot）同样按源名落盘；subPackages 页路径含分包根', () => {
    const plan = planUniPreviewWrite({
      pageKey: 'chart_demo',
      client: { key: 'member', pages: [{ key: 'chart_demo', title: '图表', subRoot: 'pagesChart' }] },
      files: { 'src/pagesChart/gen/chart_demo.vue': '<template><view /></template>' },
    })
    expect(plan.ok).toBe(true)
    if (plan.ok) {
      expect(plan.writes[0].rel).toBe('uni-shell/src/pagesChart/gen/chart_demo.vue')
    }
  })

  it('同源托管口径（Task 10.1 路线 1）：iframe src 是同源相对路径，构建注入 h5 基路径', () => {
    expect(PREVIEW_BUILD_PATH).toBe('/__lc-codegen/uni-preview')
    expect(UNI_PREVIEW_BASE).toBe('/__lc-codegen/uni-static')
    // 相对路径：iframe 与宿主同源才有宿主的 /api 代理与登录态（钉死 localhost:端口就不是同源了）
    expect(uniPreviewUrl('cardlist_test', 3)).toBe('/__lc-codegen/uni-static/#/pages/gen/cardlist_test?v=3')
    // 带尾斜杠 = hash 路由基路径形态（uni 侧 routerBase 由 vite base 推导）
    expect(uniH5Base()).toBe('/__lc-codegen/uni-static/')
    // 构建 env 注入基路径：漏了它 → 产物 index.html 指宿主根 /assets/**，iframe 里是空壳
    const env = uniBuildEnv({ UNI_H5_BASE: 'ignored', FOO: 'bar' })
    expect(env[UNI_H5_BASE_ENV]).toBe('/__lc-codegen/uni-static/')
    expect(env.UNI_H5_BASE).toBe('/__lc-codegen/uni-static/')
    expect(env.FOO).toBe('bar')
    expect(env.NODE_ENV).toBe('production')
    // uni-shell 的 vite 配置必须真读这个 env（否则注入的基路径白给）
    const shellViteConfig = readFileSync(
      path.resolve(__dirname, '../../../../../../uni-shell/vite.config.ts'),
      'utf8',
    )
    expect(shellViteConfig).toMatch(/base:\s*process\.env\.UNI_H5_BASE/)
  })

  it('CLI 独立服务端口 5301 保留（不启设计器时看一眼产物的旁路，非真跑入口）', () => {
    expect(PREVIEW_PORT).toBe(5301)
  })

  it('startUniPreviewServer：在 <base>/ 下 serve <rootDir>/uni-shell/dist/build/h5，/ 回 index.html，子路径外不托管', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lc-uni-preview-'))
    // 同一 rootDir 口径：planUniPreviewWrite 写 uni-shell/src/、runUniBuild 在 uni-shell/ 里跑，
    // 产物落在 <rootDir>/uni-shell/dist/build/h5。这里再放一份同名干扰产物在 <rootDir>/dist/build/h5，
    // 钉住服务的是「uni build 真正会写的那个目录」，而不是少一段的旧路径（否则托管路径上永远 404「产物未构建」）
    const h5 = path.join(root, 'uni-shell', 'dist', 'build', 'h5')
    mkdirSync(h5, { recursive: true })
    writeFileSync(path.join(h5, 'index.html'), '<html>uni-h5-index</html>', 'utf8')
    mkdirSync(path.join(h5, 'assets'), { recursive: true })
    writeFileSync(path.join(h5, 'assets', 'demo.js'), 'console.log(1)', 'utf8')
    const decoy = path.join(root, 'dist', 'build', 'h5')
    mkdirSync(decoy, { recursive: true })
    writeFileSync(path.join(decoy, 'index.html'), '<html>decoy</html>', 'utf8')
    const server = startUniPreviewServer(root, PREVIEW_PORT)
    try {
      const get = (p: string) => fetch(`http://127.0.0.1:${PREVIEW_PORT}${p}`)
      const read = async (p: string) => {
        const r = await get(p)
        return { status: r.status, type: r.headers.get('content-type') || '', body: await r.text() }
      }
      const index = await read(`${UNI_PREVIEW_BASE}/`)
      expect(index.status).toBe(200)
      expect(index.body).toContain('uni-h5-index')
      expect(index.body).not.toContain('decoy')
      expect(index.type).toContain('text/html')

      const asset = await read(`${UNI_PREVIEW_BASE}/assets/demo.js`)
      expect(asset.status).toBe(200)
      expect(asset.type).toContain('javascript')

      const missing = await read(`${UNI_PREVIEW_BASE}/assets/nope.js`)
      expect(missing.status).toBe(404)

      // 子路径外一律不托管：宿主 app 的路径不能被产物服务抢走
      const outside = await read('/assets/demo.js')
      expect(outside.status).toBe(404)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      rmSync(root, { recursive: true, force: true })
    }
  })
})
