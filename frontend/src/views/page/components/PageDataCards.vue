<template>
  <div class="page-data-cards" :class="{ 'stretch-fill': stretch }">
    <ListCards
      ref="cardsRef"
      :columns="resolvedColumns"
      :fetch-api="fetchApi"
      :card-min-width="cardMinWidth"
      :default-page-size="pageSize || 20"
      :show-pagination="pagination"
      :actions="resolvedActions"
      :group-by="groupBy"
      @row-click="handleRowClick"
      @action-click="handleActionClick"
    />
    <el-dialog v-model="localFormVisible" :title="localFormTitle" width="560px" destroy-on-close>
      <FormRenderer
        v-if="localFormVisible"
        ref="localFormRef"
        :rule="localFormRules"
        :option="{ labelWidth: '100px', submitBtn: { show: false }, resetBtn: { show: false } }"
        :initial-values="localFormValues"
        :readonly="localFormMode === 'view'"
      />
      <template #footer>
        <el-button @click="localFormVisible = false">取消</el-button>
        <el-button v-if="localFormMode !== 'view'" type="primary" @click="saveLocalForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'
import ListCards from '@/components/business/ListCards.vue'
import FormRenderer from '@/views/form/components/FormRenderer.vue'
import type { CardColumn, DataSourceBindingContext, ListQueryParams, ListPageResult } from '@/components/business/types'

const props = withDefaults(defineProps<{
  pageKey?: string
  dataSourceId?: string
  dsRefId?: string
  columns?: CardColumn[]
  cardMinWidth?: number | string
  pageSize?: number
  pagination?: boolean
  viewActions?: { buttons?: Array<{ key: string; label: string; placement?: string }> }
  groupBy?: string
  stretch?: boolean
  [key: string]: any
}>(), { pageSize: 20, pagination: true, cardMinWidth: 280, stretch: false })

const emit = defineEmits<{
  (e: 'row-click', row: any): void
  (e: 'loaded', rows: any[]): void
  (e: 'ready', instance: any): void
}>()

const actionBus = inject<{
  dispatch: (trigger: string, data: any) => boolean
  register?: (id: string, instance: any) => void
  hasLinkedContainer?: (id?: string) => boolean
  openLinkedContainer?: (id: string, mode: 'create' | 'edit' | 'view', row: any) => void
}>('pageActionBus')
const cardsRef = ref<InstanceType<typeof ListCards>>()
const localFormVisible = ref(false)
const localFormMode = ref<'create' | 'edit' | 'view'>('edit')
const localFormTitle = computed(() => localFormMode.value === 'create' ? '新增数据' : localFormMode.value === 'view' ? '详情' : '编辑数据')
const localFormRef = ref<InstanceType<typeof FormRenderer>>()
const localFormRules = ref<any[]>([])
const localFormValues = ref<Record<string, any>>({})
const localFormId = ref<string | number>()

const resolvedRefId = computed(() => {
  if (props.dsRefId) return props.dsRefId
  const binding = activeDsBindings.value.find((item: DataSourceBindingContext) => item.id === props.dataSourceId)
  return binding?.refId || ''
})

const resolvedColumns = computed<CardColumn[]>(() => (props.columns || []).filter((column) => !column.hidden).map((column) => ({
  ...column,
  prop: column.prop || (column as any).key,
  label: column.label || column.prop || (column as any).key,
})))

const resolvedActions = computed(() => (props.viewActions?.buttons || [])
  .filter((button) => button.placement !== 'toolbar')
  .map((button) => ({ key: button.key, label: button.label })))

const fetchApi = async (params: ListQueryParams): Promise<ListPageResult> => {
  if (!resolvedRefId.value) return { rows: [], total: 0 }
  const response = await dataSourceApi.queryData(resolvedRefId.value, {
    page: Math.max(1, params.page),
    size: params.size,
  })
  const rows = (response.data?.records || []).map((record: any) => ({ ...(record.data || {}), id: record.id, version: record.version }))
  emit('loaded', rows)
  return { rows, total: response.data?.total || 0 }
}

function handleRowClick(row: any) {
  emit('row-click', row)
  actionBus?.dispatch('row-click', { node: row, row, source: props.dataSourceId })
}

function handleActionClick(action: { key: string; label: string }, row: any) {
  const mode = action.key === 'create' ? 'create' : action.key === 'view' ? 'view' : action.key === 'edit' ? 'edit' : undefined
  if (mode && actionBus?.hasLinkedContainer?.(props.dataSourceId) && actionBus.openLinkedContainer) {
    actionBus.openLinkedContainer(props.dataSourceId || '', mode, row)
    return
  }
  if (mode) {
    void openLocalForm(mode, row)
    return
  }
  actionBus?.dispatch('action-click', { action, row, source: props.dataSourceId })
}

async function openLocalForm(mode: 'create' | 'edit' | 'view', row: any) {
  if (!resolvedRefId.value) return
  localFormMode.value = mode
  localFormRules.value = []
  const metadata = await dataSourceApi.getMetadata(resolvedRefId.value)
  localFormRules.value = (metadata.data?.columns || []).map((column: any) => ({
    type: column.columnType === 'DATE' || column.columnType === 'DATETIME' ? 'datePicker' : 'input',
    field: column.key,
    title: column.label || column.key,
    validate: column.required ? [{ required: true, message: `${column.label || column.key}不能为空` }] : [],
  }))
  localFormValues.value = row || {}
  localFormId.value = row?.id
  if (mode !== 'create' && row?.id) {
    const detail = await dataSourceApi.getData(resolvedRefId.value, row.id)
    localFormValues.value = { ...localFormValues.value, ...(detail.data?.data || {}) }
  }
  localFormVisible.value = true
}

async function saveLocalForm() {
  if (!resolvedRefId.value) return
  const values = localFormRef.value?.getFormData() || localFormValues.value
  if (localFormMode.value === 'create') await dataSourceApi.createData(resolvedRefId.value, values)
  else if (localFormId.value !== undefined) await dataSourceApi.updateData(resolvedRefId.value, localFormId.value, values)
  localFormVisible.value = false
  await cardsRef.value?.refresh()
}

onMounted(() => {
  const instance = { fetchData: () => cardsRef.value?.fetchData(), refresh: () => cardsRef.value?.refresh() }
  actionBus?.register?.(props.dataSourceId || '', instance)
  emit('ready', instance)
})
</script>

<style scoped>
.page-data-cards { width: 100%; height: 100%; min-width: 0; min-height: 0; }
.stretch-fill { height: 100%; }
</style>
