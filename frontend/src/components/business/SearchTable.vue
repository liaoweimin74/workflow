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
          <div class="toolbar-buttons">
            <el-button type="primary" :icon="Search" circle size="small" @click="handleSearch" />
            <el-button :icon="Refresh" circle size="small" @click="handleReset" />
            <el-button v-if="showExport" :icon="Download" :loading="exportLoading" circle size="small" @click="handleExport" />
          </div>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 表格卡片 -->
    <el-card class="table-card">
      <div style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px">
        <slot />
        <template v-for="btn in toolbarButtons" :key="btn.label">
          <!-- circle（图标形态）：无 slot 内容，图标完全居中（对齐搜索栏/操作列图标按钮），hover 显示 label -->
          <el-tooltip v-if="btn.circle" :content="btn.label" placement="top" :show-after="200">
            <el-button
              :type="btn.type"
              :size="btn.size || (tableSize === 'small' ? 'small' : 'default')"
              circle
              :icon="btn.icon"
              @click="btn.onClick"
            />
          </el-tooltip>
          <!-- 非 circle：带文字的普通/文本按钮 -->
          <el-button
            v-else
            :type="btn.type"
            :size="btn.size || (tableSize === 'small' ? 'small' : 'default')"
            :link="btn.link"
            :icon="btn.icon"
            @click="btn.onClick"
          >
            {{ btn.label }}
          </el-button>
        </template>
        <el-button
          v-if="formConfig && showCreateButton"
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
      <el-table ref="tableRef" :data="list" v-loading="loading" border :size="tableSize" height="100%" v-bind="treeTableAttrs" @row-click="(row: any, col: any, evt: Event) => emit('row-click', row, col, evt)" @cell-click="(row: any, col: any, cell: any, evt: Event) => emit('cell-click', row, col, cell, evt)" @selection-change="(selection: any[]) => emit('selection-change', selection)" @sort-change="(args: { column: any; prop: string; order: string }) => emit('sort-change', args)">
        <el-table-column
          v-for="col in columns"
          :key="col.prop || col.label"
          :prop="col.prop"
          :label="col.label"
          :width="col.width"
          :min-width="col.minWidth"
          :align="col.align"
          :fixed="col.fixed"
          :sortable="col.sortable ? 'custom' : undefined"
          :formatter="col.formatter"
        >
          <template #default="{ row, column, $index }" v-if="col.render">
            <RenderCell :render="col.render" :row="row" :column="column" :index="$index" />
          </template>
          <template #default="{ row, column, $index }" v-else-if="col.slotName && $slots[col.slotName]">
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
                <template v-if="!btn.show || btn.show(row)">
                <!-- 图标 + confirm -->
                <el-popconfirm v-if="btn.icon && btn.confirm" :title="btn.confirm" @confirm="btn.onClick(row)">
                  <template #reference>
                    <el-button :icon="btn.icon" circle plain size="small" :type="btn.type" :title="btn.label" v-permission="btn.permission" @click.stop />
                  </template>
                </el-popconfirm>

                <!-- 图标无 confirm -->
                <el-tooltip v-else-if="btn.icon" :content="btn.label" placement="top" :show-after="200">
                  <el-button :icon="btn.icon" circle plain size="small" :type="btn.type" v-permission="btn.permission" @click.stop="btn.onClick(row)" />
                </el-tooltip>

                <!-- 文本 + confirm -->
                <el-popconfirm v-else-if="btn.confirm" :title="btn.confirm" @confirm="btn.onClick(row)">
                  <template #reference>
                    <el-button
                      link
                      size="small"
                      :type="btn.type"
                      v-permission="btn.permission"
                      @click.stop
                    >
                      {{ btn.label }}
                    </el-button>
                  </template>
                </el-popconfirm>

                <!-- 纯文本 -->
                <el-button
                  v-else
                  link
                  size="small"
                  :type="btn.type"
                  v-permission="btn.permission"
                  @click.stop="btn.onClick(row)"
                >
                  {{ btn.label }}
                </el-button>
                </template>
              </template>

              <el-dropdown v-if="dropdownButtons.length" trigger="click">
                <el-button size="small" link @click.stop>
                  <el-icon :size="16"><CaretBottom /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <template v-for="btn in dropdownButtons" :key="btn.label">
                      <el-dropdown-item v-if="(!btn.show || btn.show(row)) && !btn.confirm" @click="btn.onClick(row)">
                        {{ btn.label }}
                      </el-dropdown-item>
                      <el-dropdown-item v-else-if="(!btn.show || btn.show(row)) && btn.confirm">
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
      <FormRenderer
        :key="dialogFormKey"
        ref="formRendererRef"
        :rule="formConfig.rule"
        :option="formConfig.option"
        :initial-values="dialogInitialValues"
        :actions="formConfig.actions"
        :data-sources="formConfig.dataSources"
        @open-new-tab="(key, rid) => $emit('open-new-tab', key, rid)"
      />
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="formLoading" @click="handleDialogSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, defineComponent, h, type PropType } from 'vue'
import { Search, Refresh, Download, Plus, Edit, Delete, CaretBottom } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { SearchTableProps, ActionButton, QueryParams, TableColumn } from './types'
import FormRenderer from '@/views/form/components/FormRenderer.vue'

