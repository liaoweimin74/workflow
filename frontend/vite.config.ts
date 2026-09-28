import { defineConfig, type PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { spawn } from 'child_process'
import net from 'net'

// 【应急自愈看门狗】next dev(3000) 被 OOM 击杀后无人拉起：平台仅在容器启动时
// 执行一次 .zscripts/dev.sh，之后没有任何存活进程负责复活它；而运维会话里
// 启动的后台进程会在命令块结束时被整树回收（setsid 也无法幸免）。
// vite 监听自身配置文件变更会自动重启 → 借 configureServer 钩子探测 3000，
// 不通则以 detached 方式 spawn 根目录 `bun run dev`（父进程是本 vite 进程，
// 可长期存活；其内部 start-services.sh 幂等：8080/5173 健康时直接跳过）。
// 端口守卫保证 vite 每次重启时最多补拉一次，3000 存活时完全零开销。
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
      if (await portAlive(3000)) return
      console.log('[revive-next-dev] 3000 无响应，拉起 next dev ...')
      const child = spawn('bun', ['run', 'dev'], {
        cwd: '/home/z/my-project',
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
    }
  }
}

export default defineConfig({
  // 沙箱适配：唯一对外端口为 3000（Caddy→Next 门户），/lowcode/* 反代到本服务；
  // base 必须与门户反代路径一致，否则经 3000 访问时资源 404
  base: '/lowcode/',
  plugins: [vue(), tailwindcss(), reviveNextDev()],
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