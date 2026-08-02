<template>
  <div class="search-table" :class="{ 'is-small': tableSize === 'small' }">
    <!-- 搜索栏 -->
    <el-card v-if="showSearch" class="search-card" style="margin-bottom: 16px">
      <el-form :inline="true" :model="query" :size="tableSize" @submit.prevent>
        <el-form-item v-for="field in searchFields" :key="field.prop" :label="field.label">
          <el-input
            v-if="field.type === 'input'"
            v-model="query[field.prop]"
            :placeholder="field.placeholder"
            :style="field.style || 'width: 180px'"
            clearable
          />
          <el-select
            v-else-if="field.type === 'select'"
            v-model="query[field.prop]"
            :placeholder="field.placeholder"
            clearable
            :style="field.style || 'width: 180px'"
          >
            <el-option
              v-for="opt in field.options"
              :key="String(opt.value)"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <el-tree-select
            v-else-if="field.type === 'tree-select'"
            v-model="query[field.prop]"
            v-bind="field.treeProps"
            :placeholder="field.placeholder"
            clearable
            :style="field.style || 'width: 200px'"
            check-strictly
          />
          <el-date-picker
            v-else-if="field.type === 'date-picker'"
            v-model="query[field.prop]"
            :placeholder="field.placeholder"
          />
          <el-date-picker
            v-else-if="field.type === 'date-range'"
            v-model="query[field.prop]"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
          />
        </el-form-item>
        <el-form-item>
          <div style="display: flex; gap: 8px; margin-left: auto">
            <el-button type="primary" :icon="Search" circle @click="handleSearch" />
            <el-button :icon="Refresh" circle @click="handleReset" />
            <el-button v-if="showExport" :icon="Download" :loading="exportLoading" circle @click="handleExport" />
          </div>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 表格卡片 -->
    <el-card class="table-card">
      <div style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px">
        <slot />
        <el-button
          v-if="formConfig"
          type="primary"
          :icon="Plus"
          :size="tableSize === 'small' ? 'small' : 'default'"
          v-permission="formConfig.createPermission"
          @click="handleCreate(undefined)"
        >
          新增
        </el-button>
      </div>

      <div class="table-wrapper">
      <el-table :data="list" v-loading="loading" border :size="tableSize" height="100%" v-bind="treeTableAttrs" @row-click="(row: any, col: any, evt: Event) => emit('row-click', row, col, evt)">
        <el-table-column
          v-for="col in columns"
          :key="col.prop || col.label"
          :prop="col.prop"
          :label="col.label"
          :width="col.width"
          :min-width="col.minWidth"
          :align="col.align"
          :fixed="col.fixed"
          :formatter="col.formatter"
        >
          <template #default="{ row, column, $index }" v-if="col.slotName && $slots[col.slotName]">
            <slot :name="col.slotName" :row="row" :column="column" :$index="$index" />
          </template>
        </el-table-column>

        <!-- 操作列 -->
        <el-table-column
          v-if="resolvedActionButtons.length"
          label="操作"
          :width="actionColumnWidth"
          fixed="right"
        >
          <template #default="{ row }">
            <div class="action-buttons" style="display: inline-flex; align-items: center; gap: 0; white-space: nowrap">
              <template v-for="btn in visibleButtons" :key="btn.label">
                <!-- 图标 + confirm -->
                <el-popconfirm v-if="btn.icon && btn.confirm" :title="btn.confirm" @confirm="btn.onClick(row)">
                  <template #reference>
                    <el-button :icon="btn.icon" circle size="small" :type="btn.type" :title="btn.label" v-permission="btn.permission" />
                  </template>
                </el-popconfirm>

                <!-- 图标无 confirm -->
                <el-tooltip v-else-if="btn.icon" :content="btn.label" placement="top" :show-after="200">
                  <el-button :icon="btn.icon" circle size="small" :type="btn.type" v-permission="btn.permission" @click="btn.onClick(row)" />
                </el-tooltip>

                <!-- 文本 + confirm (当前逻辑不变) -->
                <el-popconfirm v-else-if="btn.confirm" :title="btn.confirm" @confirm="btn.onClick(row)">
                  <template #reference>
                    <el-button text
                      size="small"
                      :type="btn.type"
                      v-permission="btn.permission"
                    >
                      {{ btn.label }}
                    </el-button>
                  </template>
                </el-popconfirm>

                <!-- 纯文本 (当前逻辑不变) -->
                <el-button
                  v-else
                  size="small"
                  :type="btn.type || 'text'"
                  v-permission="btn.permission"
                  @click="btn.onClick(row)"
                >
                  {{ btn.label }}
                </el-button>
              </template>

              <el-dropdown v-if="dropdownButtons.length" trigger="click">
                <el-button size="small" text>
                  <el-icon :size="16"><CaretBottom /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <template v-for="btn in dropdownButtons" :key="btn.label">
                      <el-dropdown-item v-if="!btn.confirm" @click="btn.onClick(row)">
                        {{ btn.label }}
                      </el-dropdown-item>
                      <el-dropdown-item v-else>
                        <el-popconfirm :title="btn.confirm" @confirm="btn.onClick(row)">
                          <template #reference>
                            <span>{{ btn.label }}</span>
                          </template>
                        </el-popconfirm>
                      </el-dropdown-item>
                    </template>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
      </div>

      <div v-if="showPagination && total > 0" class="pagination-bar">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :total="total"
          :page-sizes="pageSizes"
          layout="total, sizes, prev, pager, next, jumper"
          :small="tableSize === 'small'"
          @size-change="fetchList()"
          @current-change="fetchList()"
        />
      </div>
    </el-card>

    <!-- 表单弹窗 -->
    <el-dialog
      v-if="formConfig"
      v-model="dialogVisible"
      :title="dialogTitle"
      :width="formConfig.dialogWidth || '500px'"
      :close-on-click-modal="false"
      @close="handleDialogClose"
    >
      <FormBuilder
        ref="formRef"
        v-model="formData"
        :fields="formConfig.fields"
        :layout="formConfig.layout"
        :label-width="formConfig.labelWidth || '80px'"
      />
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="formLoading" @click="handleDialogSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { Search, Refresh, Download, Plus, Edit, Delete, CaretBottom } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { SearchTableProps, ActionButton, QueryParams } from './types'
import FormBuilder from './FormBuilder.vue'

