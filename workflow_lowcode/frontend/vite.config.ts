import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  // 网关子路径部署：沙箱仅暴露一个端口，经 Caddy 将 /lowcode/* 转发到本 dev server
  base: '/lowcode/',
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
    // 允许经网关（任意 Host 头）访问
    allowedHosts: true,
    // 经 Next.js 中间件反代无法升级 WebSocket，先关闭 HMR（改动后手动刷新）
    hmr: false,
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