import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { createDevTools } from '@vtj/pro/vite'
import path from 'path'

export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    tailwindcss(),
    // VTJ 设计器仅在开发模式启用，生产构建不注入 /__vtj__/ 路由
    ...(mode === 'development' ? [createDevTools()] : [])
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
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
}))