import { defineConfig, type PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// 【D+ 架构（用户 2026-10-08 定调）：低代码 vite 独占 3000】
// - Next.js 门户（next-server）按方案不再启动，节省约 1.5GB 内存；
//   原 reviveNextDev 看门狗随之移除（它的职责是把 next dev 拉回来，与方案相悖）。
// - vite 直接监听 3000，应用位于根路径（base=/），旧 /lowcode/ 路径随之作废；
//   router/http 均取 import.meta.env.BASE_URL，base 变更自动生效。
// - /api 反代到 8080 后端（用户口径「java 后端」，实际 node dist/main.js 引擎）。
// - allowedHosts 放行全部 Host：沙箱为内网开发服务，预览域名不固定；
//   外域探测（fcapp.run Host 头）与 preview-*.space-z.ai 预览均依赖此放行。
export default defineConfig({
  base: '/',
  plugins: [vue(), tailwindcss()],
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
    allowedHosts: true,
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
