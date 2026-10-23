import { defineConfig } from 'vite'

/**
 * @lc/runtime-uni library 构建：vue external；uni 是宿主工程的全局对象
 * （uni-app 运行时注入），包内以裸标识符引用、不参与打包。对位 P2
 * runtime-package-build Gate——若哪天把 vue 源码打进包，包测试先红。
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    lib: {
      entry: {
        http: 'src/http.ts',
        form: 'src/form.ts',
        actions: 'src/actions.ts',
        charts: 'src/charts.ts',
        formula: 'src/formula.ts',
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: (id: string) => id === 'vue' || id.startsWith('vue/'),
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
})
