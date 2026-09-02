<template>
  <div class="list-cards" :class="{ 'is-loading': loading }">
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
        <div v-if="groupBy" class="card-group-title">{{ group.label }}</div>
        <div class="card-grid" :style="gridStyle">
          <div v-for="row in group.rows" :key="row.id || row._index" class="card-item" @click="handleCardClick(row)">
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
        <div v-if="actions.length > 0" class="card-actions">
          <el-button
            v-for="action in actions"
            :key="action.key"
            :class="`card-action-${action.key}`"
            size="small"
            @click.stop="handleActionClick(action, row)"
          >
            {{ action.label }}
          </el-button>
        </div>
          </div>
        </div>
      </section>
    </div>
    <el-pagination
      v-if="showPagination && total > 0"
      class="card-pagination"
      :current-page="query.page"
      :page-size="query.size"
      :total="total"
      layout="prev, pager, next"
      @current-change="handlePageChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Warning } from '@element-plus/icons-vue'
import type { CardColumn, ListQueryParams, ListPageResult } from './types'

interface ListCardsProps {
  fetchApi: (params: ListQueryParams) => Promise<ListPageResult>
  columns: CardColumn[]
  cardMinWidth?: number | string
  defaultPageSize?: number
  showPagination?: boolean
  designMode?: boolean
  actions?: Array<{ key: string; label: string }>
  groupBy?: string
}

const props = withDefaults(defineProps<ListCardsProps>(), {
  defaultPageSize: 10,
  cardMinWidth: 200,
  showPagination: true,
  designMode: false,
  actions: () => [],
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
const actions = computed(() => props.actions)
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
  return column.valueType === 'date' && value ? new Date(value).toLocaleDateString() : value ?? ''
}

async function fetchData(params?: Partial<ListQueryParams>) {
  loading.value = true
  error.value = null
  const reqId = ++requestId
  try {
    const result = await props.fetchApi({ page: query.page, size: query.size, ...params } as ListQueryParams)
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
function retry() { error.value = null; fetchData() }
function refresh() { emit('refresh'); fetchData() }

onMounted(() => fetchData())
defineExpose({ fetchData, refresh, retry })
</script>

<style scoped>
.list-cards { width: 100%; height: 100%; min-width: 0; display: flex; flex-direction: column; }
.is-loading { opacity: 0.6; }
.card-groups { flex: 1; min-height: 0; overflow-y: auto; padding: 16px; }
.card-group + .card-group { margin-top: 24px; }
.card-group-title { margin-bottom: 12px; font-size: 15px; font-weight: 600; color: #303133; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); gap: 16px; }
.card-item { background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); cursor: pointer; min-height: 120px; }
.card-item:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); transform: translateY(-1px); }
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
