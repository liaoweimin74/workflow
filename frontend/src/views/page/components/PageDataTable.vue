<template>
  <SearchTable
    ref="tableRef"
    :search-fields="resolvedSearchFields"
    :columns="resolvedColumns"
    :action-buttons="resolvedActionButtons"
    :toolbar-buttons="resolvedToolbarButtons"
    :merge-default-actions="false"
    :fetch-api="fetchApi"
    :form-config="formConfig"
    :show-create-button="!hasCreateButton"
    :show-search="showSearch"
    :show-pagination="pagination"
    :delete-confirm="deleteConfirm"
    @row-click="handleRowClick"
    @cell-click="handleCellClick"
    @selection-change="handleSelectionChange"
    @sort-change="handleSortChange"
  />

  <!-- 详情弹窗（view 按钮/行查看：只读表单） -->
  <el-dialog v-model="detailVisible" title="详情" :width="detailWidth" :close-on-click-modal="false">
    <FormRenderer
      v-if="detailVisible"
      :key="detailFormKey"
      :rule="detailRules"
      :option="{ labelWidth: '100px' }"
      :initial-values="detailRow"
      readonly
    />
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus, Edit, Delete, View, Search, Refresh, Upload, Download, Document,
  Printer, Setting, Check, Close, Star, Collection, Message, Bell, User, Lock, Unlock,
} from '@element-plus/icons-vue'
import { dataSourceApi } from '@/api/data-source'
import { formatCellValue } from '@/utils/formatters'
import { executeScript, isScriptEventEnabled } from '@/utils/scriptSandbox'
import SearchTable from '@/components/business/SearchTable.vue'
import FormRenderer from '@/views/form/components/FormRenderer.vue'
import type { TableColumn, ActionButton, SearchField, ToolbarButton, DataSourceBindingContext } from '@/components/business/types'
import { activeDsBindings } from '@/utils/formDsBindingsStore'

/** 动作总线（PageRendererPage provide）：dispatch(trigger, eventData) */
const actionBus = inject<{ dispatch: (trigger: string, eventData: any) => void } | undefined>('pageActionBus')

const route = useRoute()
const router = useRouter()

const props = defineProps<{
  /** 页面 key（数据源查询接口路径） */
  pageKey: string
  /** 页面内数据源绑定 id（schema.dataSources[].id） */
  dataSourceId?: string
  /** 全局数据源 refId（由 PageRendererPage.transformComponent 注入） */
  dsRefId?: string
  /** 列配置（ViewDesigner 风格：{ key, label, width, align, sortable, formatter, fixed }） */
  columns?: any[]
  /** 操作配置（ViewDesigner 风格：{ buttons, permissions, actionColumnWidth }） */
  viewActions?: { buttons?: any[]; permissions?: string; actionColumnWidth?: number }
  /** 详情配置（ViewDesigner 风格：{ width, type }） */
  viewDetail?: { width?: string; type?: string }
  /** 事件链配置 */
  viewEvents?: any[]
  /** 搜索字段配置 */
  searchFields?: any[]
  /** 是否显示搜索栏（默认 false） */
  showSearch?: boolean
  /** 是否显示分页（默认 true） */
  pagination?: boolean
  /** 行选择模式（SearchTable 不支持，保留兼容） */
  selectionMode?: 'none' | 'single' | 'multiple'
  /** 附加属性（border/stripe 等） */
  [key: string]: any
}>()

const emit = defineEmits<{
  (e: 'row-click', row: any): void
  (e: 'loaded', records: any[]): void
  (e: 'ready', instance: any): void
}>()

const tableRef = ref<InstanceType<typeof SearchTable> | null>(null)
/** 最近加载的记录（供动作总线/外部读取） */
const records = ref<any[]>([])

/** 数据源列定义（metadata，供 formConfig 动态生成表单） */
const metaColumns = ref<{ key: string; label: string; columnType?: string; required?: boolean; scale?: number }[]>([])
/** 数据源可写标记 */
const writable = ref(false)
/** 当前 filter（动作总线 set-filter 注入） */
const currentFilter = ref<Record<string, unknown> | undefined>(undefined)
/** 切换数据源后标记为 true，忽略 props.columns 旧配置 */
const useMetadataColumns = ref(false)

// ==================== 详情弹窗 ====================
const detailVisible = ref(false)
const detailRow = ref<Record<string, any>>({})
const detailWidth = computed(() => props.viewDetail?.width || '800px')
/** 每次打开递增，强制重建 FormRenderer（读取最新行数据） */
const detailFormKey = ref(0)

