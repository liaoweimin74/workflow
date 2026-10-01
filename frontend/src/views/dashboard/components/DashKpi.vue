<template>
  <div ref="rootEl" class="dash-kpi" :class="{ 'is-design': designMode, 'is-fullscreen': isFullscreen }">
    <div class="dash-kpi-head">
      <span class="dash-kpi-title">{{ title || '指标' }}</span>
      <span
        v-if="trendText"
        class="dash-kpi-trend"
        :class="{ up: trendDirection === 'up', down: trendDirection === 'down' }"
      >
        <svg v-if="trendDirection === 'up'" viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
          <path fill="currentColor" d="M12 5l7 8h-4v6h-6v-6H5l7-8z" />
        </svg>
        <svg v-else-if="trendDirection === 'down'" viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
          <path fill="currentColor" d="M12 19l-7-8h4V5h6v6h4l-7 8z" />
        </svg>
        {{ trendText }}
      </span>
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
    <div class="dash-kpi-value-row">
      <span class="dash-kpi-value">{{ displayValue }}</span>
      <span v-if="unit" class="dash-kpi-unit">{{ unit }}</span>
    </div>
    <div v-if="subtitle" class="dash-kpi-subtitle">{{ subtitle }}</div>
    <!-- 迷你趋势（Sparkline）：纯 SVG，随数据刷新 -->
    <svg v-if="sparkline && sparkPoints.length > 1" class="dash-kpi-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        :points="sparkPolyline"
        fill="none"
        stroke="#10b981"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <polygon :points="sparkArea" fill="rgba(16, 185, 129, 0.12)" />
      <circle :cx="sparkLast[0]" :cy="sparkLast[1]" r="2.4" fill="#10b981" />
    </svg>
    <!-- 设计态：无数据源配置时给出引导（运行态由渲染器注入数据源） -->
    <div v-if="designMode && !resolvedSourceId" class="dash-kpi-placeholder">未绑定数据源</div>
  </div>
</template>

<script setup lang="ts">
/**
 * 仪表盘 KPI 指标卡（Task 119 → Task 120 增强）。
 *
 * 数据契约：`GET /v1/data-sources/{refId}/aggregate?group=__all__&agg=...` 的
 * 单行结果（key='__all__'）。
 *
 * Task 120 增强：
 *   - 同比/环比：trendEnabled + trendGrain（day/week/month）+ trendField（时间字段）
 *     —— 额外发一次「上期区间」聚合（filter 追加 range），算百分比变化 + 趋势箭头；
 *   - 迷你折线图（Sparkline）：group=trendField + timeGrain 分桶，纯 SVG 渲染；
 *   - setFilter 升级：支持显式运算符（{op,value}）与 null 清除（dash-shared）；
 *   - 组件级全屏。
 *
 * 动作总线约定（对齐 page-table）：expose `setFilter(...)` / `refresh()`，
 * 实例经 ready 事件上报注册。
 */
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'
import { parseDashFilter, mergeDashFilter, upsertDashConditions, type DashCondition } from './dash-shared'
import { useFullscreen } from '@/composables/useFullscreen'

const props = withDefaults(
  defineProps<{
    title?: string
    subtitle?: string
    unit?: string
    agg?: string
    metric?: string | null
    /** 页内数据源逻辑 id（schema.dataSources[].id） */
    dataSourceId?: string
    /** 运行时注入的全局数据源 id（PageRendererPage.transformComponent） */
    dsRefId?: string
    /** 组件级过滤（结构化 filter JSON；setFilter 追加） */
    filter?: string | null
    /** 设计态不取数 */
    designMode?: boolean
    /** 数字格式化：thousand（千分位） */
    numberFormat?: string
    /** Task 120：开启同比/环比（需 trendField） */
    trendEnabled?: boolean
    /** Task 120：对比粒度 day | week | month（上期区间长度） */
    trendGrain?: string
    /** Task 120：时间字段（列名），用于上期区间过滤与 Sparkline 分桶 */
    trendField?: string
    /** Task 120：显示迷你折线图（需 trendField） */
    sparkline?: boolean
    /** Task 120：Sparkline 桶数上限 */
    sparkRange?: number
  }>(),
  {
    title: '',
    subtitle: '',
    unit: '',
    agg: 'count',
    metric: null,
    dataSourceId: '',
    dsRefId: '',
    filter: null,
    designMode: false,
    numberFormat: '',
    trendEnabled: false,
    trendGrain: 'day',
    trendField: '',
    sparkline: false,
    sparkRange: 12,
  },
)

const emit = defineEmits<{ (e: 'ready', instance: unknown): void }>()

const rootEl = ref<HTMLDivElement | null>(null)
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootEl)

