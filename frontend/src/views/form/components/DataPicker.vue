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
    <!-- 有值：Tag 列表（编辑态可 x 移除 + 查看/选择按钮；只读态仅查看） -->
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
        link
        type="primary"
        size="small"
        class="data-picker__view-btn"
        @click="openViewDialog"
      >查看</el-button>
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
        ref="tableRef"
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
    <!-- 查看已选记录列表：表格列与选择弹窗一致，数据为当前已选记录（复用 list 接口 + id IN 过滤） -->
    <el-dialog
      v-model="viewDialogVisible"
      title="已选记录"
      width="700px"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-table
        :data="viewRows"
        v-loading="viewLoading"
        border
        highlight-current-row
        @row-click="handleViewRowClick"
      >
        <el-table-column
          v-for="col in resolvedColumns"
          :key="col"
          :prop="col"
          :label="columnLabelMap[col] || col"
          min-width="120"
          :formatter="(row: any) => formatCell(row, col)"
        />
      </el-table>
    </el-dialog>
    <!-- 点击 Tag：记录详情弹窗（复用 form-create 渲染目标表单，readonly 由 detailReadonly 配置控制） -->
    <el-dialog
      v-model="detailVisible"
      :title="'记录详情'"
      width="640px"
      :close-on-click-modal="false"
      append-to-body
    >
      <div v-loading="detailLoading" style="min-height: 200px">
        <FormRenderer
          v-if="detailSchema.length > 0"
          ref="detailFormRef"
          :rule="detailSchema"
          :option="detailOption"
          :initial-values="detailFormValues"
          :readonly="detailReadonly"
        />
        <p v-else-if="!detailLoading" class="detail-empty">目标表单 schema 为空或表单未发布</p>
      </div>
      <template v-if="!detailReadonly && detailSchema.length > 0" #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button type="primary" :loading="detailSaving" @click="handleDetailSave">保存</el-button>
      </template>
    </el-dialog>
    <DataPickerCreateDialog
      v-model:visible="createDialogVisible"
      :source-form-key="sourceFormKey || ''"
      @success="handleCreateSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject, nextTick, type ComponentPublicInstance } from 'vue'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { type Rule } from '@form-create/element-ui'
import { bizDataApi } from '@/api/bizData'
import { formApi } from '@/api/form'
import DataPickerCreateDialog from './DataPickerCreateDialog.vue'
import FormRenderer from './FormRenderer.vue'

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
    /** 最多可选数量：缺省不限；1 = 单选语义（点行即选 + 校验长度 ≤ 1） */
    maxCount?: number
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
    /** 详情弹窗表单是否只读（默认 true；false 时详情表单可编辑并支持保存） */
    detailReadonly?: boolean
    /** 冗余显示文本（由表单数据提供，如 <key>_text；缺省时内部 resolve 补全） */
    displayText?: string
    disabled?: boolean
    readonly?: boolean
    placeholder?: string
  }>(),
  {
    placeholder: '请选择',
    disabled: false,
    readonly: false,
    clearOnCascadeChange: false,
    allowCreate: false,
    detailReadonly: true,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:displayText': [value: string]
}>()

const formCreateInject = inject<FormCreateInject | undefined>('formCreateInject', undefined)

const dialogVisible = ref(false)
const createDialogVisible = ref(false)
const viewDialogVisible = ref(false)
const viewLoading = ref(false)
const viewRows = ref<any[]>([])
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailSaving = ref(false)
const detailRow = ref<any>(null)
const detailSchema = ref<Rule[]>([])
const detailOption = ref<Record<string, any>>({})
const detailFormRef = ref<ComponentPublicInstance | null>(null)
const loading = ref(false)
const keyword = ref('')
const tableData = ref<any[]>([])
const total = ref(0)
const tempSelection = ref<any[]>([])
const resolvedDisplayText = ref('')
const missingIds = ref<string[]>([])
const tableRef = ref<ComponentPublicInstance | null>(null)

const query = ref({ page: 1, size: 10 })

/** 单选语义：maxCount=1（点行即选） */
const isSingleSelect = computed(() => props.maxCount === 1)

