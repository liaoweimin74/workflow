<template>
  <el-form label-width="110px" size="default">
    <el-form-item required>
      <template #label>
        <span class="label-with-tip">
          数据源
          <el-tooltip content="选择已绑定的数据源；切换后自动加载列定义" placement="top">
            <el-icon class="tip-icon"><QuestionFilled /></el-icon>
          </el-tooltip>
        </span>
      </template>
      <el-select v-model="draft.dataSourceId" placeholder="选择页面数据源绑定" style="width: 100%" @change="handleDataSourceChange">
        <el-option v-for="source in formDataSources" :key="source.id" :label="source.id" :value="source.id" />
      </el-select>
    </el-form-item>
    <el-divider content-position="left">组件级数据筛选</el-divider>
    <el-form-item label="筛选条件">
      <div style="width: 100%">
        <el-radio-group v-model="draft.filterLogic" size="small">
          <el-radio-button value="AND">所有（且）</el-radio-button>
          <el-radio-button value="OR">任一（或）</el-radio-button>
        </el-radio-group>
        <div v-for="(row, index) in draft.filterRows" :key="index" class="filter-row">
          <el-select v-model="row.column" placeholder="目标列" style="width: 30%">
            <el-option v-for="column in visibleColumns" :key="column.key" :label="column.label || column.key" :value="column.key" />
          </el-select>
          <el-select v-model="row.op" style="width: 22%">
            <el-option label="等于" value="eq" /><el-option label="不等于" value="ne" />
            <el-option label="包含" value="like" /><el-option label="属于" value="in" />
            <el-option label="为空" value="isEmpty" /><el-option label="不为空" value="isNotEmpty" />
          </el-select>
          <el-select v-model="row.source" style="width: 22%">
            <el-option label="固定值" value="fixed" /><el-option label="表单字段" value="field" />
          </el-select>
          <el-select v-if="row.source === 'field'" v-model="row.field" placeholder="当前表单字段" style="width: 30%">
            <el-option v-for="field in currentFields" :key="field" :label="field" :value="field" />
          </el-select>
          <el-input v-else v-model="row.fixedValue" placeholder="固定值" style="width: 30%" />
          <el-button type="danger" link @click="draft.filterRows.splice(index, 1)">删除</el-button>
        </div>
        <el-button type="primary" link style="margin-top: 8px" @click="addFilter">+ 添加筛选条件</el-button>
      </div>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import { dataSourceApi } from '@/api/data-source'
import type { ColumnConfigItem } from '@/api/bizData'

export interface DataSourceFilterRow {
  column: string
  op: string
  source: 'fixed' | 'field'
  fixedValue: string
  field: string
}

export interface DataSourceTabValue {
  dataSourceId: string
  filter?: { logic: 'AND' | 'OR'; conditions: Record<string, unknown>[] }
}

const props = withDefaults(defineProps<{
  modelValue?: DataSourceTabValue
  formDataSources: Array<{ id: string; refId: string }>
  currentFields?: string[]
}>(), { currentFields: () => [] })

const emit = defineEmits<{
  (event: 'update:modelValue', value: DataSourceTabValue): void
  (event: 'columns', value: ColumnConfigItem[]): void
}>()

const draft = reactive({
  dataSourceId: '',
  filterLogic: 'AND' as 'AND' | 'OR',
  filterRows: [] as DataSourceFilterRow[],
})
const columns = ref<ColumnConfigItem[]>([])
const formDataSources = computed(() => props.formDataSources)
const currentFields = computed(() => props.currentFields)
const visibleColumns = computed(() => columns.value.filter((column) => !column.hidden))

watch(() => props.modelValue, (value) => {
  draft.dataSourceId = value?.dataSourceId ?? ''
  const filter = value?.filter
  draft.filterLogic = filter?.logic ?? 'AND'
  draft.filterRows = (filter?.conditions ?? []).map((condition) => ({
    column: String(condition.column ?? ''),
    op: String(condition.op ?? 'eq'),
    source: condition.source === 'field' ? 'field' : 'fixed',
    fixedValue: String(condition.value ?? condition.fixedValue ?? ''),
    field: String(condition.field ?? ''),
  }))
  if (draft.dataSourceId) void loadColumns()
}, { immediate: true, deep: true })

async function loadColumns() {
  const binding = formDataSources.value.find((source) => source.id === draft.dataSourceId)
  try {
    columns.value = binding?.refId ? (await dataSourceApi.getMetadata(binding.refId)).data?.columns ?? [] : []
  } catch {
    columns.value = []
  }
  emit('columns', columns.value)
}

function handleDataSourceChange() {
  draft.filterRows = []
  void loadColumns()
  emit('update:modelValue', value())
}

function addFilter() {
  draft.filterRows.push({ column: '', op: 'eq', source: 'fixed', fixedValue: '', field: '' })
}

function value(): DataSourceTabValue {
  const conditions = draft.filterRows.filter((row) => row.column).map((row) => ({
    column: row.column,
    op: row.op,
    source: row.source,
    ...(row.source === 'field' ? { field: row.field } : { value: row.fixedValue }),
  }))
  return {
    dataSourceId: draft.dataSourceId,
    ...(conditions.length > 0 ? { filter: { logic: draft.filterLogic, conditions } } : {}),
  }
}

defineExpose({ value })
</script>

<style scoped>
.filter-row { display: flex; gap: 8px; margin-top: 8px; }
.label-with-tip { display: inline-flex; align-items: center; }
.tip-icon { margin-left: 4px; color: #909399; cursor: help; }
</style>
