<template>
  <div class="lookup-picker">
    <el-input
      :model-value="displayText"
      :placeholder="placeholder || '请选择'"
      :disabled="disabled"
      :clearable="clearable"
      readonly
      @click="openDialog"
      @clear="handleClear"
    >
      <template #prefix>
        <el-icon><Search /></el-icon>
      </template>
    </el-input>
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle || placeholder || '选择数据'"
      width="700px"
      :close-on-click-modal="false"
      append-to-body
    >
      <div v-if="showSearch !== false" style="margin-bottom: 12px; display: flex; gap: 8px">
        <el-input
          v-model="keyword"
          :placeholder="searchPlaceholder || '请输入关键字搜索'"
          clearable
          @keyup.enter="handleSearch"
        />
        <el-button type="primary" @click="handleSearch">搜索</el-button>
      </div>
      <el-table
        :data="tableData"
        v-loading="loading"
        border
        highlight-current-row
        @row-click="handleRowClick"
        @selection-change="handleSelectionChange"
      >
        <el-table-column v-if="mode === 'multiple'" type="selection" width="50" />
        <el-table-column
          v-for="col in columns"
          :key="col.prop || col.label"
          :label="col.label"
          :width="col.width"
          :formatter="(row: any) => formatCell(row, col.prop)"
        />
      </el-table>
      <div style="margin-top: 12px; display: flex; justify-content: flex-end">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          small
          @size-change="fetchData()"
          @current-change="fetchData()"
        />
      </div>
      <template v-if="mode === 'multiple'" #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmSelection">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, inject, watch } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { LookupPickerProps, QueryParams } from './types'
import { buildFetchApiFromConfig, readCellValue, buildSnapshot, resolveFilter } from './lookupFetch'

/** form-create 注入对象，提供 api.setValue/getValue 等方法 */
interface FormCreateInject {
  api?: {
    setValue: (field: string, value: unknown) => void
    getValue?: (field: string) => unknown
  }
}

const props = withDefaults(defineProps<LookupPickerProps>(), {
  mode: 'single',
  placeholder: '请选择',
  searchPlaceholder: '请输入关键字搜索',
  showSearch: true,
  disabled: false,
  clearable: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any> | null | Record<string, any>[]]
  'select': [row: any]
  'clear': []
}>()

/** form-create 注入，若组件在 form-create 外使用则为 undefined */
const formCreateInject = inject<FormCreateInject | undefined>('formCreateInject', undefined)

const dialogVisible = ref(false)
const loading = ref(false)
const keyword = ref('')
const tableData = ref<any[]>([])
const total = ref(0)
const tempSelection = ref<any[]>([])

const query = reactive<QueryParams & { keyword?: string }>({
  page: 1,
  size: 10,
})

/** 有效 fetchApi：代码级函数优先；否则由 fetch 配置构造 */
const effectiveFetchApi = computed(() => {
  if (typeof props.fetchApi === 'function') return props.fetchApi
  return buildFetchApiFromConfig(props.fetch || { action: '' })
})

const defaultDisplayField = computed(() => {
  const firstCol = props.columns.find(c => c.prop)
  return firstCol?.prop || ''
})

const resolvedDisplayField = computed(() => props.displayField || defaultDisplayField.value)

const displayText = computed(() => {
  const val = props.modelValue
  if (val === null || val === undefined || val === '') return ''
  // 新语义：单选 modelValue 为显示文本字符串，直接返回
  if (typeof val === 'string') return val
  if (Array.isArray(val)) {
    if (val.length === 0) return ''
    // 多选快照数组：拼接全部 displayField 值展示
    return val
      .map((item: any) => readCellValue(item, resolvedDisplayField.value) || '')
      .filter(Boolean)
      .join(',')
  }
  if (typeof val === 'object') {
    return readCellValue(val, resolvedDisplayField.value) || ''
  }
  return ''
})

/** 依赖字段（动态条件来源），供联动 watch */
const filterDependFields = computed<string[]>(() => {
  const conds = props.fetch?.filter?.conditions || []
  return conds.map(c => c.field).filter((f): f is string => !!f)
})

