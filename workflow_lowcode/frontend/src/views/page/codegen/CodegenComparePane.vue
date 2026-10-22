<!--
双渲染对照（design D5 的人工版）：同一份页面定义，左边宿主渲染、右边出码产物渲染。
两侧都是真组件、不是截图：宿主走 PageRendererPage（与 /page/<key>?preview=true 同一棵子树），
产物走 codegen/probe/ 下落盘的出码产物（与 /codegen-probe/<key> 同一份文件）。
route.params.pageKey 由验证台保证等于当前页名，所以宿主侧的组件身份（pageKey）与真路由一致。
-->
<script setup lang="ts">
import type { RouteComponent } from 'vue-router'
import type { PageDefinitionDetailDTO } from '@/api/page'
import PageRendererPage from '@/views/page/PageRendererPage.vue'

defineProps<{
  pageKey: string
  /** 宿主侧定义：与 PageRenderer 下传的那份同形（type / schema / name / key），额外带一个 pageKey 供索引 */
  definition: PageDefinitionDetailDTO
  /** 磁盘上的产物组件；没有就是 undefined，面板负责把「为什么没有」说出来 */
  artifact?: RouteComponent | null
  /** 与本次生成逐字节不同的产物文件名：不改就不是同一份东西，对照结论也就不成立 */
  mismatch?: string[]
  /**
   * 挂载令牌：PageRendererPage 只在 onMounted 读一次 definition，换定义不重挂就还是上一份的渲染结果。
   * 验证台每次生成 +1（含语料↔活库切换、重新生成）。
   */
  revision?: number
}>()
</script>

<template>
  <div class="codegen-compare">
    <section class="codegen-compare__side codegen-compare__side--host">
      <h4 class="codegen-compare__title">宿主渲染（PageRendererPage）</h4>
      <div class="codegen-compare__body">
        <PageRendererPage :key="`${pageKey}@${revision ?? 0}`" :definition="definition" />
      </div>
    </section>

    <section class="codegen-compare__side codegen-compare__side--artifact">
      <h4 class="codegen-compare__title">出码产物渲染</h4>
      <div class="codegen-compare__body">
        <component :is="artifact" v-if="artifact" :key="`${pageKey}@${revision ?? 0}`" />
        <p v-else class="codegen-compare__missing">
          磁盘上没有这一页的产物，右侧没有东西可比。点上方「落盘产物」，或在命令行落盘：
          <code>PROBE_PAGES={{ pageKey }} npx vitest run src/views/page/codegen/__tests__/runtime-probe.test.ts</code>
          （产物是生成物，不进 git）
        </p>
        <p v-if="mismatch && mismatch.length" class="codegen-compare__stale">
          磁盘上的产物与本次生成的不是同一份，差异文件：{{ mismatch.join('、') }}。
          左侧报告来自本次生成，右侧却是旧产物——点「落盘产物」重新写一遍再下结论。
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.codegen-compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-items: start;
}
.codegen-compare__side {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  min-width: 0;
}
.codegen-compare__title {
  margin: 0;
  padding: 6px 10px;
  border-bottom: 1px solid #ebeef5;
  background: #f5f7fa;
  font-size: 12px;
  font-weight: 600;
}
.codegen-compare__body {
  padding: 8px;
  min-height: 240px;
  max-height: 70vh;
  overflow: auto;
}
.codegen-compare__missing,
.codegen-compare__stale {
  margin: 0;
  padding: 8px;
  font-size: 12px;
  line-height: 1.6;
}
.codegen-compare__missing {
  color: #b88230;
  background: #fdf6ec;
}
.codegen-compare__stale {
  margin-top: 8px !important;
  color: #b03232;
  background: #fef0f0;
}
.codegen-compare__missing code {
  display: block;
  margin: 6px 0;
  padding: 6px;
  background: #fff;
  border: 1px dashed #e6a23c;
  word-break: break-all;
}
@media (max-width: 1200px) {
  .codegen-compare {
    grid-template-columns: 1fr;
  }
}
</style>