const value = ref<number | null>(null)
const prevValue = ref<number | null>(null)
const sparkRows = ref<Array<{ key: string; value: number }>>([])
const loading = ref(false)
const failed = ref(false)
const baseFilter = ref<Record<string, unknown> | null>(parseDashFilter(props.filter))
/** setFilter 追加的条件（动作总线 set-filter） */
const extraConditions = ref<DashCondition[]>([])

/** 运行时优先 dsRefId（渲染器注入）；设计器画布回退模块级绑定存储（dataSourceId → refId） */
const resolvedSourceId = computed(
  () => props.dsRefId || activeDsBindings.value.find((b) => b.id === props.dataSourceId)?.refId || '',
)

const displayValue = computed(() => {
  if (value.value === null) return '--'
  if (props.numberFormat === 'thousand') {
    return value.value.toLocaleString('zh-CN')
  }
  return String(value.value)
})

/** 环比文案与方向：prev 为 null（未启用/取不到）时不展示 */
const trendPercent = computed<number | null>(() => {
  if (prevValue.value === null || value.value === null) return null
  if (prevValue.value === 0) return value.value === 0 ? 0 : null
  return ((value.value - prevValue.value) / prevValue.value) * 100
})
const trendText = computed(() => {
  const percent = trendPercent.value
  if (percent === null) return ''
  const rounded = Math.round(Math.abs(percent) * 10) / 10
  return `${rounded}%`
})
const trendDirection = computed(() => {
  const percent = trendPercent.value
  if (percent === null || percent === 0) return 'flat' as const
  return percent > 0 ? ('up' as const) : ('down' as const)
})

/** 粒度对应毫秒数（环比区间长度） */
function grainMs(): number {
  if (props.trendGrain === 'week') return 7 * 86400000
  if (props.trendGrain === 'month') return 30 * 86400000
  return 86400000
}

/** 上期区间过滤条件（trendField range [上期起, 本期起)） */
function prevRangeCondition(): DashCondition | null {
  if (!props.trendField) return null
  const now = Date.now()
  const span = grainMs()
  const currentStart = now - span
  const prevStart = currentStart - span
  const fmt = (ts: number): string => new Date(ts).toISOString().slice(0, 19).replace('T', ' ')
  return { column: props.trendField, op: 'range', value: [fmt(prevStart), fmt(currentStart)] }
}

async function fetchValue(): Promise<void> {
  const sourceId = resolvedSourceId.value
  if (!sourceId || props.designMode) return
  loading.value = true
  failed.value = false
  try {
    const res = await dataSourceApi.aggregate(sourceId, {
      group: '__all__',
      agg: props.agg || 'count',
      metric: props.agg === 'count' ? null : props.metric || null,
      filter: currentFilterJson(),
    })
    if (res.code !== 0 && res.code !== 200) {
      throw new Error((res as unknown as { msg?: string }).msg || '聚合查询失败')
    }
    const rows = res.data?.rows || []
    value.value = rows.length > 0 ? Number(rows[0].value) : 0
  } catch (e: unknown) {
    failed.value = true
    value.value = null
    // 静默降级：仪表盘一个组件失败不干扰其他组件；控制台可见
    console.warn('[dash-kpi] aggregate failed:', e instanceof Error ? e.message : e)
    if (!props.designMode) ElMessage.closeAll()
  } finally {
    loading.value = false
  }
}

/** 上期值（环比）：独立请求，失败静默（不干扰主值展示） */
async function fetchPrevValue(): Promise<void> {
  const sourceId = resolvedSourceId.value
  if (!sourceId || props.designMode || !props.trendEnabled || !props.trendField) return
  const rangeCondition = prevRangeCondition()
  if (rangeCondition === null) return
  try {
    const merged = mergeDashFilter(baseFilter.value, [...extraConditions.value, rangeCondition], props.filter)
    const res = await dataSourceApi.aggregate(sourceId, {
      group: '__all__',
      agg: props.agg || 'count',
      metric: props.agg === 'count' ? null : props.metric || null,
      filter: merged,
    })
    if (res.code !== 0 && res.code !== 200) return
    const rows = res.data?.rows || []
    prevValue.value = rows.length > 0 ? Number(rows[0].value) : 0
  } catch (e: unknown) {
    console.warn('[dash-kpi] prev-period aggregate failed:', e instanceof Error ? e.message : e)
    prevValue.value = null
  }
}

