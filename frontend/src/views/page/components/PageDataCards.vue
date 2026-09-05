<template>
  <div class="page-data-cards" :class="{ 'stretch-fill': stretch }">
    <ListCards
      v-if="metaLoaded"
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
      :toolbar-buttons="toolbarButtons"
      :group-by="groupBy"
      :collapsible-groups="collapsibleGroups"
      :actions-placement="actionsPlacement"
      :design-mode="designMode"
      :theme="theme"
      :form-style="style"
      :style="cardStyle"
      @row-click="handleRowClick"
      @action-click="handleActionClick"
      @toolbar-action="handleToolbarAction"
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
          :data-sources="formDataSources"
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
        :data-sources="formDataSources"
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
import { formApi } from '@/api/form'
import { resolveOptionRules, hasOptionDatasource } from '@/vendor/option-datasource'
import { activeDsBindings } from '@/utils/formDsBindingsStore'
import { executeScript, isScriptEventEnabled } from '@/utils/scriptSandbox'
import ListCards from '@/components/business/ListCards.vue'
import FormRenderer from '@/views/form/components/FormRenderer.vue'
import { leafDisplayText, withArrayLabels } from '@/views/form/arrayValueLabel'
import type { CardColumn, DataSourceBindingContext, ListQueryParams, ListPageResult } from '@/components/business/types'
import type { CardTheme, CardStyle } from '@/components/business/ListCards.types'

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
  /** 内置主题模板 */
  theme?: CardTheme
  /** form-create 组件级样式（原始 CSS 样式对象，如 { color, backgroundColor }），应用到每张卡片 */
  style?: Record<string, string>
  /** 结构化卡片整体样式（覆盖主题），通过「卡片样式脚本」配置 */
  cardStyle?: CardStyle
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

const resolvedColumns = computed<CardColumn[]>(() => (props.columns || []).filter((column) => !column.hidden).map((column) => {
  const prop = column.prop || (column as any).key
  const meta = metadataColumns.value.find((m) => m.key === prop)
  // 数组值组件列（卡片字段显示显示值而非原始 value）：formatter 优先读 <key>_text（叶子 label），缺失回退 value join（对齐 PageDataTable）
  const isArrayCol = !!meta && ARRAY_COMPONENT_TYPES.includes(meta.componentType || '')
  return {
    ...column,
    prop,
    label: column.label || column.prop || (column as any).key,
    ...(isArrayCol && !column.formatter
      ? {
          formatter: (row: any, _col: any, value: unknown) => {
            const text = row?.[prop + '_text']
            if (text !== undefined && text !== null && text !== '') return leafDisplayText(text)
            return formatArrayValue(value)
          },
        }
      : {}),
  }
}))

/** 数组值组件类型（卡片字段显示按组件类型渲染显示值 label） */
const ARRAY_COMPONENT_TYPES = ['checkbox', 'multiSelect', 'multiSelectPro', 'select', 'elTransfer', 'tree', 'elTreeSelect', 'cascader']

/** 数组值组件主列（JSON）搜索 → 用 <key>_text 列（查询值=显示值 label，后端 LIKE 匹配显示列；对齐 PageDataTable） */
function resolveSearchColumn(key: string): string {
  const meta = metadataColumns.value.find((m) => m.key === key)
  if (meta && ARRAY_COMPONENT_TYPES.includes(meta.componentType || '')) return `${key}_text`
  return key
}

/** JSON 数组 → 逗号拼接；非数组（旧逗号串/字符串）原样返回 */
function formatArrayValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      if (Array.isArray(parsed)) return parsed.join(', ')
    } catch {
      // 旧逗号串或普通字符串，原样
    }
    return v
  }
  return v
}

const metadataColumns = ref<any[]>([])
/** 元数据加载完成标记：ListCards 在列定义就绪后才挂载，保证首次取数渲染即带 formatter（数组值列显示 label 而非原始 value） */
const metaLoaded = ref(false)
/** 数据源绑定表单 formKey（FORM metadata 返回；非空时查询栏/编辑弹窗按表单 schema 构建组件与选项） */
const formKey = ref('')
/** 业务表单 schema rule（formKey 加载 + resolveOptionRules 解析选项数据源） */
const formSchemaRule = ref<Array<Record<string, any>>>([])
/** 表单级数据源绑定（schema.dataSources：表单内 id → 全局 refId） */
const formDataSources = ref<DataSourceBindingContext[]>([])
const columnsForRender = computed(() => props.designMode && props.columns?.length === 0
  ? metadataColumns.value.map((column) => ({ prop: column.key, label: column.label || column.key, role: column.role || 'field' }))
  : resolvedColumns.value)
