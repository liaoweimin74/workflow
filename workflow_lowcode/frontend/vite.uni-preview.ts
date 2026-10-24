// 【uni 产物预览中间件，dev-only（Task 8.2）】给设计器「产物预览」开一条
// 落盘 + 构建 + 静态服务通道：浏览器把 generatePageUni 的 files POST 过来，
// 落进 uni-shell/src/，spawn `uni build`（H5），起一个本地静态服务（端口 5301），
// 返回预览 URL 与版本令牌（preview=true 口径的重挂依据）。
//
// 为什么在中间件里做：build 依赖 node 侧文件系统与子进程，浏览器做不了；
// 为什么不做成常驻 watch：spec mobile-preview「产物级预览 MUST NOT 被要求常驻运行」，
// 构建按需触发（预览按钮点亮页签时）。
//
// 安全口径（与 vite.codegen-probe-writer.ts 同纪律）：文件名来自浏览器 = 不可信输入。
// 只接受 uni-shell/src/ 下的白名单后缀（.vue/.json/.ts），路径必须以 src/ 开头
// （generatePageUni 的产物形态），正文限 512KB，且只接受同源请求。生产构建不带本中间件。
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, statSync, createReadStream, existsSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'

/** 中间件挂载路径（客户端 codegen-run 的 uni-preview 通道与本路径必须一致） */
export const PREVIEW_BUILD_PATH = '/__lc-codegen/uni-preview'
/** 产物 H5 静态服务端口（plan Task 8.2/10.1 钉死 5301） */
export const PREVIEW_PORT = 5301
/** uni-shell 工程目录（相对 frontend 根） */
export const UNI_SHELL_DIR_REL = 'uni-shell'
/** 产物落盘根：uni-shell/src/（generatePageUni files 的键就是 src/ 相对路径） */
const DEST_ROOT = `${UNI_SHELL_DIR_REL}/src`
const MAX_TEXT_LENGTH = 512_000

/** 单段文件名：首字符不能是点，杜绝 `.` / `..` / 隐藏文件；分隔符只留 `-` 与 `_` */
const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/
/** 产物后缀白名单：SFC / 工程清单 / api 模块（generatePageUni 现状形态） */
const ALLOWED_EXT = /\.(vue|json|ts)$/

export interface UniPreviewWrite {
  rel: string
  text: string
}

export type UniPreviewPlan =
  | { ok: true; writes: UniPreviewWrite[]; written: string[] }
  | { ok: false; error: string }

function isSafeArtifactName(name: string): boolean {
  if (!name.startsWith('src/')) return false
  if (name.includes('\\')) return false
  if (!ALLOWED_EXT.test(name)) return false
  return name.split('/').every((s) => s !== '' && SEGMENT.test(s))
}

/**
 * 纯函数：把请求体换算成「要写哪些文件」，非法就给回一条归因。
 * files 键是 generatePageUni 的产物名（src/...），落点 = uni-shell/<键>。
 */
export function planUniPreviewWrite(payload: any): UniPreviewPlan {
  // pageKey 会拼进产物页路径（src/pages/gen/<pageKey>.vue）与 previewUrl，
  // 与文件名段同纪律：必须是单段合法名（'../evil' 这类直接拒绝）
  const pageKey = payload?.pageKey
  if (typeof pageKey !== 'string' || !SEGMENT.test(pageKey)) {
    return { ok: false, error: `非法 pageKey：${String(pageKey)}` }
  }
  const files = payload?.files
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    return { ok: false, error: '请求体没有 files 对象' }
  }
  const names = Object.keys(files)
  if (!names.length) return { ok: false, error: 'files 是空的' }

  const writes: UniPreviewWrite[] = []
  for (const name of names) {
    if (!isSafeArtifactName(name)) return { ok: false, error: `非法产物文件名：${name}` }
    const text = files[name]
    if (typeof text !== 'string') return { ok: false, error: `产物正文不是字符串：${name}` }
    if (text.length > MAX_TEXT_LENGTH) return { ok: false, error: `产物正文过大：${name}` }
    writes.push({ rel: `${DEST_ROOT}/${name.slice('src/'.length)}`, text })
  }
  return { ok: true, writes, written: [...names].sort() }
}

/** 请求体读取（与 probe-writer 同款：边收边限） */
function readBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString('utf8')
      if (raw.length > MAX_TEXT_LENGTH * 4) reject(new Error('请求体过大'))
    })
    req.on('end', () => resolve(raw))
    req.on('error', reject)
  })
}

function sameOrigin(req: any): boolean {
  const host = String(req.headers.host || '')
  for (const key of ['origin', 'referer']) {
    const value = req.headers[key]
    if (!value) continue
    try {
      if (new URL(String(value)).host !== host) return false
    } catch {
      return false
    }
  }
  return true
}

/**
 * 同步落盘（构建前置）：写 uni-shell/src/ 下产物文件。
 * 独立导出：build-preview 脚本（scripts/build-preview.mjs 等价路径）与中间件共用。
 */
export function writeUniPreviewFiles(rootDir: string, writes: UniPreviewWrite[]): void {
  for (const w of writes) {
    const target = path.resolve(rootDir, w.rel)
    const root = path.resolve(rootDir, DEST_ROOT)
    // 双保险：换算后的绝对路径必须还在 uni-shell/src/ 里
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error(`非法产物落点：${w.rel}`)
    }
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, w.text, 'utf8')
  }
}

