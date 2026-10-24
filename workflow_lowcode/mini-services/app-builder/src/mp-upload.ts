// app-builder 体验版上传内核（Task 9.3 Step 3，plan: mini-services/app-builder）。
// 职责：消费 9.2 归档的小程序产物目录（<archiveRoot>/<releaseId>/mp-weixin），
// 经 miniprogram-ci 以「本 Client 的 appid + 私钥」上传体验版，并生成体验版
// 预览二维码回传 qrUrl（spec: app-release-pipeline「体验版上传」）。
//
// 凭据口径：appId / privateKeyPath 全部由调用方（Java 后端按 Client 配置）入参，
// 本模块不持有任何全局单例配置——不同 Client 的凭证互不影响（spec 同名要求）。
//
// 可测性：miniprogram-ci 走惰性动态 import 且经 MiniCi 接口注入——单测注入替身
// 即可覆盖全部分支，不连微信、不读真实私钥；真实运行时段内不存在则给出明确错误。
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

/** V1 体验版上传仅支持小程序（uni build -p mp-weixin 产物） */
const MP_PLATFORM = 'mp-weixin'
/** releaseId 与 9.2 同口径：防穿越（拼进文件路径前先过白名单） */
const RELEASE_ID = /^[A-Za-z0-9_-]{1,64}$/
/** 二维码落点文件名（归档目录内，与产物目录并列） */
const QR_FILE = 'qr.png'

export interface MiniCiUploadOptions {
  projectPath: string
  appId: string
  privateKeyPath: string
  version: string
  desc: string
}

export interface MiniCiPreviewOptions {
  projectPath: string
  appId: string
  privateKeyPath: string
  desc: string
  qrcodeOutputDest: string
}

/** miniprogram-ci 最小适配面（测试注入替身） */
export interface MiniCi {
  upload(opts: MiniCiUploadOptions): Promise<unknown>
  preview(opts: MiniCiPreviewOptions): Promise<unknown>
}

export interface UploadExperienceInput {
  /** 归档根目录（与 9.2 buildApp 同源） */
  archiveRoot: string
  releaseId: string
  /** 默认 mp-weixin */
  platform?: string
  appId: string
  privateKeyPath: string
  /** 上传版本号（缺省回落 releaseId） */
  version?: string
  desc?: string
  /** 依赖注入替身（缺省 realMiniCi） */
  miniCi?: MiniCi
}

export type UploadResult =
  | { ok: true; qrUrl: string; qrPath: string }
  | { ok: false; error: string }

/** 归档产物目录：<archiveRoot>/<releaseId>/<platform>（与 9.2 buildApp 归档口径一致） */
export function archivedProjectPath(archiveRoot: string, releaseId: string, platform: string = MP_PLATFORM): string {
  return path.join(path.resolve(archiveRoot), releaseId, platform)
}

/**
 * 真实 miniprogram-ci 适配：惰性动态 import（未安装时段内报错，安装/真机上传时零改造）。
 * 同时兼容 CJS 默认导出与命名导出两种互操作形态。
 */
async function loadMiniCi(): Promise<any> {
  let mod: any
  try {
    mod = await import('miniprogram-ci')
  } catch (e: any) {
    throw new Error(`miniprogram-ci 未安装：${e?.message || e}（体验版上传需要该依赖）`)
  }
  return mod?.default && mod.default.Project ? mod.default : mod
}

function makeProject(ci: any, opts: { projectPath: string; appId: string; privateKeyPath: string }) {
  return new ci.Project({
    appid: opts.appId,
    type: 'miniProgram',
    projectPath: opts.projectPath,
    privateKeyPath: opts.privateKeyPath,
    ignores: [],
  })
}

/** 真跑 miniprogram-ci（server 使用；测试注入替身） */
export const realMiniCi: MiniCi = {
  async upload(opts) {
    const ci = await loadMiniCi()
    return ci.upload({
      project: makeProject(ci, opts),
      version: opts.version,
      desc: opts.desc,
      setting: { es6: true, minify: true, minifyWXSS: true, minifyWXML: true },
    })
  },
  async preview(opts) {
    const ci = await loadMiniCi()
    return ci.preview({
      project: makeProject(ci, opts),
      desc: opts.desc,
      qrcodeFormat: 'image',
      qrcodeOutputDest: opts.qrcodeOutputDest,
      setting: { es6: true, minify: true },
    })
  },
}

/**
 * 上传体验版 + 回传预览二维码。任一步失败回 {ok:false, error}（不抛——server 据此
 * 组 4xx/5xx）；二维码先删旧再生成，避免上个版本的残留文件被误当成本次产物。
 */
export async function uploadExperience(input: UploadExperienceInput): Promise<UploadResult> {
  const platform = input.platform ?? MP_PLATFORM
  if (platform !== MP_PLATFORM) {
    return { ok: false, error: `V1 体验版上传仅支持 ${MP_PLATFORM} 产物（得到 ${platform}）` }
  }
  if (!input.releaseId || !RELEASE_ID.test(input.releaseId)) {
    return { ok: false, error: `非法 releaseId：${String(input.releaseId)}` }
  }
  if (!input.appId || typeof input.appId !== 'string') {
    return { ok: false, error: '缺少小程序 appId（按 Client 配置的上传凭据）' }
  }
  if (!input.privateKeyPath || typeof input.privateKeyPath !== 'string') {
    return { ok: false, error: '缺少小程序 privateKeyPath（按 Client 配置的上传私钥）' }
  }

  const projectPath = archivedProjectPath(input.archiveRoot, input.releaseId, platform)
  if (!existsSync(projectPath)) {
    return { ok: false, error: `小程序产物不存在：${projectPath}（请先构建 Release）` }
  }

  const qrPath = path.join(path.resolve(input.archiveRoot), input.releaseId, QR_FILE)
  const qrUrl = `/artifacts/${input.releaseId}/${QR_FILE}`
  const version = input.version && input.version.trim() !== '' ? input.version : input.releaseId
  const desc = input.desc && input.desc.trim() !== '' ? input.desc : `体验版 v${version}`
  const miniCi = input.miniCi ?? realMiniCi

  try {
    await miniCi.upload({ projectPath, appId: input.appId, privateKeyPath: input.privateKeyPath, version, desc })
  } catch (e: any) {
    return { ok: false, error: `体验版上传失败：${e?.message || e}` }
  }

  try {
    mkdirSync(path.dirname(qrPath), { recursive: true })
    rmSync(qrPath, { force: true })
    await miniCi.preview({ projectPath, appId: input.appId, privateKeyPath: input.privateKeyPath, desc, qrcodeOutputDest: qrPath })
  } catch (e: any) {
    return { ok: false, error: `预览二维码生成失败：${e?.message || e}` }
  }

  if (!existsSync(qrPath)) {
    return { ok: false, error: `预览二维码未生成：${qrPath}` }
  }
  return { ok: true, qrUrl, qrPath }
}