/** Sparkline 序列：trendField 分桶升序（独立请求，失败静默） */
async function fetchSparkline(): Promise<void> {
  const sourceId = resolvedSourceId.value
  if (!sourceId || props.designMode || !props.sparkline || !props.trendField) return
  try {
    const res = await dataSourceApi.aggregate(sourceId, {
      group: props.trendField,
      timeGrain: props.trendGrain === 'week' ? 'week' : props.trendGrain === 'month' ? 'month' : 'day',
      agg: props.agg || 'count',
      metric: props.agg === 'count' ? null : props.metric || null,
      sort: 'key',
      order: 'asc',
      limit: Math.max(2, props.sparkRange || 12),
      filter: currentFilterJson(),
    })
    if (res.code !== 0 && res.code !== 200) return
    sparkRows.value = res.data?.rows || []
  } catch (e: unknown) {
    console.warn('[dash-kpi] sparkline aggregate failed:', e instanceof Error ? e.message : e)
    sparkRows.value = []
  }
}

/** SVG 折线点（viewBox 100×28，4px 边距） */
const sparkPoints = computed<Array<[number, number]>>(() => {
  const rowsData = sparkRows.value
  if (rowsData.length === 0) return []
  const values = rowsData.map((r) => r.value)
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const width = 100
  const height = 28
  const pad = 3
  const step = rowsData.length > 1 ? (width - pad * 2) / (rowsData.length - 1) : 0
  return rowsData.map((row, index) => {
    const x = pad + index * step
    const y = height - pad - ((row.value - min) / span) * (height - pad * 2)
    return [Number(x.toFixed(2)), Number(y.toFixed(2))]
  })
})
const sparkPolyline = computed(() => sparkPoints.value.map((point) => point.join(',')).join(' '))
const sparkArea = computed(() => {
  const points = sparkPoints.value
  if (points.length === 0) return ''
  const first = points[0]
  const last = points[points.length - 1]
  return `${first[0]},28 ${points.map((point) => point.join(',')).join(' ')} ${last[0]},28`
})
const sparkLast = computed<[number, number]>(() => sparkPoints.value[sparkPoints.value.length - 1] ?? [0, 0])

function currentFilterJson(): string | null {
  return mergeDashFilter(baseFilter.value, extraConditions.value, props.filter)
}

/** 动作总线 set-filter：追加条件（等值 / 显式运算符 / null 清除）并重查 */
function setFilter(cond: Record<string, unknown>): void {
  upsertDashConditions(extraConditions.value, cond)
  void refreshAll()
}

function refresh(): void {
  extraConditions.value = []
  void refreshAll()
}

function refreshAll(): void {
  void fetchValue()
  void fetchPrevValue()
  void fetchSparkline()
}

watch(
  () => [props.dsRefId, props.dataSourceId, props.agg, props.metric, props.trendEnabled, props.trendField, props.sparkline],
  () => void refreshAll(),
)

onMounted(() => {
  void refreshAll()
  emit('ready', { setFilter, refresh })
})

defineExpose({ setFilter, refresh, loading })
</script>

<style scoped>
.dash-kpi {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 18px 20px;
  border-radius: 12px;
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  min-height: 118px;
  overflow: hidden;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}
.dash-kpi:hover {
  box-shadow: 0 6px 18px rgba(16, 185, 129, 0.1);
  transform: translateY(-1px);
}
.dash-kpi.is-design {
  outline: 1px dashed var(--el-color-primary-light-5, #a7f3d0);
}
.dash-kpi.is-fullscreen {
  z-index: 3000;
  border-radius: 0;
}
.dash-kpi::after {
  content: '';
  position: absolute;
  right: -26px;
  top: -26px;
  width: 84px;
  height: 84px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, rgba(16, 185, 129, 0) 70%);
  pointer-events: none;
}
.dash-kpi-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.dash-kpi-title {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dash-kpi-trend {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  font-weight: 600;
  margin-left: auto;
}
.dash-kpi-trend.up { color: var(--el-color-success, #10b981); }
.dash-kpi-trend.down { color: var(--el-color-danger, #f43f5e); }
.dash-fullscreen-btn {
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
  flex: none;
}
.dash-kpi:hover .dash-fullscreen-btn,
.dash-kpi.is-fullscreen .dash-fullscreen-btn {
  opacity: 1;
}
.dash-fullscreen-btn:hover {
  background: var(--el-fill-color, #f0f2f5);
  color: var(--el-color-primary, #10b981);
}
.dash-kpi-value-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.dash-kpi-value {
  font-size: 30px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--el-text-color-primary, #303133);
  font-variant-numeric: tabular-nums;
}
.dash-kpi-unit {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
}
.dash-kpi-subtitle {
  font-size: 12px;
  color: var(--el-text-color-placeholder, #c0c4cc);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dash-kpi-spark {
  width: 100%;
  height: 28px;
  margin-top: 2px;
}
.dash-kpi-placeholder {
  position: absolute;
  inset: auto 12px 10px auto;
  font-size: 11px;
  color: var(--el-color-warning, #e6a23c);
}
</style>
