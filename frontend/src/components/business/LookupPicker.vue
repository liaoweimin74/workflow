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
          :placeholder="searchInputPlaceholder"
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
      >
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
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, inject, watch, type Ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { LookupPickerProps, QueryParams, LookupFilterConfig, DataSourceBindingContext } from './types'
import { FORM_DS_BINDINGS_KEY } from './types'
import { buildFetchApiFromConfig, readCellValue, resolveFilter } from './lookupFetch'
import { mergeFilters } from '@/utils/filterMerge'
import { resolveFilterFieldReferences } from '@/utils/filterResolve'
import { dataSourceApi } from '@/api/data-source'

/** form-create 注入对象，提供 api.setValue/getValue 等方法 */
interface FormCreateInject {
  api?: {
    setValue: (field: string, value: unknown) => void
    getValue?: (field: string) => unknown
  }
}

const props = withDefaults(defineProps<LookupPickerProps>(), {
  placeholder: '请选择',
  searchPlaceholder: '请输入关键字搜索',
  showSearch: true,
  disabled: false,
  clearable: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any> | null]
  'select': [row: any]
  'clear': []
}>()

/** form-create 注入，若组件在 form-create 外使用则为 undefined */
const formCreateInject = inject<FormCreateInject | undefined>('formCreateInject', undefined)

/** 页面/表单级数据源绑定上下文（FormRenderer / PageRendererPage provide） */
const dsBindings = inject<Ref<DataSourceBindingContext[]> | DataSourceBindingContext[]>(FORM_DS_BINDINGS_KEY, [])

/** 当前组件的绑定上下文（通过 dataSourceId 解析） */
const currentBinding = computed<DataSourceBindingContext | undefined>(() => {
  if (!props.dataSourceId) return undefined
  const list = Array.isArray(dsBindings) ? dsBindings : (dsBindings as any).value
  return list?.find((b: DataSourceBindingContext) => b.id === props.dataSourceId)
})

/** 全局数据源 refId（由绑定解析） */
const dsRefId = computed(() => currentBinding.value?.refId || '')

const dialogVisible = ref(false)
const loading = ref(false)
const keyword = ref('')
const tableData = ref<any[]>([])
const total = ref(0)

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

/**
 * 搜索框 placeholder：提示可搜索字段。
 * 优先从 searchColumns（新 dataSourceId 模式）获取；
 * 否则从 fetch.keywordColumn（旧 fetch 模式）获取；
 * 未配置时用 searchPlaceholder 或默认文案。
 */
const searchInputPlaceholder = computed(() => {
  // 新模式：searchColumns prop
  if (props.searchColumns && props.searchColumns.length > 0) {
    const labels = props.searchColumns.map((c) => {
      const col = props.columns.find(x => x.prop === c)
      return col?.label || c
    })
    return `搜索${labels.join('/')}`
  }
  // 旧模式：fetch.keywordColumn
  const cols = props.fetch?.keywordColumn
    ? props.fetch.keywordColumn.split(',').map(s => s.trim()).filter(Boolean)
    : []
  if (cols.length > 0) {
    const labels = cols.map((c) => {
      const col = props.columns.find(x => x.prop === c)
      return col?.label || c
    })
    return `搜索${labels.join('/')}`
  }
  return props.searchPlaceholder || '请输入关键字搜索'
})

const displayText = computed(() => {
  const val = props.modelValue
  if (val === null || val === undefined || val === '') return ''
  // 单选：modelValue 为显示文本字符串，直接返回
  if (typeof val === 'string') {
    return val
  }
  if (typeof val === 'object') {
    return readCellValue(val, resolvedDisplayField.value) || ''
  }
  return ''
})

/** 合并后的 filter（数据源级 + 组件级） */
const mergedFilter = computed<LookupFilterConfig | undefined>(() => {
  if (!props.dataSourceId) return undefined
  const dsFilter = currentBinding.value?.filter
  return mergeFilters(dsFilter, props.filter)
})

/** 依赖字段（动态条件来源），供联动 watch */
const filterDependFields = computed<string[]>(() => {
  // 新模式：合并后的 filter
  const mf = mergedFilter.value
  if (mf) {
    return mf.conditions.map((c: any) => c.field).filter((f: any): f is string => !!f)
  }
  // 旧模式：fetch.filter
  const conds = props.fetch?.filter?.conditions || []
  return conds.map((c: any) => c.field).filter((f: any): f is string => !!f)
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
  fetchData()
}

async function fetchData() {
  loading.value = true
  try {
    // === 新路径：通过页面/表单级数据源绑定查询 ===
    if (dsRefId.value) {
      const params: Record<string, unknown> = {
        page: query.page - 1,
        size: query.size,
      }
      if (keyword.value) {
        params.keyword = keyword.value
        // 搜索列：新 prop searchColumns 优先；回退 fetch.keywordColumn
        const kwCols = (props.searchColumns && props.searchColumns.length > 0)
          ? props.searchColumns
          : (props.fetch?.keywordColumn || '').split(',').map(s => s.trim()).filter(Boolean)
        if (kwCols.length > 0) params.keywordColumn = kwCols.join(',')
      }
      // 合并 + 解析 filter（数据源级 + 组件级）
      const getValue = (field: string) => formCreateInject?.api?.getValue?.(field)
      if (mergedFilter.value) {
        const resolved = resolveFilterFieldReferences(
          mergedFilter.value,
          Object.fromEntries(
            (mergedFilter.value.conditions || [])
              .filter(c => c.field)
              .map(c => [c.field!, getValue(c.field!) ?? '']),
          ),
        )
        if (resolved && resolved.conditions.length > 0) {
          params.filter = JSON.stringify(resolved)
        }
      }
      const res = await dataSourceApi.queryData(dsRefId.value, params as any)
      const biz = res.data as any
      tableData.value = biz?.records || []
      total.value = biz?.total || 0
      return
    }

    // === 旧路径：通过 fetch/fetchApi 配置查询 ===
    const fetchApi = effectiveFetchApi.value
    if (!props.fetch && !props.fetchApi) {
      ElMessage.warning('未配置数据源，请在设计器中配置"数据源/回填"')
      return
    }
    const params: any = { ...query }
    if (keyword.value) params.keyword = keyword.value
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
  // 单选：emit 显示文本字符串（field 绑定显示文本字段）
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

function handleClear() {
  emit('update:modelValue', null)
  emit('clear')
  writeIdField(null)
  // 清空 returnFields 对应的表单字段
  clearReturnFields()
}

// 动态筛选联动：依赖字段值变化 → 清空当前选择与回填，刷新选项
watch(
  () => filterDependFields.value.map(f => formCreateInject?.api?.getValue?.(f)),
  () => {
    emit('update:modelValue', null)
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