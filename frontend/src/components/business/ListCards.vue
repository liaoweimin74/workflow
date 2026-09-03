<template>
  <div class="list-cards" :class="{ 'is-loading': loading }">
    <el-card v-if="showSearch" class="search-card card-search" shadow="never">
      <el-form :inline="true" :model="query" @submit.prevent="handleSearch">
        <el-form-item v-for="field in searchFields" :key="field.prop" :label="field.label">
          <el-input
            v-model="query[field.prop]"
            :placeholder="field.placeholder || field.label"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
<!-- 加载中骨架屏 -->
    <div v-if="loading" class="loading-skeleton">
      <el-skeleton :paragraph="{ rows: 3 }" active :grid="skeletonGrid">
        <template #image>
          <el-skeleton-item variant="rect" width="100%" height="180" />
        </template>
      </el-skeleton>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="error-state">
      <el-icon :size="48" style="color: #ff4d4f"><Warning /></el-icon>
      <div class="error-message">{{ error }}</div>
      <el-button v-if="!designMode" type="primary" @click="retry" class="retry-btn">重试</el-button>
    </div>

    <!-- 空状态 -->
    <div v-else-if="total === 0 && rows.length === 0" class="empty-state">
      <el-empty description="暂无数据" />
      <el-button v-if="!designMode" type="primary" @click="retry" class="retry-btn">重试</el-button>
    </div>

    <!-- 卡片网格渲染 -->
    <div v-else class="card-groups">
      <section v-for="group in groupedRows" :key="group.key" class="card-group">
        <div v-if="groupBy" class="card-group-title" :class="{ 'is-collapsible': collapsibleGroups, 'is-collapsed': collapsibleGroups && !isGroupExpanded(group.key) }" @click="collapsibleGroups && toggleGroup(group.key)">
          <span class="card-group-title-text">{{ group.label }}</span>
<span v-if="collapsibleGroups" class="card-group-toggle">
            <el-icon :class="{ 'is-collapsed-icon': !expandedGroups[group.key] }"><ArrowDown /></el-icon>
          </span>
        </div>
        <div v-show="!(groupBy && collapsibleGroups && !isGroupExpanded(group.key))" class="card-grid" :style="gridStyle">
          <div v-for="row in group.rows" :key="row.id || row._index" class="card-item" :class="`actions-placement-${actionsPlacement}`" @click="handleCardClick(row)">
        <div class="card-content">
        <div v-if="hasRoleTitle" class="card-title" :style="columnStyle(titleColumn)">{{ formatValue(row, titleColumn) }}</div>
        <div v-if="hasRoleSubtitle" class="card-subtitle" :style="columnStyle(subtitleColumn)">{{ formatValue(row, subtitleColumn) }}</div>
        <div v-if="hasRoleTag" class="card-tags">
          <el-tag :type="getTagType(row, tagColumn?.tagConfig)" :style="columnStyle(tagColumn)">{{ formatValue(row, tagColumn) }}</el-tag>
        </div>
        <div class="card-fields">
          <div v-for="col in visibleColumns" :key="col.prop" :class="['card-field', `card-field-${col.prop}`, `label-position-${col.labelPosition || 'left'}`]" :style="fieldStyle(col)">
            <span v-if="col.showLabel !== false" class="field-label" :style="columnStyle(col)">{{ col.label }}</span>
            <span class="field-value" :style="columnStyle(col)">{{ formatValue(row, col) }}</span>
          </div>
        </div>
        <div v-if="hasRoleMetric" class="card-metric" :style="columnStyle(metricColumn)">{{ formatValue(row, metricColumn) }}</div>
        </div>
        <div v-if="actions.length > 0" class="card-actions" :style="actionsPlacement === 'right' ? 'flex-direction: column' : undefined">
          <template v-for="action in actions" :key="action.key">
            <!-- icon 形态：仅图标的圆形按钮，hover 显示 label -->
            <el-tooltip v-if="action.style === 'icon'" :content="action.label" placement="top" :show-after="200">
              <el-button
                :class="`card-action-${action.key}`"
                :type="action.type"
                size="small"
                circle
                @click.stop="handleActionClick(action, row)"
              >
                <el-icon><component :is="getIcon(action.icon, action.key)" /></el-icon>
              </el-button>
            </el-tooltip>
            <!-- text 形态：文字链接按钮 -->
            <el-button
              v-else-if="action.style === 'text'"
              :class="`card-action-${action.key}`"
              :type="action.type"
              size="small"
              link
              @click.stop="handleActionClick(action, row)"
            >
              <el-icon v-if="action.icon" style="margin-right: 4px"><component :is="getIcon(action.icon, action.key)" /></el-icon>
              {{ action.label }}
            </el-button>
            <!-- button 形态（默认）：带图标+文字按钮 -->
            <el-button
              v-else
              :class="`card-action-${action.key}`"
              :type="action.type"
              size="small"
              @click.stop="handleActionClick(action, row)"
            >
              <el-icon v-if="action.icon" style="margin-right: 6px"><component :is="getIcon(action.icon, action.key)" /></el-icon>
              {{ action.label }}
            </el-button>
          </template>
        </div>
          </div>
        </div>
      </section>
    </div>
    <el-pagination
      v-if="showPagination"
      class="card-pagination"
      :current-page="query.page"
      :page-size="query.size"
      :total="total"
      :page-sizes="pageSizes"
      layout="total, sizes, prev, pager, next"
      @current-change="handlePageChange"
      @size-change="handlePageSizeChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import {
  Warning, Plus, Edit, Delete, View, Search, Refresh, Upload, Download,
  Document, Printer, Setting, Check, Close, Star, Collection, Message, Bell, User, Lock, Unlock, ArrowDown,
} from '@element-plus/icons-vue'
import type { CardColumn, ListQueryParams, ListPageResult, SearchField } from './types'
import { renderCellContent } from '@/utils/tableColumnRenderer'