// ==================== 图标映射 ====================
/** 图标名 → 组件（对齐 ActionsConfig.iconOptions，工具栏/操作列按钮图标解析用） */
const iconMap: Record<string, any> = {
  Plus, Edit, Delete, View, Search, Refresh, Upload, Download, Document,
  Printer, Setting, Check, Close, Star, Collection, Message, Bell, User, Lock, Unlock,
}
/** 内置按钮默认图标名（PascalCase，对齐 ActionsConfig.iconOptions value） */
const BUILTIN_ICONS: Record<string, string> = { create: 'Plus', edit: 'Edit', delete: 'Delete', view: 'View' }
function defaultIconOf(key?: string): string | undefined {
  return key ? BUILTIN_ICONS[key] : undefined
}
function getIcon(name?: string): any {
  return name ? iconMap[name] : undefined
}

// ==================== 搜索字段适配 ====================
const showSearch = computed(() => props.showSearch === true)
/** SearchFieldConfig({key,label,matchType}) → SearchField({prop,label,type}) */
const resolvedSearchFields = computed<SearchField[]>(() =>
  (props.searchFields || []).map((f: any) => ({
    type: 'input',
    prop: f.key ?? f.field,
    label: f.label || f.key,
  })),
)

// ==================== 列适配 ====================
/** ColumnViewConfig → SearchTable TableColumn（formatter 字符串映射为函数） */
const resolvedColumns = computed<TableColumn[]>(() => {
  // 切换数据源后优先使用元数据列，忽略旧的 props.columns
  if (useMetadataColumns.value || !props.columns || props.columns.length === 0) {
    return metaColumns.value.map((c) => ({
      prop: c.key,
      label: c.label || c.key,
      minWidth: 120,
    }))
  }
  // 有用户配置的列时使用用户配置
  return (props.columns || []).map((c: any) => ({
    prop: c.key ?? c.prop,
    label: c.label || c.key || c.prop,
    width: c.width,
    minWidth: c.minWidth || 120,
    align: c.align as any,
    fixed: c.fixed as any,
    sortable: !!c.sortable,
    formatter: c.formatter ? (_row: any, _col: TableColumn, cellValue: any) => formatCellValue(cellValue, c.formatter) : undefined,
  }))
})

// ==================== 操作按钮适配 ====================
/** 用户是否配置了 create 按钮（隐藏 SearchTable 内置新增，避免操作栏出现两个"新增"） */
const hasCreateButton = computed(() =>
  (props.viewActions?.buttons || []).some((b: any) => b.key === 'create'),
)

/** 工具栏按钮（placement=toolbar）→ SearchTable ToolbarButton：button=普通按钮+图标+文字，text=文本按钮+图标，icon=圆形图标按钮 */
const resolvedToolbarButtons = computed<ToolbarButton[]>(() =>
  (props.viewActions?.buttons || [])
    .filter((b: any) => b.placement === 'toolbar')
    .map((btn: any) => ({
      label: btn.label,
      type: btn.type || defaultType(btn.key),
      link: btn.style === 'text',
      circle: btn.style === 'icon',
      icon: getIcon(btn.icon || defaultIconOf(btn.key)),
      onClick: () => handleActionClick(btn, undefined),
    })),
)

/** 操作列按钮（placement=column）→ SearchTable ActionButton；始终返回数组（空则无按钮，不回退 formConfig 默认） */
const resolvedActionButtons = computed<ActionButton[]>(() =>
  (props.viewActions?.buttons || [])
    .filter((b: any) => b.placement !== 'toolbar')
    .map((btn: any) => ({
      label: btn.label,
      type: btn.type || defaultType(btn.key),
      link: btn.style !== 'icon',
      icon: btn.style === 'icon' ? getIcon(btn.icon || defaultIconOf(btn.key)) : undefined,
      show: btn.visible ? (row: any) => evalVisible(btn.visible, row) : undefined,
      onClick: (row: any) => handleActionClick(btn, row),
    })),
)

function defaultType(key: string): '' | 'primary' | 'danger' {
  // 对齐 PageRenderer：create=primary、delete=danger、edit/view=默认（灰色描边/图标）
  if (key === 'create') return 'primary'
  if (key === 'delete') return 'danger'
  return ''
}

/** visible 表达式求值（$row.xxx → 行值，$param.xxx → 路由参数） */
function evalVisible(expr: string, row: any): boolean {
  try {
    const resolved = expr
      .replace(/\$row\.([\w]+)/g, (_: string, k: string) => {
        const v = getNestedValue(row, k)
        return v === null || v === undefined ? 'undefined' : JSON.stringify(v)
      })
      .replace(/\$param\.([\w]+)/g, (_: string, k: string) => {
        const v = (window as any).__routeParams?.[k]
        return v === null || v === undefined ? 'undefined' : JSON.stringify(v)
      })
    if (/[a-zA-Z_$]\s*\(/.test(resolved)) return false
    return !!Function('"use strict"; return (' + resolved + ')')()
  } catch {
    return true
  }
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => o?.[k], obj)
}

