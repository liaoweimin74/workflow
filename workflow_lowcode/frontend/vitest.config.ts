import { defineConfig, defaultExclude } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  // 内联空 PostCSS 配置：同 vite.config.ts，阻止向上搜索到工作区根目录的 postcss.config.mjs
  css: {
    postcss: {},
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // 【真机探测 spike，未合并】出码相关测试要读 runtime 组件自己的 props 表，
      // 与 vite.config.ts / tsconfig.json 用同一套别名，别出现第二份真相
      '@lc/runtime': path.resolve(__dirname, 'src/lc-runtime'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    server: {
      deps: {
        // element-plus 的表单校验依赖 async-validator：element-plus 走 Node 外部依赖时，它内部
        // `import AsyncValidator from 'async-validator'`（CJS 入口）拿到的是被包了一层的命名空间对象，
        // `new AsyncValidator()` 直接 TypeError，校验 Promise 永不定态 —— el-form 的 rules 在测试里「永远通过」。
        // 让 element-plus 经 Vite 处理，互操作与生产一致，字段级校验才测得到。
        // 副作用：element-plus 自己会真去 import '@element-plus/icons-vue'，凡是手写整份图标 mock 的
        // 用例都得改成部分 mock（保留 actual），否则加载 element-plus 就报缺导出。
        inline: ['element-plus'],
      },
    },
    // 排除 e2e 测试（Playwright），避免 vitest 误收集
    exclude: [...defaultExclude, 'e2e/**'],
  },
})