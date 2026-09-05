<template>
  <el-dialog v-model="visible" :title="dialogTitle" :width="isListMode ? '860px' : '600px'" :close-on-click-modal="false">
    <template v-if="isListMode">
      <el-alert v-if="effectiveListMode === 'card'" title="卡片列表配置" type="info" :closable="false" show-icon class="card-mode-tip">
        可配置卡片分组、列字体和卡片操作区；点击每列的“高级配置”设置字体样式。
      </el-alert>
      <el-tabs v-model="activeTab" type="border-card">
        <!-- Tab 1: 数据源 + 组件级数据筛选（统一组件） -->
        <el-tab-pane label="数据源" name="binding">
          <UniDataSourceBinding
            :model-value="dsBindingValue"
            @update:model-value="syncBinding"
            :form-data-sources="formDataSources"
            :current-fields="currentFields"
            @columns="handleUnifiedColumns"
          />
        </el-tab-pane>
        <!-- Tab 2: 显示列 -->
        <el-tab-pane :label="effectiveListMode === 'card' ? '卡片字段' : '显示列'" name="columns">
          <!-- 查询栏开关：开启后可配置查询列（QueryColumnsConfig 显示查询勾选），运行时显示查询栏 -->
          <el-form label-width="100px" size="default">
            <!-- 卡片顶部快捷配置：两行。第一行：显示查询栏/撑满/卡片最小宽度；第二行：分组字段/分组可折叠/操作区位置 -->
            <div class="card-quick-config">
              <div class="card-quick-row">
                <el-form-item>
                  <template #label>
                    <span class="label-with-tip">
                      显示查询栏
                      <el-tooltip content="默认不显示；开启后可按下列勾选可查询字段" placement="top">
                        <el-icon class="tip-icon"><QuestionFilled /></el-icon>
                      </el-tooltip>
                    </span>
                  </template>
                  <el-switch v-model="tableData.showSearch" />
                </el-form-item>
                <el-form-item>
                  <template #label>
                    <span class="label-with-tip">
                      撑满
                      <el-tooltip content="开启后表格占满父容器宽高，数据区域内部滚动" placement="top">
                        <el-icon class="tip-icon"><QuestionFilled /></el-icon>
                      </el-tooltip>
                    </span>
                  </template>
                  <el-switch v-model="tableData.stretch" />
                </el-form-item>
                <el-form-item v-if="effectiveListMode === 'card'" class="qi-min-width">
                  <template #label><span class="qi-label">卡片最小宽度</span></template>
                  <el-input-number v-model="tableData.cardMinWidth" :min="180" :max="800" :step="20" class="qi-number" />
                </el-form-item>
              </div>
              <div v-if="effectiveListMode === 'card'" class="card-quick-row">
                <el-form-item class="qi-group-field">
                  <template #label><span class="qi-label">分组字段</span></template>
                  <el-select v-model="tableData.groupBy" clearable placeholder="不分组" class="qi-select">
                    <el-option v-for="c in tableCandidates" :key="c.key" :label="c.label || c.key" :value="c.key" />
                  </el-select>
                </el-form-item>
                <el-form-item>
                  <template #label>
                    <span class="label-with-tip">
                      分组可折叠
                      <el-tooltip content="开启后分组标题可点击折叠/展开该组卡片（仅设置了分组字段时生效）" placement="top">
                        <el-icon class="tip-icon"><QuestionFilled /></el-icon>
                      </el-tooltip>
                    </span>
                  </template>
                  <el-switch v-model="tableData.collapsibleGroups" />
                </el-form-item>
                <el-form-item class="qi-actions-placement">
                  <template #label><span class="qi-label">操作区位置</span></template>
                  <el-select v-model="tableData.actionsPlacement" class="qi-select">
                    <el-option label="底部（默认）" value="bottom" />
                    <el-option label="顶部" value="top" />
                    <el-option label="右侧（纵向排列）" value="right" />
                  </el-select>
                </el-form-item>
              </div>
            </div>
          </el-form>
          <QueryColumnsConfig
            v-if="tableCandidates.length > 0"
            :candidates="tableCandidates"
            :filterable-keys="tableFilterableKeys as any"
            v-model:search-fields="tableData.searchFields as any"
            v-model:columns="tableData.columns"
            :show-search="tableData.showSearch"
            v-model:sortable-fields="tableData.sortableFields"
            :sortable-candidates="tableSortableCandidates"
            :mode="effectiveListMode"
          />
          <el-empty v-else description="请先选择数据源" :image-size="60" />
          <!-- 分页配置（默认显示分页，20 条/页，可选 [10,20,50]；横向流式布局） -->
          <el-divider content-position="left">分页</el-divider>
          <div class="pagination-config">
            <el-form-item label="显示分页">
              <el-switch v-model="tableData.pagination" />
            </el-form-item>
            <el-form-item label="每页条数">
              <el-input-number v-model="tableData.pageSize" :min="1" :max="200" :step="10" style="width: 160px" />
            </el-form-item>
            <el-form-item label="可选页大小">
              <el-select
                v-model="tableData.pageSizes"
                multiple
                allow-create
                filterable
                default-first-option
                :reserve-keyword="false"
                placeholder="选择或输入每页大小"
                style="width: 260px"
              >
                <el-option v-for="n in [10, 20, 50, 100]" :key="n" :label="n + ' 条'" :value="n" />
              </el-select>
            </el-form-item>
          </div>
        </el-tab-pane>
        <!-- Tab 3: 操作 -->
        <el-tab-pane label="操作" name="actions">
          <ActionsConfig v-model="tableData.actions" v-model:detail="tableData.detail" :mode="effectiveListMode" />
        </el-tab-pane>
        <!-- Tab 4: 事件 -->
        <el-tab-pane label="事件" name="events">
          <EventsConfig v-model="tableData.events" :mode="effectiveListMode" />
        </el-tab-pane>
      </el-tabs>
    </template>

    <template v-else>
      <!-- 非表格模式：数据源 + 按钮 -->
      <el-form label-position="top" class="container-form" size="default">
        <el-form-item required>
          <template #label>
            <span class="label-with-tip">
              页面内数据源
              <el-tooltip content="数据源在「数据源配置」中绑定；切换后自动加载列定义" placement="top">
                <el-icon class="tip-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </span>
          </template>
          <el-select v-model="form.dataSourceId" placeholder="选择页面数据源绑定" style="width: 100%" @change="handleDataSourceChange">
            <el-option v-for="ds in formDataSources" :key="ds.id" :label="ds.id" :value="ds.id" />
          </el-select>
        </el-form-item>

        <!-- 按钮配置 -->
        <el-divider content-position="left">按钮</el-divider>
        <div class="container-button-grid">
          <el-form-item label="新增按钮">
            <el-switch v-model="container.showNewButton" />
          </el-form-item>
          <el-form-item label="取消按钮">
            <el-switch v-model="container.showCancelButton" />
          </el-form-item>
          <el-form-item label="确定按钮">
            <el-switch v-model="container.showConfirmButton" />
          </el-form-item>
          <el-form-item label="删除按钮">
            <el-switch v-model="container.showDeleteButton" />
          </el-form-item>
          <el-form-item label="复制按钮">
            <el-switch v-model="container.showCopyButton" />
          </el-form-item>
        </div>
        <el-form-item>
          <template #label>
            <span class="label-with-tip">
              自定义按钮
              <el-tooltip content="请输入 JSON 数组，格式：[{ &quot;key&quot;: &quot;approve&quot;, &quot;label&quot;: &quot;审核&quot;, &quot;actions&quot;: [{ &quot;op&quot;: &quot;refresh&quot;, &quot;target&quot;: &quot;ds1&quot; }] }]" placement="top">
                <el-icon class="tip-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </span>
          </template>
          <el-input
            v-model="container.customButtonsText"
            type="textarea"
            :rows="4"
            placeholder='[{ "key": "approve", "label": "审核", "actions": [{ "op": "refresh", "target": "ds1" }] }]'
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
    </template>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import { dataSourceApi } from '@/api/data-source'
