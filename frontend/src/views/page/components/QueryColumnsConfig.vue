<template>
  <div class="query-columns-config">
    <div class="config-header">
      <span class="config-title">{{ showSearch ? '字段配置（显示 & 查询）' : '字段配置（显示）' }}</span>
      <span class="config-hint">{{ showSearch ? `已选查询 ${searchFields.length} 项 · ` : '' }}显示 {{ columns.length }} 项</span>
      <el-button link type="primary" :icon="Plus" @click="openCustomColumn">添加自定义列</el-button>
    </div>

    <!-- 可排序字段（视图级收窄；候选受数据源 metadata 上限约束） -->
    <div v-if="sortableCandidates && sortableCandidates.length" class="sortable-config">
      <span class="config-title">
        可排序字段
        <el-tooltip content="排序入口仅对勾选字段开放；数据源不可排字段不可配置" placement="top">
          <el-icon class="config-tip-icon"><QuestionFilled /></el-icon>
        </el-tooltip>
      </span>
      <el-select
        :model-value="sortableFields || []"
        multiple
        clearable
        placeholder="跟随数据源全部可排字段"
        style="width: 100%"
        @change="(v: string[]) => emit('update:sortableFields', v)"
      >
        <el-option v-for="c in sortableCandidates" :key="c.key" :label="c.label" :value="c.key" />
      </el-select>
    </div>

    <!-- 字段列表（整行可拖拽排序：已勾选展示字段的顺序随拖拽调整） -->
    <div ref="tableWrapperRef">
    <el-table :data="displayCandidates" border max-height="460">
      <el-table-column prop="key" label="字段" width="130" />
      <el-table-column prop="label" label="标题" min-width="110" />

      <!-- 查询条件（showSearch=false 时隐藏） -->
      <template v-if="showSearch">
        <el-table-column label="查询" width="62" align="center">
          <template #default="{ row }">
            <el-checkbox
              :model-value="isSearchChecked(row.key)"
              :disabled="!isFilterable(row.key)"
              @change="(v: any) => toggleSearch(row, !!v)"
            />
          </template>
        </el-table-column>
        <el-table-column label="匹配方式" width="107">
          <template #default="{ row }">
            <el-select
              v-if="isSearchChecked(row.key)"
              :model-value="searchMatchTypeOf(row.key)"
              style="width: 77px"
              @change="(v: any) => setSearchMatchType(row.key, v)"
            >
              <el-option
                v-for="opt in matchOptions(row)"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
      </template>

      <!-- 展示列 -->
      <el-table-column label="展示" width="62" align="center">
        <template #default="{ row }">
          <el-checkbox
            :model-value="isColumnChecked(row.key)"
            @change="(v: any) => toggleColumn(row, !!v)"
          />
        </template>
      </el-table-column>
      <el-table-column label="宽度" width="139">
        <template #default="{ row }">
          <el-input-number
            v-if="isColumnChecked(row.key)"
            :model-value="columnWidthOf(row.key)"
            :min="50"
            :max="600"
            :step="10"
            style="width: 109px"
            @change="(v: any) => setColumnProp(row.key, 'width', v)"
          />
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="对齐" width="122">
        <template #default="{ row }">
          <el-select
            v-if="isColumnChecked(row.key)"
            :model-value="columnAlignOf(row.key)"
            style="width: 92px"
            @change="(v: any) => setColumnProp(row.key, 'align', v)"
          >
            <el-option label="左对齐" value="left" />
            <el-option label="居中" value="center" />
            <el-option label="右对齐" value="right" />
          </el-select>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="格式化" width="136">
        <template #default="{ row }">
          <el-select
            v-if="isColumnChecked(row.key)"
            :model-value="columnFormatterOf(row.key)"
            clearable
            style="width: 106px"
            placeholder="无"
            @change="(v: any) => setColumnProp(row.key, 'formatter', v || undefined)"
          >
            <el-option label="货币" value="currency" />
            <el-option label="日期" value="date" />
            <el-option label="日期时间" value="datetime" />
            <el-option label="布尔" value="boolean" />
            <el-option label="枚举" value="enum" />
          </el-select>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="固定列" width="109">
        <template #default="{ row }">
          <el-select
            v-if="isColumnChecked(row.key)"
            :model-value="columnFixedOf(row.key)"
            clearable
            style="width: 79px"
            placeholder="无"
            @change="(v: any) => setColumnProp(row.key, 'fixed', v || undefined)"
          >
            <el-option label="左侧" value="left" />
            <el-option label="右侧" value="right" />
          </el-select>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="高级" width="90" align="center">
        <template #default="{ row }">
          <el-button
            v-if="isColumnChecked(row.key)"
            link
            type="primary"
            @click="mode === 'card' ? openCardAdvanced(row.key) : openAdvanced(row.key)"
          >
            高级配置
          </el-button>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="" width="48" align="center">
        <template #default="{ row }">
          <el-button
            v-if="isCustomColumn(row.key)"
            link
            type="danger"
            :icon="Delete"
            title="删除自定义列"
            @click="removeCustomColumn(row.key)"
          />
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
    </el-table>
    </div>

    <el-empty v-if="displayCandidates.length === 0" description="当前表单无可配置字段" :image-size="60" />

    <!-- 列高级配置子面板 -->
    <ColumnAdvancedConfig
      :visible="advancedVisible"
      :column="advancedColumn"
      @update:visible="advancedVisible = $event"
      @save="saveAdvanced"
    />
    <CardColumnAdvancedConfig
      v-if="mode === 'card'"
      class="card-advanced-config"
      :visible="cardAdvancedVisible"
      :column="cardAdvancedColumn"
      @update:visible="cardAdvancedVisible = $event"
      @save="saveCardAdvanced"
    />

    <!-- 添加自定义列弹窗 -->
    <el-dialog v-model="customVisible" title="添加自定义列" width="460px" :close-on-click-modal="false">
      <el-form label-width="90px">
        <el-form-item required :error="customKeyError || undefined">
          <template #label>
            <span class="label-with-tip">
              列标识
              <el-tooltip content="自定义列的列标识不必是数据源字段；添加后点击该列「高级配置」，配置模板/表达式即可生成计算列。" placement="top">
                <el-icon class="tip-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </span>
          </template>
          <el-input v-model="customKey" placeholder="任意标识（不必是数据字段），如 total" />
        </el-form-item>
        <el-form-item label="列标题">
          <el-input v-model="customLabel" placeholder="可选，缺省用 key，如 合计" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="customVisible = false">取消</el-button>
        <el-button type="primary" @click="addCustomColumn">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import Sortable from 'sortablejs'