const props = withDefaults(defineProps<SearchTableProps>(), {
  defaultPageSize: 10,
  pageSizes: () => [10, 20, 50],
  showExport: false,
  exportLoading: false,
  maxVisibleButtons: 3,
  showSearch: true,
  tableSize: 'default',
})

/** 树形表格属性：透传给 el-table */
const treeTableAttrs = computed(() => {
  if (!props.treeProps) return {}
  return {
    'row-key': props.treeProps.rowKey,
    'tree-props': { children: props.treeProps.children },
    'default-expand-all': props.treeProps.defaultExpandAll ?? true,
  }
})

/** 树形模式下隐藏分页 */
const showPagination = computed(() => !props.treeProps)

const emit = defineEmits<{
  search: [params: QueryParams]
  reset: []
  export: [params: QueryParams]
  'row-click': [row: any, column: any, event: Event]
}>()

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)

const query = reactive<QueryParams>({ page: 1, size: props.defaultPageSize })
const initialQuery = ref<Record<string, any>>({})

// 表单弹窗状态
const dialogVisible = ref(false)
const dialogTitle = ref('')
const isEdit = ref(false)
const editId = ref<number | string>(0)
const formData = ref<Record<string, any>>({})
const formLoading = ref(false)
const formRef = ref()

// 操作列宽度
const actionColumnWidth = computed(() => {
  const buttons = visibleButtons.value
  const hasMore = resolvedActionButtons.value.length > props.maxVisibleButtons

  let width = 0
  for (const btn of buttons) {
    if (btn.icon) {
      width += 36 // 圆形图标按钮 + 包裹开销
    } else {
      // 文本按钮：按字数估算，保底 50px
      width += Math.max(btn.label.length * 14 + 26, 50)
    }
  }
  if (hasMore) width += 62 // "更多"下拉
  width += 22 // el-table .cell 左右 padding

  return Math.ceil(width) + 'px'
})

const resolvedActionButtons = computed<ActionButton[]>(() => {
  const defaults = props.formConfig ? getDefaultActions() : []
  if (props.actionButtons !== undefined) {
    // 合并：自定义按钮追加到默认按钮后面
    return [...defaults, ...props.actionButtons]
  }
  return defaults
})

function getDefaultActions(): ActionButton[] {
  const btns: ActionButton[] = []
  if (props.formConfig?.updateApi) {
    btns.push({
      label: '编辑',
      icon: Edit,
      type: 'text',
      permission: props.formConfig.editPermission,
      onClick: (row) => handleEdit(row),
    })
  }
  if (props.formConfig?.deleteApi) {
    btns.push({
      label: '删除',
      icon: Delete,
      type: 'text',
      confirm: '确定删除该记录吗？',
      permission: props.formConfig.deletePermission,
      onClick: (row) => handleDelete(row),
    })
  }
  return btns
}