/**
 * 按需触发 uni build（H5）。解析失败/非零退出 reject，stdout/stderr 尾部带回错误信息。
 * uni CLI 来自 uni-shell 的 devDependencies（@dcloudio/vite-plugin-uni 附带），用
 * `npx --no-install uni build` 保证不越出工程本地依赖。
 */
export function runUniBuild(rootDir: string): Promise<string> {
  const shellDir = path.resolve(rootDir, UNI_SHELL_DIR_REL)
  return new Promise((resolvePromise, reject) => {
    const child = spawn('npx', ['--no-install', 'uni', 'build'], {
      cwd: shellDir,
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
    child.on('close', (code) => {
      if (code === 0) resolvePromise(out)
      else reject(new Error(`uni build 失败（exit ${code}）：${out.slice(-2000)}`))
    })
  })
}

export interface UniPreviewState {
  /** 版本令牌：每次成功构建 +1（preview 面板用它强制 iframe 重挂） */
  version: number
  /** 最近一次构建时间（ISO）；未构建过为 null */
  builtAt: string | null
  /** 最近一次构建的 pageKey */
  pageKey: string | null
}

/**
 * 中间件：POST { pageKey, pageName, client, files } →
 * 落盘 uni-shell/src/ → uni build（H5）→ { ok, version, previewUrl, builtAt }。
 * 版本令牌随每次成功构建递增（同一次会话内存态；dev server 重启归零可接受——
 * iframe 重挂的对手方是本次会话里上一次构建）。
 * 首次构建成功后惰性起 5301 静态服务（幂等复用；没触发过构建就不占端口）。
 */
export function uniPreviewPlugin(rootDir: string): Plugin {
  const state: UniPreviewState = { version: 0, builtAt: null, pageKey: null }
  let h5Server: http.Server | null = null
  return {
    name: 'lc-uni-preview',
    configureServer(server) {
      server.middlewares.use(PREVIEW_BUILD_PATH, async (req: any, res: any) => {
        const json = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') return json(405, { error: '只接受 POST' })
        if (!sameOrigin(req)) return json(403, { error: '只接受同源请求' })

        let payload: any
        try {
          payload = JSON.parse(await readBody(req))
        } catch (e: any) {
          return json(400, { error: `请求体解析失败：${e?.message || e}` })
        }
        const plan = planUniPreviewWrite(payload)
        if (!plan.ok) return json(400, { error: plan.error })

        try {
          writeUniPreviewFiles(rootDir, plan.writes)
        } catch (e: any) {
          return json(500, { error: `落盘失败：${e?.message || e}` })
        }
        try {
          await runUniBuild(rootDir)
        } catch (e: any) {
          return json(500, { error: e?.message || 'uni build 失败' })
        }
        if (!h5Server) h5Server = startUniPreviewServer(rootDir)
        state.version += 1
        state.builtAt = new Date().toISOString()
        state.pageKey = String(payload?.pageKey || '')
        return json(200, {
          ok: true,
          version: state.version,
          builtAt: state.builtAt,
          previewUrl: `http://localhost:${PREVIEW_PORT}/#/pages/gen/${state.pageKey}?v=${state.version}`,
          pageKey: state.pageKey,
        })
      })
    }
  }
}

/** 产物 H5 静态服务根：uni build（h5）的输出目录 */
const H5_DIST_REL = path.join('dist', 'build', 'h5')

const MIME_BY_EXT: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
}

/**
 * 产物 H5 静态服务（node:http 裸服务，无 vite 依赖）：
 * serve <rootDir>/dist/build/h5。dev server 里按需惰性起 + 幂等复用；
 * 供中间件、build-preview 脚本与测试共同使用。
 */
export function startUniPreviewServer(rootDir: string, port: number = PREVIEW_PORT): http.Server {
  const h5Root = path.resolve(rootDir, H5_DIST_REL)
  const server = http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname)
      // 单段校验兜底：只允许 / 下的普通段，杜绝 .. 穿越（Windows 上反斜杠也算分隔符）
      const segments = urlPath.split('/').filter(Boolean)
      if (segments.some((s) => s === '..' || s.includes('\\'))) {
        res.statusCode = 400
        res.end('bad path')
        return
      }
      let file = path.join(h5Root, ...segments)
      const rel = segments.join('/')
      const looksLikeAsset = /\.(html|js|mjs|css|json|png|jpe?g|gif|svg|ico|woff2?|ttf|map)$/i.test(rel)
      if (!rel || !existsSync(file) || !statSync(file).isFile()) {
        if (rel && looksLikeAsset) {
          // 明确的资源请求（带后缀）不存在 → 404（SPA 兜底会把 HTML 当资源内容，不能回 index）
          res.statusCode = 404
          res.end('uni h5 产物未构建或资源不存在：请先在「产物预览」页签触发构建')
          return
        }
        // hash router：根路径与无后缀导航路径统一落 index.html（SPA 行为）
        file = path.join(h5Root, 'index.html')
        if (!existsSync(file)) {
          res.statusCode = 404
          res.end('uni h5 产物未构建：请先在「产物预览」页签触发构建')
          return
        }
      }
      res.statusCode = 200
      res.setHeader('content-type', MIME_BY_EXT[path.extname(file).toLowerCase()] || 'application/octet-stream')
      createReadStream(file).pipe(res)
    } catch (e: any) {
      res.statusCode = 500
      res.end(`static serve 失败：${e?.message || e}`)
    }
  })
  server.listen(port)
  return server
}
