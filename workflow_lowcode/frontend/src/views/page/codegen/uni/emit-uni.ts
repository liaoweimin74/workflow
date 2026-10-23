/**
 * emitUniApp（Task 3.1 骨架）：uniapp 目标出码编排入口。
 *
 * design G3/D5：parse → IR 与 web 出码完全同源复用，本模块只做编排与工程文件组装；
 * 组件级模板按 component-map 逐族出码在 Task 5.x/7.x 落地，本任务先交付：
 *  · 页面 SFC 骨架（view 根组件 + 页面名注入）
 *  · pages.json / manifest.json / App.vue（project-files，清单即真相）
 *  · 报告（Task 2.4 per-target，uniapp 维度）
 */

import { emitManifest } from '../emit'
import type { GenerateResult } from '../ir'
import { parseIr } from '../parse'
import { buildReport } from '../report'
import { buildAppVue, buildManifestJson, buildPagesJson, type UniClientConfig } from './project-files'

export function generatePageUni(
  schema: { rule: any[]; option: any; dataSources: any[]; actions: any[] },
  meta: { pageKey: string; pageName: string; client: UniClientConfig },
): GenerateResult {
  const ir = parseIr(schema, { pageKey: meta.pageKey, pageName: meta.pageName, exportedAt: 'emit-uni' })
  const manifest = emitManifest(ir)

  const files: Record<string, string> = {
    [`src/pages/gen/${meta.pageKey}.vue`]: emitPageScaffold(meta.pageName),
    'src/pages.json': buildPagesJson(meta.client),
    'src/manifest.json': buildManifestJson(meta.client),
    'src/App.vue': buildAppVue(),
  }

  // 报告：per-target（Task 2.4）uniapp 维度。空洞反读需要 uniapp 模板反读器
  // （uniapp 模板非 el-* 形态，web reverse 不适用，Task 10.x 语料 Gate 时配套落），
  // 此处不喂产物 → holes 为空是「暂无可反读产物」的诚实值；unsupported（含
  // 三区能力矩阵条目）与 per-target 可出码率为真值。
  const report = buildReport(schema, meta.pageKey, manifest, {}, 'uniapp')
  return { files, manifest, report }
}

/** 页面 SFC 骨架：view 根组件 + 页面名注入（组件级模板出码 Task 5.x/7.x 落地） */
function emitPageScaffold(pageName: string): string {
  return `<template>
  <view class="lc-page">
    <!-- Task 3.1 骨架：组件级模板由 emit 按 component-map 逐族出码（Task 5.x/7.x） -->
    <text class="lc-page__title">{{ pageName }}</text>
  </view>
</template>

<script setup lang="ts">
// 运行期适配来自 @lc/runtime-uni（Task 3.2），模板出码落地前仅注入页面名
const pageName = ${JSON.stringify(pageName)}
</script>

<style scoped>
.lc-page {
  padding: 24rpx;
}
</style>
`
}