const visibleButtons = computed(() =>
  resolvedActionButtons.value.slice(0, props.maxVisibleButtons),
)
const dropdownButtons = computed(() =>
  resolvedActionButtons.value.slice(props.maxVisibleButtons),
)

function initSearchDefaults() {
  const defaults: Record<string, any> = {}
  for (const field of props.searchFields) {
    if (field.defaultValue !== undefined) {
      defaults[field.prop] = field.defaultValue
    }
  }
  initialQuery.value = { page: 1, size: props.defaultPageSize, ...defaults }
  Object.assign(query, initialQuery.value)
}

onMounted(() => {
  initSearchDefaults()
  fetchList()
})

async function fetchList() {
  loading.value = true
  try {
    const res = await props.fetchApi({ ...query })
    list.value = Array.isArray(res.rows) ? res.rows : []
    total.value = Number(res.total) || 0
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  query.page = 1
  fetchList()
}

function handleReset() {
  Object.keys(query).forEach((key) => delete query[key])
  Object.assign(query, initialQuery.value)
  fetchList()
}

function handleExport() {
  emit('export', { ...query })
}

// --- CRUD ---
function handleCreate(initialValues?: Record<string, any>) {
  isEdit.value = false
  editId.value = 0
  const configInitialValues = props.formConfig?.initialValues || {}
  formData.value = { ...configInitialValues, ...(initialValues || {}) }
  dialogTitle.value = props.formConfig?.dialogTitle?.create || '新增'
  dialogVisible.value = true
}

async function handleEdit(row: any) {
  if (props.formConfig?.beforeEdit) {
    const ok = await props.formConfig.beforeEdit(row)
    if (ok === false) return
  }
  isEdit.value = true
  editId.value = row.id
  dialogTitle.value = props.formConfig?.dialogTitle?.edit || '编辑'

  if (props.formConfig?.getApi) {
    formLoading.value = true
    try {
      const res = await props.formConfig.getApi(row.id)
      formData.value = { ...res }
    } finally {
      formLoading.value = false
    }
  } else {
    formData.value = { ...row }
  }
  dialogVisible.value = true
}

async function handleDelete(row: any) {
  if (props.formConfig?.beforeDelete) {
    const ok = await props.formConfig.beforeDelete(row)
    if (ok === false) return
  }
  try {
    await props.formConfig?.deleteApi?.(row.id)
    ElMessage.success('删除成功')
    props.formConfig?.afterDelete?.()
    fetchList()
  } catch {
    // http 拦截器统一处理
  }
}

async function handleDialogSubmit() {
  const valid = await formRef.value?.validate()
  if (!valid) return

  formLoading.value = true
  try {
    if (isEdit.value) {
      await props.formConfig?.updateApi?.(editId.value, formData.value)
      props.formConfig?.afterUpdate?.(formData.value)
    } else {
      await props.formConfig?.createApi?.(formData.value)
      props.formConfig?.afterCreate?.(formData.value)
    }
    ElMessage.success(isEdit.value ? '更新成功' : '创建成功')
    dialogVisible.value = false
    fetchList()
  } finally {
    formLoading.value = false
  }
}

function handleDialogClose() {
  formData.value = {}
}

defineExpose({ fetchList, openFormDialog: handleCreate })
</script>

<style scoped>
.search-table {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 紧凑模式 */
.is-small {
  font-size: 12px;
}
.is-small .el-form,
.is-small .el-table,
.is-small .el-pagination {
  font-size: 12px;
}

/* 搜索栏 */
.search-card {
  flex-shrink: 0;
}
.search-card :deep(.el-card__body) {
  padding-bottom: 0;
}

/* 表格卡片 - 占满剩余空间 */
.table-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.table-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 工具栏 - 固定 */
.toolbar {
  flex-shrink: 0;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 表格数据区域 - 滚动 */
.table-wrapper {
  flex: 1;
  overflow: hidden;
}
.table-wrapper :deep(.el-table) {
  height: 100% !important;
}
.table-wrapper :deep(.el-table__body-wrapper) {
  overflow-y: auto;
}

/* 分页栏 */
.pagination-bar {
  flex-shrink: 0;
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

/* 操作列文字按钮紧凑样式 */
.action-buttons .el-button {
  margin-left: 0;
  padding: 4px 6px;
}
.action-buttons .el-button + .el-button {
  margin-left: 0;
}
</style>