interface ListCardsProps {
  fetchApi: (params: ListQueryParams) => Promise<ListPageResult>
  columns: CardColumn[]
  cardMinWidth?: number | string
  defaultPageSize?: number
  searchFields?: SearchField[]
  showSearch?: boolean
  pageSizes?: number[]
  showPagination?: boolean
  designMode?: boolean
  /** 操作按钮（style 控制形态：button=带图标+文字 / icon=仅图标圆形 / text=文字链接） */
  actions?: Array<{
    key: string
    label: string
    style?: 'button' | 'icon' | 'text'
    icon?: string
    type?: string
    placement?: string
  }>
  groupBy?: string
  /** 分组是否可折叠（仅 groupBy 生效时才有意义；默认展开） */
  collapsibleGroups?: boolean
  /** 卡片操作区位置：top=内容上方 / bottom=内容下方（默认）/ right=内容右侧纵向排列 */
  actionsPlacement?: 'top' | 'bottom' | 'right'
}

const props = withDefaults(defineProps<ListCardsProps>(), {
  defaultPageSize: 10,
  searchFields: () => [],
  showSearch: false,
  pageSizes: () => [10, 20, 50],
  cardMinWidth: 200,
  showPagination: true,
  designMode: false,
  actions: () => [],
  collapsibleGroups: false,
  actionsPlacement: 'bottom',
})

const emit = defineEmits<{
  'row-click': [row: any]
  refresh: []
  'action-click': [action: { key: string; label: string }, row: any]
}>()

const loading = ref(false)
const rows = ref<any[]>([])
const total = ref(0)
const error = ref<string | null>(null)
let requestId = 0

const query = reactive<ListQueryParams>({ page: 1, size: props.defaultPageSize })
const searchFields = computed(() => props.searchFields.filter((field) => Boolean(field.prop)))
const showSearch = computed(() => props.showSearch && searchFields.value.length > 0)
const initialQuery = computed(() => Object.fromEntries([
  ['page', 1],
  ['size', props.defaultPageSize],
  ...searchFields.value
    .filter((field) => field.defaultValue !== undefined)
    .map((field) => [field.prop, field.defaultValue]),
]))
const actions = computed(() => props.actions)

