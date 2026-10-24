// ----- TDD: 「产物预览」的小程序预览二维码入口（Task 8.3，依赖 9.3 上传链路） -----
// npx vitest run src/views/page/codegen/__tests__/uni-qr-run.test.ts
//
// spec: mobile-preview「小程序端预览给出二维码」——
//   WHEN 目标端为 MP_WEIXIN 且 Client 已配置 appid
//   THEN 产物预览提供微信开发者工具预览二维码
//
// 口径：二维码不是凭空画的，必须走完整发布链路（建 Release 快照 → 出码构建 mp-weixin →
// miniprogram-ci 上传体验版 → 回传 uploadedQrUrl）。所以这里守三件事：
//   · 目标端判定（MP_WEIXIN + buildConfig 已配 appid）——不具备条件时给「为什么没有」，不硬撑；
//   · 出码口径（按该 Client 的启用清单多页出码，pages.json 顺序/nav、manifest appid 都对）；
//   · 链路口径（状态机不成功就抛，绝不把半成品二维码当成功）。

import { beforeEach, describe, expect, it, vi } from 'vitest'

import cardlistSchema from './fixtures/corpus/cardlist_test.json'
import dashboardSchema from './fixtures/corpus/dashboard.json'
import type { AppClientDTO, AppClientPageDTO, AppReleaseDTO } from '@/api/release'
import {
  pickMiniprogramClient,
  resolveUniQrAvailability,
  runUniQrPreview,
  type UniQrDeps,
} from '../uni-qr-run'

/** 造一个客户端（默认 MP_WEIXIN + 已配 appid） */
const client = (over: Partial<AppClientDTO> = {}): AppClientDTO => ({
  id: 'c1',
  appId: 'app1',
  clientType: 'MP_WEIXIN',
  name: '商户端小程序',
  renderMode: 'CODEGEN',
  buildConfigJson: JSON.stringify({ appid: 'wx-abc', privateKeyPath: '/k.pem' }),
  ...over,
})

const page = (over: Partial<AppClientPageDTO> = {}): AppClientPageDTO => ({
  id: 'ap1',
  pageId: 'p1',
  pageName: '卡片列表',
  sort: 1,
  navConfig: null,
  ...over,
})

const release = (over: Partial<AppReleaseDTO> = {}): AppReleaseDTO => ({
  id: 'r1',
  appId: 'app1',
  clientId: 'c1',
  version: 1,
  status: 'CREATED',
  ...over,
})

/** 默认 deps：两页启用清单 + 两个真实语料 schema（出码链路真跑） */
function deps(over: Partial<UniQrDeps> = {}): UniQrDeps {
  return {
    listClients: async () => [client()],
    listClientPages: async () => [
      page({ pageId: 'p1', pageName: '卡片列表', sort: 1, navConfig: '{"navigationStyle":"custom"}' }),
      page({ id: 'ap2', pageId: 'p2', pageName: '仪表盘', sort: 2 }),
    ],
    getPageDef: async (pageId: string) =>
      pageId === 'p1'
        ? { key: 'cardlist_test', name: '卡片列表', schema: JSON.stringify(cardlistSchema) }
        : { key: 'dashboard', name: '仪表盘', schema: JSON.stringify(dashboardSchema) },
    createRelease: async () => release({ status: 'CREATED' }),
    buildRelease: async () => release({ status: 'PUBLISHED', artifactUrl: '/artifacts/r1/mp-weixin' }),
    uploadRelease: async () =>
      release({ status: 'UPLOADED', artifactUrl: '/artifacts/r1/mp-weixin', uploadedQrUrl: '/artifacts/r1/qr.png' }),
    ...over,
  }
}

describe('pickMiniprogramClient — 目标端判定', () => {
  it('挑 MP_WEIXIN 且 buildConfig 已配 appid 的客户端', () => {
    expect(pickMiniprogramClient([client()])).toEqual({
      clientId: 'c1',
      clientName: '商户端小程序',
      appid: 'wx-abc',
    })
  })

  it('兼容 appId 键名（后端同一口径）', () => {
    const c = client({ buildConfigJson: JSON.stringify({ appId: 'wx-camel' }) })
    expect(pickMiniprogramClient([c])?.appid).toBe('wx-camel')
  })

  it('小程序客户端没配 appid：不算可用目标（不拿它出码）', () => {
    expect(pickMiniprogramClient([client({ buildConfigJson: JSON.stringify({ privateKeyPath: '/k.pem' }) })])).toBeNull()
    expect(pickMiniprogramClient([client({ buildConfigJson: '{}' })])).toBeNull()
    expect(pickMiniprogramClient([client({ buildConfigJson: null })])).toBeNull()
    expect(pickMiniprogramClient([client({ buildConfigJson: '不是 JSON' })])).toBeNull()
  })

  it('非 MP_WEIXIN（H5/WEB/APP）不作目标；没有客户端则为 null', () => {
    expect(pickMiniprogramClient([client({ clientType: 'H5' })])).toBeNull()
    expect(pickMiniprogramClient([client({ clientType: 'APP' })])).toBeNull()
    expect(pickMiniprogramClient([])).toBeNull()
    expect(pickMiniprogramClient(null)).toBeNull()
  })

  it('多个 MP 客户端时取已配 appid 的那个（跳过没配的）', () => {
    const noAppid = client({ id: 'c0', name: '未配的小程序', buildConfigJson: '{}' })
    const withAppid = client({ id: 'c9', name: '配好的小程序' })
    expect(pickMiniprogramClient([noAppid, withAppid])?.clientId).toBe('c9')
  })
})

