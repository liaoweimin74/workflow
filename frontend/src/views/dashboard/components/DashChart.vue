<template>
  <div class="dash-chart" :class="{ 'is-design': designMode }">
    <div v-if="title" class="dash-chart-title">{{ title }}</div>
    <div v-show="hasData" ref="chartEl" class="dash-chart-canvas" :style="{ height: chartHeight }" />
    <div v-if="!hasData" class="dash-chart-empty" :style="{ height: chartHeight }">
      <el-empty
        :description="emptyText"
        :image-size="60"
      />
    </div>
    <div v-if="designMode && !resolvedSourceId" class="dash-chart-hint">未绑定数据源</div>
  </div>
</template>

<script setup lang="ts">
/**
 * 仪表盘统计图（Task 119）：柱状 / 折线 / 饼环。
 *
 * 数据契约：`GET /v1/data-sources/{refId}/aggregate?group=维度&agg=...&timeGrain=...`。
 * 动作总线约定（对齐 page-table）：expose `setFilter({field: value})`（追加等值条件重查）
 * 与 `refresh()`；实例经 ready 事件上报注册。尺寸自适应（ResizeObserver）。
 */
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { ensureEcharts, DASH_PALETTE, cssVar, canvasAvailable } from './useEcharts'
import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'

const props = withDefaults(
  defineProps<{
    title?: string
    /** bar | line | pie */
    chartType?: string
    /** 维度列 key（`__all__` 无意义，图表必分组） */
    group?: string
    /** 时间桶粒度（空 = 不分桶） */
    timeGrain?: string | null
    agg?: string
    metric?: string | null
    sort?: string
    order?: string
    limit?: number
    /** 页内数据源逻辑 id */
    dataSourceId?: string
    /** 运行时注入的全局数据源 id */
    dsRefId?: string
    /** 结构化 filter JSON */
    filter?: string | null
    /** 绘图高度（css 值） */
    height?: string
    designMode?: boolean
  }>(),
  {
    title: '',
    chartType: 'bar',
    group: '',
    timeGrain: null,
    agg: 'count',
    metric: null,
    sort: 'key',
    order: 'asc',
    limit: 0,
    dataSourceId: '',
    dsRefId: '',
    filter: null,
    height: '260px',
    designMode: false,
  },
)

const emit = defineEmits<{ (e: 'ready', instance: unknown): void }>()

const chartEl = ref<HTMLDivElement | null>(null)
const rows = ref<Array<{ key: string; value: number }>>([])
const loading = ref(false)
const loadError = ref('')
let chart: ReturnType<ReturnType<typeof ensureEcharts>['init']> | null = null
let resizeObserver: ResizeObserver | null = null
let baseFilter: Record<string, unknown> | null = parseFilter(props.filter)
const extraConditions = ref<Array<{ column: string; op: string; value: unknown }>>([])

/** 运行时优先 dsRefId（渲染器注入）；设计器画布回退模块级绑定存储（dataSourceId → refId） */
const resolvedSourceId = computed(
  () => props.dsRefId || activeDsBindings.value.find((b) => b.id === props.dataSourceId)?.refId || '',
)
const chartHeight = computed(() => props.height || '260px')
const hasData = computed(() => rows.value.length > 0)
const emptyText = computed(() =>
  loadError.value ? `加载失败：${loadError.value}` : props.designMode ? '设计态预览（运行时加载数据源数据）' : '暂无数据',
)

