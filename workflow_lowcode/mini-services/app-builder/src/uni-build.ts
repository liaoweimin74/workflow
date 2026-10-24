// app-builder 构建内核（Task 9.2 Step 3，plan: mini-services/app-builder）。
// 职责：接收 Java 后端转发的 {releaseId, platform, buildConfig, files}——
// 1) files（generatePageUni 产物，键为 src/ 相对路径）按 8.2 同纪律落盘到
//    shell 工程的 src/；2) `npx --no-install uni build -p mp-weixin|h5`；
// 3) 产物归档到 <archiveRoot>/<releaseId>/，回 {ok, artifactUrl, artifactPath}。
//
// 安全口径与 frontend/vite.uni-preview.ts 完全一致：文件名来自网络 = 不可信
// 输入，src/ 前缀 + 单段 SEGMENT 校验 + 白名单后缀 + 512KB 上限 + 绝对路径
// 双保险（防穿越）。
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** 单段文件名：首字符不能是点，杜绝 `.` / `..` / 隐藏文件（与 vite.uni-preview 同款） */
const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/
/** 产物后缀白名单：SFC / 工程清单 / api 模块（generatePageUni 现状形态） */
const ALLOWED_EXT = /\.(vue|json|ts)$/
const MAX_TEXT_LENGTH = 512_000
/** uni build 支持的平台白名单（spec: app-release-pipeline「按 Client 构建」） */
const PLATFORMS = new Set(['mp-weixin', 'h5'])
/** 平台 → uni build 产物子目录（dist/build/<platform>） */
const DIST_SUBDIR: Record<string, string> = {
  'mp-weixin': 'dist/build/mp-weixin',
  h5: 'dist/build/h5',
}

export interface BuildWrite {
  rel: string
  text: string
}

export type WritePlan =
  | { ok: true; writes: BuildWrite[] }
  | { ok: false; error: string }

export interface SpawnResult {
  code: number
  output: string
}

export type SpawnUni = (
  cmd: string,
  args: string[],
  opts?: { cwd: string },
) => Promise<SpawnResult>

export interface BuildAppInput {
  /** uni-shell 工程目录（files 落盘根 = <projectRoot>/src/） */
  projectRoot: string
  platform: string
  releaseId: string
  /** generatePageUni 产物（键为 src/ 相对路径，值为文本） */
  files?: Record<string, string>
  /** 归档根目录（产物复制到 <archiveRoot>/<releaseId>/<platform>.zip|dir） */
  archiveRoot: string
  /** spawn 替身（测试注入；缺省真跑 npx uni build） */
  spawnUni?: SpawnUni
}

export type BuildResult =
  | { ok: true; artifactUrl: string; artifactPath: string; output: string }
  | { ok: false; error: string }

function isSafeArtifactName(name: string): boolean {
  if (!name.startsWith('src/')) return false
  if (name.includes('\\')) return false
  if (!ALLOWED_EXT.test(name)) return false
  return name.split('/').every((s) => s !== '' && SEGMENT.test(s))
}

/** 纯函数：files → 落盘计划；非法归因（与 vite.uni-preview.planUniPreviewWrite 同纪律） */
export function planAppBuildWrite(payload: { files?: unknown }): WritePlan {
  const files = payload?.files
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    return { ok: false, error: '请求体没有 files 对象' }
  }
  const names = Object.keys(files)
  if (!names.length) return { ok: false, error: 'files 是空的' }
  const writes: BuildWrite[] = []
  for (const name of names) {
    if (!isSafeArtifactName(name)) return { ok: false, error: `非法产物文件名：${name}` }
    const text = (files as Record<string, unknown>)[name]
    if (typeof text !== 'string') return { ok: false, error: `产物正文不是字符串：${name}` }
    if (text.length > MAX_TEXT_LENGTH) return { ok: false, error: `产物正文过大：${name}` }
    writes.push({ rel: name, text })
  }
  return { ok: true, writes }
}

