import { defineConfig, defaultExclude } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
    // 排除 e2e 测试（Playwright），避免 vitest 误收集
    exclude: [...defaultExclude, 'e2e/**'],
  },
})