<template>
  <div class="option-datasource-config">
    <el-form :model="draft" label-width="92px" size="small">
      <el-form-item label="数据源">
        <el-select v-model="draft.dataSourceId" placeholder="请选择数据源" clearable @change="handleSourceChange">
          <el-option v-for="source in sources" :key="source.id" :label="source.name" :value="source.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="显示字段">
        <el-select v-model="draft.labelField" placeholder="请选择 label 字段">
          <el-option v-for="column in columns" :key="column.key" :label="column.label || column.key" :value="column.key" />
        </el-select>
      </el-form-item>
      <el-form-item label="值字段">
        <el-select v-model="draft.valueField" placeholder="请选择 value 字段">
          <el-option v-for="column in columns" :key="column.key" :label="column.label || column.key" :value="column.key" />
        </el-select>
      </el-form-item>
      <el-form-item label="子节点字段">
        <el-select v-model="draft.childrenField" clearable placeholder="树形数据可选">
          <el-option v-for="column in columns" :key="column.key" :label="column.label || column.key" :value="column.key" />
        </el-select>
      </el-form-item>
      <el-form-item label="父节点字段">
        <el-select v-model="draft.parentField" clearable placeholder="扁平树形数据可选">
          <el-option v-for="column in columns" :key="column.key" :label="column.label || column.key" :value="column.key" />
        </el-select>
      </el-form-item>
      <el-form-item label="查询条件">
        <el-input v-model="draft.filters" type="textarea" :rows="3" placeholder='JSON，例如 {"logic":"AND","conditions":[]}' />
      </el-form-item>
      <el-button type="primary" :disabled="!valid" @click="confirm">应用数据源</el-button>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { dataSourceApi, type DataSourceDTO } from '@/api/data-source'
import type { ColumnConfigItem } from '@/api/bizData'
import type { OptionDataSourceConfig } from '../option-datasource'

const props = defineProps<{
  modelValue?: OptionDataSourceConfig & { readonly dataSourceId?: string }
  sources?: DataSourceDTO[]
}>()
const emit = defineEmits<{ (event: 'update:modelValue', value: OptionDataSourceConfig & { readonly dataSourceId: string }): void }>()
const draft = reactive({ dataSourceId: '', labelField: '', valueField: '', childrenField: '', parentField: '', filters: '' })
const columns = ref<ColumnConfigItem[]>([])
const availableSources = ref<DataSourceDTO[]>([])
const sources = computed(() => props.sources ?? availableSources.value)
const valid = computed(() => Boolean(draft.dataSourceId && draft.labelField && draft.valueField))

watch(() => props.modelValue, (value) => {
  Object.assign(draft, value ?? { dataSourceId: '', labelField: '', valueField: '', childrenField: '', parentField: '', filters: '' })
  if (draft.dataSourceId) void loadMetadata()
}, { immediate: true, deep: true })

async function loadMetadata() {
  columns.value = []
  if (!draft.dataSourceId) return
  try {
    columns.value = (await dataSourceApi.getMetadata(draft.dataSourceId)).data?.columns ?? []
  } catch {
    ElMessage.error('数据源字段加载失败')
  }
}

function handleSourceChange() {
  draft.labelField = ''
  draft.valueField = ''
  draft.childrenField = ''
  draft.parentField = ''
  void loadMetadata()
}

onMounted(async () => {
  if (props.sources) return
  availableSources.value = (await dataSourceApi.getEnabledDataSources()).data ?? []
})

function confirm() {
  if (!valid.value) return
  emit('update:modelValue', { ...draft })
}
</script>
