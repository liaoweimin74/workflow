<template>
  <div class="page-renderer">
    <!-- 自定义页面（PAGE）：独立渲染组件（数据源注册 + 动作总线）；definition 由宿主下传，避免二次请求 -->
    <PageRendererPage v-if="page?.type === 'PAGE'" :definition="page" />
    <!-- 错误态：不存在/未发布/类型不受支持，不白屏 -->
    <el-result v-else-if="error" icon="error" :title="error" style="padding: 80px 0" />
  </div>
</template>

<script setup lang="ts">
// 路由组件 name 与路由 name 一致，供 AdminLayout keep-alive include 匹配缓存
defineOptions({ name: 'PageRenderer' })

import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import PageRendererPage from './PageRendererPage.vue'
import { pageApi, type PageDefinitionDetailDTO } from '@/api/page'

const route = useRoute()
// 挂载时快照：keep-alive 按 :key="route.path" 隔离实例，不同 pageKey 是独立实例；
// 缓存实例的全局 route 会随其他页签导航变化，此处不能 watch route.params（否则缓存实例错误重载）
const pageKey = ref(route.params.pageKey as string)

const error = ref('')
const page = ref<PageDefinitionDetailDTO | null>(null)

onMounted(async () => {
  try {
    // preview=true（设计器预览）：取最新 DRAFT 定义而非已发布版本
    const preview = route.query.preview === 'true'
    const res = await pageApi.getPageByKey(pageKey.value, preview)
    page.value = res.data
    if (res.data.type !== 'PAGE') {
      error.value = '页面类型不受支持（视图页面已废弃）'
    }
  } catch (e: any) {
    error.value = e?.message || '页面加载失败'
    ElMessage.error(error.value)
  }
})
</script>

<style scoped>
.page-renderer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px;
  height: 100%;
  position: relative;
}
</style>
