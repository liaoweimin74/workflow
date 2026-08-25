<template>
  <SearchTable
    ref="tableRef"
    :search-fields="resolvedSearchFields"
    :columns="resolvedColumns"
    :action-buttons="resolvedActionButtons"
    :merge-default-actions="false"
    :fetch-api="fetchApi"
    :form-config="formConfig"
    :show-search="showSearch"
    :show-pagination="pagination"
    :delete-confirm="deleteConfirm"
    @row-click="handleRowClick"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, View } from '@element-plus/icons-vue'
import { dataSourceApi } from '@/api/data-source'
import { formatCellValue } from '@/utils/formatters'
import SearchTable from '@/components/business/SearchTable.vue'
import type { TableColumn, ActionButton, SearchField } from '@/components/business/types'

/** 动作总线（PageRendererPage provide）：dispatch(trigger, eventData) */
const actionBus = inject<{ dispatch: (trigger: string, eventData: any) => void } | undefined>('pageActionBus')

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

// ==================== 图标映射 ====================
const iconMap: Record<string, any> = { Plus, Edit, Delete, View }
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
const resolvedColumns = computed<TableColumn[]>(() =>
  (props.columns || []).map((c: any) => ({
    prop: c.key ?? c.prop,
    label: c.label || c.key || c.prop,
    width: c.width,
    minWidth: c.minWidth || 120,
    align: c.align as any,
    fixed: c.fixed as any,
    sortable: !!c.sortable,
    formatter: c.formatter ? (row: any, _col: TableColumn, cellValue: any) => formatCellValue(cellValue, c.formatter) : undefined,
  })),
)

// ==================== 操作按钮适配 ====================
const resolvedActionButtons = computed<ActionButton[] | undefined>(() => {
  const buttons = props.viewActions?.buttons || []
  if (buttons.length > 0) {
    return buttons.map((btn: any) => ({
      label: btn.label,
      type: btn.type || defaultType(btn.key),
      link: btn.style !== 'icon',
      icon: btn.style === 'icon' ? getIcon(btn.icon) : undefined,
      show: btn.visible ? (row: any) => evalVisible(btn.visible, row) : undefined,
      onClick: (row: any) => handleActionClick(btn, row),
    }))
  }
  // 未配置自定义按钮 → undefined，让 SearchTable 用 formConfig 默认编辑/删除
  return undefined
})

function defaultType(key: string): '' | 'primary' | 'danger' {
  if (key === 'delete') return 'danger'
  if (key === 'edit' || key === 'view' || key === 'create') return 'primary'
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
const fetchApi = async (params: { page: number; size: number; [key: string]: any }) => {
  const dsId = props.dsRefId || props.dataSourceId
  // 设计器画布中无 pageKey（渲染页才注入），跳过加载避免无效请求
  if (!dsId || !props.pageKey) return { rows: [], total: 0 }
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
  const query: Record<string, any> = { page: params.page - 1, size: params.size }
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
const formConfig = computed(() => {
  if (!props.dsRefId || !writable.value) return undefined
  return {
    rule: metaColumns.value.map((c) => ({
      type: inputTypeOf(c.columnType),
      field: c.key,
      title: c.label,
      props: c.columnType === 'DECIMAL' ? { precision: c.scale || 2 } : {},
      validate: c.required ? [{ required: true, message: `${c.label}不能为空` }] : [],
    })),
    labelWidth: '100px',
    createApi: (data: any) => dataSourceApi.createData(props.dsRefId!, data),
    updateApi: (id: string, data: any, row?: any) => dataSourceApi.updateData(props.dsRefId!, id, data, row?.version),
    deleteApi: (id: string) => dataSourceApi.deleteData(props.dsRefId!, id),
    getApi: async (id: string) => {
      const r = await dataSourceApi.getData(props.dsRefId!, id)
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
  if (btn.key === 'edit') {
    tableRef.value?.openEdit(row)
  } else if (btn.key === 'delete') {
    handleDelete(row)
  } else if (btn.events?.length) {
    // 自定义按钮：执行事件链（trigger 恒为 click）
    for (const ev of btn.events) {
      for (const action of ev.actions || []) {
        actionBus?.dispatch(action.type, { row, ...action.params })
      }
    }
  }
}

/** 删除：确认后调用数据源删除 API，并刷新列表 */
async function handleDelete(row: any) {
  if (!props.dsRefId) return
  try {
    await ElMessageBox.confirm('确定要删除该记录吗？', '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await dataSourceApi.deleteData(props.dsRefId, row.id)
    ElMessage.success('删除成功')
    tableRef.value?.fetchList()
  } catch {
    // 拦截器已弹错误
  }
}

// ==================== 行点击 → 事件链 ====================
function handleRowClick(row: any, column?: any, event?: Event) {
  emit('row-click', row)
  actionBus?.dispatch('row-click', { node: row, row })
  // 触发 viewEvents 中 row-click 触发器
  for (const ev of props.viewEvents || []) {
    if (ev.trigger !== 'row-click') continue
    for (const action of ev.actions || []) {
      actionBus?.dispatch(action.type, { row, ...action.params })
    }
  }
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

onMounted(async () => {
  // 加载元数据（可写标记 + 列定义，供 formConfig 动态生成表单）
  if (props.dsRefId) {
    try {
      const res = await dataSourceApi.getMetadata(props.dsRefId)
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
  emit('ready', { refresh, setFilter, resetFilter, openCreate, records })
})
</script>