import { Plus, QuestionFilled, Delete } from '@element-plus/icons-vue'
import ColumnAdvancedConfig from './ColumnAdvancedConfig.vue'
import CardColumnAdvancedConfig from './CardColumnAdvancedConfig.vue'
import type { ColumnConfigItem } from '@/api/bizData'
import type { SearchFieldConfig, ColumnViewConfig } from '../ViewDesigner.vue'

const props = withDefaults(defineProps<{
  candidates: ColumnConfigItem[]
  searchFields: SearchFieldConfig[]
  columns: ColumnViewConfig[]
  /** 可筛选列 key 集合（查询条件勾选禁用依据；缺省全部可勾选） */
  filterableKeys?: Set<string>
  /** 是否显示查询条件配置（默认 true；PageDesigner 数据表格场景设为 false） */
  showSearch?: boolean
  /** 视图级可排序字段（schema.sortableFields；缺省=跟随数据源全部可排字段） */
  sortableFields?: string[]
  /** 可排序字段候选（数据源 metadata 声明 sortable=true 的列；不可排字段不出现） */
  sortableCandidates?: { key: string; label: string }[]
  mode?: 'table' | 'card'
}>(), {
  showSearch: true,
  mode: 'table',
})

const emit = defineEmits<{
  (e: 'update:searchFields', v: SearchFieldConfig[]): void
  (e: 'update:columns', v: ColumnViewConfig[]): void
  (e: 'update:sortableFields', v: string[]): void
}>()

