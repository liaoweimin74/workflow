<template>
  <div class="data-picker">
    <el-input
      :model-value="displayText"
      :placeholder="placeholder || '请选择'"
      :disabled="disabled || readonly"
      :clearable="!readonly"
      :class="{ 'pick-ref-missing': hasMissing && !readonly }"
      readonly
      @click="openDialog"
      @clear="handleClear"
    >
      <template #prefix>
        <el-icon><Search /></el-icon>
      </template>
    </el-input>
    <el-button
      v-if="canView"
      link
      type="primary"
      class="data-picker__view"
      @click.stop="goView"
    >查看</el-button>
    <el-dialog
      v-model="dialogVisible"
      :title="placeholder || '选择数据'"
      width="700px"
      :close-on-click-modal="false"
      append-to-body
    >
      <div style="margin-bottom: 12px; display: flex; gap: 8px">
        <el-input
          v-model="keyword"
          :placeholder="'搜索' + (displayField || '')"
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
        <el-table-column v-if="isMultiple" type="selection" width="50" />
        <el-table-column
          v-for="col in resolvedColumns"
          :key="col"
          :prop="col"
          :label="col"
          min-width="120"
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
      <template v-if="isMultiple" #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmSelection">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { bizDataApi } from '@/api/bizData'

/** form-create 注入对象，提供 api.setValue 等方法 */
interface FormCreateInject {
  api?: {
    setValue: (field: string, value: unknown) => void
    getValue?: (field: string) => unknown
  }
}

/** 过滤条件项：column 目标表列；operator 操作符（v2 仅 '='）；valueType static 固定值 / field 当前表单字段 */
export interface FilterItem {
  column: string
  operator: string
  valueType: 'static' | 'field'
  value: string
}

