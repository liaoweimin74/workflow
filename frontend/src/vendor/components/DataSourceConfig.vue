<template>
  <div class="option-datasource-control">
    <el-button class="option-ds-button" plain size="small" @click="openDialog">配置数据源</el-button>
    <el-dialog v-model="dialogVisible" title="配置数据源" width="860px" :close-on-click-modal="false" @close="discardDraft">
    <el-tabs v-model="activeTab" type="border-card">
      <el-tab-pane label="数据源" name="source">
        <DataSourceBindingTab
          ref="sourceTabRef"
          :model-value="sourceDraft"
          @update:model-value="updateSourceDraft"
          :form-data-sources="sourceBindings"
          :current-fields="[]"
          @columns="columns = $event"
        />
      </el-tab-pane>
      <el-tab-pane label="字段配置" name="fields">
        <el-form label-width="110px" size="default">
          <el-form-item label="显示字段" required>
            <el-select v-model="fieldDraft.labelField" placeholder="请选择显示字段" style="width: 100%">
              <el-option v-for="column in columns" :key="column.key" :label="column.label || column.key" :value="column.key" />
            </el-select>
          </el-form-item>
          <el-form-item label="值字段" required>
            <el-select v-model="fieldDraft.valueField" placeholder="请选择值字段" style="width: 100%">
              <el-option v-for="column in columns" :key="column.key" :label="column.label || column.key" :value="column.key" />
            </el-select>
          </el-form-item>
          <el-form-item label="子节点字段">
            <el-select v-model="fieldDraft.childrenField" clearable placeholder="嵌套树形数据可选" style="width: 100%" @change="fieldDraft.parentField = ''">
              <el-option v-for="column in columns" :key="column.key" :label="column.label || column.key" :value="column.key" />
            </el-select>
          </el-form-item>
          <el-form-item label="父节点字段">
            <el-select v-model="fieldDraft.parentField" clearable placeholder="扁平树形数据可选" style="width: 100%" @change="fieldDraft.childrenField = ''">
              <el-option v-for="column in columns" :key="column.key" :label="column.label || column.key" :value="column.key" />
            </el-select>
          </el-form-item>
          <el-alert v-if="fieldDraft.childrenField && fieldDraft.parentField" title="子节点字段和父节点字段只能配置一个" type="warning" :closable="false" />
        </el-form>
      </el-tab-pane>
    </el-tabs>
      <template #footer>
      <el-button @click="discardDraft">取消</el-button>
      <el-button type="primary" :disabled="!valid" @click="confirm">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { ColumnConfigItem } from '@/api/bizData'
import DataSourceBindingTab, { type DataSourceTabValue } from '@/views/form/components/DataSourceBindingTab.vue'
import type { OptionDataSourceConfig } from '../option-datasource'
import { activeDsBindings } from '@/utils/formDsBindingsStore'

type OptionConfig = OptionDataSourceConfig & { readonly dataSourceId: string }

const props = defineProps<{
  modelValue?: OptionConfig
  formDataSources?: Array<{ id: string; refId: string; name?: string }>
}>()
const emit = defineEmits<{ (event: 'update:modelValue', value: OptionConfig): void }>()
const dialogVisible = ref(false)
const activeTab = ref('source')
const columns = ref<ColumnConfigItem[]>([])
const sourceTabRef = ref<InstanceType<typeof DataSourceBindingTab> | null>(null)
const sourceDraft = ref<DataSourceTabValue>({ dataSourceId: '' })
const fieldDraft = reactive({ labelField: '', valueField: '', childrenField: '', parentField: '' })
const sourceBindings = computed(() => props.formDataSources ?? activeDsBindings.value)
const valid = computed(() => Boolean(sourceDraft.value.dataSourceId && fieldDraft.labelField && fieldDraft.valueField)
  && !(fieldDraft.childrenField && fieldDraft.parentField))

watch(() => props.modelValue, (value) => {
  if (!dialogVisible.value) resetDraft(value)
}, { immediate: true, deep: true })

function confirm() {
  if (!valid.value) {
    ElMessage.warning('请完成数据源和字段配置')
    return
  }
  const source = sourceTabRef.value?.value() ?? sourceDraft.value
  emit('update:modelValue', {
    dataSourceId: source.dataSourceId,
    filters: source.filter ? JSON.stringify(source.filter) : undefined,
    labelField: fieldDraft.labelField,
    valueField: fieldDraft.valueField,
    ...(fieldDraft.childrenField ? { childrenField: fieldDraft.childrenField } : {}),
    ...(fieldDraft.parentField ? { parentField: fieldDraft.parentField } : {}),
  })
  dialogVisible.value = false
}

function resetDraft(value = props.modelValue) {
  sourceDraft.value = { dataSourceId: value?.dataSourceId ?? '', filter: value?.filters ? parseFilter(value.filters) : undefined }
  fieldDraft.labelField = value?.labelField ?? ''
  fieldDraft.valueField = value?.valueField ?? ''
  fieldDraft.childrenField = value?.childrenField ?? ''
  fieldDraft.parentField = value?.parentField ?? ''
  activeTab.value = 'source'
}

function openDialog() {
  resetDraft()
  dialogVisible.value = true
}

function discardDraft() {
  dialogVisible.value = false
  resetDraft()
}

function updateSourceDraft(value: DataSourceTabValue) {
  sourceDraft.value = value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseFilter(value: string): DataSourceTabValue['filter'] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (isRecord(parsed)) {
      const candidate = parsed
      if (Array.isArray(candidate.conditions)) {
        return {
          logic: candidate.logic === 'OR' ? 'OR' : 'AND',
          conditions: candidate.conditions.filter(isRecord),
        }
      }
    }
  } catch {
    return undefined
  }
  return undefined
}
</script>

<style scoped>
.option-datasource-control {
  width: 100%;
}

.option-datasource-control .el-button.option-ds-button {
  font-weight: 400;
  width: 100%;
  border-color: #2E73FF;
  color: #2E73FF;
}
</style>
