<template>
  <div class="page-chart">
    <!-- 可选标题行 -->
    <div v-if="title" class="page-chart-title">{{ title }}</div>
    <!-- 已配置：交 PageDataChart 渲染（空数据/加载态/空态文案由其内部处理） -->
    <PageDataChart
      v-if="hasConfig"
      :rows="rows"
      :config="chartConfig"
      :columns="labelColumns"
      :height="height"
      :loading="loading"
    />
    <!-- 未配置维度/指标：占位提示（不发起取数） -->
    <div v-else class="page-chart-empty" :style="{ height: height || '320px' }">
      <el-empty description="请在属性面板「配置图表」中设置图表类型、维度列与指标列" :image-size="80" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * PAGE 轨数据图表（Task 3-e：page-chart 组件，VIEW 轨 PageDataChart 能力的页面级复活）。
 *
 * 职责边界（对齐 page-table / page-list-cards 的自取数模式）：
 * - 自取数：dataSourceApi.queryData 经数据源 refId 拉行数据——运行态 size=-1 全量拉取
 *   （对齐 PageRenderer chart 分支语义：图表按维度前端聚合需要全量；后端 size<=0 跳过 LIMIT），
 *   设计态固定首页 10 条（对齐 PageDataTable/PageDataCards 设计态口径，避免画布拉全量）；
 * - 数据映射：props.config（PAGE 轨形态 {type, dimension, measures}，PageChartConfigDialog 产出）
 *   经 chartDataset.normalizeChartConfig 归一为 VIEW 轨 ViewChartConfig 后交
 *   PageDataChart（rows → buildChartDataset/buildPieDataset 前端聚合，ECharts 渲染），
 *   聚合口径复用 tableEnhance.computeAggregate（与汇总行同源）；
 * - 动作总线：expose refresh/setFilter/resetFilter + emit ready（PageRendererPage
 *   componentRefs 注册与 set-filter/refresh 动作链与 page-table 同款接入点）。
 *
 * 行取值兼容：rows 扁平化为 {...字段, id, version}（PageDataTable fetchApi 同款），
 * chartDataset.rowValueOf 双形态兼容，聚合不受影响。
 */
import { ref, computed, watch, onMounted, inject } from 'vue'
import PageDataChart from './PageDataChart.vue'
import { normalizeChartConfig, CHART_AGGS, type ViewChartConfig } from './chartDataset'
import type { PageChartConfig, PageChartMeasure } from './pageChartConfig'
import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'
import type { DataSourceBindingContext } from '@/components/business/types'

const props = withDefaults(
  defineProps<{
    /** 页面 key（page-table 同款契约；当前取数走数据源 refId，预留页面级数据通道切换） */
    pageKey: string
    /** 页面内数据源绑定 id（schema.dataSources[].id；dsRefId 缺省时经绑定存储解析） */
    dataSourceId?: string
    /** 全局数据源 refId（PageRendererPage.transformComponent 注入，优先于绑定存储解析） */
    dsRefId?: string
    /** 设计态标记：取数固定首页且最多 10 条（PageDesigner.enableCardDesignMode 注入） */
    designMode?: boolean
    /** 图表画布高度（css 值），缺省 320px */
    height?: string
    /** 图表配置（PageChartConfigDialog 产出：{type, dimension, measures:[{key,agg,label?}]}） */
    config?: PageChartConfig | null
    /** 可选标题（画布上方标题行；缺省不渲染） */
    title?: string
  }>(),
  {
    height: '320px',
    config: null,
    title: '',
  },
)

const emit = defineEmits<{
  (e: 'ready', instance: {
    refresh: () => void
    setFilter: (filter: Record<string, unknown>) => void
    resetFilter: () => void
    /** 行数据 ref（emit 载荷不解包，.value 取行；defineExpose 同名字段经代理访问自动解包） */
    records: unknown
  }): void
  (e: 'loaded', rows: any[]): void
}>()

/** 动作总线（PageRendererPage provide）：register 上报实例供 refresh/set-filter 动作链寻址 */
const actionBus = inject<
  {
    dispatch: (trigger: string, eventData: any) => boolean
    register?: (dataSourceId: string, instance: any) => void
  } | undefined
>('pageActionBus')

// ==================== 数据源解析 ====================

/** 从绑定存储解析全局数据源 refId（优先 props.dsRefId，其次 store 按 dataSourceId 查找；对齐 PageDataTable） */
const resolvedRefId = computed(() => {
  if (props.dsRefId) return props.dsRefId
  if (props.dataSourceId) {
    const binding = activeDsBindings.value.find((b: DataSourceBindingContext) => b.id === props.dataSourceId)
    if (binding?.refId) return binding.refId
  }
  return ''
})

// ==================== 配置归一化（PAGE 形态 → VIEW 轨 ViewChartConfig） ====================

/** 指标列容错归一：剔除空 key、非法 agg 回退 sum（畸形容错对齐 normalizeChartConfig 口径） */
function normalizeMeasures(measures: unknown): PageChartMeasure[] {
  if (!Array.isArray(measures)) return []
  return measures
    .filter((m: any) => m && typeof m.key === 'string' && m.key !== '')
    .map((m: any) => ({
      key: m.key as string,
      agg: CHART_AGGS.includes(m.agg) ? m.agg : 'sum',
      ...(typeof m.label === 'string' && m.label !== '' ? { label: m.label as string } : {}),
    }))
}

