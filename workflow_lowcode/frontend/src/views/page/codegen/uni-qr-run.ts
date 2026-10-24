/**
 * 「产物预览」的小程序预览二维码链路（Task 8.3，依赖 9.3 上传链路）。
 *
 * spec: mobile-preview「小程序端预览给出二维码」——
 *   WHEN 目标端为 MP_WEIXIN 且 Client 已配置 appid
 *   THEN 产物预览提供微信开发者工具预览二维码
 *
 * 二维码不是凭空画的，必须由完整发布链路产出：
 *   1) 解析目标小程序客户端（MP_WEIXIN + buildConfig 已配 appid）；
 *   2) 按该 Client 的**启用清单**多页出码（pages.json 顺序即清单顺序、首项即首页）；
 *   3) 建 Release 快照 → 构建 mp-weixin → miniprogram-ci 上传体验版；
 *   4) 回传 uploadedQrUrl 供设计器展示。
 *
 * 三条纪律：
 *   · 不具备条件（非 MP_WEIXIN / 未配 appid / 未分配页面 / 页面未归属应用）时给出**原因**，
 *     不硬撑一个假二维码；
 *   · 状态机没有走到终态（构建非 PUBLISHED、上传没回传 qrUrl）一律抛错，绝不把半成品当成功；
 *   · deps 可注入：单测用替身，真跑走 releaseApi/pageApi。
 */

import { pageApi } from '@/api/page'
import { releaseApi, type AppClientDTO, type AppClientPageDTO, type AppReleaseDTO } from '@/api/release'
import { generatePageUni } from './uni/emit-uni'
import type { UniClientConfig, UniClientPageEntry } from './uni/project-files'

/** 小程序预览目标：该 App 下可用于出体验版二维码的客户端 */
export interface UniQrTarget {
  clientId: string
  clientName: string
  appid: string
}

/** 目标端判定：挑第一个「MP_WEIXIN 且 buildConfig 已配 appid」的客户端，无则 null */
export function pickMiniprogramClient(clients: AppClientDTO[] | null | undefined): UniQrTarget | null {
  if (!clients) return null
  for (const c of clients) {
    if (c?.clientType !== 'MP_WEIXIN') continue
    const appid = appidOf(c.buildConfigJson)
    if (!appid) continue
    return { clientId: c.id, clientName: c.name, appid }
  }
  return null
}

/** buildConfig 取 appid（兼容 appid/appId 键名；缺/非法 JSON 视为未配置） */
function appidOf(buildConfigJson: string | null | undefined): string | null {
  if (!buildConfigJson) return null
  let cfg: any
  try {
    cfg = JSON.parse(buildConfigJson)
  } catch {
    return null
  }
  if (!cfg || typeof cfg !== 'object') return null
  const value = cfg.appid ?? cfg.appId
  const text = value == null ? '' : String(value).trim()
  return text || null
}

/** navConfig（navigation_json）→ pages.json 该页 style 的 nav 覆盖；非法/空视为无覆盖 */
function navOf(navConfig: string | null | undefined): Record<string, unknown> | undefined {
  if (!navConfig) return undefined
  try {
    const parsed = JSON.parse(navConfig)
    return parsed && typeof parsed === 'object' ? parsed : undefined
  } catch {
    return undefined
  }
}

export interface UniQrDeps {
  listClients(appId: string): Promise<AppClientDTO[]>
  listClientPages(appId: string, clientId: string): Promise<AppClientPageDTO[]>
  getPageDef(pageId: string): Promise<{ key: string; name: string; schema: string }>
  createRelease(appId: string, clientId: string): Promise<AppReleaseDTO>
  buildRelease(
    appId: string,
    clientId: string,
    releaseId: string,
    files: Record<string, string>,
  ): Promise<AppReleaseDTO>
  uploadRelease(appId: string, clientId: string, releaseId: string): Promise<AppReleaseDTO>
}

