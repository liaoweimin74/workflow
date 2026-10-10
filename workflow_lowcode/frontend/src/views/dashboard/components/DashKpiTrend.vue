<template>
  <div ref="rootEl" class="dash-kpi-trend" :class="{ 'is-design': designMode, 'is-fullscreen': isFullscreen, 'is-fixed-height': fixedHeight }" :style="layoutStyle">
    <div class="dash-kpi-trend-head">
      <span class="dash-kpi-trend-title">{{ title || '指标' }}</span>
      <span class="dash-kpi-trend-compare" :class="trendClass">
        <span class="dash-kpi-trend-compare-label">{{ compareLabel }}</span>
        <svg v-if="trendDirection === 'up'" viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
          <path fill="currentColor" d="M12 5l7 8h-4v6h-6v-6H5l7-8z" />
        </svg>
        <svg v-else-if="trendDirection === 'down'" viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
          <path fill="currentColor" d="M12 19l-7-8h4V5h6v6h4l-7 8z" />
        </svg>
        <span class="dash-kpi-trend-compare-value">{{ trendText || '--' }}</span>
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
    <div class="dash-kpi-trend-value-row">
      <span class="dash-kpi-trend-value">{{ displayValue }}</span>
      <span v-if="unit" class="dash-kpi-trend-unit">{{ unit }}</span>
    </div>
    <div class="dash-kpi-trend-prev">
      <span class="dash-kpi-trend-prev-label">上期</span>
      <span class="dash-kpi-trend-prev-value">{{ displayPrevValue }}</span>
    </div>
    <div v-if="subtitle" class="dash-kpi-trend-subtitle">{{ subtitle }}</div>
    <!-- 设计态：无数据源配置时给出引导（运行态由渲染器注入 dsRefId） -->
    <div v-if="designMode && !resolvedSourceId" class="dash-kpi-trend-placeholder">未绑定数据源</div>
  </div>
</template>

<script setup lang="ts">
/**
 * 环比指标卡 DashKpiTrend（Task 3-h）。
 *
 * 【数据流结论】DashKpi 是自取数组件（dataSourceApi.aggregate + dsRefId/activeDsBindings 解析），
 * 本组件复制其取数逻辑并取两次：
 *   - 当前期窗口：[now - span, now)，按 trendField 追加 range 过滤；
 *   - 上期窗口：compareOffset 平移一期 → [now - 2·span, now - span)；
 *   - 环比 = (cur - prev) / prev × 100（除零保护见 kpiTrendShared.computeComparePercent）。
 * span 口径与 DashKpi.grainMs 对齐：day=1 天 / week=7 天 / month=30 天。
 *
 * 【双模式】
 *   - 自取数（默认）：传 dataSourceId/dsRefId + trendField（时间列），组件内部两次聚合取数；
 *   - 数据下发：传 current/previous 两个 number prop（不传 undefined 即自取数模式），
 *     组件只做展示与百分比计算——是否接线下发版本由主会话决定。
 *
 * 【配色】trendColorScheme：
 *   - 'up-good'（默认）：上升=成功色（绿）、下降=危险色（红）——与 DashKpi 家族观感一致；
 *   - 'down-good'：上升=危险色（红）、下降=成功色（绿）——即「升红降绿」，适合成本/故障类指标。
 *
 * 动作总线约定（对齐 DashKpi/page-table）：expose setFilter(...)/refresh()，实例经 ready 事件上报。
 */
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'
import { parseDashFilter, mergeDashFilter, upsertDashConditions, dashSpanGapStyle, dashHeightStyle, type DashCondition } from './dash-shared'
import { periodRangeCondition, computeComparePercent, formatComparePercent, type KpiCompareOffset, type KpiTrendColorScheme } from './kpiTrendShared'
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
    /** 环比窗口粒度 day | week | month（默认 month） */
    compareOffset?: KpiCompareOffset | string
    /** 环比标签文案（默认 '环比'） */
    compareLabel?: string
    /** 时间字段（列名）：窗口区间过滤依据；空 = 当前期不设窗（全量当主值）且不计算环比 */
    trendField?: string
    /** 趋势配色方案 up-good | down-good（默认 up-good，DashKpi 同族） */
    trendColorScheme?: KpiTrendColorScheme | string
    /** 数据下发模式：当期值（传 undefined = 自取数模式） */
    current?: number | null
    /** 数据下发模式：上期值 */
    previous?: number | null
    /** 栅格跨度（1-24，与 DashKpi.span 同义） */
    span?: number
    /** 显示高度（空 = 自适应；纯数字补 px） */
    height?: string
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
    compareOffset: 'month',
    compareLabel: '环比',
    trendField: '',
    trendColorScheme: 'up-good',
    span: 24,
    height: '',
    // current/previous 不给默认值：保持 undefined = 「未下发」语义（自取数模式）
  },
)