function deleteConfirm(): string {
  return '确定要删除该记录吗？'
}

// ==================== fetchApi 适配 ====================
/** 从模块存储解析全局数据源 refId（优先 props.dsRefId，其次 store 查找，最后回退 dataSourceId） */
const resolvedRefId = computed(() => {
  if (props.dsRefId) return props.dsRefId
  if (props.dataSourceId) {
    const binding = activeDsBindings.value.find((b: DataSourceBindingContext) => b.id === props.dataSourceId)
    if (binding?.refId) return binding.refId
  }
  return ''
})

const fetchApi = async (params: { page: number; size: number; [key: string]: any }) => {
  const dsId = resolvedRefId.value
  if (!dsId) return { rows: [], total: 0 }

  // 组装筛选条件：动作总线 set-filter 注入的条件 + 搜索栏条件
  const filterConditions: any[] = []
  if (currentFilter.value) {
    for (const [column, value] of Object.entries(currentFilter.value)) {
      if (value === '' || value === null || value === undefined) continue
      filterConditions.push({ column, op: 'eq', value })
    }
  }
  for (const field of resolvedSearchFields.value) {
    const v = params[field.prop]
    if (v === '' || v === null || v === undefined) continue
    filterConditions.push({ column: field.prop, op: 'like', value: v })
  }
  const query: Record<string, any> = { page: Math.max(0, params.page - 1), size: params.size }
  if (filterConditions.length > 0) {
    query.filter = JSON.stringify({ logic: 'AND', conditions: filterConditions })
  }
  const res: any = await dataSourceApi.queryData(dsId, query)
  const rows = (res?.data?.records || []).map((r: any) => ({ ...(r.data || {}), id: r.id, version: r.version }))
  records.value = rows
  emit('loaded', rows)
  return { rows, total: res?.data?.total || 0 }
}

// ==================== formConfig（CRUD 弹窗动态生成） ====================
/** 由数据源列定义生成表单规则（新增/编辑/详情共用） */
function buildFormRule() {
  return metaColumns.value.map((c) => ({
    type: inputTypeOf(c.columnType),
    field: c.key,
    title: c.label,
    props: c.columnType === 'DECIMAL' ? { precision: c.scale || 2 } : {},
    validate: c.required ? [{ required: true, message: `${c.label}不能为空` }] : [],
  }))
}

/** 详情弹窗规则（只读表单） */
const detailRules = computed(() => buildFormRule())

const formConfig = computed(() => {
  if (!writable.value) return undefined
  return {
    rule: buildFormRule(),
    labelWidth: '100px',
    createApi: (data: any) => dataSourceApi.createData(resolvedRefId.value, data),
    updateApi: (id: string, data: any, row?: any) => dataSourceApi.updateData(resolvedRefId.value, id, data, row?.version),
    deleteApi: (id: string) => dataSourceApi.deleteData(resolvedRefId.value, id),
    getApi: async (id: string) => {
      const r = await dataSourceApi.getData(resolvedRefId.value, id)
      return r?.data?.data || {}
    },
    dialogWidth: '500px',
    dialogTitle: { create: '新增数据', edit: '编辑数据' },
  }
})

function inputTypeOf(columnType?: string): string {
  if (columnType === 'INTEGER' || columnType === 'BIGINT' || columnType === 'TINYINT' || columnType === 'DECIMAL') return 'inputNumber'
  if (columnType === 'DATETIME' || columnType === 'DATE') return 'datePicker'
  return 'input'
}

// ==================== 按钮点击分发 ====================
function handleActionClick(btn: any, row: any) {
  // 有绑定事件 → 优先执行事件链（内建/自定义都一样，对齐 PageRenderer）
  if (btn.events?.length) {
    for (const ev of btn.events) {
      for (const action of ev.actions || []) {
        void dispatchButtonAction(action, row)
      }
    }
    return
  }
  // 无事件 → 默认行为
  if (btn.key === 'create') {
    // 打开新增弹窗（工具栏 create 按钮；无行参数）
    tableRef.value?.openFormDialog()
  } else if (btn.key === 'edit') {
    tableRef.value?.openEdit(row)
  } else if (btn.key === 'delete') {
    handleDelete(row)
  } else if (btn.key === 'view') {
    openDetail(row)
  }
}

// ==================== 按钮事件链动作执行器（对齐 PageRenderer dispatchAction） ====================
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

