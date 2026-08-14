<template>
  <div class="data-picker">
    <!-- 空值：可点击输入框（点击打开选择弹窗） -->
    <el-input
      v-if="!hasValue"
      :model-value="''"
      :placeholder="placeholder || '请选择'"
      :disabled="disabled || readonly"
      readonly
      @click="openDialog"
    >
      <template #prefix>
        <el-icon><Search /></el-icon>
      </template>
    </el-input>
    <!-- 有值：Tag 列表（编辑态可 x 移除 + 选择按钮；只读态无 x） -->
    <div v-else class="data-picker__tags">
      <span
        v-for="(item, i) in tagItems"
        :key="item.id"
        class="data-picker__tag"
        @click="handleTagClick(item.id)"
      >
        <el-tag
          :type="item.missing ? 'danger' : 'primary'"
          :closable="!readonly"
          size="small"
          @close="removeTag(i)"
        >
          {{ item.text }}
        </el-tag>
      </span>
      <el-button
        v-if="!readonly"
        link
        type="primary"
        size="small"
        class="data-picker__select-btn"
        @click="openDialog"
      >选择</el-button>
    </div>
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
          :placeholder="searchPlaceholderText"
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
          :label="columnLabelMap[col] || col"
          min-width="120"
          :formatter="(row: any) => formatCell(row, col)"
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
      <template v-if="isMultiple || allowCreate" #footer>
        <el-button v-if="allowCreate" @click="openCreateDialog">新增</el-button>
        <el-button v-if="isMultiple" @click="dialogVisible = false">取消</el-button>
        <el-button v-if="isMultiple" type="primary" @click="confirmSelection">确定</el-button>
      </template>
    </el-dialog>
    <!-- 点击 Tag：记录详情弹窗（只读展示目标记录各字段） -->
    <el-dialog
      v-model="detailVisible"
      :title="'记录详情'"
      width="600px"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-descriptions :column="1" border v-loading="detailLoading">
        <el-descriptions-item v-for="col in detailColumns" :key="col.key" :label="col.label">
          {{ detailCell(col.key) }}
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
    <DataPickerCreateDialog
      v-model:visible="createDialogVisible"
      :source-form-key="sourceFormKey || ''"
      @success="handleCreateSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { bizDataApi } from '@/api/bizData'
import { formApi } from '@/api/form'
import DataPickerCreateDialog from './DataPickerCreateDialog.vue'

/** form-create 注入对象，提供 api.setValue 等方法 */
interface FormCreateInject {
  api?: {
    setValue: (field: string, value: unknown) => void
    getValue?: (field: string) => unknown
  }
}

/** 单条筛选条件（对齐 LookupPicker）：column 目标表列；op 运算符；value 固定值 / field 当前表单字段 */
export interface FilterCondition {
  column: string
  op?: 'eq' | 'ne' | 'like' | 'in' | 'isEmpty' | 'isNotEmpty'
  /** 固定值（field 未配置时使用） */
  value?: unknown
  /** 动态源：当前表单字段名（存在时条件值 = 该字段当前值，经 form-create api.getValue 读取） */
  field?: string
}

/** 结构化筛选配置：AND（所有满足，默认）/ OR（任一满足）+ 条件列表 */
export interface PickerFilters {
  logic?: 'AND' | 'OR'
  conditions: FilterCondition[]
}

