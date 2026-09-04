<template>
  <div class="page-data-cards" :class="{ 'stretch-fill': stretch }">
    <ListCards
      ref="cardsRef"
      :columns="columnsForRender"
      :fetch-api="fetchApi"
      :card-min-width="cardMinWidth"
      :default-page-size="pageSize || 20"
      :search-fields="resolvedSearchFields"
      :show-search="showSearch"
      :page-sizes="pageSizes"
      :show-pagination="pagination"
      :actions="resolvedActions"
      :group-by="groupBy"
      :collapsible-groups="collapsibleGroups"
      :actions-placement="actionsPlacement"
      :design-mode="designMode"
      @row-click="handleRowClick"
      @action-click="handleActionClick"
    />
    <!-- 详情弹窗（view 按钮：只读表单，宽度取 viewDetail.width） -->
    <el-dialog v-model="detailVisible" title="详情" :width="detailWidth" :close-on-click-modal="false">
      <div class="detail-body-scroll" :style="{ height: detailHeight || undefined }">
        <FormRenderer
          v-if="detailVisible"
          :key="detailFormKey"
          :rule="detailRules"
          :option="{ labelWidth: '100px' }"
          :initial-values="detailRow"
          readonly
        />
      </div>
    </el-dialog>
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
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'
import { executeScript, isScriptEventEnabled } from '@/utils/scriptSandbox'
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
  /** 按钮事件链（对齐 ViewDesigner：{ actions: [{ type, params }] }） */
  events?: Array<{ actions?: Array<{ type: string; params?: { key: string; value: string }[] }> }>
}

const props = withDefaults(defineProps<{
  pageKey?: string
  dataSourceId?: string
  dsRefId?: string
  columns?: CardColumn[]
  cardMinWidth?: number | string
  pageSize?: number
  searchFields?: Array<{ key?: string; field?: string; label?: string }>
  showSearch?: boolean
  pageSizes?: number[]
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
}>(), { pageSize: 20, showSearch: false, pageSizes: () => [10, 20, 50], pagination: true, cardMinWidth: 280, stretch: false })

const emit = defineEmits<{
  (e: 'row-click', row: any): void
  (e: 'loaded', rows: any[]): void
  (e: 'ready', instance: any): void
}>()

const route = useRoute()
const router = useRouter()

const actionBus = inject<{
  dispatch: (trigger: string, data: any) => boolean
  register?: (id: string, instance: any) => void
  hasLinkedContainer?: (id?: string) => boolean
  openLinkedContainer?: (id: string, mode: 'create' | 'edit' | 'view', row: any) => void
}>('pageActionBus')
const cardsRef = ref<InstanceType<typeof ListCards>>()

// ==================== 独立详情弹窗（view 按钮） ====================
const detailVisible = ref(false)
const detailRow = ref<Record<string, any>>({})
const detailFormKey = ref(0)
const detailRules = ref<any[]>([])
const detailWidth = computed(() => props.viewDetail?.width || '800px')
const detailHeight = computed(() => props.viewDetail?.height || '')

// ==================== 本地编辑/新增表单 ====================
const localFormVisible = ref(false)
const localFormMode = ref<'create' | 'edit' | 'view'>('edit')
const localFormTitle = computed(() => localFormMode.value === 'create' ? '新增数据' : localFormMode.value === 'view' ? '详情' : '编辑数据')
const localFormRef = ref<InstanceType<typeof FormRenderer>>()
const localFormRules = ref<any[]>([])
const localFormValues = ref<Record<string, any>>({})
const localFormId = ref<string | number>()

/** 动作总线 set-filter 注入的过滤条件（对齐 PageDataTable） */
const currentFilter = ref<Record<string, unknown> | undefined>(undefined)
/** 最近加载的记录（供导出/外部读取） */
const records = ref<any[]>([])

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
const resolvedSearchFields = computed(() => (props.searchFields || [])
  .map((field) => ({
    type: 'input' as const,
    prop: field.key || field.field || '',
    label: field.label || field.key || field.field || '',
  }))
  .filter((field) => field.prop))

// 行级操作按钮（设计态/运行态一致：配置了按钮则预览/运行都显示，便于设计器所见即所得；保留 style/icon/type/events 供卡片按形态渲染与分发）
const resolvedActions = computed(() => (props.viewActions?.buttons || [])
  .filter((button) => button.placement !== 'toolbar')
  .map((button) => ({
    key: button.key,
    label: button.label,
    style: button.style,
    icon: button.icon,
    type: button.type,
    events: button.events,
  })))