/** 解析后的筛选参数：底表 → filter JSON；外部 API → 等值查询参数展开 */
const resolvedFilterParams = computed<Record<string, unknown> | undefined>(() => {
  const filter = props.fetch?.filter
  if (!filter || !props.fetch?.action) return undefined
  const getValue = (field: string) => formCreateInject?.api?.getValue?.(field)
  if (props.fetch.action.startsWith('/v1/biz-data/')) {
    return resolveFilter(filter, getValue || (() => undefined))
  }
  // 外部 API：仅等值展开
  const params: Record<string, unknown> = {}
  for (const c of filter.conditions || []) {
    if (!c.column || (c.op && c.op !== 'eq')) continue
    const v = c.field ? (getValue ? getValue(c.field) : undefined) : c.value
    if (v === undefined || v === null || v === '') continue
    params[c.column] = v
  }
  return Object.keys(params).length > 0 ? params : undefined
})

/** 表格单元格格式化：readCellValue 兼容 BizDataVO 内层与平铺行；对象/数组 JSON 化 */
function formatCell(row: any, key?: string): string {
  const v = readCellValue(row, key)
  if (v === null || v === undefined) return ''
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

function openDialog() {
  if (props.disabled) return
  dialogVisible.value = true
  keyword.value = ''
  query.page = 1
  tempSelection.value = []
  fetchData()
}

async function fetchData() {
  const fetchApi = effectiveFetchApi.value
  // fetch 配置未配置数据源（action 为空）时提示
  if (!props.fetch && !props.fetchApi) {
    ElMessage.warning('未配置数据源，请在设计器中配置"数据源/回填"')
    return
  }
  loading.value = true
  try {
    const params: any = { ...query }
    if (keyword.value) params.keyword = keyword.value
    // 数据源筛选：底表 → filter JSON；外部 API → 等值参数
    const filterParams = resolvedFilterParams.value
    if (filterParams) {
      if (props.fetch?.action.startsWith('/v1/biz-data/')) {
        params.filter = filterParams
      } else {
        Object.assign(params, filterParams)
      }
    }
    const res = await fetchApi(params)
    tableData.value = res.rows || []
    total.value = res.total || 0
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  query.page = 1
  fetchData()
}

function handleRowClick(row: any) {
  if (props.mode === 'multiple') return
  // 新语义：emit 显示文本字符串（field 绑定显示文本字段）
  emit('update:modelValue', readCellValue(row, resolvedDisplayField.value) ?? null)
  emit('select', row)
  // 独立存储 id（设计者显式配置的 idField）
  writeIdField(row.id)
  // 回填 returnFields 到表单其他字段
  fillReturnFields(row)
  dialogVisible.value = false
}

/** 将选中记录 id 写入 idField 字段（若配置且 formCreateInject 可用） */
function writeIdField(id: unknown) {
  const api = formCreateInject?.api
  if (!api || !props.idField) return
  api.setValue(props.idField, id ?? null)
}

/**
 * 将选中行的字段通过 api.setValue 回填到表单其他字段。
 * 若 formCreateInject 不可用（非 form-create 环境），则安全跳过。
 */
function fillReturnFields(row: Record<string, unknown>) {
  const api = formCreateInject?.api
  if (!api || !props.returnFields) return
  for (const [sourceField, targetField] of Object.entries(props.returnFields)) {
    api.setValue(targetField, readCellValue(row, sourceField) ?? null)
  }
}

/**
 * 清除所有 returnFields 对应的表单字段。
 * 若 formCreateInject 不可用，则安全跳过。
 */
function clearReturnFields() {
  const api = formCreateInject?.api
  if (!api || !props.returnFields) return
  for (const targetField of Object.values(props.returnFields)) {
    api.setValue(targetField, null)
  }
}

function handleSelectionChange(rows: any[]) {
  tempSelection.value = rows
}

function confirmSelection() {
  const snapshots = tempSelection.value.map((row: any) =>
    buildSnapshot(row, resolvedDisplayField.value, props.columns),
  )
  emit('update:modelValue', snapshots)
  if (snapshots.length > 0) {
    emit('select', snapshots)
  }
  dialogVisible.value = false
}

function handleClear() {
  emit('update:modelValue', props.mode === 'multiple' ? [] : null)
  emit('clear')
  writeIdField(null)
  // 清空 returnFields 对应的表单字段
  clearReturnFields()
}

// 动态筛选联动：依赖字段值变化 → 清空当前选择与回填，刷新选项（快照语义：已选数据不清空由父级保证）
watch(
  () => filterDependFields.value.map(f => formCreateInject?.api?.getValue?.(f)),
  () => {
    emit('update:modelValue', props.mode === 'multiple' ? [] : null)
    writeIdField(null)
    clearReturnFields()
    if (dialogVisible.value) {
      query.page = 1
      fetchData()
    }
  },
)

defineExpose({ openDialog, closeDialog: () => { dialogVisible.value = false }, readCellValue })
</script>