// ========== 自定义列（派生自 columns 中非数据源字段的列） ==========
/** 是否为自定义列（key 不在数据源候选列表中） */
function isCustomColumn(key: string): boolean {
  return !props.candidates.some((c) => c.key === key)
}

/** 下方字段列表数据源 = 数据源字段候选 + 自定义列（计算列），自定义列参与展示/排序/编辑/删除 */
const displayCandidates = computed<ColumnConfigItem[]>(() => {
  const candKeys = new Set(props.candidates.map((c) => c.key))
  const customs: ColumnConfigItem[] = props.columns
    .filter((c) => !candKeys.has(c.key))
    .map((c) => ({
      key: c.key,
      label: c.label,
      columnType: 'VARCHAR',
      length: null,
      scale: null,
      required: false,
      unique: false,
      indexed: false,
      hidden: false,
    }))
  return [...props.candidates, ...customs]
})

// ========== 字段列表整行拖拽排序 ==========
const tableWrapperRef = ref<HTMLElement>()
let fieldSortable: Sortable | null = null

/** 初始化字段表格行拖拽：拖拽后按新顺序重排已勾选展示字段（columns） */
function initFieldSortable() {
  nextTick(() => {
    if (fieldSortable) {
      fieldSortable.destroy()
      fieldSortable = null
    }
    const tbody = tableWrapperRef.value?.querySelector('.el-table__body-wrapper tbody')
    if (!tbody) return
    fieldSortable = Sortable.create(tbody as HTMLElement, {
      animation: 150,
      onEnd: (evt: any) => {
        const oldIndex = evt.oldIndex
        const newIndex = evt.newIndex
        if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return
        // 重排候选副本（模拟 DOM 新顺序），已勾选展示字段按新顺序重排 columns
        const cands = [...displayCandidates.value]
        const [moved] = cands.splice(oldIndex, 1)
        cands.splice(newIndex, 0, moved)
        const cols = props.columns
        const newCols = cands
          .filter((c) => cols.some((x) => x.key === c.key))
          .map((c) => cols.find((x) => x.key === c.key) as ColumnViewConfig)
        const same = newCols.length === cols.length && newCols.every((c, i) => c.key === cols[i].key)
        if (!same) emit('update:columns', newCols)
      },
    })
  })
}

onMounted(initFieldSortable)
// 候选字段变化（数据源切换）后重新绑定
watch(() => props.candidates.length, initFieldSortable)

// ========== 查询条件 ==========
/** 字段是否可作查询条件（filterableKeys 未配置时全部允许；自定义计算列不可作为查询条件） */
function isFilterable(key: string): boolean {
  if (isCustomColumn(key)) return false
  return props.filterableKeys ? props.filterableKeys.has(key) : true
}

function isSearchChecked(key: string): boolean {
  return props.searchFields.some((f) => f.key === key)
}

function searchMatchTypeOf(key: string): string {
  return props.searchFields.find((f) => f.key === key)?.matchType || 'eq'
}

/** 该列 matchType 选项：文本 eq/like；数字/日期 eq/range */
function matchOptions(col: ColumnConfigItem): { label: string; value: string }[] {
  if (col.columnType === 'INT' || col.columnType === 'DECIMAL'
      || col.columnType === 'DATE' || col.columnType === 'DATETIME') {
    return [
      { label: '等值', value: 'eq' },
      { label: '范围', value: 'range' },
    ]
  }
  return [
    { label: '等值', value: 'eq' },
    { label: '模糊', value: 'like' },
  ]
}

function defaultMatchType(col: ColumnConfigItem): string {
  return matchOptions(col)[0].value
}

