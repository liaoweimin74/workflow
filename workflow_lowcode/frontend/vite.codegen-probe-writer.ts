// 【出码产物落盘中间件，dev-only】给前端「出码」按钮开一条写盘通道：
// 浏览器里 generatePage 出来的文件 POST 过来，落进 src/views/page/codegen/probe/，
// 于是点完按钮就能直接 /codegen-probe/<页名> 看产物真机渲染，不必回命令行跑 vitest。
//
// 为什么必须在这里校验：configureServer 只在 `vite dev` 里存在，而这个 dev server 绑的是
// 0.0.0.0 + allowedHosts:true（见 vite.config.ts），文件名来自浏览器 = 不可信输入。
// 口径：只允许 probe/ 目录下的 .vue/.ts，最多一层子目录（产物形态就是 `X.vue` + `api/x.ts`），
// 正文限 512KB，且只接受同源请求。生产构建不带这个中间件。
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

export const PROBE_WRITE_PATH = '/__lc-codegen/probe'
export const PROBE_DIR_REL = 'src/views/page/codegen/probe'
const MAX_TEXT_LENGTH = 512_000

/** 单段文件名：首字符不能是点，杜绝 `.` / `..` / 隐藏文件；分隔符只留 `-` 与 `_` */
const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/

export type ProbeWritePlan =
  | { ok: true; writes: { rel: string; name: string; text: string }[] }
  | { ok: false; error: string }

function isSafeArtifactName(name: string): boolean {
  if (!/\.(vue|ts)$/.test(name)) return false
  if (name.includes('\\')) return false
  const segments = name.split('/')
  if (segments.length > 2) return false
  return segments.every((s) => SEGMENT.test(s) && s !== 'probe')
}

/** 纯函数：把请求体换算成「要写哪些文件」，非法就给回一条归因 */
export function planProbeWrites(payload: any): ProbeWritePlan {
  const files = payload?.files
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    return { ok: false, error: '请求体没有 files 对象' }
  }
  const names = Object.keys(files)
  if (!names.length) return { ok: false, error: 'files 是空的' }

  const writes: { rel: string; name: string; text: string }[] = []
  for (const name of names) {
    if (!isSafeArtifactName(name)) return { ok: false, error: `非法产物文件名：${name}` }
    const text = files[name]
    if (typeof text !== 'string') return { ok: false, error: `产物正文不是字符串：${name}` }
    if (text.length > MAX_TEXT_LENGTH) return { ok: false, error: `产物正文过大：${name}` }
    writes.push({ rel: `${PROBE_DIR_REL}/${name}`, name, text })
  }
  return { ok: true, writes }
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

function readBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString('utf8')
      // 边收边限，别让一个超大请求先把内存吃掉
      if (raw.length > MAX_TEXT_LENGTH * 4) reject(new Error('请求体过大'))
    })
    req.on('end', () => resolve(raw))
    req.on('error', reject)
  })
}

export function codegenProbeWriter(rootDir: string): Plugin {
  return {
    name: 'lc-codegen-probe-writer',
    configureServer(server) {
      server.middlewares.use(PROBE_WRITE_PATH, async (req: any, res: any) => {
        const json = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') return json(405, { error: '只接受 POST' })
        if (!sameOrigin(req)) return json(403, { error: '只接受同源请求' })

        let plan: ProbeWritePlan
        try {
          plan = planProbeWrites(JSON.parse(await readBody(req)))
        } catch (e: any) {
          return json(400, { error: `请求体解析失败：${e?.message || e}` })
        }
        if (!plan.ok) return json(400, { error: plan.error })

        try {
          for (const w of plan.writes) {
            const target = path.resolve(rootDir, w.rel)
            // 双保险：换算后的绝对路径必须还在 probe/ 里
            const dir = path.resolve(rootDir, PROBE_DIR_REL)
            if (target !== dir && !target.startsWith(dir + path.sep)) {
              return json(400, { error: `非法产物文件名：${w.name}` })
            }
            mkdirSync(path.dirname(target), { recursive: true })
            writeFileSync(target, w.text, 'utf8')
          }
        } catch (e: any) {
          return json(500, { error: `写盘失败：${e?.message || e}` })
        }
        return json(200, { written: plan.writes.map((w) => w.name) })
      })
    }
  }
}
