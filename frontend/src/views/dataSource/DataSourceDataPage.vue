<template>
  <div class="ds-data-page">
    <div class="page-header">
      <el-button :icon="ArrowLeft" @click="router.back()">返回</el-button>
      <span class="page-title">{{ name || '数据源数据' }}</span>
      <el-tag v-if="type" :type="typeTagType(type)" size="small">{{ typeLabel(type) }}</el-tag>
      <el-tag v-if="status" :type="statusTagType(status)" size="small">{{ statusLabel(status) }}</el-tag>
    </div>

    <SearchTable
      v-if="crud.metaLoaded.value"
      :columns="columns"
      :fetch-api="fetchApi"
      :form-config="crud.formConfig.value"
      :default-page-size="20"
      :page-sizes="[10, 20, 50]"
    />
    <el-card v-else v-loading="!crud.metaLoaded.value" style="min-height: 200px" />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'DataSourceData' })

import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { TableColumn } from '@/components/business/types'
import { dataSourceApi } from '@/api/data-source'
import { useDataSourceCrud } from '@/composables/useDataSourceCrud'

const route = useRoute()
const router = useRouter()

const dsId = computed(() => route.params.id as string)
const crud = useDataSourceCrud(dsId)

const name = ref('')
const type = ref('')
const status = ref('')

const columns = computed<TableColumn[]>(() =>
  crud.metaColumns.value.map((c) => ({
    prop: c.key,
    label: c.label,
    minWidth: 120,
    sortable: !!c.sortable,
  })),
)

const fetchApi = async (params: { page: number; size: number; [key: string]: any }) => {
  const query: Record<string, any> = { page: Math.max(1, params.page), size: params.size }
  if (params.sort) query.sort = params.sort
  if (params.order) query.order = params.order
  const res: any = await dataSourceApi.queryData(dsId.value, query)
  const rows = (res?.data?.records || []).map((r: any) => ({ ...(r.data || {}), id: r.id, version: r.version }))
  return { rows, total: res?.data?.total || 0 }
}

onMounted(async () => {
  const ds = await dataSourceApi.getDataSource(dsId.value)
  name.value = (ds.data as any)?.name || ''
  type.value = (ds.data as any)?.type || ''
  status.value = (ds.data as any)?.status || ''
  await crud.loadMetadata()
})

function typeTagType(t: string): '' | 'primary' | 'success' | 'warning' | 'info' {
  const map: Record<string, '' | 'primary' | 'success' | 'warning' | 'info'> = {
    FORM: 'primary', WORKFLOW: 'primary', SYSTEM: 'success', API: 'warning', SQL: 'info',
  }
  return map[t] || ''
}
function typeLabel(t: string): string {
  const map: Record<string, string> = { FORM: '业务表单', WORKFLOW: '工作流表单', SYSTEM: '系统结构', API: '第三方 API', SQL: 'SQL 查询' }
  return map[t] || t
}
function statusTagType(s: string): '' | 'success' | 'warning' | 'info' {
  const map: Record<string, '' | 'success' | 'warning' | 'info'> = { DRAFT: 'warning', ENABLED: 'success', DISABLED: 'info' }
  return map[s] || ''
}
function statusLabel(s: string): string {
  const map: Record<string, string> = { DRAFT: '草稿', ENABLED: '已启用', DISABLED: '已禁用' }
  return map[s] || s
}
</script>

<style scoped>
.ds-data-page { padding: 16px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.page-title { font-size: 16px; font-weight: 600; color: #303133; }
</style>