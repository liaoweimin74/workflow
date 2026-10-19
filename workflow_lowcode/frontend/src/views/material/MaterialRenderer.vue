<template>
  <div class="material-renderer">
    <el-skeleton v-if="loading" :rows="6" animated />
    <el-result v-else-if="error" icon="error" :title="errorTitle" :sub-title="error">
      <template #extra>
        <el-button type="primary" @click="load">重新加载</el-button>
      </template>
    </el-result>
    <component :is="materialComponent" v-else-if="materialComponent" />
  </div>
</template>

<script setup lang="ts">
// 路由组件 name 与路由 name 一致，供 AdminLayout keep-alive include 匹配；
// 不同物料是不同 path，keep-alive 的 :key="route.path" 保证实例互不干扰（同 PageRenderer）
defineOptions({ name: 'MaterialRenderer' })

import { ref, shallowRef, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import type { Component } from 'vue'
import { loadMaterialComponent, MaterialLoadError, type MaterialLoadReason } from '@/platform/materialLoader'

const route = useRoute()

const loading = ref(false)
const error = ref('')
const materialComponent = shallowRef<Component | null>(null)

const ERROR_TITLES: Record<MaterialLoadReason, string> = {
  NOT_FOUND: '物料不存在',
  DISABLED: '物料已停用',
  SDK_INCOMPATIBLE: '物料版本不兼容',
  WIDGET_NOT_PAGE: '该物料不能作为整页挂载',
  NOT_WIDGET: '该物料不能作为组件嵌入',
  INVALID_MODULE: '物料包无效',
  NETWORK: '物料加载失败'
}

const errorTitle = ref('物料加载失败')

// 挂载时快照：keep-alive 按 :key="route.path" 隔离实例，缓存实例的全局 route 会随其他页签导航变化
const materialKey = ref(route.params.materialKey as string)

async function load() {
  loading.value = true
  error.value = ''
  try {
    materialComponent.value = await loadMaterialComponent(materialKey.value)
  } catch (e) {
    if (e instanceof MaterialLoadError) {
      errorTitle.value = ERROR_TITLES[e.reason] ?? '物料加载失败'
      error.value = e.message
    } else {
      errorTitle.value = '物料加载失败'
      error.value = (e as Error)?.message ?? '未知错误'
    }
    materialComponent.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.material-renderer {
  min-height: 200px;
  padding: 4px;
}
</style>
