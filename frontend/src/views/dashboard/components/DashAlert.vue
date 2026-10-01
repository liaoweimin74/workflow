<template>
  <div ref="rootEl" class="dash-alert" :class="{ 'is-design': designMode, 'is-fullscreen': isFullscreen, 'is-alert': alerting, 'is-ok': !alerting && value !== null }">
    <div class="dash-alert-head">
      <span class="dash-alert-title">{{ title || '指标监控' }}</span>
      <span class="dash-alert-state" :class="{ alerting }">
        <svg v-if="alerting" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
          <path fill="currentColor" d="M12 2L1 21h22L12 2zm0 6a1 1 0 011 1v4a1 1 0 01-2 0V9a1 1 0 011-1zm0 9.2a1.2 1.2 0 110-2.4 1.2 1.2 0 010 2.4z" />
        </svg>
        <svg v-else-if="value !== null" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
          <path fill="currentColor" d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1.2 14.4l-4-4 1.4-1.4 2.6 2.6 5.6-5.6 1.4 1.4-7 7z" />
        </svg>
        {{ stateText }}
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
    <div class="dash-alert-value-row">
      <span class="dash-alert-value">{{ displayValue }}</span>
      <span v-if="unit" class="dash-alert-unit">{{ unit }}</span>
      <span class="dash-alert-threshold">阈值 {{ conditionLabel }} {{ thresholdText }}</span>
    </div>
    <div v-if="alerting && alertText" class="dash-alert-message">{{ alertText }}</div>
    <div v-if="designMode && !resolvedSourceId" class="dash-alert-placeholder">未绑定数据源</div>
  </div>
</template>

<script setup lang="ts">
/**
 * 告警/异常标记卡（Task 120）：聚合单值 vs 阈值（gt/lt/gte/lte/eq），
 * 触发时红色告警态 + 自定义文案；正常时绿色 ✓ 态。
 */
import { ref, computed, onMounted, watch } from 'vue'
import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'
import { parseDashFilter, mergeDashFilter, upsertDashConditions, type DashCondition } from './dash-shared'
import { useFullscreen } from './useFullscreen'

const props = withDefaults(
  defineProps<{
    title?: string
    unit?: string
    agg?: string
    metric?: string | null
    dataSourceId?: string
    dsRefId?: string
    filter?: string | null
    designMode?: boolean
    numberFormat?: string
    /** gt | lt | gte | lte | eq */
    condition?: string
    threshold?: number
    /** 触发时的告警文案 */
    alertText?: string
  }>(),
  {
    title: '',
    unit: '',
    agg: 'count',
    metric: null,
    dataSourceId: '',
    dsRefId: '',
    filter: null,
    designMode: false,
    numberFormat: '',
    condition: 'gt',
    threshold: 0,
    alertText: '',
  },
)

const emit = defineEmits<{ (e: 'ready', instance: unknown): void }>()
const rootEl = ref<HTMLDivElement | null>(null)
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootEl)
const value = ref<number | null>(null)
const baseFilter = ref<Record<string, unknown> | null>(parseDashFilter(props.filter))
const extraConditions = ref<DashCondition[]>([])

const resolvedSourceId = computed(
  () => props.dsRefId || activeDsBindings.value.find((b) => b.id === props.dataSourceId)?.refId || '',
)

const alerting = computed(() => {
  if (value.value === null) return false
  const threshold = Number(props.threshold) || 0
  switch (props.condition) {
    case 'lt': return value.value < threshold
    case 'gte': return value.value >= threshold
    case 'lte': return value.value <= threshold
    case 'eq': return value.value === threshold
    default: return value.value > threshold
  }
})

const conditionLabel = computed(() => {
  const map: Record<string, string> = { gt: '>', lt: '<', gte: '≥', lte: '≤', eq: '=' }
  return map[props.condition] ?? '>'
})

