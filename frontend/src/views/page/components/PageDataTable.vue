<template>
  <div>
    <el-table
      ref="tableRef"
      :data="records"
      v-loading="loading"
      border
      stripe
      v-bind="tableAttrs"
      @row-click="handleRowClick"
      @cell-click="handleCellClick"
      @selection-change="handleSelectionChange"
      @sort-change="handleSortChange"
    >
      <el-table-column
        v-if="props.selectionMode === 'multiple'"
        type="selection"
        width="55"
      />
      <el-table-column
        v-if="props.selectionMode === 'single'"
        label=""
        width="55"
        align="center"
      >
        <template #default="{ row }">
          <el-radio
            :model-value="currentRow?.id"
            :value="row.id"
            @change="handleCurrentChange(row)"
          >&nbsp;</el-radio>
        </template>
      </el-table-column>
      <el-table-column
        v-for="col in resolvedColumns"
        :key="col.prop"
        :prop="col.prop"
        :label="col.label"
        :min-width="col.minWidth"
        :width="col.width"
        :align="col.align"
        :sortable="col.sortable ? 'custom' : undefined"
        :fixed="col.fixed || undefined"
      >
        <template #default="{ row }">
          {{ col.formatter ? formatCellValue(getNestedValue(row, col.prop), col.formatter) : getNestedValue(row, col.prop) }}
        </template>
      </el-table-column>
      <!-- 操作列 -->
      <el-table-column
        v-if="resolvedActionButtons.length"
        label="操作"
        :width="actionColumnWidthValue"
        align="center"
        fixed="right"
      >
        <template #default="{ row }">
          <div style="display: inline-flex; align-items: center; gap: 0; white-space: nowrap">
            <template v-for="btn in resolvedActionButtons" :key="btn.key">
              <template v-if="isActionVisibleForRow(btn, row)">
                <el-tooltip v-if="btn.style === 'icon'" :content="btn.label" placement="top" :show-after="200">
                  <el-button :icon="getIcon(btn.icon)" circle :type="btn.type" @click.stop="handleActionClick(btn, row)" />
                </el-tooltip>
                <el-button
                  v-else
                  :type="btn.type"
                  :icon="btn.style === 'button' ? getIcon(btn.icon) : undefined"
                  link
                  @click.stop="handleActionClick(btn, row)"
                >
                  {{ btn.label }}
                </el-button>
              </template>
            </template>
          </div>
        </template>
      </el-table-column>
    </el-table>
    <!-- 分页 -->
    <div v-if="props.pagination" style="margin-top: 12px; display: flex; justify-content: flex-end">
      <el-pagination
        :current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        background
        @current-change="handlePageChange"
      />
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingRow ? '编辑数据' : '新增数据'"
      width="500px"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <el-form :model="form" label-width="100px">
        <el-form-item
          v-for="col in formColumns"
          :key="col.key"
          :label="col.label"
          :required="col.required"
        >
          <el-input
            v-if="!col.columnType || col.columnType === 'VARCHAR' || col.columnType === 'TEXT'"
            v-model="form[col.key]"
          />
          <el-input-number
            v-else-if="col.columnType === 'INTEGER' || col.columnType === 'BIGINT' || col.columnType === 'TINYINT'"
            v-model="form[col.key]"
            :controls="false"
            style="width: 100%"
          />
          <el-input-number
            v-else-if="col.columnType === 'DECIMAL'"
            v-model="form[col.key]"
            :precision="col.scale || 2"
            :controls="false"
            style="width: 100%"
          />
          <el-date-picker
            v-else-if="col.columnType === 'DATETIME'"
            v-model="form[col.key]"
            type="datetime"
            style="width: 100%"
          />
          <el-date-picker
            v-else-if="col.columnType === 'DATE'"
            v-model="form[col.key]"
            type="date"
            style="width: 100%"
          />
          <el-input v-else v-model="form[col.key]" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import http from '@/utils/http'
import { dataSourceApi } from '@/api/data-source'
import { formatCellValue } from '@/utils/formatters'
import { Plus, Edit, Delete, View, Search, Refresh } from '@element-plus/icons-vue'

/** 动作总线（PageRendererPage provide）：dispatch(trigger, eventData) */
const actionBus = inject<{ dispatch: (trigger: string, eventData: any) => void } | undefined>('pageActionBus')

