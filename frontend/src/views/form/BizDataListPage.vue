<template>
  <div class="biz-data-page">
    <div class="page-header">
      <el-button :icon="ArrowLeft" @click="router.back()">返回</el-button>
      <span class="page-title">{{ formName || '业务数据' }}</span>
      <span class="page-subtitle">数据表：wf_biz_{{ formKey }}</span>
    </div>

    <SearchTable
      v-if="loaded"
      ref="tableRef"
      :search-fields="searchFields"
      :columns="columns"
      :fetch-api="fetchApi"
      :form-config="formConfig"
      :default-page-size="20"
      :page-sizes="[10, 20, 50]"
    />
    <el-card v-else v-loading="!loaded" style="min-height: 200px" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, FormConfig } from '@/components/business/types'
import { formApi } from '@/api/form'
import { bizDataApi, type ColumnConfigItem } from '@/api/bizData'
import type { Rule } from '@form-create/element-ui'

const route = useRoute()
const router = useRouter()
const tableRef = ref<InstanceType<typeof SearchTable>>()

const formKey = computed(() => route.params.formKey as string)
const formName = ref('')
const columnConfig = ref<ColumnConfigItem[]>([])
const schemaRules = ref<Rule[]>([])
const schemaOption = ref<Record<string, any>>({})
const loaded = ref(false)

/** 业务列（可展示，排除隐藏列） */
const bizColumns = computed(() => columnConfig.value.filter(c => !c.unsupported && !c.hidden))

/** 可筛选列（非 JSON/TEXT，且 indexed 或短文本） */
const filterableColumns = computed(() =>
  bizColumns.value.filter(
    c => c.columnType !== 'JSON' && c.columnType !== 'TEXT' && (c.indexed || (c.length != null && c.length <= 64) || c.columnType === 'VARCHAR'),
  ),
)

/** 搜索栏（由 column_config 动态生成） */
const searchFields = computed<SearchField[]>(() =>
  filterableColumns.value.map(c => ({
    type: 'input',
    label: c.label,
    prop: c.key,
    placeholder: c.label,
    style: 'width: 180px',
  })),
)

/** 表格列（formatter 读 row.data[key]；data-picker 引用列优先显示冗余文本） */
const columns = computed<TableColumn[]>(() => {
  const bizCols: TableColumn[] = bizColumns.value.map(c => ({
    prop: c.key,
    label: c.label,
    minWidth: c.columnType === 'TEXT' || c.columnType === 'JSON' ? 200 : 130,
    formatter: (row: any) => {
      if (c.pickerConfig && row.data?.[c.key]) {
        // data-picker：显示冗余文本列（<key>_text），缺省回退原值
        const text = row.data[c.key + '_text']
        if (text !== undefined && text !== null && text !== '') return String(text)
      }
      return formatCell(row.data?.[c.key])
    },
  }))
  return [
    ...bizCols,
    {
      prop: 'updatedAt',
      label: '更新时间',
      width: 160,
      align: 'center',
      formatter: (row: any) => formatDate(row.updatedAt),
    },
  ]
})

/**
 * fetchApi 适配层：SearchTable 平铺查询参数 → biz-data 的 filter JSON
 */
async function fetchApi(params: any) {
  const filter: Record<string, unknown> = {}
  for (const col of filterableColumns.value) {
    const v = params[col.key]
    if (v !== undefined && v !== null && v !== '') {
      filter[col.key] = v
    }
  }
  const res = await bizDataApi.list(formKey.value, {
    page: (params.page || 1) - 1,
    size: params.size || 20,
    filter,
  })
  return { rows: res.data.records || [], total: res.data.total || 0 }
}

/**
 * formConfig：新增/编辑弹窗直接复用表单 schema（form-create rule），
 * 行对象通过 updateApi 第三参获取（version 用于乐观锁）。
 * 泛型用 Record<string, any>：弹窗初始值/表单数据是业务字段平铺对象。
 */
const formConfig = computed<FormConfig<Record<string, any>>>(() => ({
  rule: schemaRules.value,
  option: schemaOption.value,
  dialogWidth: '640px',
  dialogTitle: { create: '新增数据', edit: '编辑数据' },
  createPermission: 'form:edit',
  editPermission: 'form:edit',
  deletePermission: 'form:list',
  getApi: async (id) => {
    const res = await bizDataApi.detail(formKey.value, String(id))
    return res.data.data
  },
  createApi: (data) => bizDataApi.create(formKey.value, data),
  updateApi: (id, data, row) => bizDataApi.update(formKey.value, String(id), data, row?.version ?? 1),
  deleteApi: (id) => bizDataApi.remove(formKey.value, String(id)),
}))

onMounted(async () => {
  await loadFormMeta()
})

/** 加载表单定义（name / columnConfig / schema） */
async function loadFormMeta() {
  try {
    const res = await formApi.getFormDefinitionByKey(formKey.value)
    const def = res.data
    formName.value = def.name
    if (def.columnConfig) {
      columnConfig.value = JSON.parse(def.columnConfig)
    }
    if (def.schema && def.schema !== '[]') {
      const parsed = JSON.parse(def.schema)
      schemaRules.value = Array.isArray(parsed) ? parsed : (parsed.rule || [])
      schemaOption.value = !Array.isArray(parsed) && parsed.option ? parsed.option : {}
    }
    loaded.value = true
  } catch {
    ElMessage.error('业务表单不存在或未发布')
  }
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style scoped>
.biz-data-page {
  padding: 16px;
  height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
}
.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.page-title {
  font-size: 16px;
  font-weight: bold;
}
.page-subtitle {
  font-size: 12px;
  color: #909399;
}
</style>
