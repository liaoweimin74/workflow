<template>
  <div ref="rootEl" class="dash-chart" :class="{ 'is-design': designMode, 'is-fullscreen': isFullscreen }" :style="layoutStyle">
    <div class="dash-chart-head">
      <div v-if="title" class="dash-chart-title">{{ title }}</div>
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
 * 仪表盘统计图（Task 119 → Task 120 扩展）。
 *
 * 图型（chartType）：bar | line | area | pie | scatter | heatmap | funnel
 *   - area：累积趋势（line + areaStyle）
 *   - scatter：分类相关性（x=维度，y=值）
 *   - heatmap：密度/时段分布（group="a,b" 双维度，复合 key "va|vb" 透视 x/y）
 *   - funnel：转化流程（value 降序漏斗）
 *
 * 数据契约：`GET /v1/data-sources/{refId}/aggregate?group=维度&agg=...&timeGrain=...`。
 * 动作总线：expose `setFilter({field: value | {op,value} | null})`（Task 120 支持显式
 * 运算符与清除语义）与 `refresh()`；实例经 ready 事件上报注册。ResizeObserver 自适应。
 */
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { ensureEcharts, DASH_PALETTE, cssVar, canvasAvailable } from './useEcharts'
import { parseDashFilter, mergeDashFilter, upsertDashConditions, splitCompositeKey, dashSpanGapStyle, type DashCondition } from './dash-shared'
import { useFullscreen } from '@/composables/useFullscreen'
import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'

const props = withDefaults(
  defineProps<{
    title?: string
    /** bar | line | area | pie | scatter | heatmap | funnel */
    chartType?: string
    /** 维度列 key（`__all__` 无意义，图表必分组；热力图 "a,b" 双维度） */
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
    /** Task 123：栅格跨度（1-24，与 rule.col.span 镜像；高度沿用既有 height 绘图语义） */
    span?: number
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
    span: 24,
  },
)

const emit = defineEmits<{ (e: 'ready', instance: unknown): void }>()

const rootEl = ref<HTMLDivElement | null>(null)
const chartEl = ref<HTMLDivElement | null>(null)
const rows = ref<Array<{ key: string; value: number }>>([])
const loading = ref(false)
const loadError = ref('')
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootEl)

/** Task 123 布局：并排留白（全屏跳过）；绘图高度仍由既有 height prop 驱动画布 */
const layoutStyle = computed<Record<string, string>>(() => {
  if (isFullscreen.value) return {}
  return dashSpanGapStyle(props.span)
})
let chart: ReturnType<ReturnType<typeof ensureEcharts>['init']> | null = null
let resizeObserver: ResizeObserver | null = null
const baseFilter = ref<Record<string, unknown> | null>(parseDashFilter(props.filter))
const extraConditions = ref<DashCondition[]>([])

/** 运行时优先 dsRefId（渲染器注入）；设计器画布回退模块级绑定存储（dataSourceId → refId） */
const resolvedSourceId = computed(
  () => props.dsRefId || activeDsBindings.value.find((b) => b.id === props.dataSourceId)?.refId || '',
)
const chartHeight = computed(() => props.height || '260px')
const hasData = computed(() => rows.value.length > 0)
const emptyText = computed(() =>
  loadError.value ? `加载失败：${loadError.value}` : props.designMode ? '设计态预览（运行时加载数据源数据）' : '暂无数据',
)

function currentFilterJson(): string | null {
  return mergeDashFilter(baseFilter.value, extraConditions.value, props.filter)
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
      throw new Error((res as unknown as { msg?: string }).msg || '聚合查询失败')
    }
    rows.value = res.data?.rows || []
    await nextTick()
    render()
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : String(e)
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

/** 热力图：复合 key "va|vb" → { x 轴值集, y 轴值集, [xIdx,yIdx,value] 数据 } */
function heatmapData(): { xValues: string[]; yValues: string[]; data: Array<[number, number, number]> } {
  const xValues: string[] = []
  const yValues: string[] = []
  const pairs = rows.value.map((row) => {
    const parts = splitCompositeKey(row.key)
    const x = parts[0] ?? ''
    const y = parts[1] ?? ''
    if (!xValues.includes(x)) xValues.push(x)
    if (!yValues.includes(y)) yValues.push(y)
    return { x, y, value: row.value }
  })
  const data = pairs.map((pair) => [xValues.indexOf(pair.x), yValues.indexOf(pair.y), pair.value] as [number, number, number])
  return { xValues, yValues, data }
}

