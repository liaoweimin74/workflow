<template>
  <div ref="rootEl" class="dash-leaderboard" :class="{ 'is-design': designMode, 'is-fullscreen': isFullscreen, 'is-fixed-height': fixedHeight }" :style="layoutStyle">
    <div class="dash-leaderboard-head">
      <span class="dash-leaderboard-title">{{ title || '排行榜' }}</span>
      <span v-if="rows.length > 0" class="dash-leaderboard-meta">Top {{ rows.length }}</span>
      <button
        v-if="!designMode"
        class="dash-fullscreen-btn"
        type="button"
        :title="isFullscreen ? '退出全屏' : '全屏'"
        :aria-label="isFullscreen ? '退出全屏' : '全屏'"
        @click.stop="toggleFullscreen"
      >
        <svg v-if="!isFullscreen" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path fill="currentColor" d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path fill="currentColor" d="M9 4h2v6H5V8h4V4zm4 0h2v4h4v2h-6V4zM5 14h6v6H9v-4H5v-2zm10 0h4v2h-4v4h-2v-6z" />
        </svg>
      </button>
    </div>
    <div v-if="rows.length > 0" class="dash-leaderboard-list">
      <div v-for="(row, index) in rows" :key="row.name" class="dash-leaderboard-row" :class="{ top: index < 3 }">
        <span class="dash-leaderboard-rank" :class="`rank-${index + 1}`">{{ index + 1 }}</span>
        <span class="dash-leaderboard-name" :title="row.name">{{ row.name }}</span>
        <div class="dash-leaderboard-track">
          <div class="dash-leaderboard-fill" :style="{ width: rowWidth(row.value) }" />
        </div>
        <span class="dash-leaderboard-value">{{ formatValue(row.value) }}</span>
      </div>
    </div>
    <div v-else class="dash-leaderboard-empty">
      <el-empty :description="designMode ? '设计态预览（运行时加载数据源数据）' : '暂无数据'" :image-size="50" />
    </div>
    <div v-if="designMode && !resolvedSourceId" class="dash-leaderboard-hint">未绑定数据源</div>
  </div>
</template>

<script setup lang="ts">
/**
 * 排行榜（Task 120）：group=维度 + order=desc + limit=topN 的聚合结果，
 * 渲染为「名次徽标 + 名称 + 相对宽度条 + 数值」列表。前三名金/银/铜徽标。
 */
import { ref, computed, onMounted, watch } from 'vue'
import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'
import { parseDashFilter, mergeDashFilter, upsertDashConditions, dashSpanGapStyle, dashHeightStyle, type DashCondition } from './dash-shared'
import { useFullscreen } from '@/composables/useFullscreen'

const props = withDefaults(
  defineProps<{
    title?: string
    /** 维度列 key（排行榜必分组） */
    group?: string
    agg?: string
    metric?: string | null
    timeGrain?: string | null
    /** 展示条数（后端 limit） */
    limit?: number
    /** 页内数据源逻辑 id */
    dataSourceId?: string
    /** 运行时注入的全局数据源 id */
    dsRefId?: string
    filter?: string | null
    designMode?: boolean
    numberFormat?: string
    /** Task 123：栅格跨度（1-24，与 rule.col.span 镜像） */
    span?: number
    /** Task 123：显示高度（空 = 自适应；固定高度时列表区滚动） */
    height?: string
  }>(),
  {
    title: '',
    group: '',
    agg: 'count',
    metric: null,
    timeGrain: null,
    limit: 5,
    dataSourceId: '',
    dsRefId: '',
    filter: null,
    designMode: false,
    numberFormat: '',
    span: 24,
    height: '',
  },
)

const emit = defineEmits<{ (e: 'ready', instance: unknown): void }>()
const rootEl = ref<HTMLDivElement | null>(null)
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootEl)

/** Task 123 布局：并排留白（全屏跳过）+ 固定高度（内容纵向居中） */
const layoutStyle = computed<Record<string, string>>(() => {
  if (isFullscreen.value) return {}
  return { ...dashSpanGapStyle(props.span), ...(dashHeightStyle(props.height) || {}) }
})
const fixedHeight = computed(() => !!dashHeightStyle(props.height))
const rawRows = ref<Array<{ key: string; value: number }>>([])
const baseFilter = ref<Record<string, unknown> | null>(parseDashFilter(props.filter))
const extraConditions = ref<DashCondition[]>([])

const resolvedSourceId = computed(
  () => props.dsRefId || activeDsBindings.value.find((b) => b.id === props.dataSourceId)?.refId || '',
)

