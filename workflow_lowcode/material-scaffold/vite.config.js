import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 物料构建：产物为单文件 ESM，宿主依赖一律 external（不打进包）。
// vue / element-plus / @platform/sdk 由宿主 index.html 的 import map 解析，
// 物料与宿主共用同一 Vue 实例（provide/inject、全局状态才可用）。
// SFC 样式由 scripts/gen-manifest.mjs 在构建后内联进 bundle（物料契约=单 JS + manifest）。
export default defineConfig({
  // 内联空 PostCSS 配置：阻止向上搜索到工作区根的 postcss.config.mjs（Next.js 门户配置）
  css: {
    postcss: {}
  },
  plugins: [vue()],
  build: {
    lib: {
      entry: 'src/index.js',
      formats: ['es'],
      fileName: () => 'bundle.js'
    },
    rollupOptions: {
      external: ['vue', 'element-plus', '@platform/sdk']
    },
    outDir: 'dist/page',
    emptyOutDir: true,
    minify: false,
    cssCodeSplit: false
  }
})