function render(): void {
  const el = chartEl.value
  if (!el || !canvasAvailable()) return
  // 0 尺寸容器（tab 未激活/折叠面板）init 会产生 ECharts 警告且宽度锁定 0：静默跳过，
  // 容器恢复尺寸时 ResizeObserver 回调会补调 render()
  if (el.clientWidth === 0 || el.clientHeight === 0) return
  const echarts = ensureEcharts()
  // 环境兜底：jsdom/无 canvas 环境下 init/setOption 会抛错（测试与异常终端），吞掉不让它打断页面
  try {
    if (!chart) {
      chart = echarts.init(el)
    }
  } catch {
    chart = null
    return
  }
  const axisText = textColor()
  const axisLine = lineColor()
  const seriesName = props.title || (props.agg === 'count' ? '数量' : `${props.agg}(${props.metric || ''})`)
  const namedRows = rows.value.map((r) => ({ name: r.key === '' ? '（空）' : r.key, value: r.value }))

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
          data: namedRows,
        },
      ],
    }
  } else if (props.chartType === 'funnel') {
    // 漏斗：value 降序呈现转化阶段
    const sorted = [...namedRows].sort((a, b) => Number(b.value) - Number(a.value))
    option = {
      color: DASH_PALETTE,
      tooltip: { trigger: 'item', formatter: '{b}: {c}' },
      legend: { bottom: 0, type: 'scroll', textStyle: { color: axisText }, pageTextStyle: { color: axisText } },
      series: [
        {
          type: 'funnel',
          left: '12%',
          width: '76%',
          top: 12,
          bottom: 40,
          sort: 'descending',
          gap: 2,
          minSize: '12%',
          label: { color: '#fff', formatter: '{b} {c}', fontSize: 12 },
          data: sorted,
        },
      ],
    }
  } else if (props.chartType === 'heatmap') {
    const { xValues, yValues, data } = heatmapData()
    const maxValue = Math.max(1, ...rows.value.map((r) => r.value))
    option = {
      tooltip: {
        position: 'top',
        formatter: (p: { dataIndex: number }) => {
          const item = data[p.dataIndex]
          if (!item) return ''
          return `${xValues[item[0]] ?? ''} × ${yValues[item[1]] ?? ''}: ${item[2]}`
        },
      },
      grid: { left: 8, right: 16, top: 12, bottom: 8, containLabel: true },
      xAxis: { type: 'category', data: xValues, axisLabel: { color: axisText, rotate: xValues.length > 6 ? 30 : 0, interval: 0 }, axisLine: { lineStyle: { color: axisLine } } },
      yAxis: { type: 'category', data: yValues, axisLabel: { color: axisText }, axisLine: { lineStyle: { color: axisLine } } },
      visualMap: {
        min: 0,
        max: maxValue,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        inRange: { color: ['#ecfdf5', '#10b981', '#065f46'] },
        textStyle: { color: axisText },
      },
      series: [{ type: 'heatmap', data, label: { show: yValues.length <= 6, color: axisText, fontSize: 11 } }],
    }
  } else {
    const horizontal = props.chartType !== 'scatter' && rows.value.length > 8
    const isArea = props.chartType === 'area'
    const isLine = props.chartType === 'line' || isArea
    option = {
      color: [DASH_PALETTE[0]],
      tooltip: { trigger: 'axis', axisPointer: { type: props.chartType === 'scatter' ? 'cross' : 'shadow' } },
      grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      xAxis: horizontal
        ? { type: 'value', axisLabel: { color: axisText }, splitLine: { lineStyle: { color: axisLine } } }
        : {
            type: 'category',
            data: namedRows.map((r) => r.name),
            axisLabel: { color: axisText, rotate: rows.value.length > 6 ? 30 : 0, interval: 0 },
            axisLine: { lineStyle: { color: axisLine } },
          },
      yAxis: horizontal
        ? {
            type: 'category',
            data: namedRows.map((r) => r.name),
            axisLabel: { color: axisText },
            axisLine: { lineStyle: { color: axisLine } },
          }
        : { type: 'value', axisLabel: { color: axisText }, splitLine: { lineStyle: { color: axisLine } } },
      series: [
        {
          name: seriesName,
          type: isLine ? 'line' : props.chartType === 'scatter' ? 'scatter' : 'bar',
          smooth: isLine,
          symbolSize: props.chartType === 'scatter' ? 10 : undefined,
          barMaxWidth: 36,
          itemStyle: { borderRadius: props.chartType === 'bar' ? [4, 4, 0, 0] : 0 },
          areaStyle:
            isArea
              ? {
                  color: {
                    type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [
                      { offset: 0, color: 'rgba(16, 185, 129, 0.28)' },
                      { offset: 1, color: 'rgba(16, 185, 129, 0.02)' },
                    ],
                  },
                }
              : undefined,
          data: props.chartType === 'scatter'
            ? rows.value.map((r) => ({ value: [r.key === '' ? '（空）' : r.key, r.value] }))
            : rows.value.map((r) => r.value),
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

/** 动作总线 set-filter：追加条件（等值 / 显式运算符 / null 清除）并重查 */
function setFilter(cond: Record<string, unknown>): void {
  upsertDashConditions(extraConditions.value, cond)
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

// 全屏切换后容器尺寸变化 → 重算画布
watch(isFullscreen, async () => {
  await nextTick()
  chart?.resize()
})

onMounted(async () => {
  await nextTick()
  if (chartEl.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (chart) {
        chart.resize()
      } else {
        // 实例尚未创建（此前 0 尺寸被守卫跳过）：容器恢复尺寸时补渲染
        render()
      }
    })
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
.dash-chart.is-fullscreen {
  z-index: 3000;
  border-radius: 0;
}
.dash-chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 20px;
}
.dash-chart-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
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
.dash-chart:hover .dash-fullscreen-btn,
.dash-chart.is-fullscreen .dash-fullscreen-btn {
  opacity: 1;
}
.dash-fullscreen-btn:hover {
  background: var(--el-fill-color, #f0f2f5);
  color: var(--el-color-primary, #10b981);
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
