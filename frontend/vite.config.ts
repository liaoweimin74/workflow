import { defineConfig, type PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import net from 'net'

// 【应急自愈看门狗】next dev(3000) 被 OOM 击杀后无人拉起：平台仅在容器启动时
// 执行一次 .zscripts/dev.sh，之后没有任何存活进程负责复活它；而运维会话里
// 启动的后台进程会在命令块结束时被整树回收（setsid 也无法幸免）。
// vite 监听自身配置文件变更会自动重启 → 借 configureServer 钩子探测 3000，
// 不通则以 detached 方式 spawn 根目录 `bun run dev`（父进程是本 vite 进程，
// 可长期存活；其内部 start-services.sh 幂等：8080/5173 健康时直接跳过）。
// 端口守卫保证 vite 每次重启时最多补拉一次，3000 存活时完全零开销。
//
// ⚠️ 沙箱限定：bun 与 /home/z/my-project 只存在于 Linux 沙箱容器。Windows 开发机
// 上 spawn 会 ENOENT 且（历史代码缺 error 监听）把 vite 整个带崩 —— 因此仅当
// 沙箱目录存在时才启用本看门狗，其余环境直接跳过。
const SANDBOX_ROOT = '/home/z/my-project'
const SANDBOX_ENV = process.platform !== 'win32' && existsSync(SANDBOX_ROOT)

function reviveNextDev(): PluginOption {
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
    name: 'revive-next-dev',
    async configureServer() {
      if (!SANDBOX_ENV) return
      if (await portAlive(3000)) return
      console.log('[revive-next-dev] 3000 无响应，拉起 next dev ...')
      const child = spawn('bun', ['run', 'dev'], {
        cwd: SANDBOX_ROOT,
        detached: true,
        stdio: 'ignore'
      })
      // 拉起失败（bun 缺失等）不影响 vite 本身
      child.on('error', () => {})
      child.unref()
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
    "(function(){try{if(location.port==='5173')return;var L=function(){this.readyState=1;var s=this;setTimeout(function(){var e={type:'open',target:s};typeof s.onopen==='function'&&s.onopen(e);((s.__l&&s.__l.open)||[]).forEach(function(c){c(e)})},0)};L.prototype.addEventListener=function(t,c){(this.__l=this.__l||{})[t]=this.__l[t]||[];this.__l[t].push(c)};L.prototype.removeEventListener=function(t,c){var l=this.__l&&this.__l[t];if(l)this.__l[t]=l.filter(function(f){return f!==c})};L.prototype.dispatchEvent=function(){return!0};L.prototype.send=function(){};L.prototype.close=function(){this.readyState=3};L.CONNECTING=0;L.OPEN=1;L.CLOSING=2;L.CLOSED=3;L.prototype.OPEN=1;L.prototype.CLOSED=3;window.WebSocket=L}catch(e){}})()"
  return {
    name: 'silence-proxied-hmr',
    transformIndexHtml() {
      return [{ tag: 'script', children: stubScript, injectTo: 'head-prepend' }]
    }
  }
}

export default defineConfig({
  // 沙箱适配：唯一对外端口为 3000（Caddy→Next 门户），/lowcode/* 反代到本服务；
  // base 必须与门户反代路径一致，否则经 3000 访问时资源 404
  base: '/lowcode/',
  plugins: [silenceProxiedHmr(), vue(), tailwindcss(), reviveNextDev()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // FcDesigner 使用项目内 vendor 源码（支持表单配置页签 formConfigExtra slot 扩展）
      '@form-create/designer': path.resolve(__dirname, 'src/vendor')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
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