describe('resolveUniQrAvailability — 有没有二维码，没有就说清为什么', () => {
  it('页面没归属应用：直说，不发请求', async () => {
    const listClients = vi.fn()
    const out = await resolveUniQrAvailability(null, deps({ listClients }))
    expect(out).toEqual({ available: false, reason: expect.stringContaining('未归属应用') })
    expect(listClients).not.toHaveBeenCalled()
  })

  it('应用下没有「已配 appid 的小程序客户端」：给出原因并可复现（拿到客户端清单）', async () => {
    const out = await resolveUniQrAvailability(
      'app1',
      deps({ listClients: async () => [client({ clientType: 'H5', id: 'h5' })] }),
    )
    expect(out.available).toBe(false)
    if (!out.available) expect(out.reason).toContain('appid')
  })

  it('目标端为 MP_WEIXIN 且 Client 已配 appid：可用，且带上启用清单页数', async () => {
    const out = await resolveUniQrAvailability('app1', deps())
    expect(out).toEqual({
      available: true,
      target: { clientId: 'c1', clientName: '商户端小程序', appid: 'wx-abc' },
      pageCount: 2,
    })
  })

  it('小程序客户端没分配页面：不可用（空体验版没意义）', async () => {
    const out = await resolveUniQrAvailability('app1', deps({ listClientPages: async () => [] }))
    expect(out.available).toBe(false)
    if (!out.available) expect(out.reason).toContain('未分配页面')
  })
})

describe('runUniQrPreview — 走完发布链路拿二维码', () => {
  it('可用时才跑：不可用直接原样返回原因，一次链路都不发', async () => {
    const createRelease = vi.fn()
    const out = await runUniQrPreview('app1', deps({ listClients: async () => [], createRelease }))
    expect(out).toEqual({ available: false, reason: expect.stringContaining('appid') })
    expect(createRelease).not.toHaveBeenCalled()
  })

  it('按该 Client 启用清单多页出码（pages.json 顺序/nav、manifest appid 都对）', async () => {
    let builtFiles: Record<string, string> = {}
    await runUniQrPreview(
      'app1',
      deps({
        buildRelease: async (_a, _c, _r, files) => {
          builtFiles = files
          return release({ status: 'PUBLISHED' })
        },
      }),
    )
    // 两页各一份 SFC
    expect(Object.keys(builtFiles)).toContain('src/pages/gen/cardlist_test.vue')
    expect(Object.keys(builtFiles)).toContain('src/pages/gen/dashboard.vue')
    // 清单即真相：顺序 = 启用清单顺序，首项即首页
    const pagesJson = JSON.parse(builtFiles['src/pages.json'])
    expect(pagesJson.pages.map((p: any) => p.path)).toEqual(['pages/gen/cardlist_test', 'pages/gen/dashboard'])
    expect(pagesJson.pages[0].style.navigationBarTitleText).toBe('卡片列表')
    // 条目级 nav（navigation_json）原样合并进该页 style
    expect(pagesJson.pages[0].style.navigationStyle).toBe('custom')
    // appid 落 manifest（小程序构建配置消费）
    expect(JSON.parse(builtFiles['src/manifest.json'])['mp-weixin'].appid).toBe('wx-abc')
  })

  it('链路顺序：建快照 → 用同一 releaseId 构建 → 上传，返回 uploadedQrUrl', async () => {
    const order: string[] = []
    const out = await runUniQrPreview(
      'app1',
      deps({
        createRelease: async () => {
          order.push('create')
          return release({ id: 'r7', version: 3, status: 'CREATED' })
        },
        buildRelease: async (_a, _c, releaseId) => {
          order.push(`build:${releaseId}`)
          return release({ id: releaseId, status: 'PUBLISHED' })
        },
        uploadRelease: async (_a, _c, releaseId) => {
          order.push(`upload:${releaseId}`)
          return release({ id: releaseId, status: 'UPLOADED', uploadedQrUrl: '/artifacts/r7/qr.png' })
        },
      }),
    )
    expect(order).toEqual(['create', 'build:r7', 'upload:r7'])
    expect(out).toEqual({
      available: true,
      qrUrl: '/artifacts/r7/qr.png',
      releaseId: 'r7',
      version: 3,
      appid: 'wx-abc',
      clientName: '商户端小程序',
      pageCount: 2,
    })
  })

  it('构建没到 PUBLISHED：抛错并说清原因，不上传（不拿半成品当成功）', async () => {
    const uploadRelease = vi.fn()
    await expect(
      runUniQrPreview(
        'app1',
        deps({
          buildRelease: async () => release({ status: 'FAILED', error: 'uni build 失败（exit 1）：template syntax' }),
          uploadRelease,
        }),
      ),
    ).rejects.toThrow(/uni build 失败/)
    expect(uploadRelease).not.toHaveBeenCalled()
  })

  it('上传成功但没回传二维码：照样判失败（img 空 src 等于没二维码）', async () => {
    await expect(
      runUniQrPreview(
        'app1',
        deps({
          uploadRelease: async () => release({ status: 'UPLOADED', error: 'miniprogram-ci 未产出二维码' }),
        }),
      ),
    ).rejects.toThrow(/未产出二维码/)
  })

  it('页面定义读不到（schema 为空）：抛错，不进构建（不把空产物传上去）', async () => {
    const buildRelease = vi.fn()
    await expect(
      runUniQrPreview('app1', deps({ getPageDef: async () => ({ key: 'x', name: 'X', schema: '' }), buildRelease })),
    ).rejects.toThrow(/定义/)
    expect(buildRelease).not.toHaveBeenCalled()
  })
})