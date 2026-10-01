<template>
  <div ref="rootEl" class="dash-goal" :class="{ 'is-design': designMode, 'is-fullscreen': isFullscreen }">
    <div class="dash-goal-head">
      <span class="dash-goal-title">{{ title || '目标进度' }}</span>
      <span class="dash-goal-percent" :class="percentTone">{{ percentText }}</span>
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
    <el-progress
      :percentage="percent"
      :stroke-width="10"
      :color="progressColor"
      :show-text="false"
      class="dash-goal-bar"
    />
    <div class="dash-goal-legend">
      <span>当前 <b>{{ displayCurrent }}</b></span>
      <span>目标 <b>{{ displayTarget }}</b></span>
      <span v-if="unit">{{ unit }}</span>
    </div>
    <div v-if="designMode && !resolvedSourceId" class="dash-goal-placeholder">未绑定数据源</div>
  </div>
</template>

<script setup lang="ts">
/**
 * 目标进度卡（Task 120）：当前值（聚合）vs 目标值（配置）→ 进度条 + 百分比。
 *
 * 数据契约：与 DashKpi 相同（group=__all__ 单值）。完成率超 100% 封顶展示，
 * 百分比色调：<60% 玫瑰、<100% 琥珀、达成 翡翠。
 */
import { ref, computed, onMounted, watch } from 'vue'
import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'
import { parseDashFilter, mergeDashFilter, upsertDashConditions, type DashCondition } from './dash-shared'
import { useFullscreen } from './useFullscreen'

const props = withDefaults(
  defineProps<{
    title?: string
    target?: number
    unit?: string
    agg?: string
    metric?: string | null
    dataSourceId?: string
    dsRefId?: string
    filter?: string | null
    designMode?: boolean
    numberFormat?: string
  }>(),
  {
    title: '',
    target: 100,
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
const rootEl = ref<HTMLDivElement | null>(null)
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootEl)
const value = ref<number | null>(null)
const baseFilter = ref<Record<string, unknown> | null>(parseDashFilter(props.filter))
const extraConditions = ref<DashCondition[]>([])

const resolvedSourceId = computed(
  () => props.dsRefId || activeDsBindings.value.find((b) => b.id === props.dataSourceId)?.refId || '',
)

const safeTarget = computed(() => (Number(props.target) > 0 ? Number(props.target) : 100))
const percent = computed(() => {
  if (value.value === null) return 0
  return Math.min(100, Math.round((value.value / safeTarget.value) * 100))
})
const percentText = computed(() => (value.value === null ? '--' : `${percent.value}%`))
const percentTone = computed(() => {
  if (value.value === null) return ''
  if (percent.value >= 100) return 'done'
  if (percent.value >= 60) return 'near'
  return 'far'
})
const progressColor = computed(() => {
  if (percent.value >= 100) return '#10b981'
  if (percent.value >= 60) return '#f59e0b'
  return '#f43f5e'
})
const displayCurrent = computed(() => (value.value === null ? '--' : props.numberFormat === 'thousand' ? value.value.toLocaleString('zh-CN') : String(value.value)))
const displayTarget = computed(() => (props.numberFormat === 'thousand' ? safeTarget.value.toLocaleString('zh-CN') : String(safeTarget.value)))

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
    console.warn('[dash-goal] aggregate failed:', e instanceof Error ? e.message : e)
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
  () => [props.dsRefId, props.dataSourceId, props.agg, props.metric, props.target],
  () => void fetchValue(),
)

onMounted(() => {
  void fetchValue()
  emit('ready', { setFilter, refresh })
})

defineExpose({ setFilter, refresh })
</script>

<style scoped>
.dash-goal {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 18px;
  border-radius: 12px;
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  min-height: 108px;
  transition: box-shadow 0.2s ease;
}
.dash-goal:hover {
  box-shadow: 0 6px 18px rgba(16, 185, 129, 0.1);
}
.dash-goal.is-design {
  outline: 1px dashed var(--el-color-primary-light-5, #a7f3d0);
}
.dash-goal.is-fullscreen {
  z-index: 3000;
  border-radius: 0;
}
.dash-goal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.dash-goal-title {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
  font-weight: 500;
}
.dash-goal-percent {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.dash-goal-percent.done { color: var(--el-color-success, #10b981); }
.dash-goal-percent.near { color: var(--el-color-warning, #e6a23c); }
.dash-goal-percent.far { color: var(--el-color-danger, #f43f5e); }
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
  flex: none;
}
.dash-goal-head .dash-goal-percent { margin-left: auto; }
.dash-goal:hover .dash-fullscreen-btn,
.dash-goal.is-fullscreen .dash-fullscreen-btn {
  opacity: 1;
}
.dash-fullscreen-btn:hover {
  background: var(--el-fill-color, #f0f2f5);
  color: var(--el-color-primary, #10b981);
}
.dash-goal-legend {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}
.dash-goal-legend b {
  color: var(--el-text-color-primary, #303133);
  font-variant-numeric: tabular-nums;
}
.dash-goal-placeholder {
  position: absolute;
  inset: auto 12px 8px auto;
  font-size: 11px;
  color: var(--el-color-warning, #e6a23c);
}
</style>