/** 归一化配置：维度与指标齐备才有效；未配置返回 null（组件显示「未配置」空态，不发起取数） */
const chartConfig = computed<ViewChartConfig | null>(() => {
  const raw = props.config
  if (!raw || typeof raw !== 'object') return null
  const dimension = typeof raw.dimension === 'string' ? raw.dimension : ''
  const yFields = normalizeMeasures(raw.measures)
  if (!dimension || yFields.length === 0) return null
  // normalizeChartConfig 补齐 limit 缺省（20）并对 type 容错回退 bar
  return normalizeChartConfig({ type: raw.type, xField: dimension, yFields })
})

const hasConfig = computed(() => chartConfig.value !== null)

/** 原始指标声明（含可选显示名），用于系列名 label 映射覆盖 */
const rawMeasures = computed<PageChartMeasure[]>(() => {
  const raw = props.config
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.measures)) return []
  return normalizeMeasures(raw.measures)
})

// ==================== 行数据与列元数据 ====================

const rows = ref<any[]>([])
const loading = ref(false)
/** 最近加载的记录（expose 供动作总线/外部读取，对齐 PageDataTable.records） */
const records = computed(() => rows.value)
/** 数据源 metadata 列（getMetadata；显示名映射 + 聚合口径判定的渐进增强，失败不阻断取数） */
const metadataColumns = ref<Array<{ key: string; label: string; columnType?: string }>>([])

/** 列显示名映射（PageDataChart.columns）：metadata label 为底，指标显示名覆盖（图例/系列名） */
const labelColumns = computed(() => {
  const map = new Map<string, string>()
  for (const c of metadataColumns.value) map.set(c.key, c.label || c.key)
  for (const m of rawMeasures.value) if (m.label) map.set(m.key, m.label)
  return Array.from(map, ([key, label]) => ({ key, label }))
})

/** 行数据扁平化：BizDataVO {id, data:{...}, version} → {...字段, id, version}（PageDataTable 同款） */
function flattenRecords(list: any[]): any[] {
  return (list || []).map((r: any) => ({ ...(r.data || {}), id: r.id, version: r.version }))
}

// ==================== 取数 ====================

/** 动作总线 set-filter 注入的过滤条件（eq 合并进取数 filter；对齐 PageDataTable.currentFilter） */
const currentFilter = ref<Record<string, unknown> | undefined>(undefined)

/**
 * 全量拉取行数据（运行态 size=-1；设计态首页 10 条），交 PageDataChart 前端按维度聚合。
 * 动作总线 set-filter 注入的条件以 eq 合并（对齐 PageDataCards）；空值条件剔除。
 */
async function loadRows() {
  const dsId = resolvedRefId.value
  if (!dsId || !hasConfig.value) {
    rows.value = []
    return
  }
  loading.value = true
  try {
    const query: Record<string, any> = props.designMode
      // 设计态预览固定取首页且最多 10 条（对齐 PageDataTable/PageDataCards 设计态口径）
      ? { page: 1, size: 10 }
      // 运行态全量拉取（后端 size<=0 跳过 LIMIT），前端按维度聚合（对齐 PageRenderer chart 分支 size=-1 语义）
      : { size: -1 }
    const filterConditions = currentFilter.value
      ? Object.entries(currentFilter.value)
          .filter(([, v]) => v !== '' && v !== null && v !== undefined)
          .map(([column, value]) => ({ column, op: 'eq', value }))
      : []
    if (filterConditions.length > 0) {
      query.filter = JSON.stringify({ logic: 'AND', conditions: filterConditions })
    }
    const res = await dataSourceApi.queryData(dsId, query)
    rows.value = flattenRecords(res?.data?.records || [])
    emit('loaded', rows.value)
  } catch {
    // http 拦截器已弹出错误消息；图表退化为「暂无数据」空态
    rows.value = []
  } finally {
    loading.value = false
  }
}

/** 加载数据源 metadata（显示名映射；失败静默——图表仍可用 key 作系列名） */
async function loadMetadata() {
  const dsId = resolvedRefId.value
  if (!dsId) {
    metadataColumns.value = []
    return
  }
  try {
    const res = await dataSourceApi.getMetadata(dsId)
    metadataColumns.value = ((res?.data as any)?.columns || []).map((c: any) => ({
      key: c.key,
      label: c.label || c.key,
      columnType: c.columnType,
    }))
  } catch {
    metadataColumns.value = []
  }
}

// ==================== 动作总线接口（对齐 PageDataTable refresh/setFilter/resetFilter） ====================

function refresh() {
  void loadRows()
}

function setFilter(filter: Record<string, unknown>) {
  currentFilter.value = { ...(currentFilter.value || {}), ...filter }
  void loadRows()
}

function resetFilter() {
  currentFilter.value = undefined
  void loadRows()
}

defineExpose({
  refresh,
  setFilter,
  resetFilter,
  /** 已加载行数据（ref 经 expose 自动解包） */
  records,
  reload: loadRows,
})

// ==================== 生命周期与依赖变化 ====================

onMounted(async () => {
  await loadMetadata()
  void loadRows()
  const instance = { refresh, setFilter, resetFilter, records }
  actionBus?.register?.(props.dataSourceId || '', instance)
  emit('ready', instance)
})

// 数据源解析变化（含绑定存储异步就绪 '' → id）：重载列元数据 + 重新取数
watch(resolvedRefId, () => {
  metadataColumns.value = []
  void loadMetadata()
  void loadRows()
})

// 设计态标记变化：取数上限口径切换（10 条 ↔ 全量），重取
watch(() => props.designMode, () => {
  void loadRows()
})

// 配置变化（设计器确认配置回填）：维度/指标齐备时重取（未配置时 loadRows 内部守卫清空）
watch(() => props.config, () => {
  void loadRows()
}, { deep: true })
</script>

<style scoped>
.page-chart {
  width: 100%;
  min-width: 0;
}
.page-chart-title {
  margin-bottom: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.page-chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