const props = defineProps<{
  /** 页面 key（数据源查询接口路径） */
  pageKey: string
  /** 数据源绑定 id（schema.dataSources[].id） */
  dataSourceId?: string
  /** 数据源 refId（全局数据源 id，直接查询用） */
  refId?: string
  /** 全局数据源 ID（供写操作使用；由 PageRendererPage.transformComponent 注入） */
  dsRefId?: string
  /** 表格列配置 [{prop,label,width,formatter,fixed,align,sortable}] */
  columns?: { prop: string; label: string; width?: number | string; minWidth?: number | string; align?: string; sortable?: boolean; formatter?: string; fixed?: string }[]
  /** 启用排序 */
  sortable?: boolean
  /** 启用筛选 */
  filterable?: boolean
  /** 显示分页 */
  pagination?: boolean
  /** 行选择模式 */
  selectionMode?: 'none' | 'single' | 'multiple'
  /** 操作列宽度 */
  actionColumnWidth?: number
  /** 操作按钮配置 */
  actionButtons?: { key: string; label: string; placement: string; style: string; icon?: string; visible?: string; type?: string; events?: any[] }[]
  /** 附加表格属性（border/stripe/size 等） */
  [key: string]: any
}>()

const emit = defineEmits<{
  (e: 'row-click', row: any): void
  (e: 'cell-click', row: any, column: any): void
  (e: 'selection-change', selection: any[]): void
  (e: 'current-change', row: any, oldRow: any): void
  (e: 'sort-change', args: { column: any; prop: string; order: string }): void
  (e: 'loaded', records: any[]): void
  (e: 'ready', instance: any): void
}>()

const records = ref<any[]>([])
const loading = ref(false)
const size = ref(20)
const currentPage = ref(1)
const total = ref(0)
const currentRow = ref<any>(null)
const selectedRows = ref<any[]>([])
/** 当前 filter（动作总线 set-filter 注入） */
const currentFilter = ref<Record<string, unknown> | undefined>(undefined)

/** 写操作支持（metadata.writable） */
const writable = ref(false)
/** 数据源列定义（metadata.columns，供新增/编辑弹窗动态渲染表单） */
const formColumns = ref<{ key: string; label: string; columnType?: string; required?: boolean; scale?: number }[]>([])

// ==================== CRUD 弹窗 ====================
const dialogVisible = ref(false)
const editingRow = ref<any>(null)
const form = ref<Record<string, any>>({})
const saving = ref(false)

const tableAttrs = computed(() => {
  const { columns, pageKey, dataSourceId, refId, dsRefId, ...rest } = props as any
  return rest
})

const resolvedColumns = computed(() =>
  (props.columns || []).map((c) => ({
    prop: c.prop,
    label: c.label,
    width: c.width,
    minWidth: c.minWidth || 120,
    align: c.align,
    sortable: c.sortable,
    formatter: c.formatter,
    fixed: c.fixed,
  })),
)

/** 嵌套属性取值（支持 a.b.c 格式） */
function getNestedValue(row: any, path: string): any {
  return path.split('.').reduce((obj, key) => obj?.[key], row)
}

/** 图标映射 */
const iconMap: Record<string, any> = { Plus, Edit, Delete, View, Search, Refresh }
function getIcon(name?: string): any {
  return name ? iconMap[name] : undefined
}

/** 操作按钮配置（默认内置编辑/删除） */
const resolvedActionButtons = computed(() => {
  if (props.actionButtons?.length) return props.actionButtons
  // 默认：有写权限时显示编辑/删除
  if (!writable.value || !props.dsRefId) return []
  return [
    { key: 'edit', label: '编辑', placement: 'column', style: 'text', type: 'primary' },
    { key: 'delete', label: '删除', placement: 'column', style: 'text', type: 'danger' },
  ]
})

/** 操作列宽度 */
const actionColumnWidthValue = computed(() => {
  if (props.actionColumnWidth && props.actionColumnWidth > 0) return props.actionColumnWidth
  const count = resolvedActionButtons.value.length
  if (count === 0) return 0
  return count * 70 + 20
})