/** 查询组件类型映射（按数据源 metadata componentType；选项数据源来自业务表单 schema，对齐 PageDataTable） */
const QUERY_SELECT_TYPES = ['select', 'multiSelect', 'multiSelectPro', 'checkbox', 'elTransfer']
const QUERY_TREE_TYPES = ['tree', 'elTreeSelect']
const QUERY_PICKER_TYPES = ['LookupPicker', 'DataPicker']

/** 按列 key 找业务表单 schema rule */
function findFormRuleByKey(fieldKey: string): Record<string, any> | undefined {
  return formSchemaRule.value.find((r) => (r as any).field === fieldKey)
}

/** 扁平选项 label 列表（select 类查询：label=value；树/级联/穿梭从 props.data/props.options 取） */
function formOptionLabelItems(rule: any): { label: string; value: string }[] {
  const list: any[] = rule?.options ?? rule?.props?.options ?? rule?.props?.data ?? []
  const labels: string[] = []
  const collect = (items: any[]) => {
    for (const it of items) {
      if (it && it.label !== undefined) labels.push(String(it.label))
      if (Array.isArray(it.children)) collect(it.children)
    }
  }
  collect(list)
  return labels.map((l) => ({ label: l, value: l }))
}

const resolvedSearchFields = computed(() => (props.searchFields || [])
  .map((field) => {
    const key = field.key || field.field || ''
    const meta = metadataColumns.value.find((m) => m.key === key)
    const compType = meta?.componentType || ''
    const rule = findFormRuleByKey(key)
    const base = { prop: key, label: field.label || key }
    if (QUERY_TREE_TYPES.includes(compType)) {
      return {
        ...base,
        type: 'tree-select' as const,
        treeProps: { data: rule?.props?.data ?? [], props: { label: 'label', value: 'label', children: 'children' } },
        style: 'width: 200px',
      }
    }
    if (compType === 'cascader') {
      return {
        ...base,
        type: 'cascader' as const,
        cascaderProps: { options: rule?.props?.options ?? [], props: { label: 'label', value: 'label', children: 'children' } },
        style: 'width: 200px',
      }
    }
    if (QUERY_SELECT_TYPES.includes(compType)) {
      return {
        ...base,
        type: 'select' as const,
        options: formOptionLabelItems(rule),
        style: 'width: 180px',
      }
    }
    if (QUERY_PICKER_TYPES.includes(compType)) {
      return {
        ...base,
        type: 'lookupPicker' as const,
        lookupProps: { ...(rule?.props || {}) },
        style: 'width: 200px',
      }
    }
    if (compType === 'DatePicker' || compType === 'datePicker' || compType === 'date') {
      return { ...base, type: 'date-picker' as const }
    }
    return { ...base, type: 'input' as const, style: 'width: 180px' }
  })
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
const toolbarButtons = computed(() => (props.viewActions?.buttons || [])
  .filter((button) => button.placement === 'toolbar')
  .map((button) => ({
    key: button.key,
    label: button.label,
    icon: button.icon || defaultIconOf(button.key),
    type: button.type || defaultTypeOf(button.key),
    link: button.style === 'text',
    circle: button.style === 'icon',
    size: 'default' as const,
    events: button.events,
  })))

const BUILTIN_ACTION_ICONS: Record<string, string> = {
  create: 'Plus',
  edit: 'Edit',
  delete: 'Delete',
  view: 'View',
}

function defaultIconOf(key: string): string | undefined {
  return BUILTIN_ACTION_ICONS[key]
}

function defaultTypeOf(key: string): 'primary' | 'success' | 'warning' | 'danger' | 'info' | undefined {
  if (key === 'create') return 'primary'
  if (key === 'delete') return 'danger'
  return undefined
}

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
      .map((field) => {
        const raw = params[field.prop]
        const v = Array.isArray(raw) ? raw.join('/') : raw
        // 数组值组件主列（JSON）→ 映射 <key>_text 显示列查询 label（对齐 PageDataTable）
        return { column: resolveSearchColumn(field.prop), op: 'like', value: v }
      })
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

/** 加载数据源 metadata（运行态查 componentType 供数组值列渲染显示值；设计态空 columns 时同时生成 fallback 展示列） */
async function loadMetadata() {
  if (!resolvedRefId.value) return
  try {
    const response = await dataSourceApi.getMetadata(resolvedRefId.value)
    metadataColumns.value = response.data?.columns || []
    formKey.value = response.data?.formKey || ''
    // 表单 schema + 选项数据源取数较慢：异步加载（不阻塞首次取数/ready；查询栏选项与编辑弹窗规则随后就绪）
    void loadFormSchema()
  } catch {
    metadataColumns.value = []
    formKey.value = ''
    formSchemaRule.value = []
    formDataSources.value = []
  }
  // 列定义就绪（成功含列/失败空列）：放行 ListCards 挂载（挂载后首次取数即用最新列定义）
  metaLoaded.value = true
}

/** 加载业务表单 schema（查询栏 select/tree/cascader 选项数据源取数，对齐 PageDataTable） */
async function loadFormSchema() {
  if (!formKey.value) {
    formSchemaRule.value = []
    formDataSources.value = []
    return
  }
  try {
    const res = await formApi.getFormDefinitionByKey(formKey.value)
    const raw = (res.data as any)?.schema
    const schema = JSON.parse(raw || '[]')
    const rules = Array.isArray(schema) ? schema : (schema.rule || [])
    formDataSources.value = !Array.isArray(schema) && Array.isArray(schema.dataSources) ? schema.dataSources : []
    formSchemaRule.value = hasOptionDatasource(rules)
      ? await resolveOptionRules(rules, formDataSources.value)
      : rules
  } catch {
    formSchemaRule.value = []
    formDataSources.value = []
  }
}

// 数据源（含设计态绑定）变化：清空旧列定义并重新取元数据（metaLoaded 置 false 卸载 ListCards，重挂载后取数即用新列定义）
watch(resolvedRefId, () => {
  metadataColumns.value = []
  metaLoaded.value = false
  void loadMetadata()
})

onMounted(() => {
  void loadMetadata()
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

function handleToolbarAction(action: { key: string; label: string; icon?: string; type?: string; events?: any[] }) {
  handleActionClick(action, undefined)
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
/** 表单规则回退（无表单 schema 的 SYSTEM/API 数据源）：列定义映射基础组件（对齐 PageDataTable buildFormRule） */
function buildFormRule() {
  return metadataColumns.value.map((column: any) => ({
    type: column.columnType === 'DATE' || column.columnType === 'DATETIME' ? 'datePicker' : 'input',
    field: column.key,
    title: column.label || column.key,
    validate: column.required ? [{ required: true, message: `${column.label || column.key}不能为空` }] : [],
  }))
}

/** 编辑/详情表单规则：FORM 数据源用业务表单 schema（组件/选项/校验按定义，无 _text 重复列）；其余回退列映射（对齐 PageDataTable） */
const formRules = computed(() => (formSchemaRule.value.length > 0 ? formSchemaRule.value : buildFormRule()))

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
  detailRules.value = formRules.value
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
  localFormValues.value = row || {}
  localFormId.value = row?.id
  if (mode !== 'create' && row?.id) {
    const detail = await dataSourceApi.getData(resolvedRefId.value, row.id)
    localFormValues.value = { ...localFormValues.value, ...(detail.data?.data || {}) }
  }
  // 表单规则：FORM 数据源用业务表单 schema（组件/选项/校验按定义），其余回退列映射
  localFormRules.value = formRules.value
  localFormVisible.value = true
}

async function saveLocalForm() {
  if (!resolvedRefId.value) return
  const values = localFormRef.value?.getFormData() || localFormValues.value
  // 提交生成 <key>_text 显示列（数组值组件 value → label，对齐 PageDataTable/BizDataListPage）
  const payload = withArrayLabels(values, formSchemaRule.value)
  if (localFormMode.value === 'create') await dataSourceApi.createData(resolvedRefId.value, payload)
  else if (localFormId.value !== undefined) await dataSourceApi.updateData(resolvedRefId.value, String(localFormId.value), payload)
  localFormVisible.value = false
  await cardsRef.value?.refresh()
}
</script>

<style scoped>
.page-data-cards { width: 100%; height: 100%; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.page-data-cards :deep(.list-cards) { flex: 1 1 auto; min-height: 0; }
.stretch-fill { height: 100%; }
.detail-body-scroll { overflow-y: auto; }
</style>
