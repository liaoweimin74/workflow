import { defineConfig, type PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import net from 'net'
import {
  getEngineStatus,
  switchBackendEngine,
  startJavaBuild,
  collectStatus,
  ensureAllServices,
} from '../../src/lib/service-supervisor'

// 【D+ 方案 2026-10-06】本 vite 直接接管 3000（Caddy 唯一对外端口），
// 原 Next 门户（next-server 1.26~1.93G）退役：
//   - base 由 /lowcode/ 改 /，vue-router/http.ts 经 import.meta.env.BASE_URL 自动适配
//   - /api/portal/* 由本文件 BFF 中间件承接（原 Next route handler 1:1 移植，
//     复用主项目 src/lib/service-supervisor.ts —— 纯 Node 实现零 Next 依赖）
//   - 其余 /api/* 仍由 server.proxy 转发 Java(8080)，BFF 中间件先于 proxy 执行不冲突
//     （已核实 Java 后端无 /api/portal 路由）

// 【应急自愈看门狗】Java 后端(8080) 假死/被杀后无人拉起：平台仅在容器启动时
// 执行一次启动链，之后没有任何存活进程负责复活它；而运维会话里
// 启动的后台进程会在命令块结束时被整树回收（setsid 也无法幸免）。
// vite 监听自身配置文件变更会自动重启 → 借 configureServer 钩子探测 8080，
// 不通则以 detached 方式 spawn scripts/start-services.sh（父进程是本 vite 进程，
// 可长期存活；start-services.sh 幂等：8080/3000 健康时直接跳过）。
//
// ⚠️ 沙箱限定：bun 与 /home/z/my-project 只存在于 Linux 沙箱容器。Windows 开发机
// 上 spawn 会 ENOENT 且（历史代码缺 error 监听）把 vite 整个带崩 —— 因此仅当
// 沙箱目录存在时才启用本看门狗，其余环境直接跳过。
const SANDBOX_ROOT = '/home/z/my-project'
const SANDBOX_ENV = process.platform !== 'win32' && existsSync(SANDBOX_ROOT)

function reviveBackend(): PluginOption {
  const portAlive = (port: number, timeout = 1500) =>
    new Promise<boolean>((resolve) => {
      const socket = net.connect({ port, host: '127.0.0.1' })
      const done = (ok: boolean) => {
        socket.destroy()
        resolve(ok)
      }
      socket.once('connect', () => done(true))
      socket.once('error', () => done(false))
      socket.setTimeout(timeout, () => done(false))
    })
  return {
    name: 'revive-backend',
    async configureServer() {
      if (!SANDBOX_ENV) return
      if (await portAlive(8080)) return
      console.log('[revive-backend] 8080 无响应，拉起 start-services.sh（幂等）...')
      const child = spawn('bash', ['scripts/start-services.sh'], {
        cwd: SANDBOX_ROOT,
        detached: true,
        stdio: 'ignore'
      })
      // 拉起失败不影响 vite 本身
      child.on('error', () => {})
      child.unref()
    }
  }
}

// 【门户 BFF 中间件】1:1 移植原 Next route handler（响应结构 { code, msg, data } 与
// HTTP 状态码保持一致），业务逻辑全部来自 service-supervisor：
//   GET  /api/portal/engine    查询当前引擎与 Java 版可用性
//   POST /api/portal/engine    { action: "switch" | "build-java", engine? }
//   GET  /api/portal/services  查询平台服务运行状态
//   POST /api/portal/services  确保服务已拉起（幂等）
// configureServer 内直接 use 的中间件先于 vite 内部（含 /api→8080 proxy）执行，
// 仅拦截 /api/portal 前缀，其余 /api/* 照旧转发 Java。
function portalBff(): PluginOption {
  const sendJson = (res: import('http').ServerResponse, status: number, payload: unknown) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(payload))
  }
  const readBody = (req: import('http').IncomingMessage) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        if (!raw) return resolve({})
        try {
          resolve(JSON.parse(raw))
        } catch {
          reject(new Error('INVALID_JSON'))
        }
      })
      req.on('error', reject)
    })
  return {
    name: 'portal-bff',
    configureServer(server) {
      server.middlewares.use('/api/portal', (req, res) => {
        void (async () => {
          const url = (req.url || '').split('?')[0]
          try {
            if (url === '/engine' || url === '/engine/') {
              if (req.method === 'GET') {
                return sendJson(res, 200, { code: 200, msg: 'ok', data: getEngineStatus() })
              }
              if (req.method === 'POST') {
                let body: { action?: string; engine?: string }
                try {
                  body = (await readBody(req)) as { action?: string; engine?: string }
                } catch {
                  return sendJson(res, 400, { code: 400, msg: '请求体必须是 JSON', data: null })
                }
                if (body.action === 'build-java') {
                  const r = startJavaBuild()
                  return sendJson(res, r.started ? 200 : 400, {
                    code: r.started ? 200 : 400,
                    msg: r.started
                      ? 'Java 版构建已启动（后台进行，约 10~20 分钟），可稍后刷新查看进度'
                      : r.reason ?? '无法启动构建',
                    data: getEngineStatus()
                  })
                }
                if (body.action === 'switch') {
                  const engine = body.engine
                  if (engine !== 'node' && engine !== 'java') {
                    return sendJson(res, 400, { code: 400, msg: 'engine 必须是 node 或 java', data: null })
                  }
                  const r = await switchBackendEngine(engine)
                  const services = await collectStatus()
                  return sendJson(res, r.ok ? 200 : 400, {
                    code: r.ok ? 200 : 400,
                    msg: r.message,
                    data: { services, engine: getEngineStatus() }
                  })
                }
                return sendJson(res, 400, { code: 400, msg: '未知 action，支持 switch / build-java', data: null })
              }
            }
            if (url === '/services' || url === '/services/') {
              if (req.method === 'GET') {
                return sendJson(res, 200, { code: 200, msg: 'ok', data: await collectStatus() })
              }
              if (req.method === 'POST') {
                const { services, actions } = await ensureAllServices()
                return sendJson(res, 200, { code: 200, msg: 'ok', data: { services, actions } })
              }
            }
            return sendJson(res, 404, { code: 404, msg: 'Not Found', data: null })
          } catch (e) {
            return sendJson(res, 500, { code: 500, msg: String((e as Error)?.message ?? e), data: null })
          }
        })()
      })
    }
  }
}

