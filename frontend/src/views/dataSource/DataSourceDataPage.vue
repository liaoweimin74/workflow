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
      :search-fields="searchFields"
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
import {
  buildTableColumns,
  buildSearchFields,
  filterableColumnsOf,
  collectFilterConditions,
} from '@/utils/bizTableLayout'

const route = useRoute()
const router = useRouter()

const dsId = computed(() => route.params.id as string)
const crud = useDataSourceCrud(dsId)

const name = ref('')
const type = ref('')
const status = ref('')

/** 表格列（按元数据渲染：数组值/颜色/日期定制，与业务表单数据管理一致；render 读 row.data[key]） */
const columns = computed<TableColumn[]>(() =>
  buildTableColumns(crud.rawColumns.value.filter((c) => !c.hidden && !c.unsupported), {
    // 数据源数据页无子表 schema 弹窗：子表列按普通 JSON 展示（不渲染 slotName 链接）
    useSubtableSlot: false,
    // 列严格等于用户配置的字段元数据：SQL 数据源 query 返回无 updatedAt 审计字段，内置尾列无意义
    appendUpdatedAt: false,
  }),
)

/** 可筛选列（非 JSON/TEXT/colorPicker，indexed 或短文本；数组组件用 <key>_text 冗余列） */
const filterableColumns = computed(() => filterableColumnsOf(crud.rawColumns.value))

/** 搜索栏（按元数据动态生成：文本 input / 日期 date-picker / 数据引用 lookupPicker，与业务表单数据管理一致） */
const searchFields = computed(() =>
  buildSearchFields(filterableColumns.value, crud.formSchemaRule.value),
)

const fetchApi = async (params: { page: number; size: number; [key: string]: any }) => {
  const conditions = collectFilterConditions(filterableColumns.value, params)
  const query: Record<string, any> = { page: Math.max(1, params.page), size: params.size }
  if (params.sort) query.sort = params.sort
  if (params.order) query.order = params.order
  // 后端 BizDataQueryRequest.filter 为 JSON 字符串（对齐 PageQueryController/BizDataSupport 解析）
  if (conditions.length > 0) query.filter = JSON.stringify({ logic: 'AND', conditions })
  const res: any = await dataSourceApi.queryData(dsId.value, query)
  // 保持 records 原结构（BizDataVO：{ id, data, version, ... }），列 render 读 row.data[key]
  return { rows: res?.data?.records || [], total: res?.data?.total || 0 }
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