/** 值降序 + 复合名（空维度兜底「（空）」） */
const rows = computed(() => {
  const sorted = [...rawRows.value].sort((a, b) => b.value - a.value)
  return sorted.map((row) => ({ name: row.key === '' ? '（空）' : row.key, value: row.value }))
})

const maxValue = computed(() => Math.max(1, ...rows.value.map((row) => row.value)))

function rowWidth(value: number): string {
  return `${Math.max(4, Math.round((value / maxValue.value) * 100))}%`
}

function formatValue(value: number): string {
  if (props.numberFormat === 'thousand') return value.toLocaleString('zh-CN')
  return String(value)
}

function currentFilterJson(): string | null {
  return mergeDashFilter(baseFilter.value, extraConditions.value, props.filter)
}

async function fetchData(): Promise<void> {
  const sourceId = resolvedSourceId.value
  if (!sourceId || props.designMode || !props.group) return
  try {
    const res = await dataSourceApi.aggregate(sourceId, {
      group: props.group,
      agg: props.agg || 'count',
      metric: props.agg === 'count' ? null : props.metric || null,
      timeGrain: props.timeGrain || null,
      sort: 'value',
      order: 'desc',
      limit: Math.max(1, props.limit || 5),
      filter: currentFilterJson(),
    })
    if (res.code !== 0 && res.code !== 200) return
    rawRows.value = res.data?.rows || []
  } catch (e: unknown) {
    console.warn('[dash-leaderboard] aggregate failed:', e instanceof Error ? e.message : e)
    rawRows.value = []
  }
}

function setFilter(cond: Record<string, unknown>): void {
  upsertDashConditions(extraConditions.value, cond)
  void fetchData()
}

function refresh(): void {
  extraConditions.value = []
  void fetchData()
}

watch(
  () => [props.dsRefId, props.dataSourceId, props.group, props.agg, props.metric, props.limit],
  () => void fetchData(),
)

onMounted(() => {
  void fetchData()
  emit('ready', { setFilter, refresh })
})

defineExpose({ setFilter, refresh })
</script>

<style scoped>
.dash-leaderboard {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: 12px;
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  min-width: 0;
}
.dash-leaderboard.is-design {
  outline: 1px dashed var(--el-color-primary-light-5, #a7f3d0);
}
.dash-leaderboard.is-fullscreen {
  z-index: 3000;
  border-radius: 0;
  overflow-y: auto;
}
/* Task 123：固定高度时内容纵向居中；列表区溢出滚动防截断 */
.dash-leaderboard.is-fixed-height {
  justify-content: center;
  overflow-y: auto;
}
.dash-leaderboard-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.dash-leaderboard-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
}
.dash-leaderboard-meta {
  font-size: 12px;
  color: var(--el-text-color-placeholder, #c0c4cc);
}
.dash-fullscreen-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-secondary, #909399);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, background-color 0.15s ease;
}
.dash-leaderboard:hover .dash-fullscreen-btn,
.dash-leaderboard.is-fullscreen .dash-fullscreen-btn {
  opacity: 1;
}
.dash-fullscreen-btn:hover {
  background: var(--el-fill-color, #f0f2f5);
  color: var(--el-color-primary, #10b981);
}
.dash-leaderboard-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dash-leaderboard-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.dash-leaderboard-rank {
  flex: none;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--el-text-color-secondary, #909399);
  background: var(--el-fill-color, #f0f2f5);
}
.dash-leaderboard-row.top .dash-leaderboard-rank {
  color: #fff;
}
.dash-leaderboard-rank.rank-1 { background: #f59e0b; }
.dash-leaderboard-rank.rank-2 { background: #94a3b8; }
.dash-leaderboard-rank.rank-3 { background: #d97706; }
.dash-leaderboard-name {
  flex: none;
  width: 76px;
  font-size: 12px;
  color: var(--el-text-color-primary, #303133);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dash-leaderboard-track {
  flex: 1;
  min-width: 0;
  height: 8px;
  border-radius: 4px;
  background: var(--el-fill-color-lighter, #f5f7fa);
  overflow: hidden;
}
.dash-leaderboard-fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, #10b981, #34d399);
  transition: width 0.4s ease;
}
.dash-leaderboard-row:nth-child(2) .dash-leaderboard-fill { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
.dash-leaderboard-row:nth-child(3) .dash-leaderboard-fill { background: linear-gradient(90deg, #14b8a6, #2dd4bf); }
.dash-leaderboard-value {
  flex: none;
  min-width: 40px;
  text-align: right;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
  font-variant-numeric: tabular-nums;
}
.dash-leaderboard-empty {
  min-height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dash-leaderboard-hint {
  position: absolute;
  right: 12px;
  top: 12px;
  font-size: 11px;
  color: var(--el-color-warning, #e6a23c);
}
</style>