function parseFilter(json: string | null | undefined): Record<string, unknown> | null {
  if (!json || json.trim() === '') return null
  try {
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function currentFilterJson(): string | null {
  if (extraConditions.value.length === 0) return props.filter || null
  const base: Record<string, unknown> =
    baseFilter && Array.isArray((baseFilter as any).conditions)
      ? { ...(baseFilter as any) }
      : { logic: 'AND', conditions: [...((baseFilter as any)?.conditions || [])] }
  const conditions = [...((base.conditions as unknown[]) || []), ...extraConditions.value]
  return JSON.stringify({ ...base, conditions })
}

async function fetchData(): Promise<void> {
  const sourceId = resolvedSourceId.value
  if (!sourceId || props.designMode || !props.group) return
  loading.value = true
  loadError.value = ''
  try {
    const res = await dataSourceApi.aggregate(sourceId, {
      group: props.group,
      agg: props.agg || 'count',
      metric: props.agg === 'count' ? null : props.metric || null,
      timeGrain: props.timeGrain || null,
      sort: props.sort || 'key',
      order: props.order || 'asc',
      limit: props.limit || 0,
      filter: currentFilterJson(),
    })
    if (res.code !== 0 && res.code !== 200) {
      throw new Error((res as any).msg || '聚合查询失败')
    }
    rows.value = res.data?.rows || []
    await nextTick()
    render()
  } catch (e: any) {
    loadError.value = e?.message || String(e)
    rows.value = []
    render()
    console.warn('[dash-chart] aggregate failed:', loadError.value)
  } finally {
    loading.value = false
  }
}

function textColor(): string {
  return cssVar('--el-text-color-secondary', '#909399')
}

function lineColor(): string {
  return cssVar('--el-border-color-lighter', '#ebeef5')
}

function render(): void {
  if (!chartEl.value || !canvasAvailable()) return
  const echarts = ensureEcharts()
  // 环境兜底：jsdom/无 canvas 环境下 init/setOption 会抛错（测试与异常终端），吞掉不让它打断页面
  try {
    if (!chart) {
      chart = echarts.init(chartEl.value)
    }
  } catch {
    chart = null
    return
  }
  const axisText = textColor()
  const axisLine = lineColor()
  const seriesName = props.title || (props.agg === 'count' ? '数量' : `${props.agg}(${props.metric || ''})`)

  let option: Record<string, unknown>
  if (props.chartType === 'pie') {
    option = {
      color: DASH_PALETTE,
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, type: 'scroll', textStyle: { color: axisText }, pageTextStyle: { color: axisText } },
      series: [
        {
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '46%'],
          itemStyle: { borderRadius: 6, borderColor: cssVar('--el-bg-color', '#fff'), borderWidth: 2 },
          label: { color: axisText, formatter: '{b} {d}%' },
          data: rows.value.map((r) => ({ name: r.key === '' ? '（空）' : r.key, value: r.value })),
        },
      ],
    }
  } else {
    const horizontal = rows.value.length > 8
    option = {
      color: [DASH_PALETTE[0]],
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      xAxis: horizontal
        ? { type: 'value', axisLabel: { color: axisText }, splitLine: { lineStyle: { color: axisLine } } }
        : {
            type: 'category',
            data: rows.value.map((r) => (r.key === '' ? '（空）' : r.key)),
            axisLabel: { color: axisText, rotate: rows.value.length > 6 ? 30 : 0, interval: 0 },
            axisLine: { lineStyle: { color: axisLine } },
          },
      yAxis: horizontal
        ? {
            type: 'category',
            data: rows.value.map((r) => (r.key === '' ? '（空）' : r.key)),
            axisLabel: { color: axisText },
            axisLine: { lineStyle: { color: axisLine } },
          }
        : { type: 'value', axisLabel: { color: axisText }, splitLine: { lineStyle: { color: axisLine } } },
      series: [
        {
          name: seriesName,
          type: props.chartType === 'line' ? 'line' : 'bar',
          smooth: props.chartType === 'line',
          barMaxWidth: 36,
          itemStyle: { borderRadius: props.chartType === 'bar' ? [4, 4, 0, 0] : 0 },
          areaStyle:
            props.chartType === 'line'
              ? { color: 'rgba(16, 185, 129, 0.12)' }
              : undefined,
          data: rows.value.map((r) => r.value),
        },
      ],
    }
  }
  try {
    chart.setOption(option, true)
  } catch {
    /* setOption 在异常环境下失败时保留空态展示 */
  }
}

function setFilter(cond: Record<string, unknown>): void {
  for (const [column, val] of Object.entries(cond)) {
    const existing = extraConditions.value.find((c) => c.column === column)
    const item = { column, op: 'eq', value: val }
    if (existing) Object.assign(existing, item)
    else extraConditions.value.push(item)
  }
  void fetchData()
}

function refresh(): void {
  extraConditions.value = []
  void fetchData()
}

watch(
  () => [props.dsRefId, props.dataSourceId, props.group, props.agg, props.metric, props.timeGrain, props.chartType],
  () => void fetchData(),
)

onMounted(async () => {
  await nextTick()
  if (chartEl.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => chart?.resize())
    resizeObserver.observe(chartEl.value)
  }
  void fetchData()
  emit('ready', { setFilter, refresh })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = null
})

defineExpose({ setFilter, refresh, loading })
</script>

<style scoped>
.dash-chart {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 12px;
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  min-width: 0;
}
.dash-chart.is-design {
  outline: 1px dashed var(--el-color-primary-light-5, #a7f3d0);
}
.dash-chart-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
}
.dash-chart-canvas {
  width: 100%;
  min-width: 0;
}
.dash-chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
}
.dash-chart-hint {
  position: absolute;
  right: 12px;
  top: 12px;
  font-size: 11px;
  color: var(--el-color-warning, #e6a23c);
}
</style>
