<script lang="ts">
// ----- 字段映射预览组件 -----
// formKey 有值时展示「表单列 + SQL 声明列」合并结果（来源/key/label/类型/可写）
// 合并规则：表单列优先，SQL 声明列按 key 去重补充；表单列可写，SQL 声明列只读
export interface MergedColumnRow {
  source: '表单' | 'SQL 声明'
  key: string
  label: string
  columnType: string
  writable: boolean
}
</script>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { formApi } from '@/api/form'
import type { ColumnConfigItem } from '@/api/bizData'

const props = withDefaults(
  defineProps<{
    formKey?: string
    columns?: ColumnConfigItem[]
  }>(),
  { formKey: '', columns: () => [] }
)

const formColumns = ref<ColumnConfigItem[]>([])
const error = ref<string | null>(null)

async function loadFormColumns(key: string) {
  error.value = null
  try {
    const res = await formApi.getFormDefinitionByKey(key)
    const detail = (res.data ?? {}) as { columnConfig?: string | null }
    if (detail.columnConfig) {
      try {
        formColumns.value = JSON.parse(detail.columnConfig) as ColumnConfigItem[]
      } catch {
        formColumns.value = []
      }
    } else {
      formColumns.value = []
    }
  } catch (e: any) {
    error.value = e?.message || '加载表单列失败'
    formColumns.value = []
  }
}

watch(
  () => props.formKey,
  (key) => {
    formColumns.value = []
    error.value = null
    if (key) loadFormColumns(key)
  },
  { immediate: true }
)

/** 合并后行：表单列优先，SQL 声明列 key 去重补充 */
const mergedRows = computed<MergedColumnRow[]>(() => {
  const formKeys = new Set(formColumns.value.map((c) => c.key))
  const rows: MergedColumnRow[] = formColumns.value.map((c) => ({
    source: '表单',
    key: c.key,
    label: c.label || c.key,
    columnType: c.columnType || 'VARCHAR',
    writable: true,
  }))
  for (const c of props.columns) {
    if (!c.key || formKeys.has(c.key)) continue
    rows.push({
      source: 'SQL 声明',
      key: c.key,
      label: c.label || c.key,
      columnType: c.columnType || 'VARCHAR',
      writable: false,
    })
  }
  return rows
})

/** 被去重（表单列已覆盖）的 SQL 声明列数 */
const dedupCount = computed(() => {
  const formKeys = new Set(formColumns.value.map((c) => c.key))
  return props.columns.filter((c) => c.key && formKeys.has(c.key)).length
})
</script>

<template>
  <div class="field-mapping-preview">
    <div v-if="!formKey" class="fmp-empty">未绑定主表单</div>
    <template v-else>
      <el-alert v-if="error" type="error" :title="`加载表单列失败：${error}`" :closable="false" show-icon style="margin-bottom: 12px" />
      <template v-else>
        <div class="fmp-summary">
          主表单 {{ formColumns.length }} 列 · SQL 声明 {{ columns.length }} 列 · 合并后 {{ mergedRows.length }} 列
          <template v-if="dedupCount > 0">（{{ dedupCount }} 列去重）</template>
        </div>
        <el-table :data="mergedRows" size="small" border class="fmp-table">
          <el-table-column prop="source" label="来源" width="100" />
          <el-table-column prop="key" label="key" min-width="120" />
          <el-table-column prop="label" label="label" min-width="120" />
          <el-table-column prop="columnType" label="类型" width="100" />
          <el-table-column label="可写" width="70" align="center">
            <template #default="{ row }">
              <span v-if="row.writable" class="fmp-writable-ok">✓</span>
              <span v-else class="fmp-writable-no">✗</span>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </template>
  </div>
</template>