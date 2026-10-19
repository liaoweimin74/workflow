import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 组件型物料（WIDGET）构建：与页面型同一套契约（单文件 ESM + manifest，宿主依赖 external），
// 只是入口与产物目录不同——两个 target 各自 emptyOutDir，互不清掉对方产物。
export default defineConfig({
  css: {
    postcss: {}
  },
  plugins: [vue()],
  build: {
    lib: {
      entry: 'src/widget.js',
      formats: ['es'],
      fileName: () => 'bundle.js'
    },
    rollupOptions: {
      external: ['vue', 'element-plus', '@platform/sdk']
    },
    outDir: 'dist/widget',
    emptyOutDir: true,
    minify: false,
    cssCodeSplit: false
  }
})
