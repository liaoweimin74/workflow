<template>
  <div class="data-picker">
    <el-input
      :model-value="displayText"
      :placeholder="placeholder || '请选择'"
      :disabled="disabled || readonly"
      :clearable="!readonly"
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
import { Search } from '@element-plus/icons-vue'
import { bizDataApi } from '@/api/bizData'

/** form-create 注入对象，提供 api.setValue 等方法 */
interface FormCreateInject {
  api?: {
    setValue: (field: string, value: unknown) => void
  }
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
    /** 级联依赖：{ field: 当前表单字段, sourceColumn: 目标表列 } */
    dependOn?: { field?: string; sourceColumn?: string }
    /** 依赖字段当前值（由父组件传入） */
    dependOnValue?: unknown
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
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:displayText': [value: string]
}>()

const formCreateInject = inject<FormCreateInject | undefined>('formCreateInject', undefined)

const dialogVisible = ref(false)
const loading = ref(false)
const keyword = ref('')
const tableData = ref<any[]>([])
const total = ref(0)
const tempSelection = ref<any[]>([])
const resolvedDisplayText = ref('')

const query = ref({ page: 1, size: 10 })

const isMultiple = computed(() => props.mode === 'multiple')

/** 显示文本：优先外部冗余文本，否则内部 resolve 结果 */
const displayText = computed(() => props.displayText || resolvedDisplayText.value)

const resolvedColumns = computed(() => {
  const cols = props.columns && props.columns.length > 0 ? props.columns : [props.displayField]
  return cols.filter(Boolean)
})

/** 级联 filter：依赖字段值 → 目标表列 */
const cascadeFilter = computed(() => {
  if (!props.dependOn?.sourceColumn) return undefined
  const v = props.dependOnValue
  if (v === undefined || v === null || v === '') return undefined
  return { [props.dependOn.sourceColumn]: v }
})

watch(
  () => props.modelValue,
  async (val) => {
    if (val) {
      await resolveDisplay(val)
    } else {
      resolvedDisplayText.value = ''
    }
  },
  { immediate: true },
)

watch(
  () => props.dependOnValue,
  () => {
    // 依赖字段变化：清空当前选择与回填
    if (props.modelValue) {
      emit('update:modelValue', '')
      emit('update:displayText', '')
      resolvedDisplayText.value = ''
      clearReturnFields()
    }
  },
)

async function resolveDisplay(val: string) {
  if (!props.sourceFormKey || !val) return
  try {
    const ids = val.split(',').filter(Boolean)
    const res = await bizDataApi.resolve(props.sourceFormKey, ids, props.displayField)
    const map = res.data || {}
    resolvedDisplayText.value = ids.map(id => map[id] || id).join(',')
  } catch {
    // 解析失败显示原始 id
    resolvedDisplayText.value = val
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
    if (cascadeFilter.value) {
      params.filter = cascadeFilter.value
    }
    const res = await bizDataApi.list(props.sourceFormKey || '', params)
    tableData.value = res.data.records || []
    total.value = res.data.total || 0
  } finally {
    loading.value = false
  }
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
