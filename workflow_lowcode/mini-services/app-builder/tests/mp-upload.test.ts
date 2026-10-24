// Task 9.3 Step 3——app-builder 体验版上传内核测试（spec: app-release-pipeline
// 「体验版上传」）。
// 覆盖：miniprogram-ci 上传 + 预览二维码回传（artifact 目录 → qrUrl）、
// 凭据按调用入参（appId/privateKeyPath，不复用全局单例）、
// 上传/预览失败可追溯、形状与前置条件校验（缺凭据 / 非法 releaseId /
// 未构建产物 / 非 mp-weixin 平台）。
// miniCi 注入替身，不真连微信、不真读私钥。
import { mkdtempSync, mkdirSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { uploadExperience, archivedProjectPath, type MiniCi } from '../src/mp-upload'

let root: string
let archiveRoot: string

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'mp-upload-'))
  archiveRoot = path.join(root, 'artifacts')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** 造出 9.2 buildApp 的归档产物形态：<archiveRoot>/<releaseId>/mp-weixin/ */
function seedArchivedProject(releaseId: string, platform = 'mp-weixin'): string {
  const dir = path.join(archiveRoot, releaseId, platform)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'app.json'), '{}')
  return dir
}

/** 记录调用的 miniCi 替身；preview 按真实行为把二维码写到 qrcodeOutputDest */
function fakeMiniCi(overrides: Partial<MiniCi> = {}): { ci: MiniCi; uploads: any[]; previews: any[] } {
  const uploads: any[] = []
  const previews: any[] = []
  const ci: MiniCi = {
    async upload(opts) {
      uploads.push(opts)
      return { subPackageInfo: [] }
    },
    async preview(opts) {
      previews.push(opts)
      writeFileSync(opts.qrcodeOutputDest, 'PNGDATA')
      return { errCode: 0 }
    },
    ...overrides,
  }
  return { ci, uploads, previews }
}

const base = () => ({
  archiveRoot,
  releaseId: 'rel1',
  appId: 'wx1234',
  privateKeyPath: '/keys/wx1234.key',
  version: '3',
  desc: '体验版 v3',
})

describe('uploadExperience 成功路径', () => {
  it('上传体验版 + 回传预览二维码，凭据按入参透传', async () => {
    seedArchivedProject('rel1')
    const { ci, uploads, previews } = fakeMiniCi()

    const result = await uploadExperience({ ...base(), miniCi: ci })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.qrUrl).toBe('/artifacts/rel1/qr.png')
    // 二维码真实落到归档目录（供静态映射服务）
    expect(existsSync(result.qrPath)).toBe(true)
    expect(result.qrPath).toBe(path.join(archiveRoot, 'rel1', 'qr.png'))

    // 上传：项目路径 = 9.2 归档产物；appid/私钥来自本 Client 入参（非全局单例）
    expect(uploads).toHaveLength(1)
    expect(uploads[0].projectPath).toBe(archivedProjectPath(archiveRoot, 'rel1'))
    expect(uploads[0].appId).toBe('wx1234')
    expect(uploads[0].privateKeyPath).toBe('/keys/wx1234.key')
    expect(uploads[0].version).toBe('3')
    // 上传成功后同源生成预览二维码
    expect(previews).toHaveLength(1)
    expect(previews[0].qrcodeOutputDest).toBe(path.join(archiveRoot, 'rel1', 'qr.png'))
    expect(previews[0].appId).toBe('wx1234')
  })

  it('未给 version 时回落 releaseId 作为版本号', async () => {
    seedArchivedProject('rel2')
    const { ci, uploads } = fakeMiniCi()

    const result = await uploadExperience({ archiveRoot, releaseId: 'rel2', appId: 'wx1', privateKeyPath: '/k.key', miniCi: ci })

    expect(result.ok).toBe(true)
    expect(uploads[0].version).toBe('rel2')
  })
})

describe('uploadExperience 失败可追溯', () => {
  it('miniprogram-ci 上传失败 → ok:false + error', async () => {
    seedArchivedProject('rel3')
    const { ci } = fakeMiniCi({ upload: async () => { throw new Error('invalid ip, not in whitelist') } })

    const result = await uploadExperience({ ...base(), releaseId: 'rel3', miniCi: ci })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('invalid ip')
  })

  it('二维码生成失败（ci 未产出文件）→ ok:false', async () => {
    seedArchivedProject('rel4')
    const { ci } = fakeMiniCi({ preview: async () => ({ errCode: 0 }) })

    const result = await uploadExperience({ ...base(), releaseId: 'rel4', miniCi: ci })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('二维码')
  })

  it('二维码生成抛错 → ok:false + error', async () => {
    seedArchivedProject('rel5')
    const { ci } = fakeMiniCi({ preview: async () => { throw new Error('preview boom') } })

    const result = await uploadExperience({ ...base(), releaseId: 'rel5', miniCi: ci })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('preview boom')
  })
})

describe('uploadExperience 前置条件与形状校验', () => {
  it('缺 appId / privateKeyPath → ok:false', async () => {
    seedArchivedProject('rel6')
    const { ci, uploads } = fakeMiniCi()

    const noAppId = await uploadExperience({ ...base(), releaseId: 'rel6', appId: '', miniCi: ci })
    expect(noAppId.ok).toBe(false)
    if (!noAppId.ok) expect(noAppId.error).toContain('appId')

    const noKey = await uploadExperience({ ...base(), releaseId: 'rel6', privateKeyPath: '', miniCi: ci })
    expect(noKey.ok).toBe(false)
    if (!noKey.ok) expect(noKey.error).toContain('privateKeyPath')

    expect(uploads).toHaveLength(0)
  })

  it('非 mp-weixin 平台拒绝（V1 仅小程序支持体验版）', async () => {
    seedArchivedProject('rel7', 'h5')
    const { ci, uploads } = fakeMiniCi()

    const result = await uploadExperience({ ...base(), releaseId: 'rel7', platform: 'h5', miniCi: ci })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('mp-weixin')
    expect(uploads).toHaveLength(0)
  })

  it('非法 releaseId 拒绝', async () => {
    const { ci } = fakeMiniCi()

    const result = await uploadExperience({ ...base(), releaseId: '../evil', miniCi: ci })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('releaseId')
  })

  it('未构建产物（归档目录不存在）→ ok:false，先构建后上传', async () => {
    const { ci, uploads } = fakeMiniCi()

    const result = await uploadExperience({ ...base(), releaseId: 'never-built', miniCi: ci })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('产物')
    expect(uploads).toHaveLength(0)
  })
})