/** 生产实现：薄封装 releaseApi/pageApi，只负责解 R 包装 */
export const defaultUniQrDeps: UniQrDeps = {
  listClients: async (appId) => (await releaseApi.listClients(appId)).data ?? [],
  listClientPages: async (appId, clientId) => (await releaseApi.listClientPages(appId, clientId)).data ?? [],
  getPageDef: async (pageId) => {
    const def = (await pageApi.getPage(pageId)).data
    return { key: def.key, name: def.name, schema: def.schema }
  },
  createRelease: async (appId, clientId) => (await releaseApi.createRelease(appId, clientId)).data,
  buildRelease: async (appId, clientId, releaseId, files) =>
    (await releaseApi.buildRelease(appId, clientId, releaseId, files)).data,
  uploadRelease: async (appId, clientId, releaseId) =>
    (await releaseApi.uploadRelease(appId, clientId, releaseId)).data,
}

export type UniQrAvailability =
  | { available: true; target: UniQrTarget; pageCount: number }
  | { available: false; reason: string }

/** 有没有二维码可给：只看「目标端 + Client 配置 + 有页面可交付」，不发任何写操作 */
export async function resolveUniQrAvailability(
  appId: string | null | undefined,
  deps: UniQrDeps = defaultUniQrDeps,
): Promise<UniQrAvailability> {
  const id = String(appId || '').trim()
  if (!id) {
    return { available: false, reason: '当前页面未归属应用，无法解析小程序客户端' }
  }
  const target = pickMiniprogramClient(await deps.listClients(id))
  if (!target) {
    return {
      available: false,
      reason: '当前应用未配置已填写 appid 的微信小程序客户端，无法生成体验版二维码',
    }
  }
  const pages = await deps.listClientPages(id, target.clientId)
  if (!pages.length) {
    return { available: false, reason: `小程序客户端「${target.clientName}」未分配页面，无法生成体验版` }
  }
  return { available: true, target, pageCount: pages.length }
}

export type UniQrOutcome =
  | { available: false; reason: string }
  | {
      available: true
      qrUrl: string
      releaseId: string
      version: number
      appid: string
      clientName: string
      pageCount: number
    }

/** 一步到位：解析目标 → 多页出码 → 建快照 → 构建 → 上传 → 回传二维码地址 */
export async function runUniQrPreview(
  appId: string | null | undefined,
  deps: UniQrDeps = defaultUniQrDeps,
): Promise<UniQrOutcome> {
  const id = String(appId || '').trim()
  const availability = await resolveUniQrAvailability(id, deps)
  if (!availability.available) {
    return { available: false, reason: availability.reason }
  }
  const { target } = availability

  const pages = await deps.listClientPages(id, target.clientId)
  const defs = await Promise.all(pages.map((p) => deps.getPageDef(p.pageId)))
  const client: UniClientConfig = {
    key: target.clientId,
    name: target.clientName,
    appid: target.appid,
    pages: defs.map((def, i) => ({
      key: def.key,
      title: def.name || def.key,
      nav: navOf(pages[i].navConfig),
    })) as UniClientPageEntry[],
  }

  // 清单即真相：逐页出码、合并产物（pages.json/manifest.json/App.vue 各页同源，覆盖同值）
  const files: Record<string, string> = {}
  for (const def of defs) {
    if (!def.schema || !String(def.schema).trim()) {
      throw new Error(`页面定义缺失（pageId 对应 key=${def.key || '未知'}），无法出码构建体验版`)
    }
    let schema: any
    try {
      schema = JSON.parse(def.schema)
    } catch {
      throw new Error(`页面定义无法解析（key=${def.key || '未知'}），无法出码构建体验版`)
    }
    Object.assign(files, generatePageUni(schema, { pageKey: def.key, pageName: def.name || def.key, client }).files)
  }

  const release = await deps.createRelease(id, target.clientId)
  const built = await deps.buildRelease(id, target.clientId, release.id, files)
  if (built.status !== 'PUBLISHED') {
    throw new Error(built.error || `构建未成功（${built.status || '未知状态'}），无法生成体验版二维码`)
  }
  const uploaded = await deps.uploadRelease(id, target.clientId, release.id)
  if (!uploaded.uploadedQrUrl) {
    throw new Error(uploaded.error || '上传未回传二维码，无法生成体验版二维码')
  }
  return {
    available: true,
    qrUrl: uploaded.uploadedQrUrl,
    releaseId: release.id,
    version: release.version,
    appid: target.appid,
    clientName: target.clientName,
    pageCount: pages.length,
  }
}