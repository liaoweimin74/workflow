<!--
【真机探测脚手架，非产品路由】按路由参数挂载 codegen/probe/ 下的出码产物（产物本身不进 git）。
路由 /codegen-probe/:name? 只在 dev 登记（见 router/index.ts），所以这里可以直连生成物。
:name 取产物的页名（大小写与 -/_ 都忽略，cardlist_test 命中 CardlistTest.vue）；不写就挂 glob 第一个。
-->
<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import type { RouteComponent } from 'vue-router'

const artifacts = import.meta.glob<RouteComponent>('./probe/*.vue')
const route = useRoute()

/** 产物文件名 → 归一化键：去掉目录、后缀、大小写与分隔符 */
const norm = (p: string) => p.split('/').pop()!.replace(/\.vue$/, '').toLowerCase().replace(/[-_]/g, '')

const hit = computed(() => {
  const wanted = String(route.params.name ?? '')
  const keys = Object.keys(artifacts)
  if (!wanted) return keys.sort()[0]
  return keys.find((k) => norm(k) === norm(wanted))
})

const page = computed(() => (hit.value ? defineAsyncComponent(artifacts[hit.value]!) : undefined))
</script>

<template>
  <div v-if="page" class="codegen-probe">
    <component :is="page" />
  </div>
  <el-result v-else icon="error" title="探测产物不存在" :subtitle="String(route.params.name || 'probe/ 目录为空')" />
</template>

<style scoped>
/* 产物按页面主体渲染，探测页给足宽度，别让栅格被外层 padding 挤掉 */
.codegen-probe {
  min-height: 100%;
}
</style>
