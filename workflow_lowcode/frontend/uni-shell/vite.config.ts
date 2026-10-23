import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

/**
 * uni-shell：低代码 uniapp 产物宿主工程（Task 3.3）。
 * 工具链版本在 package.json 锁死（@dcloudio 全家桶同一日期线 + vite 5.2.8 peer 锁）；
 * 生成页落在 src/pages/gen/（generatePageUni().files 同步写入，Task 8.x 接线）。
 */
export default defineConfig({
  plugins: [uni()],
})