/** 行级按钮可见性（visible 表达式求值） */
function isActionVisibleForRow(btn: any, row: any): boolean {
  if (!btn.visible) return true
  try {
    const expr = btn.visible.replace(/\$row\.([\w]+)/g, (_: string, k: string) => {
      const v = getNestedValue(row, k)
      return v === null || v === undefined ? 'undefined' : JSON.stringify(v)
    }).replace(/\$param\.([\w]+)/g, (_: string, k: string) => {
      const v = (window as any).__routeParams?.[k]
      return v === null || v === undefined ? 'undefined' : JSON.stringify(v)
    })
    if (/[a-zA-Z_$]\s*\(/.test(expr)) return false
    return !!Function('"use strict"; return (' + expr + ')')()
  } catch {
    return true
  }
}

// ==================== 数据加载 ====================

async function fetchData() {
  const dsId = props.dataSourceId || props.refId
  // 设计器画布中无 pageKey（渲染页才注入），跳过加载避免无效请求
  if (!dsId || !props.pageKey) {
    records.value = []
    return
  }
  loading.value = true
  try {
    const params: Record<string, any> = { page: 0, size: size.value }
    if (currentFilter.value) {
      params.filter = JSON.stringify({
        logic: 'AND',
        conditions: Object.entries(currentFilter.value).map(([column, value]) => ({ column, op: 'eq', value })),
      })
    }
    const res: any = await http.get(`/v1/pages/${props.pageKey}/ds/${dsId}/data`, { params })
    const data = res?.data ?? res
    records.value = (data.records || []).map((r: any) => ({ ...(r.data || {}), id: r.id, version: r.version }))
    emit('loaded', records.value)
  } catch {
    records.value = []
    ElMessage.error('页面数据源加载失败')
  } finally {
    loading.value = false
  }
}

/** 加载元数据（可写标记 + 列定义，供操作列和弹窗表单使用） */
async function loadMetadata() {
  if (!props.dsRefId) return
  try {
    const res = await dataSourceApi.getMetadata(props.dsRefId)
    const meta = res.data as any
    writable.value = !!meta?.writable
    formColumns.value = (meta?.columns || []).map((c: any) => ({
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

// ==================== 操作列 ====================

function handleEdit(row: any) {
  editingRow.value = row
  // 回填表单：仅填充列定义中的字段
  const data: Record<string, any> = {}
  for (const col of formColumns.value) {
    data[col.key] = row[col.key] ?? ''
  }
  form.value = data
  dialogVisible.value = true
}

function openCreate() {
  editingRow.value = null
  const data: Record<string, any> = {}
  for (const col of formColumns.value) {
    data[col.key] = col.columnType === 'INTEGER' || col.columnType === 'BIGINT' || col.columnType === 'TINYINT' || col.columnType === 'DECIMAL' ? null : ''
  }
  form.value = data
  dialogVisible.value = true
}

async function handleSave() {
  if (!props.dsRefId) return
  saving.value = true
  try {
    if (editingRow.value) {
      await dataSourceApi.updateData(props.dsRefId, editingRow.value.id, form.value, editingRow.value.version)
      ElMessage.success('修改成功')
    } else {
      await dataSourceApi.createData(props.dsRefId, form.value)
      ElMessage.success('新增成功')
    }
    dialogVisible.value = false
    fetchData()
  } catch {
    // 拦截器已弹错误
  } finally {
    saving.value = false
  }
}

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
    fetchData()
  } catch {
    // 拦截器已弹错误
  }
}

// ==================== 动作总线接口 ====================

/** 外部触发刷新（动作总线 refresh） */
function refresh() {
  fetchData()
}

/** 动作总线 set-filter：注入过滤条件后刷新 */
function setFilter(filter: Record<string, unknown>) {
  currentFilter.value = { ...(currentFilter.value || {}), ...filter }
  fetchData()
}

/** 动作总线 set-value：更新过滤条件不刷新（或清空） */
function resetFilter() {
  currentFilter.value = undefined
  fetchData()
}

function handleRowClick(row: any) {
  emit('row-click', row)
  // 通过动作总线直接触发（不依赖 form-create 的 on 桥接）
  actionBus?.dispatch('row-click', { node: row, row })
}

function handleCellClick(row: any, column: any) {
  emit('cell-click', row, column)
  actionBus?.dispatch('cell-click', { node: row, row, column })
}

function handleSelectionChange(selection: any[]) {
  selectedRows.value = selection
  emit('selection-change', selection)
  actionBus?.dispatch('selection-change', { selectedRows: selection })
}

function handleCurrentChange(row: any) {
  const oldRow = currentRow.value
  currentRow.value = row
  emit('current-change', row, oldRow)
  actionBus?.dispatch('current-change', { node: row, row, oldRow })
}

function handleSortChange(args: { column: any; prop: string; order: string }) {
  emit('sort-change', args)
  actionBus?.dispatch('sort-change', args)
}

function handlePageChange(page: number) {
  currentPage.value = page
  fetchData()
}

/** 操作按钮点击 */
function handleActionClick(btn: any, row: any) {
  if (btn.key === 'edit') {
    handleEdit(row)
  } else if (btn.key === 'delete') {
    handleDelete(row)
  } else if (btn.events?.length) {
    // 自定义按钮：执行事件链
    for (const ev of btn.events) {
      for (const action of ev.actions || []) {
        actionBus?.dispatch(action.type, { row, ...action.params })
      }
    }
  }
}

defineExpose({ refresh, fetchData, records, setFilter, resetFilter, openCreate })

onMounted(() => {
  emit('ready', { refresh, fetchData, setFilter, resetFilter, records, openCreate })
  loadMetadata()
  fetchData()
})
</script>
