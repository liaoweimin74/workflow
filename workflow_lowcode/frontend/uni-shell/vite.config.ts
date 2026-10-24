import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { UniEcharts } from 'uni-echarts/vite'

/**
 * uni-shell：低代码 uniapp 产物宿主工程（Task 3.3）。
 * 工具链版本在 package.json 锁死（@dcloudio 全家桶同一日期线 + vite 5.2.8 peer 锁）；
 * 生成页落在 src/pages/gen/（generatePageUni().files 同步写入，Task 8.x 接线）。
 * UniEcharts 插件（Task 7.1 spike）：自动排除 uni-echarts 预构建 + 注入 provideEcharts，
 * 产物页直接 import UniEcharts 组件即可（免手动 provide）。
 */
export default defineConfig({
  plugins: [uni(), UniEcharts()],
})