const fetchApi = async (params: ListQueryParams): Promise<ListPageResult> => {
  if (!resolvedRefId.value) return { rows: [], total: 0 }
  const isDesign = props.designMode
  const filterConditions = [
    ...(currentFilter.value
      ? Object.entries(currentFilter.value)
          .filter(([, v]) => v !== '' && v !== null && v !== undefined)
          .map(([column, value]) => ({ column, op: 'eq', value }))
      : []),
    ...resolvedSearchFields.value
      .map((field) => ({ column: field.prop, op: 'like', value: params[field.prop] }))
      .filter((condition) => condition.value !== '' && condition.value !== null && condition.value !== undefined),
  ]
  const queryParams: Record<string, any> = {
    // 设计态预览固定取首页，且最多 10 条；运行态透传分页
    page: isDesign ? 1 : Math.max(1, params.page),
    size: isDesign ? Math.min(params.size || 10, 10) : params.size,
  }
  if (props.pagination === false && !isDesign) {
    delete queryParams.page
    queryParams.size = -1
  }
  if (filterConditions.length > 0) {
    queryParams.filter = JSON.stringify({ logic: 'AND', conditions: filterConditions })
  }
  const response = await dataSourceApi.queryData(resolvedRefId.value, queryParams)
  const rows = (response.data?.records || []).map((record: any) => ({ ...(record.data || {}), id: record.id, version: record.version }))
  records.value = rows
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

function handleActionClick(action: { key: string; label: string; events?: any[] }, row: any) {
  // 有绑定事件 → 优先执行事件链（内建/自定义都一样，对齐 PageDataTable）
  if (action.events?.length) {
    for (const ev of action.events) {
      for (const act of ev.actions || []) {
        void dispatchButtonAction(act, row)
      }
    }
    return
  }
  const mode = action.key === 'create' ? 'create' : action.key === 'view' ? 'view' : action.key === 'edit' ? 'edit' : undefined
  if (mode && actionBus?.hasLinkedContainer?.(props.dataSourceId) && actionBus.openLinkedContainer) {
    actionBus.openLinkedContainer(props.dataSourceId || '', mode, row)
    return
  }
  if (mode === 'view') {
    openDetail(row)
    return
  }
  if (mode) {
    void openLocalForm(mode, row)
    return
  }
  if (action.key === 'delete') {
    void handleDelete(row)
    return
  }
  actionBus?.dispatch('action-click', { action, row, source: props.dataSourceId })
}

// ==================== 按钮事件链动作执行器（对齐 PageDataTable/PageRenderer dispatchAction） ====================
/** 模板变量替换：$row.字段（当前行）/ $param.参数（路由参数） */
function resolveTemplate(tpl: string, row: any): string {
  return tpl
    .replace(/\$row\.([\w]+)/g, (_: string, k: string) => {
      const v = row?.[k]
      return v === null || v === undefined ? '' : String(v)
    })
    .replace(/\$param\.([\w]+)/g, (_: string, k: string) => (route.query?.[k] == null ? '' : String(route.query[k])))
}

/** 解析动作参数 [{key,value}] → {key: 模板替换后的值} */
function resolveParams(params: { key: string; value: string }[], row: any): Record<string, any> {
  const out: Record<string, any> = {}
  for (const p of params || []) {
    out[p.key] = resolveTemplate(p.value, row)
  }
  return out
}

/** 导出当前卡片数据（JSON） */
function exportData() {
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.pageKey || 'page'}-data.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** 执行单个事件链动作（ViewDesigner 风格：type/params），对齐 PageDataTable */
async function dispatchButtonAction(action: { type: string; params?: { key: string; value: string }[] }, row: any) {
  const resolved = resolveParams(action.params || [], row)
  switch (action.type) {
    case 'open-detail':
      openDetail(row)
      break
    case 'open-link':
      if (resolved.url) router.push(resolved.url)
      break
    case 'open-create':
      openLocalForm('create')
      break
    case 'edit':
      if (row) openLocalForm('edit', row)
      break
    case 'delete':
      if (row) await handleDelete(row)
      break
    case 'refresh':
      cardsRef.value?.refresh()
      break
    case 'export':
      exportData()
      break
    case 'message':
      ElMessage({
        message: resolved.text || resolved.message || '提示',
        type: (resolved.type as any) || 'info',
      })
      break
    case 'set-filter':
      setFilter(resolved)
      break
    case 'script': {
      const source: string = resolved.source || ''
      if (!source) {
        console.warn('[page-cards] 脚本动作缺少 source 参数')
        break
      }
      if (!isScriptEventEnabled()) {
        console.warn('[page-cards] 脚本事件未启用（设置 VITE_PAGE_SCRIPT_ENABLED=true 开启）')
        break
      }
      await executeScript(source, {
        row,
        params: route.query || {},
        selectedRows: row ? [row] : [],
        ds: {
          query: (filter?: Record<string, any>) => setFilter(filter || {}),
          detail: (id: string) => (resolvedRefId.value ? dataSourceApi.getData(resolvedRefId.value, id) : Promise.reject(new Error('数据源未绑定'))),
          create: (data: Record<string, unknown>) =>
            resolvedRefId.value ? dataSourceApi.createData(resolvedRefId.value, data) : Promise.reject(new Error('数据源未绑定')),
          update: (id: string, data: Record<string, unknown>) =>
            resolvedRefId.value ? dataSourceApi.updateData(resolvedRefId.value, id, data, row?.version) : Promise.reject(new Error('数据源未绑定')),
          remove: (id: string) =>
            resolvedRefId.value ? dataSourceApi.deleteData(resolvedRefId.value, id) : Promise.reject(new Error('数据源未绑定')),
        },
        api: { pageKey: props.pageKey || '', dataSourceId: resolvedRefId.value || '' },
        actions: {
          refresh: () => cardsRef.value?.refresh(),
          openDetail: () => openDetail(row),
          openCreate: () => openLocalForm('create'),
          openEdit: () => (row ? openLocalForm('edit', row) : undefined),
          remove: (id: string) =>
            resolvedRefId.value ? dataSourceApi.deleteData(resolvedRefId.value, id) : Promise.reject(new Error('数据源未绑定')),
        },
        $: { message: (msg: string, type = 'info') => ElMessage({ message: msg, type: type as any }) },
      })
      break
    }
    default:
      console.warn('[page-cards] 未知动作类型:', action.type)
  }
}

// ==================== 详情（view）与动作总线接口 ====================
/** 详情：popup → 独立详情弹窗；drawer/inline → 本地表单只读查看 */
function openDetail(row: any) {
  if (!row) return
  const fm = props.viewDetail?.formMode || 'popup'
  if (fm !== 'popup') {
    void openLocalForm('view', row)
    return
  }
  detailRow.value = row
  detailFormKey.value++
  detailVisible.value = true
  void loadDetailRules()
}

async function loadDetailRules() {
  if (!resolvedRefId.value) return
  try {
    const metadata = await dataSourceApi.getMetadata(resolvedRefId.value)
    detailRules.value = (metadata.data?.columns || []).map((column: any) => ({
      type: column.columnType === 'DATE' || column.columnType === 'DATETIME' ? 'datePicker' : 'input',
      field: column.key,
      title: column.label || column.key,
      validate: column.required ? [{ required: true, message: `${column.label || column.key}不能为空` }] : [],
    }))
  } catch {
    detailRules.value = []
  }
}

function setFilter(filter: Record<string, unknown>) {
  currentFilter.value = { ...(currentFilter.value || {}), ...filter }
  void cardsRef.value?.refresh()
}

/** 删除：确认后调用数据源删除 API，并刷新列表 */
async function handleDelete(row: any) {
  if (!resolvedRefId.value) return
  try {
    await ElMessageBox.confirm('确定要删除该记录吗？', '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await dataSourceApi.deleteData(resolvedRefId.value, row.id)
    ElMessage.success('删除成功')
    await cardsRef.value?.refresh()
  } catch {
    // 拦截器已弹错误
  }
}

async function openLocalForm(mode: 'create' | 'edit' | 'view', row?: any) {
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
  else if (localFormId.value !== undefined) await dataSourceApi.updateData(resolvedRefId.value, String(localFormId.value), values)
  localFormVisible.value = false
  await cardsRef.value?.refresh()
}
</script>

<style scoped>
.page-data-cards { width: 100%; height: 100%; min-width: 0; min-height: 0; }
.stretch-fill { height: 100%; }
.detail-body-scroll { overflow-y: auto; }
</style>