function toggleSearch(col: ColumnConfigItem, checked: boolean) {
  // 不可筛选列（filterableKeys 之外）不允许作为查询条件
  if (checked && !isFilterable(col.key)) return
  if (checked) {
    if (!isSearchChecked(col.key)) {
      emit('update:searchFields', [
        ...props.searchFields,
        { key: col.key, label: col.label, matchType: defaultMatchType(col) },
      ])
    }
  } else {
    emit('update:searchFields', props.searchFields.filter((f) => f.key !== col.key))
  }
}

function setSearchMatchType(key: string, v: string) {
  emit(
    'update:searchFields',
    props.searchFields.map((f) => (f.key === key ? { ...f, matchType: v } : f)),
  )
}

// ========== 展示列 ==========
function isColumnChecked(key: string): boolean {
  const col = findColumn(key)
  // 自定义列：列始终保留在 columns，展示开关 = !hidden（取消展示仅隐藏，不删除）
  if (isCustomColumn(key)) return col ? !col.hidden : false
  // 数据源列：展示 = 在 columns 中
  return !!col
}

function findColumn(key: string): ColumnViewConfig | undefined {
  return props.columns.find((c) => c.key === key)
}

function columnWidthOf(key: string): number {
  return findColumn(key)?.width ?? 130
}

function columnAlignOf(key: string): string {
  return findColumn(key)?.align ?? 'left'
}

function columnFormatterOf(key: string): string {
  return findColumn(key)?.formatter ?? ''
}

function columnFixedOf(key: string): string {
  return findColumn(key)?.fixed ?? ''
}

function toggleColumn(col: ColumnConfigItem, checked: boolean) {
  // 自定义列：切换展示开关（hidden），保留列定义与高级配置；彻底删除仅通过删除按钮
  if (isCustomColumn(col.key)) {
    emit('update:columns', props.columns.map((c) =>
      c.key === col.key ? { ...c, hidden: !checked } : c,
    ))
    return
  }
  // 数据源列：在不在 columns 决定是否展示
  if (checked) {
    if (!isColumnChecked(col.key)) {
      emit('update:columns', [
        ...props.columns,
        { key: col.key, label: col.label, width: 130, align: 'left' },
      ])
    }
  } else {
    emit('update:columns', props.columns.filter((c) => c.key !== col.key))
  }
}

function setColumnProp(key: string, prop: 'width' | 'align' | 'formatter' | 'fixed', v: any) {
  emit(
    'update:columns',
    props.columns.map((c) => (c.key === key ? { ...c, [prop]: v } : c)),
  )
}

// ========== 列高级配置子面板 ==========
const advancedVisible = ref(false)
/** 当前正在编辑高级配置的列副本 */
const advancedColumn = ref<ColumnViewConfig | null>(null)
type CardColumnConfig = ColumnViewConfig & {
  role?: string
  valueType?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: string | number
  fontColor?: string
  showLabel?: boolean
  labelPosition?: 'left' | 'right' | 'top'
  style?: string
}
const cardAdvancedVisible = ref(false)
const cardAdvancedColumn = ref<CardColumnConfig | null>(null)

function openAdvanced(key: string) {
  const col = findColumn(key)
  if (!col) return
  // 传入副本，避免编辑期间污染 props
  advancedColumn.value = {
    ...col,
    onCellClick: col.onCellClick
      ? { actions: ((col.onCellClick as any).actions || []).map((a: any) => ({ ...a, params: [...(a.params || [])] })) }
      : undefined,
  }
  advancedVisible.value = true
}

function openCardAdvanced(key: string) {
  const col = findColumn(key)
  if (!col) return
  cardAdvancedColumn.value = { ...col }
  cardAdvancedVisible.value = true
}

function saveAdvanced(updated: ColumnViewConfig) {
  const col = findColumn(updated.key)
  if (!col) return
  const next = props.columns.map((c) =>
    c.key === updated.key ? { ...c, ...pickAdvanced(updated) } : c,
  )
  emit('update:columns', next)
}