import type { ColumnConfigItem } from '@/api/bizData'
import UniDataSourceBinding, { type UniDataSourceValue } from '@/views/form/components/UniDataSourceBinding.vue'
import QueryColumnsConfig from '@/views/page/components/QueryColumnsConfig.vue'
import ActionsConfig from '@/views/page/components/ActionsConfig.vue'
import EventsConfig from '@/views/page/components/EventsConfig.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  /** 当前表单字段 key 列表（筛选条件的"表单字段"选项） */
  currentFields: string[]
  /** 当前绑定配置（用于回填） */
  bindingProps?: Record<string, any>
  /** 页面内数据源绑定配置 */
  formDataSources: Array<{ id: string; refId: string }>
  /** 是否为数据表格模式（显示列/操作/事件 tabs）（兼容旧调用方） */
  tableMode?: boolean
  /** 列表展示模式：table / card；缺省且未开 tableMode 时为 form-container 模式 */
  listMode?: 'table' | 'card'
}>(), {
  tableMode: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm', props: Record<string, any>): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

/** 归一化列表展示模式：listMode 优先，兼容 tableMode=true 视为 table */
const effectiveListMode = computed<'table' | 'card' | undefined>(() =>
  props.listMode || (props.tableMode ? 'table' : undefined),
)

/** 是否为列表配置模式（table/card tabs；false = form-container 按钮配置） */
const isListMode = computed(() => effectiveListMode.value !== undefined)
const activeTab = ref('binding')
const dialogTitle = computed(() => effectiveListMode.value === 'card' ? '卡片列表数据源配置' : '数据源配置')

// ==================== 数据源 + 组件级数据筛选（表格模式） ====================
const dsColumns = ref<ColumnConfigItem[]>([])
const visibleColumns = computed(() => dsColumns.value.filter(c => !c.hidden))

const form = reactive({
  dataSourceId: '',
  filterLogic: 'AND' as 'AND' | 'OR',
  filterRows: [] as { column: string; op: string; source: 'fixed' | 'field'; fixedValue: string; field: string }[],
})

// ==================== 统一组件桥接（列表模式 tab1 由 UniDataSourceBinding 代理 UI） ====================
const dsBindingValue = ref<UniDataSourceValue>({ dataSourceId: '' })

/** form ↔ dsBindingValue 双向桥接：form 变化 → 派生 dsBindingValue（组件 v-model） */
watch(
  [() => form.dataSourceId, () => form.filterLogic, () => form.filterRows],
  ([id, logic, rows]) => {
    const conds = (rows as any[] || []).filter((r) => r.column).map((r) => ({
      column: r.column,
      op: r.op,
      source: r.source,
      ...(r.source === 'field' ? { field: r.field } : { value: r.fixedValue }),
    }))
    dsBindingValue.value = conds.length > 0
      ? { dataSourceId: id, filter: { logic, conditions: conds } }
      : { dataSourceId: id }
  },
  { deep: true, immediate: true },
)

/** 组件 → 父：组件 update:modelValue 时，回写 form（数据源 + 筛选） */
function syncBinding(value: UniDataSourceValue) {
  dsBindingValue.value = value
  form.dataSourceId = value.dataSourceId ?? ''
  const filter = value.filter
  if (filter && Array.isArray(filter.conditions)) {
    form.filterLogic = filter.logic
    form.filterRows = filter.conditions.map((c: any) => ({
      column: String(c.column ?? ''),
      op: String(c.op ?? 'eq'),
      source: c.source === 'field' ? 'field' : 'fixed',
      fixedValue: String(c.value ?? c.fixedValue ?? ''),
      field: String(c.field ?? ''),
    }))
  } else {
    form.filterLogic = 'AND'
    form.filterRows = []
  }
}

/** 组件 → 父：组件加载列后，同步 dsColumns（预览）。
 *  列表模式的显示列候选/初始化在数据源 id 变化时联动（避免编辑筛选时被覆盖）。 */
const lastBoundDsId = ref('')
function handleUnifiedColumns(cols: ColumnConfigItem[]) {
  dsColumns.value = cols
  if (isListMode.value && form.dataSourceId && form.dataSourceId !== lastBoundDsId.value) {
    lastBoundDsId.value = form.dataSourceId
    loadTableCandidates().then(() => initTableData())
  }
}

// ==================== 容器按钮配置（formContainer 模式） ====================
const container = reactive({
  showNewButton: true,
  showCancelButton: true,
  showConfirmButton: true,
  showDeleteButton: false,
  showCopyButton: false,
  customButtonsText: '',
})

/** 从 bindingProps 回填容器按钮配置 */
function initContainerConfig(bp: Record<string, any>) {
  container.showNewButton = bp.showNewButton !== false
  container.showCancelButton = bp.showCancelButton !== false
  container.showConfirmButton = bp.showConfirmButton !== false
  container.showDeleteButton = bp.showDeleteButton === true
  container.showCopyButton = bp.showCopyButton === true
  container.customButtonsText = Array.isArray(bp.customButtons)
    ? JSON.stringify(bp.customButtons)
    : ''
}

/** 解析自定义按钮 JSON（非法输入返回空数组） */
function parseCustomButtons(): any[] {
  const text = container.customButtonsText.trim()
  if (!text) return []
  try {
    const arr = JSON.parse(text)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

async function loadDsColumns() {
  dsColumns.value = []
  const binding = props.formDataSources.find(d => d.id === form.dataSourceId)
  if (!binding?.refId) return
  try {
    const res = await dataSourceApi.getMetadata(binding.refId)
    dsColumns.value = res.data?.columns || []
  } catch { /* http 拦截器已提示 */ }
}

async function handleDataSourceChange() {
  form.filterRows = []
  await loadDsColumns()
  if (isListMode.value) {
    await loadTableCandidates()
    initTableData()
  }
}

// ==================== 数据表格配置（显示列/操作/事件） ====================
const tableCandidates = ref<any[]>([])
const tableFilterableKeys = ref<Set<string>>(new Set())
const tableData = reactive({
  /** 是否显示查询栏（默认 false） */
  showSearch: false,
  /** 是否占满父容器高度（默认 false） */
  stretch: false,
  searchFields: [] as { key: string; matchType?: string }[],
  columns: [] as any[],
  /** 组件级可排序字段（受数据源 metadata 上限约束；空=跟随数据源全部可排字段） */
  sortableFields: [] as string[],
  /** 是否显示分页（默认 true） */
  pagination: true,
  /** 默认每页大小（默认 20） */
  pageSize: 20,
  /** 可选每页大小（默认 [10,20,50]） */
  pageSizes: [] as number[],
  actions: { buttons: [
    { key: 'edit', label: '编辑', placement: 'column', style: 'text' },
    { key: 'delete', label: '删除', placement: 'column', style: 'text' },
  ], permissions: '' } as any,
  detail: { width: '800px', type: 'form' } as any,
  events: [] as any[],
  groupBy: '' as string,
  cardMinWidth: 280,
  /** 分组是否可折叠（card 模式，仅 groupBy 生效时才有意义） */
  collapsibleGroups: false,
  /** 卡片操作区位置（card 模式）：top / bottom（默认）/ right */
  actionsPlacement: 'bottom' as 'top' | 'bottom' | 'right',
})

/** 可排序字段候选（数据源 metadata 声明 sortable=true 的列；不可排字段不可配置） */
const tableSortableCandidates = computed(() =>
  tableCandidates.value.filter((c: any) => c.sortable).map((c: any) => ({ key: c.key, label: c.label || c.key })),
)

/** 加载数据源列候选项（显示列 tab 用） */
async function loadTableCandidates() {
  tableCandidates.value = []
  tableFilterableKeys.value = new Set()
  const binding = props.formDataSources.find(d => d.id === form.dataSourceId)
  if (!binding?.refId) return
  try {
    const res = await dataSourceApi.getMetadata(binding.refId)
    const meta = res.data as any
    const cols = (meta?.columns || []).filter((c: any) => !c.hidden)
    tableCandidates.value = cols
    const filterable = cols.filter((c: any) =>
      c.columnType !== 'JSON' && c.columnType !== 'TEXT' &&
      (c.indexed || (c.length != null && c.length <= 64) || c.columnType === 'VARCHAR'),
    )
    tableFilterableKeys.value = new Set(filterable.map((c: any) => c.key))
  } catch {
    tableCandidates.value = []
  }
}

/** 初始化表格配置数据（从 bindingProps 读取） */
function initTableData() {
  const bp = props.bindingProps || {}
  tableData.showSearch = bp.showSearch === true
  tableData.stretch = bp.stretch === true
  tableData.searchFields = bp.searchFields || []
  const srcColumns = (bp.columns && bp.columns.length > 0)
    ? bp.columns
    : tableCandidates.value.map((c: any) => ({ prop: c.key, label: c.label || c.key }))
  tableData.columns = srcColumns.map((c: any) => ({
    ...c,
    key: c.prop ?? c.key,
    label: c.label || c.prop || c.key,
  }))
  // 可排序字段：回填已声明配置；未声明（新组件）默认跟随数据源全部可排字段
  tableData.sortableFields = Array.isArray(bp.sortableFields)
    ? [...bp.sortableFields]
    : tableCandidates.value.filter((c: any) => c.sortable).map((c: any) => c.key)
  // 分页配置：回填已声明配置；未声明使用默认（显示分页 / 20 条 / [10,20,50]）
  tableData.pagination = bp.pagination !== false
  tableData.pageSize = bp.pageSize || 20
  tableData.pageSizes = Array.isArray(bp.pageSizes) && bp.pageSizes.length ? [...bp.pageSizes] : [10, 20, 50]
  tableData.actions = bp.viewActions || { buttons: [
    { key: 'edit', label: '编辑', placement: 'column', style: 'text' },
    { key: 'delete', label: '删除', placement: 'column', style: 'text' },
  ], permissions: '' }
  tableData.detail = bp.viewDetail || { width: '800px', type: 'form' }
  tableData.events = bp.viewEvents || []
  tableData.groupBy = bp.groupBy || ''
  tableData.cardMinWidth = Number(bp.cardMinWidth) > 0 ? Number(bp.cardMinWidth) : 280
  tableData.collapsibleGroups = bp.collapsibleGroups === true
  const placement = bp.actionsPlacement
  tableData.actionsPlacement = placement === 'top' || placement === 'right' ? placement : 'bottom'
}

// ==================== 打开/回填 ====================
watch(() => props.modelValue, async (val) => {
  if (!val) return
  activeTab.value = 'binding'
  const bp = props.bindingProps || {}
  // 回填数据源 + 组件级数据筛选
  form.dataSourceId = bp.dataSourceId || ''
  lastBoundDsId.value = bp.dataSourceId || ''
  const filter = bp.filter
  if (filter && typeof filter === 'object') {
    form.filterLogic = filter.logic || 'AND'
    form.filterRows = (filter.conditions || []).map((c: any) => ({
      column: c.column || '', op: c.op || 'eq', source: c.source || 'fixed',
      fixedValue: c.fixedValue || '', field: c.field || '',
    }))
  } else {
    form.filterLogic = 'AND'
    form.filterRows = []
  }
  await loadDsColumns()
  if (isListMode.value) {
    await loadTableCandidates()
    initTableData()
  } else {
    initContainerConfig(bp)
  }
})

// ==================== 确认 ====================
function handleConfirm() {
  if (!form.dataSourceId) return
  const result: Record<string, any> = { dataSourceId: form.dataSourceId }
  // 组件级数据筛选（表格模式）
  const conditions = form.filterRows.filter(r => r.column).map(r => ({
    column: r.column, op: r.op, source: r.source,
    fixedValue: r.source === 'fixed' ? r.fixedValue : undefined,
    field: r.source === 'field' ? r.field : undefined,
  }))
  if (conditions.length > 0) {
    result.filter = { logic: form.filterLogic, conditions }
  }
  // 列表配置（table/card）
  if (isListMode.value) {
    result.showSearch = tableData.showSearch
    result.stretch = tableData.stretch
    result.searchFields = [...tableData.searchFields]
    result.columns = tableData.columns.map((c: any) => ({
      prop: c.key ?? c.prop,
      label: c.label || c.key,
      width: c.width,
      align: c.align,
      formatter: c.formatter,
      fixed: c.fixed,
      ...(c.contentType !== undefined ? { contentType: c.contentType } : {}),
      ...(c.contentValue !== undefined ? { contentValue: c.contentValue } : {}),
      ...(c.className !== undefined ? { className: c.className } : {}),
      ...(c.styleExpr !== undefined ? { styleExpr: c.styleExpr } : {}),
      ...(c.onCellClick !== undefined ? { onCellClick: c.onCellClick } : {}),
      ...(c.custom !== undefined ? { custom: c.custom } : {}),
      ...(c.hidden !== undefined ? { hidden: c.hidden } : {}),
      // ===== 卡片专属字段（card 模式） =====
      ...(c.role !== undefined ? { role: c.role } : {}),
      ...(c.valueType !== undefined ? { valueType: c.valueType } : {}),
      ...(c.fontFamily !== undefined ? { fontFamily: c.fontFamily } : {}),
      ...(c.fontSize !== undefined ? { fontSize: c.fontSize } : {}),
      ...(c.fontWeight !== undefined ? { fontWeight: c.fontWeight } : {}),
      ...(c.fontColor !== undefined ? { fontColor: c.fontColor } : {}),
      ...(c.showLabel !== undefined ? { showLabel: c.showLabel } : {}),
      ...(c.labelPosition !== undefined ? { labelPosition: c.labelPosition } : {}),
      ...(c.style !== undefined ? { style: c.style } : {}),
    }))
    result.sortableFields = [...tableData.sortableFields]
    result.pagination = tableData.pagination
    result.pageSize = tableData.pageSize
    result.pageSizes = [...tableData.pageSizes]
    result.viewActions = { ...tableData.actions }
    result.viewDetail = { ...tableData.detail }
    result.viewEvents = [...tableData.events]
    if (effectiveListMode.value === 'card') result.groupBy = tableData.groupBy
    if (effectiveListMode.value === 'card') result.cardMinWidth = tableData.cardMinWidth
    if (effectiveListMode.value === 'card') result.collapsibleGroups = tableData.collapsibleGroups
    if (effectiveListMode.value === 'card') result.actionsPlacement = tableData.actionsPlacement
  } else {
    // 容器按钮配置
    result.showNewButton = container.showNewButton
    result.showCancelButton = container.showCancelButton
    result.showConfirmButton = container.showConfirmButton
    result.showDeleteButton = container.showDeleteButton
    result.showCopyButton = container.showCopyButton
    result.customButtons = parseCustomButtons()
  }
  emit('confirm', result)
  visible.value = false
  ElMessage.success(isListMode.value ? '数据源与列表配置已保存' : '数据源配置已保存')
}
</script>

<style scoped>
.form-tip {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}
/* 卡片顶部快捷配置：纵向两行容器。
   el-form 默认 label-width=100px，六项 label+控件合计超宽会触发 flex 换行。
   拆为两行（每行三~四项）：第一行 显示查询栏/撑满/卡片最小宽度，
   第二行 分组字段/分组可折叠/操作区位置。行内统一按内容宽（nowrap 不换行），
   使每行都能在一行内放下。 */
.card-quick-config {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.card-quick-row {
  display: flex;
  flex-wrap: nowrap;
  gap: 12px;
  align-items: center;
}
.card-quick-row .el-form-item {
  margin-bottom: 0;
  min-width: 0;
  /* 去掉 el-form label-width=100px 的固定留白：各项 label 都按内容宽 */
  --el-form-label-width: max-content;
}
.card-quick-row .el-form-item__label {
  white-space: nowrap;
  flex: 0 0 auto;
}
/* label 左对齐：el-form 默认 label 右对齐（element-plus 内联规则 .el-form-item--label-right
   强制 justify-content:flex-end），字数不同的 label 右对齐后文字左边缘错位，
   导致第二行（分组字段/分组可折叠/操作区位置）看起来比第一行缩进。
   label 是 el-form-item 子组件内部元素，须用 :deep 才能命中覆盖。 */
.card-quick-row :deep(.el-form-item__label) {
  justify-content: flex-start;
}
/* 控件允许收缩，确保各项挤进一行 */
.card-quick-row .el-form-item__content {
  flex: 1 1 auto;
  min-width: 0;
}
/* 分组字段下拉：紧凑宽度（随容器可再收缩） */
.card-quick-row .qi-select {
  width: 170px;
}
/* 卡片最小宽度数字：紧凑宽度 */
.card-quick-row .qi-number {
  width: 138px;
}
/* 分页设置：横向流式布局（放不下自动换行） */
.pagination-config {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;
}
.pagination-config .el-form-item {
  margin-bottom: 0;
}
/* label 文字 + 问号提示图标：flex 垂直居中；align-self:center 在 el-form-item__label（默认 align-items:flex-start）内垂直居中，与右侧开关对齐 */
.label-with-tip {
  display: inline-flex;
  align-items: center;
  align-self: center;
  line-height: 1;
}
.label-with-tip .tip-icon {
  margin-left: 4px;
  color: #909399;
  cursor: help;
}
/* 数据容器配置：label 独占一行并左对齐，控件占满下一行 */
.container-form :deep(.el-form-item__label) {
  display: flex;
  justify-content: flex-start;
  width: 100%;
  text-align: left;
}
.container-form :deep(.el-form-item__content) {
  width: 100%;
  margin-left: 0 !important;
}
.container-button-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
}
.container-button-grid :deep(.el-form-item) {
  min-width: 0;
  margin-bottom: 0;
}
.container-button-grid :deep(.el-form-item__label) {
  white-space: nowrap;
}
</style>
