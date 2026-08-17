<template>
  <div>
    <el-table
      :data="records"
      v-loading="loading"
      border
      stripe
      v-bind="tableAttrs"
      @row-click="handleRowClick"
    >
      <el-table-column
        v-for="col in resolvedColumns"
        :key="col.prop"
        :prop="col.prop"
        :label="col.label"
        :min-width="col.minWidth"
        :width="col.width"
      />
      <el-table-column
        v-if="writable && dsRefId"
        label="操作"
        width="150"
        fixed="right"
      >
        <template #default="{ row }">
          <el-button link type="primary" @click="handleEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

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
  /** 表格列配置 [{prop,label,width}] */
  columns?: { prop: string; label: string; width?: number | string; minWidth?: number | string }[]
  /** 附加表格属性（border/stripe/size 等） */
  [key: string]: any
}>()

const emit = defineEmits<{
  (e: 'row-click', row: any): void
  (e: 'loaded', records: any[]): void
  (e: 'ready', instance: any): void
}>()

const records = ref<any[]>([])
const loading = ref(false)
const size = ref(20)
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
  })),
)

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

defineExpose({ refresh, fetchData, records, setFilter, resetFilter, openCreate })

onMounted(() => {
  emit('ready', { refresh, fetchData, setFilter, resetFilter, records, openCreate })
  loadMetadata()
  fetchData()
})
</script>
