import { createSSRApp } from 'vue'
import App from './App.vue'
import { pageDeps } from './uni-api/glue'

// uni-app Vue3 入口约定：导出 createApp（Task 3.3 骨架）
export function createApp() {
  const app = createSSRApp(App)
  // glue 挂全局属性：生成页（src/pages/gen/*.vue）经 $lc 消费运行时依赖
  // （依赖单向：gen 页 → glue → @lc/runtime-uni，Task 5.x 模板接线）
  app.config.globalProperties.$lc = pageDeps
  return { app }
}