/** v2 兼容：数组型过滤条件（valueType static/field） */
interface LegacyFilterItem {
  column: string
  operator?: string
  valueType?: 'static' | 'field'
  value?: string
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
    /** 搜索列（参与关键字搜索的目标表列 key），缺省仅 displayField */
    searchColumns?: string[]
    /** 单选/多选 */
    mode?: 'single' | 'multiple'
    /** 级联依赖（v1 兼容形态，等价于单条 field 型筛选条件） */
    dependOn?: { field?: string; sourceColumn?: string }
    /** 依赖字段当前值（由父组件传入，v1 兼容触发源） */
    dependOnValue?: unknown
    /** 筛选条件（结构化 {logic, conditions}；v2 数组 / v1 dependOn 兼容归一化） */
    filters?: PickerFilters | LegacyFilterItem[]
    /** 依赖条件变化时是否清空已选值（默认 false：保留已选值，仅刷新选项） */
    clearOnCascadeChange?: boolean
    /** 允许新增：选择弹窗提供"新增"入口 */
    allowCreate?: boolean
    /** 点击 Tag 是否可查看记录详情（默认开启） */
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

const formCreateInject = inject<FormCreateInject | undefined>('formCreateInject', undefined)

const dialogVisible = ref(false)
const createDialogVisible = ref(false)
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailRow = ref<any>(null)
const loading = ref(false)
const keyword = ref('')
const tableData = ref<any[]>([])
const total = ref(0)
const tempSelection = ref<any[]>([])
const resolvedDisplayText = ref('')
const missingIds = ref<string[]>([])

const query = ref({ page: 1, size: 10 })

const isMultiple = computed(() => props.mode === 'multiple')

/** 是否有已选值：有值时不显示输入框，改为 Tag 列表 */
const hasValue = computed(() => !!(props.modelValue))

/** Tag 数据源：modelValue（逗号 id）与显示文本（_text/resolve 逗号串）按 index 对齐拆分 */
const tagItems = computed(() => {
  const ids = (props.modelValue || '').split(',').filter(Boolean)
  if (ids.length === 0) return []
  const missingSet = new Set(missingIds.value)
  const texts = (props.displayText || resolvedDisplayText.value || '').split(',').filter(Boolean)
  return ids.map((id, i) => ({
    id,
    text: missingSet.has(id)
      ? (props.readonly ? id : '引用数据已删除')
      : (texts[i] !== undefined && texts[i] !== '' ? texts[i] : id),
    missing: missingSet.has(id),
  }))
})

/** 归一化筛选条件为结构化 {logic, conditions}：filters（v3 结构化/v2 数组）优先；dependOn（v1）兼容为单条 field 型 */
const normalizedFilters = computed<PickerFilters>(() => {
  const f = props.filters
  if (f && !Array.isArray(f) && Array.isArray(f.conditions)) {
    return { logic: f.logic || 'AND', conditions: f.conditions }
  }
  if (Array.isArray(f) && f.length > 0) {
    return {
      logic: 'AND',
      conditions: f.map((item: LegacyFilterItem) => {
        const cond: FilterCondition = { column: item.column, op: 'eq' }
        if (item.valueType === 'field') {
          cond.field = item.value || ''
        } else {
          cond.value = item.value ?? ''
        }
        return cond
      }),
    }
  }
  if (props.dependOn?.field && props.dependOn?.sourceColumn) {
    return {
      logic: 'AND',
      conditions: [{ column: props.dependOn.sourceColumn, op: 'eq', field: props.dependOn.field }],
    }
  }
  return { logic: 'AND', conditions: [] }
})

/** 查询 filter：结构化 {logic, conditions}；field 型读当前表单字段值（空值跳过该条件） */
const queryFilter = computed(() => {
  const nf = normalizedFilters.value
  const conds: Record<string, unknown>[] = []
  for (const c of nf.conditions) {
    const cond: Record<string, unknown> = { column: c.column, op: c.op || 'eq' }
    if (c.field) {
      const v = formCreateInject?.api?.getValue?.(c.field)
      if (v === undefined || v === null || v === '') continue
      cond.value = v
    } else {
      if (c.op === 'isEmpty' || c.op === 'isNotEmpty') {
        // 无 value
      } else if (c.value === undefined || c.value === null) {
        continue
      } else {
        cond.value = c.value
      }
    }
    conds.push(cond)
  }
  if (conds.length === 0) return undefined
  return { logic: nf.logic || 'AND', conditions: conds }
})

/** 级联依赖字段（field 型条件的 field），值变化时联动刷新选项 */
const dependFields = computed<string[]>(() =>
  normalizedFilters.value.conditions.filter(c => c.field).map(c => c.field as string),
)

/** 搜索列：显式配置优先，缺省仅显示字段 */
const resolvedSearchColumns = computed<string[]>(() => {
  if (props.searchColumns && props.searchColumns.length > 0) return props.searchColumns
  return props.displayField ? [props.displayField] : []
})

const resolvedColumns = computed(() => {
  const cols = props.columns && props.columns.length > 0 ? props.columns : [props.displayField]
  return cols.filter((c): c is string => !!c)
})

/** 目标表单列 key → label 映射（弹窗列头/详情显示中文；获取失败回退 key） */
const columnLabelMap = ref<Record<string, string>>({})
/** 详情弹窗展示列（目标表单非隐藏列） */
const detailColumns = ref<{ key: string; label: string }[]>([])

async function loadColumnLabels() {
  if (!props.sourceFormKey) return
  try {
    const res = await formApi.getFormDefinitionByKey(props.sourceFormKey)
    const cc = res.data.columnConfig
    const map: Record<string, string> = {}
    const detail: { key: string; label: string }[] = []
    if (cc) {
      for (const c of JSON.parse(cc) as { key: string; label?: string; hidden?: boolean }[]) {
        if (c.key && c.label) map[c.key] = c.label
        if (c.key && !c.hidden) detail.push({ key: c.key, label: c.label || c.key })
      }
    }
    columnLabelMap.value = map
    detailColumns.value = detail
  } catch {
    columnLabelMap.value = {}
    detailColumns.value = []
  }
}

/** 搜索框提示：按搜索列中文 label 拼接（多列以 / 分隔），对齐 LookupPicker.searchInputPlaceholder */
const searchPlaceholderText = computed(() => {
  const cols = resolvedSearchColumns.value
  if (cols.length === 0) return '请输入关键字搜索'
  const labels = cols.map(c => columnLabelMap.value[c] || c)
  return `搜索${labels.join('/')}`
})

/** 行单元格取值：兼容 BizDataVO 内层（row.data[key]）与平铺行（row[key]），对齐 LookupPicker.readCellValue */
function readCell(row: any, key: string): unknown {
  if (row == null || !key) return undefined
  const inner = row.data != null && typeof row.data === 'object' ? row.data[key] : undefined
  return inner !== undefined ? inner : row[key]
}

function formatCell(row: any, key: string): string {
  const v = readCell(row, key)
  if (v === null || v === undefined) return ''
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

/** 详情弹窗单元格取值 */
function detailCell(key: string): string {
  return formatCell(detailRow.value, key)
}

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
  loadColumnLabels()
  fetchData()
}

async function fetchData() {
  loading.value = true
  try {
    // 后端分页 0 起（OFFSET = page*size），el-pagination 为 1 起 → 发送时 -1（对齐 BizDataListPage 惯例）
    const params: any = { ...query.value, page: query.value.page - 1 }
    if (keyword.value && resolvedSearchColumns.value.length > 0) {
      params.keyword = keyword.value
      params.keywordColumn = resolvedSearchColumns.value.join(',')
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

/** 点击 Tag 主体：打开记录详情弹窗（加载目标记录 + 展示各字段） */
async function handleTagClick(id: string) {
  if (!props.sourceFormKey || !id) return
  if (props.viewLink === false) return
  detailVisible.value = true
  detailLoading.value = true
  detailRow.value = null
  try {
    await loadColumnLabels()
    const res = await bizDataApi.detail(props.sourceFormKey, id)
    detailRow.value = res.data
  } finally {
    detailLoading.value = false
  }
}

/** 点击 Tag 右上角 x：移除该条引用（单选清空；多选剔除该 id 保留其余） */
function removeTag(index: number) {
  const ids = (props.modelValue || '').split(',').filter(Boolean)
  if (index < 0 || index >= ids.length) return
  ids.splice(index, 1)
  const texts = (props.displayText || resolvedDisplayText.value || '').split(',').filter(Boolean)
  texts.splice(index, 1)
  const newIds = ids.join(',')
  const newText = texts.join(',')
  emit('update:modelValue', newIds)
  emit('update:displayText', newText)
  resolvedDisplayText.value = newText
  missingIds.value = []
}

/** 打开"新增"弹窗（allowCreate=true 时由 footer 按钮触发） */
function openCreateDialog() {
  createDialogVisible.value = true
}

/**
 * 新增成功（DataPickerCreateDialog emit，携带 BizDataVO）：单选自动选中，多选刷新列表供勾选。
 * 平铺 data 内层字段 + id，供 selectValue 取值。
 */
async function handleCreateSuccess(row: Record<string, any>) {
  createDialogVisible.value = false
  if (isMultiple.value) {
    await fetchData()
    return
  }
  const flat = { ...((row.data as Record<string, unknown>) || {}), id: String(row.id) }
  selectValue([flat])
  dialogVisible.value = false
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
  const texts = rows.map(r => (props.displayField ? String(readCell(r, props.displayField) ?? '') : '')).join(',')
  emit('update:modelValue', ids)
  resolvedDisplayText.value = texts
}
</script>

<style scoped>
.data-picker {
  display: flex;
  align-items: center;
  gap: 4px;
}

.data-picker__tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
