<template>
  <div class="dashboard-router-page">
    <!-- 租户首页配置指向的已发布 form-create 页面（默认 pageKey=dashboard） -->
    <PageRendererPage v-if="definition" :definition="definition" :key="definition.id" />
    <!-- 回退：内置静态首页（未创建/未发布 dashboard 页面时保持可用） -->
    <StaticDashboard v-else-if="checked" />
    <div v-else v-loading="true" class="dashboard-loading" />
  </div>
</template>

<script setup lang="ts">
/**
 * 主页路由分发（Task 119 主页替换策略 A）：
 * 读取租户首页配置（页面列表「设为首页」），加载对应的已发布 PAGE；
 * 未配置或配置页面不可用时回退 pageKey=`dashboard` 的页面，再回退内置静态首页。
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

/** 按 key 加载已发布页面；不存在、未发布、非 PAGE 或无访问权限时返回 null */
async function loadPublishedPage(key: string): Promise<PageDefinitionDetailDTO | null> {
  try {
    const res = await pageApi.getPageByKey(key, false)
    const def = res.data as PageDefinitionDetailDTO
    return def && def.type === 'PAGE' && def.status === 'PUBLISHED' && def.schema ? def : null
  } catch {
    return null
  }
}

onMounted(async () => {
  let homeKey = 'dashboard'
  try {
    const res = await pageApi.getHomePage()
    if (res.data) homeKey = res.data
  } catch {
    /* 配置接口不可用时沿用默认首页 key */
  }
  let def = await loadPublishedPage(homeKey)
  // 配置页面不可访问（无菜单/无权限/已下线）时回退默认仪表盘，再回退静态首页
  if (!def && homeKey !== 'dashboard') {
    def = await loadPublishedPage('dashboard')
  }
  definition.value = def
  checked.value = true
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