const emit = defineEmits<{ (e: 'ready', instance: unknown): void }>()

const rootEl = ref<HTMLDivElement | null>(null)
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootEl)

/** Task 123 同款布局：并排留白 + 固定高度（内容纵向居中） */
const layoutStyle = computed<Record<string, string>>(() => {
  if (isFullscreen.value) return {}
  return { ...dashSpanGapStyle(props.span), ...(dashHeightStyle(props.height) || {}) }
})
const fixedHeight = computed(() => !!dashHeightStyle(props.height))

/** 数据下发模式：current prop 已显式传入（含 null）即视为下发，跳过自取数 */
const dataPushMode = computed(() => props.current !== undefined)

const fetchedCur = ref<number | null>(null)
const fetchedPrev = ref<number | null>(null)
const loading = ref(false)
const failed = ref(false)
const baseFilter = ref<Record<string, unknown> | null>(parseDashFilter(props.filter))
/** setFilter 追加的条件（动作总线 set-filter） */
const extraConditions = ref<DashCondition[]>([])

/** 运行时优先 dsRefId（渲染器注入）；设计器画布回退模块级绑定存储（dataSourceId → refId） */
const resolvedSourceId = computed(
  () => props.dsRefId || activeDsBindings.value.find((b) => b.id === props.dataSourceId)?.refId || '',
)

const curValue = computed<number | null>(() => (dataPushMode.value ? (props.current ?? null) : fetchedCur.value))
const prevValue = computed<number | null>(() => (dataPushMode.value ? (props.previous ?? null) : fetchedPrev.value))

function formatNumber(raw: number | null): string {
  if (raw === null) return '--'
  if (props.numberFormat === 'thousand') return raw.toLocaleString('zh-CN')
  return String(raw)
}

const displayValue = computed(() => formatNumber(curValue.value))
const displayPrevValue = computed(() => formatNumber(prevValue.value))

/** 环比百分比（除零保护在纯函数层） */
const trendPercent = computed<number | null>(() => computeComparePercent(curValue.value, prevValue.value))
const trendText = computed(() => formatComparePercent(trendPercent.value))
const trendDirection = computed<'up' | 'down' | 'flat'>(() => {
  const percent = trendPercent.value
  if (percent === null || percent === 0) return 'flat'
  return percent > 0 ? 'up' : 'down'
})

/** 配色方向：up-good 上升=好；down-good 上升=坏（升红降绿） */
const trendClass = computed<string>(() => {
  const percent = trendPercent.value
  if (percent === null || percent === 0) return 'flat'
  const up = percent > 0
  const good = props.trendColorScheme === 'down-good' ? !up : up
  return good ? 'good' : 'bad'
})

/** 当前期聚合：trendField 存在时取窗口 [now-span, now)，否则全量（与 DashKpi 主值口径一致） */
async function fetchCurrent(): Promise<void> {
  const sourceId = resolvedSourceId.value
  if (!sourceId || props.designMode || dataPushMode.value) return
  loading.value = true
  failed.value = false
  try {
    const windowCond = periodRangeCondition(props.trendField, props.compareOffset, 'current')
    const conditions = windowCond ? [...extraConditions.value, windowCond] : [...extraConditions.value]
    const res = await dataSourceApi.aggregate(sourceId, {
      group: '__all__',
      agg: props.agg || 'count',
      metric: props.agg === 'count' ? null : props.metric || null,
      filter: mergeDashFilter(baseFilter.value, conditions, props.filter),
    })
    if (res.code !== 0 && res.code !== 200) {
      throw new Error((res as unknown as { msg?: string }).msg || '聚合查询失败')
    }
    const rows = res.data?.rows || []
    fetchedCur.value = rows.length > 0 ? Number(rows[0].value) : 0
  } catch (e: unknown) {
    failed.value = true
    fetchedCur.value = null
    // 静默降级：仪表盘一个组件失败不干扰其他组件；控制台可见
    console.warn('[dash-kpi-trend] current aggregate failed:', e instanceof Error ? e.message : e)
    if (!props.designMode) ElMessage.closeAll()
  } finally {
    loading.value = false
  }
}

