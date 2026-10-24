import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { UniEcharts } from 'uni-echarts/vite'

/**
 * uni-shell：低代码 uniapp 产物宿主工程（Task 3.3）。
 * 工具链版本在 package.json 锁死（@dcloudio 全家桶同一日期线 + vite 5.2.8 peer 锁）；
 * 生成页落在 src/pages/gen/（generatePageUni().files 同步写入，Task 8.x 接线）。
 * UniEcharts 插件（Task 7.1 spike）：自动排除 uni-echarts 预构建 + 注入 provideEcharts，
 * 产物页直接 import UniEcharts 组件即可（免手动 provide）。
 *
 * base（Task 10.1 同源托管）：H5 构建基路径由 UNI_H5_BASE 注入。上游 uni-h5-vite 的
 * h5 router.base 取自 vite 的 base（node_modules/@dcloudio/uni-h5-vite/dist/plugins/
 * manifestJson.js:35-46，manifest.json 的 h5.router 不带 base 时），因此**资产路径与
 * hash 路由基路径一并跟着走**，manifest.json 无需改。缺省 '/' = 发布构建口径
 * （独立部署在域名根路径）；预览构建注入 /__lc-codegen/uni-static/ 以便与宿主同源托管。
 */
export default defineConfig({
  base: process.env.UNI_H5_BASE || '/',
  plugins: [uni(), UniEcharts()],
})