/** 多选交互：maxCount 缺省（不限）或 >1 时勾选 + 确认 */
const isMultiple = computed(() => !isSingleSelect.value)

/** 解析 JSON 数组字符串（modelValue/displayText 存储形态），非法/空返回 [] */
function parseJsonArray(v: string | undefined | null): string[] {
  if (!v) return []
  try {
    const parsed = JSON.parse(v)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/** 是否有已选值：有值时不显示输入框，改为 Tag 列表（空数组视为无值） */
const hasValue = computed(() => parseJsonArray(props.modelValue).length > 0)

/** Tag 数据源：modelValue（JSON id 数组）与显示文本（_text/resolve JSON 文本数组）按 index 对齐 */
const tagItems = computed(() => {
  const ids = parseJsonArray(props.modelValue)
  if (ids.length === 0) return []
  const missingSet = new Set(missingIds.value)
  const texts = parseJsonArray(props.displayText || resolvedDisplayText.value)
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

/** 目标表单列 key → label 映射（弹窗列头显示中文；获取失败回退 key） */
const columnLabelMap = ref<Record<string, string>>({})

async function loadColumnLabels() {
  if (!props.sourceFormKey) return
  try {
    const res = await formApi.getFormDefinitionByKey(props.sourceFormKey)
    const cc = res.data.columnConfig
    const map: Record<string, string> = {}
    if (cc) {
      for (const c of JSON.parse(cc) as { key: string; label?: string }[]) {
        if (c.key && c.label) map[c.key] = c.label
      }
    }
    columnLabelMap.value = map
  } catch {
    columnLabelMap.value = {}
  }
}

/** 详情表单初始值：detail 记录的 data 内层（业务字段平铺），对齐 BizDataListPage.getApi */
const detailFormValues = computed(() => {
  const d = detailRow.value
  if (d && typeof d === 'object') {
    const inner = (d as Record<string, unknown>).data
    if (inner && typeof inner === 'object') return inner as Record<string, unknown>
    return d
  }
  return {}
})

/** 加载目标表单 schema（form-create rule + option）供详情弹窗渲染 */
async function loadDetailSchema() {
  detailSchema.value = []
  detailOption.value = {}
  if (!props.sourceFormKey) return
  try {
    const res = await formApi.getFormDefinitionByKey(props.sourceFormKey)
    const def = res.data
    if (def.schema && def.schema !== '[]') {
      const parsed = JSON.parse(def.schema)
      if (Array.isArray(parsed)) {
        detailSchema.value = parsed
      } else {
        detailSchema.value = parsed.rule || []
        detailOption.value = parsed.option || {}
      }
    }
  } catch {
    detailSchema.value = []
    detailOption.value = {}
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
    const ids = parseJsonArray(val)
    if (ids.length === 0) return
    const res = await bizDataApi.resolve(props.sourceFormKey, ids, props.displayField)
    const map = res.data || {}
    const parts = ids.map(id => ({ id, text: map[id], missing: map[id] === undefined }))
    missingIds.value = parts.filter(p => p.missing).map(p => p.id)
    resolvedDisplayText.value = JSON.stringify(parts.map(p => (p.missing ? p.id : p.text)))
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

/** 打开"查看已选记录"弹窗：按当前已选 id 批量查询完整记录（表格与选择弹窗一致） */
async function openViewDialog() {
  const ids = parseJsonArray(props.modelValue)
  if (ids.length === 0) return
  viewDialogVisible.value = true
  viewLoading.value = true
  viewRows.value = []
  loadColumnLabels()
  try {
    // 复用 list 接口 + id IN 过滤（后端 filter 支持 in 运算符）
    const res = await bizDataApi.list(props.sourceFormKey || '', {
      page: 0,
      size: 100,
      filter: {
        logic: 'AND',
        conditions: [{ column: 'id', op: 'in', value: ids }],
      },
    })
    // 后端 IN 不保证顺序：按 modelValue 顺序重排（与 Tag 顺序一致）
    const byId = new Map<string, any>((res.data.records || []).map(r => [String(r.id), r]))
    viewRows.value = ids.map(id => byId.get(id)).filter(Boolean)
  } catch {
    viewRows.value = []
  } finally {
    viewLoading.value = false
  }
}

/** 查看弹窗点击行：打开该记录详情（与点击 Tag 一致，复用 handleTagClick） */
function handleViewRowClick(row: any) {
  if (!row || row.id === undefined || row.id === null) return
  handleTagClick(String(row.id))
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

/** 点击 Tag 主体：打开记录详情弹窗（加载目标表单 schema + 记录数据，form-create 渲染）。
 *  点击 Tag 始终可查看详情（编辑态/只读态一致）。 */
async function handleTagClick(id: string) {
  if (!props.sourceFormKey || !id) return
  detailVisible.value = true
  detailLoading.value = true
  detailRow.value = null
  detailFormRef.value = null
  try {
    await loadColumnLabels()
    await loadDetailSchema()
    const res = await bizDataApi.detail(props.sourceFormKey, id)
    detailRow.value = res.data
  } finally {
    detailLoading.value = false
  }
}

/** 保存详情表单修改（detailReadonly=false 时才可见"保存"按钮）：
 *  form-create 校验通过后读取表单数据，调 update 接口（带 version 乐观锁）保存，
 *  保存成功带回服务端最新数据刷新详情并同步 Tag 文本。 */
async function handleDetailSave() {
  const form = detailFormRef.value as any
  if (!form) return
  const validate = typeof form.validate === 'function' ? form.validate : () => Promise.resolve(true)
  const valid = await validate().catch(() => false)
  if (!valid) return
  const data = (typeof form.getFormData === 'function' ? form.getFormData() : {}) as Record<string, unknown>
  const id = detailRow.value?.id
  const version = detailRow.value?.version
  if (!props.sourceFormKey || id === undefined || id === null) return
  detailSaving.value = true
  try {
    const res = await bizDataApi.update(props.sourceFormKey, String(id), data, version)
    detailRow.value = res.data
    ElMessage.success('保存成功')
    await resolveDisplay(JSON.stringify([id]))
  } catch {
    ElMessage.error('保存失败')
  } finally {
    detailSaving.value = false
  }
}

/** 点击 Tag 右上角 x：移除该条引用（单选清空；多选剔除该 id 保留其余） */
function removeTag(index: number) {
  const ids = parseJsonArray(props.modelValue)
  if (index < 0 || index >= ids.length) return
  ids.splice(index, 1)
  const texts = parseJsonArray(props.displayText || resolvedDisplayText.value)
  texts.splice(index, 1)
  const newIds = JSON.stringify(ids)
  const newText = JSON.stringify(texts)
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
 * 新增成功（DataPickerCreateDialog emit，携带 BizDataVO）：单选自动选中，多选刷新列表并自动勾选新记录。
 * 平铺 data 内层字段 + id，供 selectValue 取值。
 */
async function handleCreateSuccess(row: Record<string, any>) {
  createDialogVisible.value = false
  if (isMultiple.value) {
    await fetchData()
    // 自动勾选新记录（spec：新增成功 SHALL 自动选中新创建的记录）
    const newId = String(row?.id)
    const target = tableData.value.find(r => String(r.id) === newId)
    if (target) {
      await nextTick()
      ;(tableRef.value as any)?.toggleRowSelection(target, true)
    }
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
  // maxCount 上限校验（缺省不限；>1 时限制勾选数量）
  if (props.maxCount && props.maxCount > 1 && tempSelection.value.length > props.maxCount) {
    ElMessage.warning(`最多选择 ${props.maxCount} 条记录`)
    return
  }
  selectValue(tempSelection.value)
  dialogVisible.value = false
}

function selectValue(rows: any[]) {
  const ids = rows.map(r => String(r.id))
  const texts = rows.map(r => (props.displayField ? String(readCell(r, props.displayField) ?? '') : ''))
  emit('update:modelValue', JSON.stringify(ids))
  resolvedDisplayText.value = JSON.stringify(texts)
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