/** 承接 TableColumn.render 的小型函数式组件（返回 VNode 或字符串） */
const RenderCell = defineComponent({
  name: 'RenderCell',
  props: {
    render: { type: Function as PropType<(row: any, column: TableColumn, index: number) => unknown>, required: true },
    row: { type: Object as PropType<any>, required: true },
    column: { type: Object as PropType<TableColumn>, required: true },
    index: { type: Number, required: true },
  },
  setup(props) {
    return () => {
      const r = props.render(props.row, props.column, props.index)
      return typeof r === 'string' || r === null || r === undefined ? h('span', r ?? '') : r
    }
  },
})

const props = withDefaults(defineProps<SearchTableProps>(), {
  defaultPageSize: 10,
  pageSizes: () => [10, 20, 50],
  showExport: false,
  exportLoading: false,
  maxVisibleButtons: 3,
  showSearch: true,
  showCreateButton: true,
  mergeDefaultActions: true,
  tableSize: 'default',
  toolbarButtons: () => [],
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

/** 树形模式下隐藏分页；非树形时按 props.showPagination（默认 true） */
const showPagination = computed(() => (!props.treeProps && props.showPagination !== false))

const emit = defineEmits<{
  search: [params: QueryParams]
  reset: []
  export: [params: QueryParams]
  'row-click': [row: any, column: any, event: Event]
  'cell-click': [row: any, column: any, cell: any, event: Event]
  'selection-change': [selection: any[]]
  'sort-change': [args: { column: any; prop: string; order: string }]
  'open-new-tab': [containerKey: string, recordId: string]
}>()

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
/** el-table 实例（供外部 sort/clearSelection 控制） */
const tableRef = ref<any>(null)

const query = reactive<QueryParams>({ page: 1, size: props.defaultPageSize })
const initialQuery = ref<Record<string, any>>({})

// 表单弹窗状态
const dialogVisible = ref(false)
const dialogTitle = ref('')
const isEdit = ref(false)
const editId = ref<number | string>(0)
const editingRow = ref<any>(null)
const dialogInitialValues = ref<Record<string, any>>({})
const formLoading = ref(false)
const formRendererRef = ref<InstanceType<typeof FormRenderer> | null>(null)
/** 每次打开弹窗递增，强制重建 FormRenderer（确保读取最新 initialValues，避免复用实例时表单残留旧数据） */
const dialogFormKey = ref(0)

// 操作列宽度
const actionColumnWidth = computed(() => {
  const buttons = visibleButtons.value
  const hasMore = resolvedActionButtons.value.length > props.maxVisibleButtons

  let width = 0
  for (const btn of buttons) {
    if (btn.icon) {
      width += 32 // 圆形图标按钮
    } else {
      // 文本按钮：每字符 14px + 左右 padding 8px
      width += btn.label.length * 14 + 8
    }
  }
  if (hasMore) width += 50 // "更多"下拉
  width += 24 // el-table .cell 左右 padding

  return Math.ceil(width) + 'px'
})

const resolvedActionButtons = computed<ActionButton[]>(() => {
  const defaults = props.formConfig ? getDefaultActions() : []
  if (props.actionButtons !== undefined) {
    // mergeDefaultActions=false 时完全使用自定义按钮；默认合并（默认在前，自定义在后）
    if (props.mergeDefaultActions === false) return props.actionButtons
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
      permission: props.formConfig.editPermission,
      onClick: (row) => handleEdit(row),
    })
  }
  if (props.formConfig?.deleteApi) {
    btns.push({
      label: '删除',
      icon: Delete,
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
  for (const field of props.searchFields || []) {
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
async function handleCreate(initialValues?: Record<string, any>) {
  if (props.formConfig?.beforeCreate) {
    const ok = await props.formConfig.beforeCreate()
    if (ok === false) return
  }
  isEdit.value = false
  editId.value = 0
  editingRow.value = null
  const configInitialValues = props.formConfig?.initialValues || {}
  dialogInitialValues.value = { ...configInitialValues, ...(initialValues || {}) }
  dialogTitle.value = props.formConfig?.dialogTitle?.create || '新增'
  dialogFormKey.value++ // 强制重建 FormRenderer，加载最新 initialValues
  dialogVisible.value = true
}

async function handleEdit(row: any) {
  if (props.formConfig?.beforeEdit) {
    const ok = await props.formConfig.beforeEdit(row)
    if (ok === false) return
  }
  isEdit.value = true
  editId.value = row.id
  editingRow.value = row
  dialogTitle.value = props.formConfig?.dialogTitle?.edit || '编辑'

  if (props.formConfig?.getApi) {
    formLoading.value = true
    try {
      const res = await props.formConfig.getApi(row.id)
      dialogInitialValues.value = { ...res }
    } finally {
      formLoading.value = false
    }
  } else {
    dialogInitialValues.value = { ...row }
  }
  dialogFormKey.value++ // 强制重建 FormRenderer，加载最新 initialValues
  dialogVisible.value = true
}

async function handleDelete(row: any) {
  if (props.formConfig?.beforeDelete) {
    const ok = await props.formConfig.beforeDelete(row)
    if (ok === false) return
  }
  const msg = props.deleteConfirm ? props.deleteConfirm(row) : '确定删除该记录吗？'
  try {
    await ElMessageBox.confirm(msg, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await props.formConfig?.deleteApi?.(row.id, row)
    ElMessage.success('删除成功')
    props.formConfig?.afterDelete?.()
    fetchList()
  } catch {
    // http 拦截器统一处理
  }
}

async function handleDialogSubmit() {
  const formData = formRendererRef.value?.getFormData() || {}

  formLoading.value = true
  try {
    if (isEdit.value) {
      await props.formConfig?.updateApi?.(editId.value, formData, editingRow.value)
      props.formConfig?.afterUpdate?.(formData)
    } else {
      await props.formConfig?.createApi?.(formData)
      props.formConfig?.afterCreate?.(formData)
    }
    ElMessage.success(isEdit.value ? '更新成功' : '创建成功')
    dialogVisible.value = false
    fetchList()
  } finally {
    formLoading.value = false
  }
}

function handleDialogClose() {
  dialogInitialValues.value = {}
}

// --- 外部控制方法（供父组件通过 ref 调用，如外部自建搜索栏 / 事件动作链） ---

/** 外部注入查询条件并刷新；resetPage=true 时重置到第一页（默认） */
function setQuery(extra: Record<string, any>, resetPage = true) {
  Object.assign(query, extra)
  if (resetPage) query.page = 1
  fetchList()
}

/** 设置表格排序（代理 el-table.sort） */
function sort(field: string, order: string) {
  tableRef.value?.sort(field, order)
}

/** 清空行选择（代理 el-table.clearSelection） */
function clearSelection() {
  tableRef.value?.clearSelection()
}

/** 当前表格数据（外部读取用） */
function getList() {
  return list.value
}

  defineExpose({ fetchList, openFormDialog: handleCreate, openEdit: handleEdit, setQuery, sort, clearSelection, getList })
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

/* 查询工具栏图标按钮 */
.toolbar-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.toolbar-buttons .el-button.is-circle {
  padding: 5px;
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
/* 操作列图标按钮：空心描边，默认无底色（hover 时才有反馈填充） */
.action-buttons .el-button.is-plain.is-circle {
  --el-button-bg-color: transparent;
}
.action-buttons .el-button.is-plain.is-circle:hover {
  --el-button-hover-bg-color: var(--el-color-primary-light-8);
}
</style>