function saveCardAdvanced(updated: CardColumnConfig) {
  const col = findColumn(updated.key)
  if (!col) return
  emit('update:columns', props.columns.map((c) =>
    c.key === updated.key ? { ...c, ...pickCardAdvanced(updated) } : c,
  ))
}

function pickCardAdvanced(c: CardColumnConfig): Partial<CardColumnConfig> {
  return {
    ...(c.role !== undefined ? { role: c.role } : {}),
    ...(c.align !== undefined ? { align: c.align } : {}),
    ...(c.valueType !== undefined ? { valueType: c.valueType } : {}),
    ...(c.fontFamily !== undefined ? { fontFamily: c.fontFamily } : {}),
    ...(c.fontSize !== undefined ? { fontSize: c.fontSize } : {}),
    ...(c.fontWeight !== undefined ? { fontWeight: c.fontWeight } : {}),
    ...(c.fontColor !== undefined ? { fontColor: c.fontColor } : {}),
    ...(c.showLabel !== undefined ? { showLabel: c.showLabel } : {}),
    ...(c.labelPosition !== undefined ? { labelPosition: c.labelPosition } : {}),
    ...(c.style !== undefined ? { style: c.style } : {}),
  }
}

/** 仅取高级配置相关字段写回，避免覆盖 width/align/fixed 等基础字段 */
function pickAdvanced(c: ColumnViewConfig): Partial<ColumnViewConfig> {
  return {
    ...(c.contentType !== undefined ? { contentType: c.contentType } : {}),
    ...(c.contentValue !== undefined ? { contentValue: c.contentValue } : {}),
    ...(c.template !== undefined ? { template: c.template } : {}),
    ...(c.expression !== undefined ? { expression: c.expression } : {}),
    ...(c.className !== undefined ? { className: c.className } : {}),
    ...(c.styleExpr !== undefined ? { styleExpr: c.styleExpr } : {}),
    ...(c.onCellClick !== undefined ? { onCellClick: c.onCellClick } : {}),
  }
}

// ========== 添加自定义列 ==========
const customVisible = ref(false)
const customKey = ref('')
const customLabel = ref('')
/** 添加校验错误提示（key 为空 / 与既有列重复） */
const customKeyError = ref('')

function openCustomColumn() {
  customKey.value = ''
  customLabel.value = ''
  customKeyError.value = ''
  customVisible.value = true
}

function addCustomColumn() {
  const key = customKey.value.trim()
  if (!key) {
    customKeyError.value = '列标识不能为空'
    return
  }
  if (props.columns.some((c) => c.key === key)) {
    customKeyError.value = `列「${key}」已存在`
    return
  }
  emit('update:columns', [
    ...props.columns,
    { key, label: customLabel.value.trim() || key, width: 130, align: 'left', custom: true },
  ])
  customKeyError.value = ''
  customVisible.value = false
}

/** 删除自定义列：从展示列移除，并同步移除其查询条件（若有） */
function removeCustomColumn(key: string) {
  emit('update:columns', props.columns.filter((c) => c.key !== key))
  emit('update:searchFields', props.searchFields.filter((f) => f.key !== key))
}
</script>

<style scoped>
.config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.config-title {
  font-weight: bold;
}
.config-hint {
  font-size: 14px;
  color: #909399;
}
.sortable-config {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  background: #fafafa;
}
.sortable-config .config-title {
  flex-shrink: 0;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  line-height: 1;
}
.config-tip-icon {
  margin-left: 4px;
  color: #909399;
  cursor: help;
}
.label-with-tip {
  display: inline-flex;
  align-items: center;
  align-self: center;
  line-height: 1;
}
.tip-icon {
  margin-left: 4px;
  color: #909399;
  cursor: help;
}
.muted {
  color: #c0c4cc;
}
</style>