// 【代理环境 HMR 静默】(Task 132)：外层预览网关与 next 门户(3000)的反代均不转发
// WebSocket 升级，vite client 经这些链路访问时 wss 反复失败刷屏（vite 8 的
// hmr:false 仅停用服务端推送，client 仍会尝试建连）。往 head 最前注入一段同步
// 脚本：仅当"非直连 5173"时把 window.WebSocket 换成"立即假 OPEN"的 stub ——
// client 判定已连接后静默待机，零报错、零重试、无挂起；直连 5173（本地开发/
// 自动化测试）保持原生 WebSocket，HMR/overlay 行为不变。
function silenceProxiedHmr(): PluginOption {
  const stubScript =
    "(function(){try{if(location.port==='3000')return;var L=function(){this.readyState=1;var s=this;setTimeout(function(){var e={type:'open',target:s};typeof s.onopen==='function'&&s.onopen(e);((s.__l&&s.__l.open)||[]).forEach(function(c){c(e)})},0)};L.prototype.addEventListener=function(t,c){(this.__l=this.__l||{})[t]=this.__l[t]||[];this.__l[t].push(c)};L.prototype.removeEventListener=function(t,c){var l=this.__l&&this.__l[t];if(l)this.__l[t]=l.filter(function(f){return f!==c})};L.prototype.dispatchEvent=function(){return!0};L.prototype.send=function(){};L.prototype.close=function(){this.readyState=3};L.CONNECTING=0;L.OPEN=1;L.CLOSING=2;L.CLOSED=3;L.prototype.OPEN=1;L.prototype.CLOSED=3;window.WebSocket=L}catch(e){}})()"
  return {
    name: 'silence-proxied-hmr',
    transformIndexHtml() {
      return [{ tag: 'script', children: stubScript, injectTo: 'head-prepend' }]
    }
  }
}

export default defineConfig({
  // D+：本服务即唯一对外门户（Caddy→3000），base 回归根路径
  base: '/',
  plugins: [silenceProxiedHmr(), vue(), tailwindcss(), portalBff(), reviveBackend()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // FcDesigner 使用项目内 vendor 源码（支持表单配置页签 formConfigExtra slot 扩展）
      '@form-create/designer': path.resolve(__dirname, 'src/vendor')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    // 【Task 140 修复】Caddy 网关透传外部真实域名 Host（*.fcapp.run，含随机哈希
    // 且容器重启会变），vite 默认 host 白名单只放行 localhost/IP → 外部访问 403
    // "Blocked request"。放行平台域名族后缀通配（.开头=匹配任意层级子域），
    // 覆盖哈希变化；仅限沙箱预览网关链路使用。
    allowedHosts: ['.fcapp.run'],
    // 沙箱限定（Task 128）：外层预览网关不转发 HMR WebSocket 升级，
    // 浏览器侧反复重连 wss 失败刷屏。沙箱内禁用 HMR（手动刷新代替热更新，
    // 文件变更仍会触发 vite 按需重编译，刷新即得新代码）；Windows 开发机不受影响。
    hmr: SANDBOX_ENV ? false : undefined,
    watch: {
      usePolling: true
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  }
})