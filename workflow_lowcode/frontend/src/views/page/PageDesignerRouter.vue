<template>
  <component :is="resolved" />
</template>

<script setup lang="ts">
import { ref, onMounted, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { pageApi } from '@/api/page'

const route = useRoute()

/** 包装：根据页面 type 分发到 ViewDesigner（视图）/ PageDesigner（自定义页面） */
const resolved = ref<any>(null)

const ViewDesigner = defineAsyncComponent(() => import('./ViewDesigner.vue'))
const PageDesigner = defineAsyncComponent(() => import('./PageDesigner.vue'))

onMounted(async () => {
  const pageId = route.query.id as string
  if (!pageId) {
    ElMessage.error('缺少页面 ID')
    resolved.value = null
    return
  }
  try {
    const res = await pageApi.getPage(pageId)
    const type = res.data?.type
    if (type === 'PAGE') {
      resolved.value = PageDesigner
    } else {
      resolved.value = ViewDesigner
    }
  } catch {
    ElMessage.error('页面加载失败')
    resolved.value = null
  }
})
</script>
