import { defineConfig } from 'vite'

/**
 * 仓库内包：模块把现网实现指回宿主源码（`../../../src/...`），构建时把这些实现整体
 * external，dist 只留边界 re-export。这样宿主与产物共用同一份实现，包也不会把
 * 宿主应用代码或 element-plus/@form-create 复制进产物。
 *
 * 本期不发布 npm；file 依赖只在仓库内成立（design D3）。
 */
const HOST_SOURCE = /^(?:\.\.\/)+src\//

const EXTERNALS = new Set([
  'vue',
  'element-plus',
  'element-plus/es',
  'element-plus/lib',
  '@element-plus/icons-vue',
  'pinia',
  'vue-router',
  'axios',
  'markdown-it',
])

const isExternal = (id: string) =>
  EXTERNALS.has(id) || id.startsWith('@form-create/') || id.startsWith('echarts') || HOST_SOURCE.test(id)

const ENTRIES = {
  FormulaField: 'src/FormulaField.ts',
  LookupPicker: 'src/LookupPicker.ts',
  'dash-chart': 'src/dash-chart.ts',
  'dash-filter': 'src/dash-filter.ts',
  'dash-kpi': 'src/dash-kpi.ts',
  'dash-notice': 'src/dash-notice.ts',
  'dash-todo': 'src/dash-todo.ts',
  dataPicker: 'src/dataPicker.ts',
  http: 'src/http.ts',
  lookupFetch: 'src/lookupFetch.ts',
  'page-chart': 'src/page-chart.ts',
  'page-data-container': 'src/page-data-container.ts',
  'page-detail': 'src/page-detail.ts',
  'page-list-cards': 'src/page-list-cards.ts',
  'page-steps': 'src/page-steps.ts',
  'page-table': 'src/page-table.ts',
}

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    lib: {
      entry: ENTRIES,
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
