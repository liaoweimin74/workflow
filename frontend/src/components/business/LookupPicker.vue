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
          :prop="col.prop"
          :label="col.label"
          :width="col.width"
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
import { ref, reactive, computed } from 'vue'
import { Search } from '@element-plus/icons-vue'
import type { LookupPickerProps, QueryParams } from './types'

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

const defaultDisplayField = computed(() => {
  const firstCol = props.columns.find(c => c.prop)
  return firstCol?.prop || ''
})

const resolvedDisplayField = computed(() => props.displayField || defaultDisplayField.value)

const displayText = computed(() => {
  const val = props.modelValue
  if (!val) return ''
  if (Array.isArray(val)) {
    if (val.length === 0) return ''
    return val[0][resolvedDisplayField.value] || ''
  }
  if (typeof val === 'object') {
    return val[resolvedDisplayField.value] || ''
  }
  return ''
})

function openDialog() {
  if (props.disabled) return
  dialogVisible.value = true
  keyword.value = ''
  query.page = 1
  tempSelection.value = []
  fetchData()
}

async function fetchData() {
  loading.value = true
  try {
    const params: any = { ...query }
    if (keyword.value) params.keyword = keyword.value
    const res = await props.fetchApi(params)
    tableData.value = res.rows
    total.value = res.total
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
  emit('update:modelValue', row)
  emit('select', row)
  dialogVisible.value = false
}

function handleSelectionChange(rows: any[]) {
  tempSelection.value = rows
}

function confirmSelection() {
  emit('update:modelValue', [...tempSelection.value])
  if (tempSelection.value.length > 0) {
    emit('select', tempSelection.value)
  }
  dialogVisible.value = false
}

function handleClear() {
  emit('update:modelValue', props.mode === 'multiple' ? [] : null)
  emit('clear')
}

defineExpose({ openDialog, closeDialog: () => { dialogVisible.value = false } })
</script>