const thresholdText = computed(() => (props.numberFormat === 'thousand' ? (Number(props.threshold) || 0).toLocaleString('zh-CN') : String(props.threshold ?? 0)))

const stateText = computed(() => {
  if (value.value === null) return '--'
  return alerting.value ? '告警' : '正常'
})

const displayValue = computed(() => {
  if (value.value === null) return '--'
  if (props.numberFormat === 'thousand') return value.value.toLocaleString('zh-CN')
  return String(value.value)
})

function currentFilterJson(): string | null {
  return mergeDashFilter(baseFilter.value, extraConditions.value, props.filter)
}

async function fetchValue(): Promise<void> {
  const sourceId = resolvedSourceId.value
  if (!sourceId || props.designMode) return
  try {
    const res = await dataSourceApi.aggregate(sourceId, {
      group: '__all__',
      agg: props.agg || 'count',
      metric: props.agg === 'count' ? null : props.metric || null,
      filter: currentFilterJson(),
    })
    if (res.code !== 0 && res.code !== 200) return
    const rows = res.data?.rows || []
    value.value = rows.length > 0 ? Number(rows[0].value) : 0
  } catch (e: unknown) {
    console.warn('[dash-alert] aggregate failed:', e instanceof Error ? e.message : e)
    value.value = null
  }
}

function setFilter(cond: Record<string, unknown>): void {
  upsertDashConditions(extraConditions.value, cond)
  void fetchValue()
}

function refresh(): void {
  extraConditions.value = []
  void fetchValue()
}

watch(
  () => [props.dsRefId, props.dataSourceId, props.agg, props.metric, props.threshold, props.condition],
  () => void fetchValue(),
)

onMounted(() => {
  void fetchValue()
  emit('ready', { setFilter, refresh })
})

defineExpose({ setFilter, refresh })
</script>

<style scoped>
.dash-alert {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 18px;
  border-radius: 12px;
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  min-height: 104px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.dash-alert.is-alert {
  border-color: rgba(244, 63, 94, 0.45);
  background: linear-gradient(180deg, rgba(244, 63, 94, 0.04), rgba(244, 63, 94, 0)) , var(--el-bg-color, #fff);
  box-shadow: 0 4px 16px rgba(244, 63, 94, 0.12);
}
.dash-alert.is-ok {
  border-color: rgba(16, 185, 129, 0.35);
}
.dash-alert.is-design {
  outline: 1px dashed var(--el-color-primary-light-5, #a7f3d0);
}
.dash-alert.is-fullscreen {
  z-index: 3000;
  border-radius: 0;
}
.dash-alert-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.dash-alert-title {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
  font-weight: 500;
}
.dash-alert-state {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-success, #10b981);
}
.dash-alert-state.alerting {
  color: var(--el-color-danger, #f43f5e);
  animation: dash-alert-pulse 1.6s ease-in-out infinite;
}
.dash-alert-head .dash-alert-state { margin-left: auto; }
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
.dash-alert:hover .dash-fullscreen-btn,
.dash-alert.is-fullscreen .dash-fullscreen-btn {
  opacity: 1;
}
.dash-fullscreen-btn:hover {
  background: var(--el-fill-color, #f0f2f5);
  color: var(--el-color-primary, #10b981);
}
@keyframes dash-alert-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
.dash-alert-value-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.dash-alert-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--el-text-color-primary, #303133);
  font-variant-numeric: tabular-nums;
}
.dash-alert-unit {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
}
.dash-alert-threshold {
  margin-left: auto;
  font-size: 11px;
  color: var(--el-text-color-placeholder, #c0c4cc);
  font-variant-numeric: tabular-nums;
}
.dash-alert-message {
  font-size: 12px;
  color: var(--el-color-danger, #f43f5e);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dash-alert-placeholder {
  position: absolute;
  inset: auto 12px 8px auto;
  font-size: 11px;
  color: var(--el-color-warning, #e6a23c);
}
</style>