// ===== 操作按钮图标 =====
/** 图标名 → 组件（对齐 ActionsConfig.iconOptions / PageDataTable） */
const iconMap: Record<string, any> = {
  Plus, Edit, Delete, View, Search, Refresh, Upload, Download, Document,
  Printer, Setting, Check, Close, Star, Collection, Message, Bell, User, Lock, Unlock,
}
/** 内置按钮默认图标名（PascalCase，对齐 ActionsConfig.iconOptions value） */
const BUILTIN_ICONS: Record<string, string> = { create: 'Plus', edit: 'Edit', delete: 'Delete', view: 'View' }
function getIcon(name?: string, key?: string): any {
  const resolved = name || (key ? BUILTIN_ICONS[key] : undefined)
  return resolved ? iconMap[resolved] : Edit
}
const groupedRows = computed(() => {
  if (!props.groupBy) return [{ key: '__all__', label: '', rows: rows.value }]
  const groups = new Map<string, any[]>()
  for (const row of rows.value) {
    const key = String(row?.[props.groupBy] ?? 'uncategorized')
    const group = groups.get(key) || []
    group.push(row)
    groups.set(key, group)
  }
  return Array.from(groups, ([key, grouped]) => ({ key, label: key === 'uncategorized' ? '未分类' : key, rows: grouped }))
})
/** 分组折叠状态（key → 是否展开；collapsibleGroups 开启时生效，默认全展开） */
const expandedGroups = reactive<Record<string, boolean>>({})
function isGroupExpanded(key: string): boolean {
  return expandedGroups[key] !== false
}
function toggleGroup(key: string) {
  expandedGroups[key] = !isGroupExpanded(key)
}
const titleColumn = computed(() => props.columns.find(c => c.role === 'title'))
const subtitleColumn = computed(() => props.columns.find(c => c.role === 'subtitle'))
const tagColumn = computed(() => props.columns.find(c => c.role === 'tag'))
const metricColumn = computed(() => props.columns.find(c => c.role === 'metric'))
const hasRoleTitle = computed(() => !!titleColumn.value)
const hasRoleSubtitle = computed(() => !!subtitleColumn.value)
const hasRoleTag = computed(() => !!tagColumn.value)
const hasRoleMetric = computed(() => !!metricColumn.value)

const visibleColumns = computed(() =>
  props.columns.filter(c => !c.hidden && !['title', 'subtitle', 'tag', 'metric'].includes(c.role))
)

const skeletonGrid = computed(() => ({
  columns: `repeat(auto-fill, minmax(${props.cardMinWidth}px, 1fr))`,
  gap: 16,
}))

const gridStyle = computed(() => ({
  'grid-template-columns': `repeat(auto-fill, minmax(min(${props.cardMinWidth}px, 100%), 1fr))`,
  gap: '16px',
}))

function getTagType(row: any, tagConfig?: any): string {
  if (tagConfig?.type) return tagConfig.type
  const value = row[tagColumn.value?.prop]
  if (['active', 'yes', 'success'].includes(value?.toString())) return 'success'
  if (['pending', 'warning'].includes(value?.toString())) return 'warning'
  if (['error', 'fail', 'danger'].includes(value?.toString())) return 'danger'
  return 'default'
}

function formatValue(row: any, column: CardColumn): string {
  const value = row?.[column.prop]
  if (column.formatter) return column.formatter(row, column, value) ?? ''
  // 列含内容配置（模板/表达式）时统一走 renderCellContent，保证页面卡片与视图卡片渲染一致
  if (hasCellContent(column)) {
    return renderCellContent({
      key: column.prop,
      contentType: column.contentType,
      contentValue: column.contentValue,
      expression: column.expression,
      template: column.template,
    }, row)
  }
  return column.valueType === 'date' && value ? new Date(value).toLocaleDateString() : value ?? ''
}

/** 是否有内容配置（对齐 PageRenderer.cardColumns 的 hasContent 判断） */
function hasCellContent(column: CardColumn): boolean {
  return !!((column.contentType && column.contentValue) || column.expression || column.template || column.formatter)
}

async function fetchData(params?: Partial<ListQueryParams>) {
  loading.value = true
  error.value = null
  const reqId = ++requestId
  try {
    const result = await props.fetchApi({ ...query, ...params } as ListQueryParams)
    if (reqId === requestId) {
      rows.value = result.rows ?? []
      total.value = result.total ?? 0
    }
  } catch (e) {
    if (reqId === requestId) {
      error.value = (e as Error)?.message ?? '加载失败'
      rows.value = []
      total.value = 0
    }
  } finally {
    if (reqId === requestId) loading.value = false
  }
}

