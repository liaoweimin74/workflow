<template>
  <div class="page-data-cards" :class="{ 'stretch-fill': stretch }">
    <ListCards
      ref="cardsRef"
      :columns="columnsForRender"
      :fetch-api="fetchApi"
      :card-min-width="cardMinWidth"
      :default-page-size="pageSize || 20"
      :show-pagination="designMode ? false : pagination"
      :actions="resolvedActions"
      :group-by="groupBy"
      :collapsible-groups="collapsibleGroups"
      :actions-placement="actionsPlacement"
      :design-mode="designMode"
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
import { computed, inject, onMounted, ref, watch } from 'vue'
import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'
import ListCards from '@/components/business/ListCards.vue'
import FormRenderer from '@/views/form/components/FormRenderer.vue'
import type { CardColumn, DataSourceBindingContext, ListQueryParams, ListPageResult } from '@/components/business/types'

/** 卡片操作按钮配置（对齐 ViewDesigner.ViewActionButton / ListCards.actions） */
interface ViewActionButton {
  key: string
  label: string
  placement?: 'toolbar' | 'column' | 'row'
  style?: 'button' | 'icon' | 'text'
  icon?: string
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
}

const props = withDefaults(defineProps<{
  pageKey?: string
  dataSourceId?: string
  dsRefId?: string
  columns?: CardColumn[]
  cardMinWidth?: number | string
  pageSize?: number
  pagination?: boolean
  viewActions?: { buttons?: Array<ViewActionButton> }
  groupBy?: string
  /** 分组是否可折叠 */
  collapsibleGroups?: boolean
  /** 卡片操作区位置 */
  actionsPlacement?: 'top' | 'bottom' | 'right'
  designMode?: boolean
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

const metadataColumns = ref<any[]>([])
const columnsForRender = computed(() => props.designMode && props.columns?.length === 0
  ? metadataColumns.value.map((column) => ({ prop: column.key, label: column.label || column.key, role: column.role || 'field' }))
  : resolvedColumns.value)

// 行级操作按钮（设计态/运行态一致：配置了按钮则预览/运行都显示，便于设计器所见即所得；保留 style/icon/type 供卡片按形态渲染）
const resolvedActions = computed(() => (props.viewActions?.buttons || [])
  .filter((button) => button.placement !== 'toolbar')
  .map((button) => ({
    key: button.key,
    label: button.label,
    style: button.style,
    icon: button.icon,
    type: button.type,
  })))

const fetchApi = async (params: ListQueryParams): Promise<ListPageResult> => {
  if (!resolvedRefId.value) return { rows: [], total: 0 }
  const isDesign = props.designMode
  const response = await dataSourceApi.queryData(resolvedRefId.value, {
    // 设计态预览固定取首页，且最多 10 条；运行态透传分页
    page: isDesign ? 1 : Math.max(1, params.page),
    size: isDesign ? Math.min(params.size || 10, 10) : params.size,
  })
  const rows = (response.data?.records || []).map((record: any) => ({ ...(record.data || {}), id: record.id, version: record.version }))
  emit('loaded', rows)
  return { rows, total: response.data?.total || 0 }
}

/** 设计态空 columns 时读取元数据生成 fallback 展示列 */
async function loadDesignMetadata() {
  if (!props.designMode || !resolvedRefId.value || (props.columns?.length ?? 0) > 0) return
  try {
    const response = await dataSourceApi.getMetadata(resolvedRefId.value)
    metadataColumns.value = response.data?.columns || []
  } catch {
    metadataColumns.value = []
  }
}

// 数据源（含设计态绑定）变化：清空旧列定义并用新数据源重新取元数据 + 显示数据
watch(resolvedRefId, () => {
  metadataColumns.value = []
  void loadDesignMetadata()
  void cardsRef.value?.fetchData()
})

onMounted(() => {
  void loadDesignMetadata()
  const instance = { fetchData: () => cardsRef.value?.fetchData(), refresh: () => cardsRef.value?.refresh() }
  actionBus?.register?.(props.dataSourceId || '', instance)
  emit('ready', instance)
})

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
</script>

<style scoped>
.page-data-cards { width: 100%; height: 100%; min-width: 0; min-height: 0; }
.stretch-fill { height: 100%; }
</style>
