<template>
  <div ref="rootEl" class="dash-filter" :class="{ 'is-design': designMode, 'is-fullscreen': isFullscreen }">
    <span v-if="label" class="dash-filter-label">{{ label }}</span>
    <el-date-picker
      v-if="filterType === 'date-range'"
      :model-value="dateRange"
      type="daterange"
      value-format="YYYY-MM-DD"
      range-separator="至"
      start-placeholder="开始日期"
      end-placeholder="结束日期"
      size="small"
      :clearable="true"
      :disabled="designMode"
      class="dash-filter-control"
      @update:model-value="onDateRange"
    />
    <el-select
      v-else-if="filterType === 'select'"
      :model-value="selectValue"
      size="small"
      :placeholder="placeholder || '全部'"
      :clearable="true"
      :disabled="designMode"
      class="dash-filter-control"
      @update:model-value="onSelect"
    >
      <el-option v-for="option in optionList" :key="option" :label="option" :value="option" />
    </el-select>
    <el-input
      v-else
      :model-value="keyword"
      size="small"
      :placeholder="placeholder || '输入关键词'"
      :clearable="true"
      :disabled="designMode"
      class="dash-filter-control"
      @update:model-value="onKeyword"
      @keyup.enter="onKeyword(keyword)"
    />
    <div v-if="designMode" class="dash-filter-hint">筛选器（运行时向同页组件广播）</div>
  </div>
</template>

<script setup lang="ts">
/**
 * 仪表盘筛选器（Task 120）。
 *
 * 三种形态：date-range（日期区间）/ select（下拉枚举）/ keyword（关键词模糊）。
 *
 * 广播模型（两路，渲染器接线）：
 *   1. emit('filter-change', payload) —— 渲染器监听后转发为动作总线 filter-change
 *      触发（页面 actions 可编程响应）；
 *   2. autoBroadcast（默认 true）—— 渲染器直接向同 schema 内所有暴露 setFilter 的
 *      组件广播 `{ [field]: {op, value} | null }`（拖一个日期筛选即全局生效，零配置）。
 *
 * 值语义：
 *   - date-range → { op: 'range', value: ['YYYY-MM-DD 00:00:00', 'YYYY-MM-DD 23:59:59'] }
 *   - select     → 等值（清除时 null）
 *   - keyword    → { op: 'like', value: 文本 }（清除时 null）
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useFullscreen } from '@/composables/useFullscreen'

const props = withDefaults(
  defineProps<{
    /** date-range | select | keyword */
    filterType?: string
    /** 目标字段（列名） */
    field?: string
    label?: string
    placeholder?: string
    /** select 形态的枚举（逗号分隔） */
    options?: string
    /** 变更后自动向同页组件广播（false = 只 emit，由页面 actions 编排） */
    autoBroadcast?: boolean
    designMode?: boolean
  }>(),
  {
    filterType: 'date-range',
    field: '',
    label: '',
    placeholder: '',
    options: '',
    autoBroadcast: true,
    designMode: false,
  },
)

const emit = defineEmits<{
  (e: 'ready', instance: unknown): void
  (e: 'filter-change', payload: { field: string; op: string; value: unknown }): void
}>()

const rootEl = ref<HTMLDivElement | null>(null)
const { isFullscreen, toggle: _toggle } = useFullscreen(rootEl)
const dateRange = ref<[string, string] | null>(null)
const selectValue = ref<string | null>(null)
const keyword = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const optionList = computed(() =>
  props.options
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== ''),
)

function onDateRange(value: [string, string] | null): void {
  dateRange.value = value
  if (value === null || !Array.isArray(value) || value.length !== 2 || !value[0] || !value[1]) {
    publish(null)
    return
  }
  publish({
    op: 'range',
    value: [`${value[0]} 00:00:00`, `${value[1]} 23:59:59`],
  })
}

function onSelect(value: string | null): void {
  selectValue.value = value
  publish(value === null || value === '' ? null : { op: 'eq', value })
}

function onKeyword(value: string): void {
  keyword.value = value
  // 输入防抖：300ms 后发布（清除立即发布）
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  if (!value) {
    publish(null)
    return
  }
  debounceTimer = setTimeout(() => publish({ op: 'like', value }), 300)
}

function publish(explicit: { op: string; value: unknown } | null): void {
  const field = props.field || ''
  if (!field) return
  // 统一「清除」语义：null → 各组件移除该字段条件
  const payloadValue = explicit === null ? null : explicit.value
  const payloadOp = explicit === null ? 'eq' : explicit.op
  emit('filter-change', { field, op: payloadOp, value: payloadValue })
}

/** 渲染器在 ready 上报时挂上 broadcaster（autoBroadcast 由渲染器执行） */
function setPendingValue(_field: string, _value: unknown): void {
  /* 编程式回填（动作总线 set-value 目标为筛选器时） */
}

onMounted(() => {
  emit('ready', { setFilter: setPendingValue, refresh: () => undefined, isDashFilter: true })
})

onBeforeUnmount(() => {
  if (debounceTimer !== null) clearTimeout(debounceTimer)
})

watch(
  () => [props.filterType, props.field, props.options],
  () => {
    dateRange.value = null
    selectValue.value = null
    keyword.value = ''
  },
)

defineExpose({ isDashFilter: true })
</script>

<style scoped>
.dash-filter {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  min-height: 44px;
}
.dash-filter.is-design {
  outline: 1px dashed var(--el-color-primary-light-5, #a7f3d0);
}
.dash-filter.is-fullscreen {
  z-index: 3000;
  border-radius: 0;
}
.dash-filter-label {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
  font-weight: 500;
  flex: none;
}
.dash-filter-control {
  flex: 1;
  min-width: 0;
}
.dash-filter-hint {
  position: absolute;
  right: 12px;
  bottom: -18px;
  font-size: 11px;
  color: var(--el-color-warning, #e6a23c);
  white-space: nowrap;
}
</style>
