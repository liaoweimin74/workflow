<template>
  <div class="dashboard-router-page">
    <!-- 已发布的 form-create 仪表盘页面（pageKey=dashboard） -->
    <PageRendererPage v-if="definition" :definition="definition" :key="definition.id" />
    <!-- 回退：内置静态首页（未创建/未发布 dashboard 页面时保持可用） -->
    <StaticDashboard v-else-if="checked" />
    <div v-else v-loading="true" class="dashboard-loading" />
  </div>
</template>

<script setup lang="ts">
/**
 * 主页路由分发（Task 119 主页替换策略 A）：
 * 存在已发布且 pageKey=`dashboard` 的 PAGE 页面 → 渲染 form-create 仪表盘；
 * 否则回退内置静态首页（零破坏，随时可退）。
 *
 * 注意 PageRendererPage 以 route.params.pageKey 取 key，主页路径没有该段，
 * 因此这里以宿主身份加载定义并通过 props.definition 下传（其 props 缺省分支
 * 也支持自行加载，但必须配 :key 隔离 keep-alive 缓存）。
 */
import { ref, onMounted } from 'vue'
import PageRendererPage from '@/views/page/PageRendererPage.vue'
import StaticDashboard from './DashboardPage.vue'
import { pageApi, type PageDefinitionDetailDTO } from '@/api/page'

const definition = ref<PageDefinitionDetailDTO | null>(null)
const checked = ref(false)

onMounted(async () => {
  try {
    // getPageByKey 未命中（404）或未发布时抛错 → 回退静态页
    const res = await pageApi.getPageByKey('dashboard', false)
    const def = res.data as PageDefinitionDetailDTO
    if (def && def.type === 'PAGE' && def.status === 'PUBLISHED' && def.schema) {
      definition.value = def
    }
  } catch {
    /* 未配置仪表盘页面：回退静态首页（预期内，不提示） */
  } finally {
    checked.value = true
  }
})
</script>

<style scoped>
.dashboard-router-page {
  min-height: 100%;
}
.dashboard-loading {
  min-height: 320px;
}
</style>
