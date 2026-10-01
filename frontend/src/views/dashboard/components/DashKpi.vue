<template>
  <div class="dash-kpi" :class="{ 'is-design': designMode }">
    <div class="dash-kpi-head">
      <span class="dash-kpi-title">{{ title || '指标' }}</span>
      <span v-if="trendText" class="dash-kpi-trend" :class="{ up: trendDirection === 'up', down: trendDirection === 'down' }">
        {{ trendText }}
      </span>
    </div>
    <div class="dash-kpi-value-row">
      <span class="dash-kpi-value">{{ displayValue }}</span>
      <span v-if="unit" class="dash-kpi-unit">{{ unit }}</span>
    </div>
    <div v-if="subtitle" class="dash-kpi-subtitle">{{ subtitle }}</div>
    <!-- 设计态：无数据源配置时给出引导（运行态由渲染器注入数据源） -->
    <div v-if="designMode && !resolvedSourceId" class="dash-kpi-placeholder">未绑定数据源</div>
  </div>
</template>

<script setup lang="ts">
/**
 * 仪表盘 KPI 指标卡（Task 119）。
 *
 * 数据契约：`GET /v1/data-sources/{refId}/aggregate?group=__all__&agg=...` 的
 * 单行结果（key='__all__'）。动作总线约定（对齐 page-table）：expose
 * `setFilter({field: value})` / `refresh()`，实例经 ready 事件上报注册。
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'

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
  },
)

const emit = defineEmits<{ (e: 'ready', instance: unknown): void }>()

const value = ref<number | null>(null)
const loading = ref(false)
const failed = ref(false)
let baseFilter: Record<string, unknown> | null = parseFilter(props.filter)
/** setFilter 追加的条件（动作总线 set-filter） */
const extraConditions = ref<Array<{ column: string; op: string; value: unknown }>>([])

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

/** 同一数据源前次值（相对变化文案，占位：刷新间对比） */
const trendText = computed(() => '')
const trendDirection = computed(() => 'flat' as const)

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
  const base = baseFilter && Array.isArray((baseFilter as any).conditions)
    ? { ...(baseFilter as any) }
    : { logic: 'AND', conditions: [...((baseFilter as any)?.conditions || [])] }
  const conditions = [...(base.conditions || []), ...extraConditions.value]
  return JSON.stringify({ ...base, conditions })
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
      throw new Error((res as any).msg || '聚合查询失败')
    }
    const rows = res.data?.rows || []
    value.value = rows.length > 0 ? Number(rows[0].value) : 0
  } catch (e: any) {
    failed.value = true
    value.value = null
    // 静默降级：仪表盘一个组件失败不干扰其他组件；控制台可见
    console.warn('[dash-kpi] aggregate failed:', e?.message || e)
    if (props.designMode !== true) ElMessage.closeAll()
  } finally {
    loading.value = false
  }
}

/** 动作总线 set-filter：追加等值条件并重查 */
function setFilter(cond: Record<string, unknown>): void {
  for (const [column, val] of Object.entries(cond)) {
    const existing = extraConditions.value.find((c) => c.column === column)
    const item = { column, op: 'eq', value: val }
    if (existing) Object.assign(existing, item)
    else extraConditions.value.push(item)
  }
  void fetchValue()
}

function refresh(): void {
  extraConditions.value = []
  void fetchValue()
}

watch(
  () => [props.dsRefId, props.dataSourceId, props.agg, props.metric],
  () => void fetchValue(),
)

onMounted(() => {
  void fetchValue()
  emit('ready', { setFilter, refresh })
})

onBeforeUnmount(() => {
  /* echarts 实例在 DashChart；KPI 无需清理 */
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
  font-size: 12px;
  font-weight: 600;
}
.dash-kpi-trend.up { color: var(--el-color-success, #10b981); }
.dash-kpi-trend.down { color: var(--el-color-danger, #f43f5e); }
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
.dash-kpi-placeholder {
  position: absolute;
  inset: auto 12px 10px auto;
  font-size: 11px;
  color: var(--el-color-warning, #e6a23c);
}
</style>
