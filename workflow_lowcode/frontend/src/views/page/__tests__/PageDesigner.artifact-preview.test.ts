// ----- TDD: 设计器把「产物预览」页签接进预览弹窗（Task 8.1） -----
// npx vitest run src/views/page/__tests__/PageDesigner.artifact-preview.test.ts
//
// 与 PageDesigner.codegen-preview-tab.test.ts 同风格：整页挂载设计器成本高，
// 「静默失效」型的接线用源码断言钉结构；runner 行为用 mock fetch 正常跑。

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import cardlistSchema from '../codegen/__tests__/fixtures/corpus/cardlist_test.json'
import { PREVIEW_BUILD_PATH, runUniArtifactPreview } from '../codegen/uni-preview-run'
import { UNI_PREVIEW_BASE, uniPreviewUrl } from '../../../../vite.uni-preview'

const SOURCE = readFileSync(resolve(__dirname, '../PageDesigner.vue'), 'utf8')

describe('PageDesigner 预览弹窗的产物预览页签', () => {
  it('把产物预览页签喂进 previewTabs 插槽，只对 uniapp 页点亮，并按插槽带出的当前页签名激活', () => {
    expect(SOURCE).toContain('<template #previewTabs="{ status }">')
    expect(SOURCE).toContain('name="uni-artifact"')
    expect(SOURCE).toContain('v-if="pageDesignType === \'uniapp\' && UniArtifactPreviewPane"')
    expect(SOURCE).toContain(':active="status === \'uni-artifact\'"')
  })

  it('产物预览栈只在 dev 里被引到：生产包不带 uni 出码与构建通道的死重', () => {
    // 静态 import 会把 generatePageUni（含 uni emit 链）拖进设计器 chunk
    expect(SOURCE).not.toMatch(/^import\s+\w+\s+from '\.\/codegen\/uni-preview-run'/m)
    expect(SOURCE).not.toMatch(/^import\s+\w+\s+from '\.\/codegen\/uni\/emit-uni'/m)
    expect(SOURCE).toMatch(
      /const UniArtifactPreviewPane =[\s\S]{0,120}import\.meta\.env\.DEV[\s\S]{0,120}defineAsyncComponent\(\(\) => import\('\.\/codegen\/UniArtifactPreviewPane\.vue'\)\)[\s\S]{0,60}\: null/,
    )
    // DEV 为假时组件是 null：页签整块不渲染，而不是留一张点得开却空白的页签
    expect(SOURCE).toContain('v-if="pageDesignType === \'uniapp\' && UniArtifactPreviewPane"')
  })

  it('预览读的是画布口径：产物预览页签与出码页签共用同一份 canvasSchema', () => {
    // 两个页签各引一次（出码 + 产物预览），定义只有一个出口
    expect(SOURCE.split(':get-schema="canvasSchema"').length - 1).toBe(2)
  })

  it('产物预览页签带上应用上下文：二维码入口要按 App 解析小程序客户端（Task 8.3）', () => {
    // 二维码链路是 per-App 的（Release 挂 Client，页面归属 App），appId 必须从页定义带下去
    expect(SOURCE).toMatch(/:is="UniArtifactPreviewPane"[\s\S]{0,400}:app-id="pageAppId"/)
  })
})

describe('runUniArtifactPreview（uni-preview-run 客户端通道）', () => {
  const meta = { pageKey: 'cardlist_test', pageName: '卡片列表' }

  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('成功：generatePageUni 的 files 原样 POST 到中间件，返回版本令牌与预览 URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, version: 3, builtAt: '2026-10-24T00:00:00.000Z', previewUrl: uniPreviewUrl('cardlist_test', 3), pageKey: 'cardlist_test' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const out = await runUniArtifactPreview({ ...meta, schema: cardlistSchema as any })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(PREVIEW_BUILD_PATH)
    const init = fetchMock.mock.calls[0][1]
    expect(init.method).toBe('POST')
    expect(String(init.headers['content-type'])).toContain('application/json')
    const body = JSON.parse(init.body)
    // pageKey / pageName / client 都在正文里（中间件 plan 用 pageKey 校验 + pages.json 由 client 决定）
    expect(body.pageKey).toBe('cardlist_test')
    expect(body.pageName).toBe('卡片列表')
    expect(body.client.pages).toEqual([{ key: 'cardlist_test', title: '卡片列表' }])
    // files 就是 generatePageUni 的产物，逐字节不加工
    const { generatePageUni } = await import('../codegen/uni/emit-uni')
    const gen = generatePageUni(cardlistSchema as any, {
      pageKey: 'cardlist_test',
      pageName: '卡片列表',
      client: { key: 'member', pages: [{ key: 'cardlist_test', title: '卡片列表' }] },
    })
    expect(body.files).toEqual(gen.files)
    // 版本令牌与预览 URL 原样带出（iframe 重挂的依据）——URL 是同源相对路径（Task 10.1 路线 1）
    expect(out.version).toBe(3)
    expect(out.previewUrl).toBe(uniPreviewUrl('cardlist_test', 3))
    expect(out.previewUrl.startsWith(UNI_PREVIEW_BASE)).toBe(true)
  })

  it('中间件非 2xx：带状态码与服务端归因抛出，不给预览 URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: '非法 pageKey：../evil' }),
    }))
    await expect(runUniArtifactPreview({ ...meta, schema: cardlistSchema as any })).rejects.toThrow(/400.*非法 pageKey/)
  })

  it('中间件没装上（SPA fallback 回 200 + HTML）：抛可读事实，不误报成功', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<!doctype html>',
      json: async () => { throw new SyntaxError('Unexpected token <') },
    }))
    await expect(runUniArtifactPreview({ ...meta, schema: cardlistSchema as any })).rejects.toThrow(/不是 JSON/)
  })

  it('200 但没有 ok/version：不假装成功', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }))
    await expect(runUniArtifactPreview({ ...meta, schema: cardlistSchema as any })).rejects.toThrow(/version/)
  })
})
