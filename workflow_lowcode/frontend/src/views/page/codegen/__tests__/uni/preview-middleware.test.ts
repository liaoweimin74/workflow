// ----- Task 8.2: uni 产物预览落盘+构建中间件（plan Step 1 RED，build-preview 链路） -----
// npx vitest run src/views/page/codegen/__tests__/uni/preview-middleware.test.ts
//
// 三条「静默失效」型断言（与 probe-writer 中间件同风格）：
//  · 落盘计划只收 generatePageUni 形态的产物（src/ 前缀 + 白名单后缀），路径穿越/越界拒绝；
//  · preview 通道按需触发构建（不在常驻 watch 里）；
//  · 版本令牌每次请求递增（preview=true 口径的重挂依据）。

import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  PREVIEW_BUILD_PATH,
  PREVIEW_PORT,
  planUniPreviewWrite,
  startUniPreviewServer,
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

  it('构建通道按需触发（挂载路径常量 + 端口常量钉住契约）', () => {
    expect(PREVIEW_BUILD_PATH).toBe('/__lc-codegen/uni-preview')
    expect(PREVIEW_PORT).toBe(5301)
  })

  it('startUniPreviewServer：serve dist/build/h5，/ 回 index.html，未命中路径回 404', async () => {
    const dist = mkdtempSync(path.join(tmpdir(), 'lc-uni-preview-'))
    const h5 = path.join(dist, 'dist', 'build', 'h5')
    mkdirSync(h5, { recursive: true })
    writeFileSync(path.join(h5, 'index.html'), '<html>uni-h5-index</html>', 'utf8')
    mkdirSync(path.join(h5, 'assets'), { recursive: true })
    writeFileSync(path.join(h5, 'assets', 'demo.js'), 'console.log(1)', 'utf8')
    const server = startUniPreviewServer(dist, PREVIEW_PORT)
    try {
      const get = (p: string) =>
        fetch(`http://127.0.0.1:${PREVIEW_PORT}${p}`).then(async (r) => ({
          status: r.status,
          type: r.headers.get('content-type') || '',
          body: await r.text(),
        }))
      const index = await get('/')
      expect(index.status).toBe(200)
      expect(index.body).toContain('uni-h5-index')
      expect(index.type).toContain('text/html')

      const asset = await get('/assets/demo.js')
      expect(asset.status).toBe(200)
      expect(asset.type).toContain('javascript')

      const missing = await get('/assets/nope.js')
      expect(missing.status).toBe(404)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      rmSync(dist, { recursive: true, force: true })
    }
  })
})