/** 上期聚合：需要 trendField（窗口过滤依据）；失败静默（不干扰主值展示） */
async function fetchPrev(): Promise<void> {
  const sourceId = resolvedSourceId.value
  if (!sourceId || props.designMode || dataPushMode.value || !props.trendField) return
  const windowCond = periodRangeCondition(props.trendField, props.compareOffset, 'previous')
  if (windowCond === null) return
  try {
    const merged = mergeDashFilter(baseFilter.value, [...extraConditions.value, windowCond], props.filter)
    const res = await dataSourceApi.aggregate(sourceId, {
      group: '__all__',
      agg: props.agg || 'count',
      metric: props.agg === 'count' ? null : props.metric || null,
      filter: merged,
    })
    if (res.code !== 0 && res.code !== 200) return
    const rows = res.data?.rows || []
    fetchedPrev.value = rows.length > 0 ? Number(rows[0].value) : 0
  } catch (e: unknown) {
    console.warn('[dash-kpi-trend] previous-period aggregate failed:', e instanceof Error ? e.message : e)
    fetchedPrev.value = null
  }
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
  if (dataPushMode.value) return
  void fetchCurrent()
  void fetchPrev()
}

watch(
  () => [props.dsRefId, props.dataSourceId, props.agg, props.metric, props.compareOffset, props.trendField, props.filter],
  () => {
    baseFilter.value = parseDashFilter(props.filter)
    void refreshAll()
  },
)

onMounted(() => {
  void refreshAll()
  emit('ready', { setFilter, refresh })
})

defineExpose({ setFilter, refresh, loading })
</script>

<style scoped>
/* 视觉族谱对齐 DashKpi.vue（Task 119/120/123）：同尺寸/字体/间距/圆角/装饰光斑 */
.dash-kpi-trend {
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
.dash-kpi-trend:hover {
  box-shadow: 0 6px 18px rgba(16, 185, 129, 0.1);
  transform: translateY(-1px);
}
.dash-kpi-trend.is-fixed-height {
  justify-content: center;
}
.dash-kpi-trend.is-design {
  outline: 1px dashed var(--el-color-primary-light-5, #a7f3d0);
}
.dash-kpi-trend.is-fullscreen {
  z-index: 3000;
  border-radius: 0;
}
.dash-kpi-trend::after {
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
.dash-kpi-trend-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.dash-kpi-trend-title {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dash-kpi-trend-compare {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  font-weight: 600;
  margin-left: auto;
  flex: none;
}
.dash-kpi-trend-compare-label {
  font-weight: 500;
  margin-right: 2px;
}
.dash-kpi-trend-compare.good { color: var(--el-color-success, #10b981); }
.dash-kpi-trend-compare.bad { color: var(--el-color-danger, #f43f5e); }
.dash-kpi-trend-compare.flat { color: var(--el-text-color-secondary, #909399); }
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
.dash-kpi-trend:hover .dash-fullscreen-btn,
.dash-kpi-trend.is-fullscreen .dash-fullscreen-btn {
  opacity: 1;
}
.dash-fullscreen-btn:hover {
  background: var(--el-fill-color, #f0f2f5);
  color: var(--el-color-primary, #10b981);
}
.dash-kpi-trend-value-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.dash-kpi-trend-value {
  font-size: 30px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--el-text-color-primary, #303133);
  font-variant-numeric: tabular-nums;
}
.dash-kpi-trend-unit {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
}
.dash-kpi-trend-prev {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.dash-kpi-trend-prev-label {
  font-size: 12px;
  color: var(--el-text-color-placeholder, #c0c4cc);
}
.dash-kpi-trend-prev-value {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
  font-variant-numeric: tabular-nums;
}
.dash-kpi-trend-subtitle {
  font-size: 12px;
  color: var(--el-text-color-placeholder, #c0c4cc);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dash-kpi-trend-placeholder {
  position: absolute;
  inset: auto 12px 10px auto;
  font-size: 11px;
  color: var(--el-color-warning, #e6a23c);
}
</style>