const props = withDefaults(
  defineProps<{
    modelValue?: string
    /** 目标业务表单 key */
    sourceFormKey?: string
    /** 目标表显示字段 */
    displayField?: string
    /** 弹窗列表列（目标表列 key），缺省显示 displayField */
    columns?: string[]
    /** 单选/多选 */
    mode?: 'single' | 'multiple'
    /** 返回字段映射：目标表字段 → 当前表单字段 */
    returnFields?: Record<string, string>
    /** 级联依赖（v1 兼容形态，等价于单条 field 型过滤条件） */
    dependOn?: { field?: string; sourceColumn?: string }
    /** 依赖字段当前值（由父组件传入，v1 兼容触发源） */
    dependOnValue?: unknown
    /** 过滤条件列表（v2）：static 固定值 / field 动态引用当前表单字段 */
    filters?: FilterItem[]
    /** 依赖条件变化时是否清空已选值与回填（默认 false：保留已选值，仅刷新选项） */
    clearOnCascadeChange?: boolean
    /** 允许新增：选择弹窗提供"新增"入口（Task 4 消费） */
    allowCreate?: boolean
    /** 只读态显示"查看"链接跳转目标记录（默认开启） */
    viewLink?: boolean
    /** 冗余显示文本（由表单数据提供，如 <key>_text；缺省时内部 resolve 补全） */
    displayText?: string
    disabled?: boolean
    readonly?: boolean
    placeholder?: string
  }>(),
  {
    mode: 'single',
    placeholder: '请选择',
    disabled: false,
    readonly: false,
    clearOnCascadeChange: false,
    allowCreate: false,
    viewLink: true,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:displayText': [value: string]
}>()

const router = useRouter()
const formCreateInject = inject<FormCreateInject | undefined>('formCreateInject', undefined)

const dialogVisible = ref(false)
const loading = ref(false)
const keyword = ref('')
const tableData = ref<any[]>([])
const total = ref(0)
const tempSelection = ref<any[]>([])
const resolvedDisplayText = ref('')
const missingIds = ref<string[]>([])

const query = ref({ page: 1, size: 10 })

const isMultiple = computed(() => props.mode === 'multiple')

/** 归一化过滤条件：filters 优先；dependOn（v1）等价于单条 field 型 */
const normalizedFilters = computed<FilterItem[]>(() => {
  if (props.filters && props.filters.length > 0) return props.filters
  if (props.dependOn?.field && props.dependOn?.sourceColumn) {
    return [{ column: props.dependOn.sourceColumn, operator: '=', valueType: 'field', value: props.dependOn.field }]
  }
  return []
})

/** 查询 filter：static 直接取值；field 读当前表单字段值（空值跳过该条件） */
const queryFilter = computed(() => {
  const f: Record<string, unknown> = {}
  for (const item of normalizedFilters.value) {
    const v = item.valueType === 'field'
      ? formCreateInject?.api?.getValue?.(item.value)
      : item.value
    if (v === undefined || v === null || v === '') continue
    f[item.column] = v
  }
  return Object.keys(f).length > 0 ? f : undefined
})

/** 级联依赖字段（field 型条件的 value），值变化时联动刷新选项 */
const dependFields = computed<string[]>(() =>
  normalizedFilters.value.filter(f => f.valueType === 'field').map(f => f.value),
)

/** 悬空引用：resolve 缺失的记录 id 数 */
const hasMissing = computed(() => missingIds.value.length > 0)

/** 显示文本：优先外部冗余文本（_text）；编辑态悬空提示；否则内部 resolve 结果 */
const displayText = computed(() => {
  if (props.displayText) return props.displayText
  if (hasMissing.value && !props.readonly) {
    return `${missingIds.value.length} 条引用数据已删除`
  }
  return resolvedDisplayText.value
})

/** 只读态可跳转查看：非空值 + 开启 viewLink */
const canView = computed(() => {
  if (!props.viewLink || props.readonly !== true) return false
  return !!(props.modelValue && props.sourceFormKey)
})

const resolvedColumns = computed(() => {
  const cols = props.columns && props.columns.length > 0 ? props.columns : [props.displayField]
  return cols.filter(Boolean)
})

watch(
  () => props.modelValue,
  async (val) => {
    if (val) {
      await resolveDisplay(val)
    } else {
      resolvedDisplayText.value = ''
      missingIds.value = []
    }
  },
  { immediate: true },
)

/** 级联联动：依赖字段（formCreateInject 读值 + v1 dependOnValue）变化 → 按配置清空/保留并刷新选项 */
watch(
  () => [
    ...dependFields.value.map(f => formCreateInject?.api?.getValue?.(f)),
    props.dependOnValue,
  ],
  () => {
    if (props.clearOnCascadeChange && props.modelValue) {
      emit('update:modelValue', '')
      emit('update:displayText', '')
      resolvedDisplayText.value = ''
      missingIds.value = []
      clearReturnFields()
    }
    if (dialogVisible.value) {
      fetchData()
    }
  },
)

async function resolveDisplay(val: string) {
  if (!props.sourceFormKey || !val) return
  try {
    const ids = val.split(',').filter(Boolean)
    const res = await bizDataApi.resolve(props.sourceFormKey, ids, props.displayField)
    const map = res.data || {}
    const parts = ids.map(id => ({ id, text: map[id], missing: map[id] === undefined }))
    missingIds.value = parts.filter(p => p.missing).map(p => p.id)
    resolvedDisplayText.value = parts.map(p => (p.missing ? p.id : p.text)).join(',')
  } catch {
    // 解析失败显示原始 id
    resolvedDisplayText.value = val
    missingIds.value = []
  }
}

function openDialog() {
  if (props.disabled || props.readonly) return
  dialogVisible.value = true
  keyword.value = ''
  query.value.page = 1
  tempSelection.value = []
  fetchData()
}

async function fetchData() {
  loading.value = true
  try {
    const params: any = { ...query.value }
    if (keyword.value && props.displayField) {
      params.keyword = keyword.value
      params.keywordColumn = props.displayField
    }
    if (queryFilter.value) {
      params.filter = queryFilter.value
    }
    const res = await bizDataApi.list(props.sourceFormKey || '', params)
    tableData.value = res.data.records || []
    total.value = res.data.total || 0
  } finally {
    loading.value = false
  }
}

/** 跳转查看：目标表单列表页，携带 detail 参数定位记录（BizDataListPage 消费） */
function goView() {
  const firstId = (props.modelValue || '').split(',')[0]
  if (!props.sourceFormKey || !firstId) return
  router.push({ path: `/biz-data/${props.sourceFormKey}`, query: { detail: firstId } })
}

function handleSearch() {
  query.value.page = 1
  fetchData()
}

function handleRowClick(row: any) {
  if (isMultiple.value) return
  selectValue([row])
  dialogVisible.value = false
}

function handleSelectionChange(rows: any[]) {
  tempSelection.value = rows
}

function confirmSelection() {
  selectValue(tempSelection.value)
  dialogVisible.value = false
}

function selectValue(rows: any[]) {
  const ids = rows.map(r => String(r.id)).join(',')
  const texts = rows.map(r => (props.displayField ? String(r[props.displayField] ?? '') : '')).join(',')
  emit('update:modelValue', ids)
  resolvedDisplayText.value = texts
  if (rows.length > 0) {
    fillReturnFields(rows[0])
  }
}

function handleClear() {
  emit('update:modelValue', '')
  emit('update:displayText', '')
  resolvedDisplayText.value = ''
  clearReturnFields()
}

/** 回填：选中记录字段 → 当前表单其他字段 */
function fillReturnFields(row: Record<string, unknown>) {
  const api = formCreateInject?.api
  if (!api || !props.returnFields) return
  for (const [sourceField, targetField] of Object.entries(props.returnFields)) {
    api.setValue(targetField, row[sourceField] ?? null)
  }
}

function clearReturnFields() {
  const api = formCreateInject?.api
  if (!api || !props.returnFields) return
  for (const targetField of Object.values(props.returnFields)) {
    api.setValue(targetField, null)
  }
}

defineExpose({ openDialog })
</script>

<style scoped>
.data-picker {
  display: flex;
  align-items: center;
  gap: 4px;
}

.data-picker__view {
  flex-shrink: 0;
}

/* 悬空引用（引用数据已删除）标红提示 */
.data-picker :deep(.el-input.pick-ref-missing .el-input__inner) {
  color: #f56c6c;
}
</style>