/**
 * 同步落盘：rel 形如 `src/pages/gen/home.vue`，落点 = path.resolve(projectRoot, rel)。
 * 双保险：换算后的绝对路径必须还在 <projectRoot>/src/ 里（防 SEGMENT 漏网穿越）。
 */
export function writeBuildFiles(projectRoot: string, writes: BuildWrite[]): void {
  const srcRoot = path.resolve(projectRoot, 'src')
  for (const w of writes) {
    const target = path.resolve(projectRoot, w.rel)
    if (target !== srcRoot && !target.startsWith(srcRoot + path.sep)) {
      throw new Error(`非法产物落点：${w.rel}`)
    }
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, w.text, 'utf8')
  }
}

/**
 * 真跑 uni build（server 使用；测试注入替身）。`npx --no-install uni build -p <platform>`：
 * uni CLI 来自 shell 工程 devDependencies（@dcloudio/vite-plugin-uni 附带），
 * `--no-install` 保证不越出工程本地依赖。
 */
export const defaultSpawnUni: SpawnUni = (cmd, args, opts) =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts?.cwd,
      shell: process.platform === 'win32',
      env: { ...process.env, NODE_ENV: 'production' },
    })
    let out = ''
    const tail = (chunk: Buffer) => {
      out += chunk.toString('utf8')
      if (out.length > 16_000) out = out.slice(-16_000)
    }
    child.stdout?.on('data', tail)
    child.stderr?.on('data', tail)
    child.on('error', (e) => reject(new Error(`uni build 启动失败：${e.message}`)))
    child.on('close', (code) => resolvePromise({ code: code ?? -1, output: out }))
  })

/**
 * 构建主流程：落盘 → uni build -p <platform> → 归档（cpSync 产物目录）。
 * 任一步失败回 {ok:false, error}（不抛——server 据此组 4xx/5xx 响应），
 * 不留半途归档（先构建成功再归档）。
 */
export async function buildApp(input: BuildAppInput): Promise<BuildResult> {
  const { projectRoot, platform, releaseId, archiveRoot } = input
  const spawnUni = input.spawnUni ?? defaultSpawnUni

  if (!PLATFORMS.has(platform)) {
    return { ok: false, error: `非法 platform：${platform}（仅 mp-weixin | h5）` }
  }
  if (!releaseId || typeof releaseId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(releaseId)) {
    return { ok: false, error: `非法 releaseId：${String(releaseId)}` }
  }

  const distSubdir = DIST_SUBDIR[platform]
  try {
    // uni build 消费 shell 工程源码；落盘在工程 src/ 下（页面/清单/api）
    const plan = planAppBuildWrite({ files: input.files })
    if (!plan.ok) return { ok: false, error: plan.error }
    writeBuildFiles(projectRoot, plan.writes)

    const distDir = path.resolve(projectRoot, distSubdir)
    const result = await spawnUni('npx', ['--no-install', 'uni', 'build', '-p', platform], {
      cwd: projectRoot,
    })
    if (result.code !== 0) {
      return { ok: false, error: `uni build 失败（exit ${result.code}）：${result.output.slice(-2000)}` }
    }
    if (!existsSync(distDir)) {
      return { ok: false, error: `uni build 完成但产物目录缺失：${distSubdir}` }
    }

    // 归档：产物目录复制到 <archiveRoot>/<releaseId>/<platform-dir>（V1 目录归档；
    // V70 语义 artifact_url 指向后端静态映射路径）
    const artifactPath = path.join(path.resolve(archiveRoot), releaseId, platform)
    cpSync(distDir, artifactPath, { recursive: true })
    const artifactUrl = `/artifacts/${releaseId}/${platform}`
    return { ok: true, artifactUrl, artifactPath, output: result.output }
  } catch (e: any) {
    return { ok: false, error: `构建归档失败：${e?.message || e}` }
  }
}
