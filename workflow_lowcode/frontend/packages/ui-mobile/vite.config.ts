import { defineConfig } from 'vite'

/**
 * @lc/ui-mobile library 构建：vue/element-plus 全部 external，dist 只留契约组件的
 * ES 模块产物（皮肤 token 在 theme.js）。对位 P2 runtime-package-build Gate——
 * 若哪天把 element-plus 源码打进包，包测试先红。
 */
const EXTERNALS = new Set(['vue', 'element-plus', 'element-plus/es', 'element-plus/lib'])

const isExternal = (id: string) => EXTERNALS.has(id) || id.startsWith('element-plus')

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    lib: {
      entry: {
        index: 'src/index.ts',
        theme: 'src/theme.ts',
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: isExternal,
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
})