function handleCardClick(row: any) { emit('row-click', row) }
function handleActionClick(action: { key: string; label: string }, row: any) {
  emit('action-click', action, row)
}
function columnStyle(column: CardColumn | undefined): Record<string, string> {
  if (!column) return {}
  return {
    ...(column.fontFamily ? { fontFamily: column.fontFamily } : {}),
    ...(column.fontSize ? { fontSize: `${column.fontSize}px` } : {}),
    ...(column.fontWeight ? { fontWeight: String(column.fontWeight) } : {}),
    ...(column.fontColor ? { color: column.fontColor } : {}),
    ...(column.style ? parseStyle(column.style) : {}),
  }
}
function fieldStyle(column: CardColumn): Record<string, string> {
  return column.align ? { textAlign: column.align } : {}
}
function parseStyle(style: string): Record<string, string> {
  return Object.fromEntries(style.split(';').map((entry) => entry.trim().split(':')).filter((parts) => parts.length === 2 && parts[0] && parts[1]).map(([key, value]) => [key.trim().replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value.trim()]))
}
function handlePageChange(page: number) {
  query.page = page
  fetchData()
}
function handlePageSizeChange(size: number) {
  query.size = size
  query.page = 1
  fetchData()
}
function handleSearch() {
  query.page = 1
  fetchData()
}
function handleReset() {
  for (const key of Object.keys(query)) delete query[key]
  Object.assign(query, initialQuery.value)
  fetchData()
}
function retry() { error.value = null; fetchData() }
function refresh() { emit('refresh'); fetchData() }

onMounted(() => {
  Object.assign(query, initialQuery.value)
  fetchData()
})
defineExpose({ fetchData, refresh, retry })
</script>

<style scoped>
.list-cards { width: 100%; height: 100%; min-width: 0; display: flex; flex-direction: column; }
.is-loading { opacity: 0.6; }
.card-groups { flex: 1; min-height: 0; overflow-y: auto; padding: 16px; }
.card-group + .card-group { margin-top: 24px; }
.card-group-title { margin-bottom: 12px; font-size: 15px; font-weight: 600; color: #303133; }
.card-group-title.is-collapsible { cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none; }
.card-group-toggle { display: inline-flex; align-items: center; justify-content: center; color: #909399; }
.card-group-toggle .el-icon { transition: transform 0.2s; }
.card-group-title.is-collapsed .card-group-toggle .el-icon { transform: rotate(-90deg); }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); gap: 16px; }
.card-item { background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); cursor: pointer; min-height: 120px; display: flex; flex-direction: column; }
.card-item:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); transform: translateY(-1px); }
/* 卡片内容主体：flex column 下占据弹性空间 */
.card-content { flex: 1; min-width: 0; }
/* 操作区：bottom 时在内容下方（默认，order 2） */
.card-item .card-actions { order: 2; margin-top: 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
/* 操作区在顶部：order 0，位于内容上方 */
.card-item.actions-placement-top .card-actions { order: 0; margin-top: 0; margin-bottom: 12px; }
.card-item.actions-placement-top .card-content { order: 1; }
/* 操作区在右侧：整卡横向布局，内容在左、操作区纵向排列在右 */
.card-item.actions-placement-right { flex-direction: row; align-items: stretch; }
.card-item.actions-placement-right .card-content { order: 0; flex: 1; }
.card-item.actions-placement-right .card-actions { order: 1; margin-top: 0; margin-left: 12px; flex-direction: column; align-items: flex-end; gap: 8px; }
.card-title { font-size: 16px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.card-subtitle { font-size: 14px; color: #909399; margin-bottom: 12px; }
.card-tags { margin-bottom: 12px; }
.card-fields { margin-bottom: 12px; }
.card-metric { font-size: 18px; font-weight: 600; color: #409eff; margin-top: 8px; }
.card-field { margin-bottom: 8px; }
.card-field.label-position-left,
.card-field.label-position-right { display: flex; align-items: baseline; gap: 8px; }
.card-field.label-position-right { justify-content: flex-end; }
.card-field.label-position-top { display: block; }
.field-label { display: block; font-size: 12px; color: #909399; margin-bottom: 4px; }
.field-value { font-size: 14px; color: #303133; }
.error-state { display: flex; flex-direction: row; align-items: center; justify-content: center; padding: 40px 20px; }
.error-message { color: #909399; margin: 0 12px; }
.retry-btn { min-width: 100px; }
</style>