/** 导出当前表格数据（JSON） */
function exportData() {
  const rows = records.value
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.pageKey || 'page'}-data.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** 执行单个事件链动作（ViewDesigner 风格：type/params） */
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
      tableRef.value?.openFormDialog()
      break
    case 'edit':
      if (row) tableRef.value?.openEdit(row)
      break
    case 'delete':
      if (row) await handleDelete(row)
      break
    case 'refresh':
      tableRef.value?.fetchList()
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
    case 'set-page': {
      const page = parseInt(resolved.page, 10)
      if (!isNaN(page) && page > 0) {
        tableRef.value?.setQuery({ page }, false)
      }
      break
    }
    case 'set-sort':
      tableRef.value?.sort(resolved.field || resolved.prop || '', resolved.order || 'ascending')
      break
    case 'clear-selection':
      tableRef.value?.clearSelection()
      break
    case 'script': {
      const source: string = resolved.source || ''
      if (!source) {
        console.warn('[page-table] 脚本动作缺少 source 参数')
        break
      }
      if (!isScriptEventEnabled()) {
        console.warn('[page-table] 脚本事件未启用（设置 VITE_PAGE_SCRIPT_ENABLED=true 开启）')
        break
      }
      await executeScript(source, {
        row,
        params: route.query || {},
        selectedRows: row ? [row] : [],
        ds: {
          query: (filter?: Record<string, any>) => {
            if (filter) setFilter(filter)
            else refresh()
          },
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
          refresh: () => refresh(),
          openDetail: () => openDetail(row),
          openCreate: () => tableRef.value?.openFormDialog(),
          openEdit: () => (row ? tableRef.value?.openEdit(row) : undefined),
          remove: (id: string) =>
            resolvedRefId.value ? dataSourceApi.deleteData(resolvedRefId.value, id) : Promise.reject(new Error('数据源未绑定')),
        },
        $: { message: (msg: string, type = 'info') => ElMessage({ message: msg, type: type as any }) },
      })
      break
    }
    default:
      console.warn('[page-table] 未知动作类型:', action.type)
  }
}

/** 详情弹窗：以数据源列生成只读表单，回显行数据 */
function openDetail(row: any) {
  if (!row) return
  detailRow.value = row
  detailFormKey.value++
  detailVisible.value = true
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
    tableRef.value?.fetchList()
  } catch {
    // 拦截器已弹错误
  }
}

// ==================== 表格事件 → 事件链 ====================
/** 触发 viewEvents 中匹配触发器的动作（动作由本组件自执行，对齐 PageRenderer triggerEvents） */
function triggerViewEvents(trigger: string, target: string, ctx: { row?: any; column?: any; selectedRows?: any[]; prop?: string; order?: string }) {
  for (const ev of props.viewEvents || []) {
    if (ev.trigger !== trigger) continue
    if (ev.target && ev.target !== target) continue
    for (const action of ev.actions || []) {
      void dispatchButtonAction(action, ctx.row)
    }
  }
}

function handleRowClick(row: any, _column?: any, _event?: Event) {
  emit('row-click', row)
  actionBus?.dispatch('row-click', { node: row, row })
  triggerViewEvents('row-click', 'table', { row })
}

/** 单元格点击（新增） */
function handleCellClick(row: any, column: any) {
  triggerViewEvents('cell-click', 'table', { row, column })
}

/** 行选择变化（新增） */
function handleSelectionChange(selection: any[]) {
  triggerViewEvents('selection-change', 'table', { selectedRows: selection })
}

/** 排序变化（新增） */
function handleSortChange(args: { column: any; prop: string; order: string }) {
  triggerViewEvents('sort-change', 'table', { column: args.column, prop: args.prop, order: args.order })
}

// ==================== 动作总线接口 ====================
function refresh() {
  tableRef.value?.fetchList()
}

function setFilter(filter: Record<string, unknown>) {
  currentFilter.value = { ...(currentFilter.value || {}), ...filter }
  tableRef.value?.fetchList()
}

function resetFilter() {
  currentFilter.value = undefined
  tableRef.value?.fetchList()
}

function openCreate() {
  tableRef.value?.openFormDialog()
}

defineExpose({ refresh, fetchData: refresh, records, setFilter, resetFilter, openCreate })

/** 加载数据源元数据（列定义 + writable 标记） */
async function loadMetadata() {
  if (!resolvedRefId.value) return
  try {
    const res = await dataSourceApi.getMetadata(resolvedRefId.value)
    const meta = res.data as any
    writable.value = !!meta?.writable
    metaColumns.value = (meta?.columns || []).map((c: any) => ({
      key: c.key,
      label: c.label || c.key,
      columnType: c.columnType,
      required: c.required,
      scale: c.scale,
    }))
  } catch {
    // 元数据加载失败不阻断表格展示
  }
}

onMounted(async () => {
  await loadMetadata()
  emit('ready', { refresh, setFilter, resetFilter, openCreate, records })
})

// 数据源切换时重新加载元数据，标记使用元数据列
watch(() => resolvedRefId.value, () => {
  useMetadataColumns.value = true
  loadMetadata()
})
</script>
