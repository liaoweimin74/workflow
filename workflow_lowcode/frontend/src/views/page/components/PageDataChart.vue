<template>
  <el-card v-loading="loading" class="page-data-chart" shadow="never">
    <!-- 画布：有数据时渲染；0 尺寸（隐藏 tab）时 ResizeObserver 恢复后补渲染 -->
    <div v-show="hasData" ref="chartEl" class="page-data-chart-canvas" :style="{ height: canvasHeight }" />
    <!-- 空态：未配置维度/指标 or 无数据 -->
    <div v-if="!hasData" class="page-data-chart-empty" :style="{ height: canvasHeight }">
      <el-empty :description="emptyText" :image-size="80" />
    </div>
  </el-card>
</template>

<script setup lang="ts">
/**
 * 视图图表渲染器（Task ④：display=chart 形态）。
 *
 * 职责边界：数据由 PageRenderer 查询后经 props.rows 下发（与表格同源取数/同 filter 语义），
 * 数据映射纯逻辑在 chartDataset.ts（rows → {dimensions, series} / pie [{name,value}]），
 * 本组件只负责 ECharts 渲染与容器自适应。ECharts 按需注册/主题色板/能力探测
 * 复用仪表盘封装 useEcharts（同一全局单例注册，避免重复注册与包体膨胀；
 * 不直接复用 DashChart 组件——其数据契约是 aggregate 端点 {key,value}，与行数据前端聚合不同）。
 *
 * 交互：容器高度缺省 320px；ResizeObserver 自适应（参照 DashChart 现成做法：
 * 0 尺寸容器跳过 init，恢复尺寸时由 observer 回调补渲染）。
 * 空数据/未配置维度指标时渲染 el-empty，不白屏。
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  buildChartDataset,
  buildPieDataset,
  normalizeChartConfig,
  type ViewChartConfig,
} from './chartDataset'
import { ensureEcharts, DASH_PALETTE, cssVar, canvasAvailable } from '@/views/dashboard/components/useEcharts'

const props = withDefaults(
  defineProps<{
    /** 查询到的行数据（与表格同源：扁平行或 BizDataVO {id, data:{...}}） */
    rows?: any[]
    /** schema.chart 配置（未配置时给合理缺省，未配置维度/指标时展示提示空态） */
    config?: ViewChartConfig | null
    /** 视图列声明（指标列 key → 显示名映射，用作图例/系列名） */
    columns?: Array<{ key: string; label?: string }>
    /** 画布高度（css 值），缺省 320px */
    height?: string
    /** 取数中（v-loading 遮罩） */
    loading?: boolean
  }>(),
  {
    rows: () => [],
    config: null,
    columns: () => [],
    height: '320px',
    loading: false,
  },
)

const chartEl = ref<HTMLDivElement | null>(null)
let chart: ReturnType<ReturnType<typeof ensureEcharts>['init']> | null = null
let resizeObserver: ResizeObserver | null = null

/** 配置归一化（畸形容错 + 缺省回填），渲染映射全部基于归一化结果 */
const cfg = computed(() => normalizeChartConfig(props.config))
const canvasHeight = computed(() => props.height || '320px')

/** 列显示名映射：视图 columns 的 label，未命中回退 key */
function labelOf(key: string): string {
  const col = props.columns.find((c) => c.key === key)
  return (col && col.label) || key
}

/** bar/line 数据集（pie 为 null）；未配置维度/指标返回 null */
const barLineDataset = computed(() =>
  cfg.value.type === 'pie' ? null : buildChartDataset(props.rows, cfg.value, labelOf),
)
/** pie 数据（只取第一个指标列；bar/line 为 null） */
const pieDataset = computed(() => (cfg.value.type === 'pie' ? buildPieDataset(props.rows, cfg.value) : null))

const hasData = computed(() =>
  cfg.value.type === 'pie'
    ? !!pieDataset.value && pieDataset.value.length > 0
    : !!barLineDataset.value && barLineDataset.value.dimensions.length > 0,
)

const emptyText = computed(() => {
  if (!cfg.value.xField || cfg.value.yFields.length === 0) return '请在视图设计器中配置图表的维度列与指标列'
  return props.loading ? '数据加载中…' : '暂无数据'
})

/** 构建 ECharts option（bar/line 多系列共用 category X 轴；pie 单系列环图） */
function buildOption(): Record<string, unknown> | null {
  const axisText = cssVar('--el-text-color-secondary', '#909399')
  const axisLine = cssVar('--el-border-color-lighter', '#ebeef5')
  if (cfg.value.type === 'pie') {
    const data = pieDataset.value
    if (!data || !data.length) return null
    return {
      color: DASH_PALETTE,
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, type: 'scroll', textStyle: { color: axisText } },
      series: [
        {
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '46%'],
          itemStyle: { borderRadius: 6, borderColor: cssVar('--el-bg-color', '#fff'), borderWidth: 2 },
          label: { color: axisText, formatter: '{b} {d}%' },
          data,
        },
      ],
    }
  }
  const ds = barLineDataset.value
  if (!ds || !ds.dimensions.length || !ds.series.length) return null
  return {
    color: DASH_PALETTE,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0, type: 'scroll', textStyle: { color: axisText } },
    grid: { left: 8, right: 16, top: 30, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: ds.dimensions,
      axisLabel: { color: axisText, rotate: ds.dimensions.length > 6 ? 30 : 0, interval: 0 },
      axisLine: { lineStyle: { color: axisLine } },
    },
    yAxis: { type: 'value', axisLabel: { color: axisText }, splitLine: { lineStyle: { color: axisLine } } },
    series: ds.series.map((s) => ({
      name: s.name,
      type: cfg.value.type,
      data: s.data,
      barMaxWidth: 36,
      smooth: cfg.value.type === 'line',
      itemStyle: { borderRadius: cfg.value.type === 'bar' ? [4, 4, 0, 0] : 0 },
    })),
  }
}

function render(): void {
  const el = chartEl.value
  if (!el || !canvasAvailable()) return
  // 0 尺寸容器（tab 未激活/折叠面板）init 会产生 ECharts 警告且宽度锁定 0：静默跳过，
  // 容器恢复尺寸时 ResizeObserver 回调会补调 render()
  if (el.clientWidth === 0 || el.clientHeight === 0) return
  const option = buildOption()
  if (!option) return
  const echarts = ensureEcharts()
  // 环境兜底：jsdom/无 canvas 环境下 init/setOption 会抛错（测试与异常终端），吞掉保留空态展示
  try {
    if (!chart) {
      chart = echarts.init(el)
    }
  } catch {
    chart = null
    return
  }
  try {
    chart.setOption(option, true)
  } catch {
    /* setOption 在异常环境下失败时保留空态展示 */
  }
}

watch([barLineDataset, pieDataset, () => cfg.value.type], async () => {
  await nextTick()
  render()
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
  render()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<style scoped>
.page-data-chart {
  flex: 1;
  min-height: 0;
}
.page-data-chart :deep(.el-card__body) {
  padding: 12px 16px;
}
.page-data-chart-canvas {
  width: 100%;
  min-width: 0;
}
.page-data-chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
