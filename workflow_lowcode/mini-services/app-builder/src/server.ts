// app-builder HTTP 服务（Task 9.2 Step 3）。
//
// Java 后端（AppReleaseBuildService）经 RestClient POST /build 转发构建请求：
//   {releaseId, platform, buildConfig, files}
//   → uni-build.buildApp 落盘 + `uni build -p <platform>` + 归档
//   → {ok:true, artifactUrl, artifactPath} | 4xx/5xx {ok:false, error}
//
// 零运行时依赖（node:http）；TS 直跑（node --experimental-strip-types，
// Node >= 22.6，engines 已钉）。buildConfig 在 V1 不参与 shell 工程
// 改写（manifest appid 由 uni-shell 现状提供），先透传校验后忽略——
// 9.3 上传（miniprogram-ci）才消费 appid 凭证。
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
// 显式 .ts 扩展名：node --experimental-strip-types 直跑 ESM 需要（vitest 亦兼容）
import { buildApp } from './uni-build.ts'

const MAX_BODY = 4_000_000

export interface ServerOptions {
  port?: number
  /** uni-shell 工程目录（files 落盘根） */
  projectRoot: string
  /** 归档根目录 */
  archiveRoot: string
  /** 构建替身（测试注入；缺省 buildApp 内部走 defaultSpawnUni） */
  buildFn?: typeof buildApp
}

export interface BuildRequestBody {
  releaseId?: unknown
  platform?: unknown
  buildConfig?: unknown
  files?: unknown
}

function readBody(req: IncomingMessage, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString('utf8')
      if (raw.length > max) {
        reject(new Error('请求体过大'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(raw))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

/**
 * 组装 buildApp 入参并执行；请求体形状问题归 400，构建失败归 500。
 * 独立导出供测试直调（不占端口）。
 */
export async function handleBuild(
  body: BuildRequestBody,
  opts: Pick<ServerOptions, 'projectRoot' | 'archiveRoot' | 'buildFn'>,
): Promise<{ status: number; payload: unknown }> {
  const releaseId = typeof body.releaseId === 'string' ? body.releaseId : ''
  const platform = typeof body.platform === 'string' ? body.platform : ''
  if (!releaseId) return { status: 400, payload: { ok: false, error: 'releaseId 不能为空' } }
  if (!platform) return { status: 400, payload: { ok: false, error: 'platform 不能为空' } }
  if (!body.files || typeof body.files !== 'object' || Array.isArray(body.files)) {
    return { status: 400, payload: { ok: false, error: 'files 不能为空（generatePageUni 产物对象）' } }
  }
  const result = await (opts.buildFn ?? buildApp)({
    projectRoot: opts.projectRoot,
    platform,
    releaseId,
    files: body.files as Record<string, string>,
    archiveRoot: opts.archiveRoot,
  })
  if (!result.ok) {
    return { status: 500, payload: { ok: false, error: result.error } }
  }
  return { status: 200, payload: { ok: true, artifactUrl: result.artifactUrl, artifactPath: result.artifactPath } }
}

/** 创建 app-builder server（listen 由调用方控制，便于测试端口注入） */
export function createAppBuilderServer(opts: ServerOptions): Server {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost')
      if (req.method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, { ok: true, service: 'app-builder' })
      }
      if (req.method === 'POST' && url.pathname === '/build') {
        let body: BuildRequestBody
        try {
          body = JSON.parse(await readBody(req, MAX_BODY))
        } catch (e: any) {
          return sendJson(res, 400, { ok: false, error: `请求体解析失败：${e?.message || e}` })
        }
        const { status, payload } = await handleBuild(body, opts)
        return sendJson(res, status, payload)
      }
      return sendJson(res, 404, { ok: false, error: 'not found' })
    } catch (e: any) {
      return sendJson(res, 500, { ok: false, error: `app-builder 内部错误：${e?.message || e}` })
    }
  })
}

/** 入口：env 注入工程目录与归档目录（本地开发默认对准 worktree 内 uni-shell） */
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href) {
  const port = Number(process.env.APP_BUILDER_PORT || 5302)
  const projectRoot = process.env.APP_BUILDER_PROJECT_ROOT || ''
  const archiveRoot = process.env.APP_BUILDER_ARCHIVE_ROOT || 'artifacts'
  if (!projectRoot) {
    console.error('[app-builder] 缺少 APP_BUILDER_PROJECT_ROOT（uni-shell 工程目录）')
    process.exit(1)
  }
  createAppBuilderServer({ port, projectRoot, archiveRoot }).listen(port, () => {
    console.log(`[app-builder] listening on :${port} (projectRoot=${projectRoot}, archiveRoot=${archiveRoot})`)
  })
}
