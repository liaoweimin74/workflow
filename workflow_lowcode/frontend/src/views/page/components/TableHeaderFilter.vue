<template>
  <!-- 表头筛选漏斗（Task ⑤）：label + 漏斗图标，点击弹层配置该列筛选；
       click.stop 防止触发列排序/行点击；headerRender 场景下替换默认 label 文本 -->
  <span class="thf-wrap" @click.stop>
    <el-popover
      v-model:visible="panelVisible"
      placement="bottom-start"
      :width="panelWidth"
      trigger="click"
      @show="handlePanelOpen"
    >
      <template #reference>
        <span class="thf-trigger" :title="`筛选${label}`">
          <span class="thf-label">{{ label }}</span>
          <el-icon class="thf-icon" :class="{ 'is-active': active }"><Filter /></el-icon>
        </span>
      </template>

      <div class="thf-panel" @click.stop>
        <!-- 文本列：多选值（候选来自当前页数据；选项类列映射 label 显示） -->
        <el-select
          v-if="kind === 'text'"
          v-model="textValues"
          multiple
          filterable
          clearable
          placeholder="筛选值"
          style="width: 100%"
        >
          <el-option v-for="o in optionItems" :key="String(o.value)" :label="o.label" :value="o.value" />
        </el-select>

        <!-- 数值列：区间 -->
        <div v-else-if="kind === 'number'" class="thf-range">
          <el-input-number v-model="numMin" :controls="false" placeholder="最小值" class="thf-range-input" />
          <span class="thf-sep">至</span>
          <el-input-number v-model="numMax" :controls="false" placeholder="最大值" class="thf-range-input" />
        </div>

        <!-- 日期列：日期/日期时间区间 -->
        <el-date-picker
          v-else
          v-model="dateRange"
          :type="dateType || 'daterange'"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          :value-format="dateValueFormat"
          style="width: 100%"
        />

        <div class="thf-actions">
          <el-button text size="small" @click="handleClear">清空</el-button>
          <el-button type="primary" size="small" :disabled="!canApply" @click="handleApply">筛选</el-button>
        </div>
        <div v-if="rangeIncomplete" class="thf-tip">区间需同时填写起止值</div>
      </div>
    </el-popover>
  </span>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Filter } from '@element-plus/icons-vue'
import { buildHeaderFilterCondition, hasActiveHeaderFilter, type HeaderFilterValue } from './tableEnhance'

const props = withDefaults(defineProps<{
  /** 列 key（筛选目标列，发送给服务端 filter 条件） */
  columnKey: string
  /** 列标题 */
  label: string
  /** 筛选形态：text=多选值 / number=数字区间 / date=日期区间 */
  kind: 'text' | 'number' | 'date'
  /** 日期形态（kind=date 时）：daterange（默认）/ datetimerange */
  dateType?: 'daterange' | 'datetimerange'
  /** 文本多选候选（静态传入） */
  options?: { label: string; value: any }[]
  /** 文本多选候选（惰性求值：弹层打开时读取最新页数据） */
  loadOptions?: () => { label: string; value: any }[]
  /** 当前筛选值（惰性读取，保持与父级筛选状态的响应式联动） */
  getValue?: () => HeaderFilterValue | undefined
}>(), {
  dateType: 'daterange',
})

const emit = defineEmits<{
  /** 应用筛选（value=null 表示清空该列筛选）；父级负责写回状态并重新取数 */
  (e: 'apply', payload: { key: string; value: HeaderFilterValue | null }): void
}>()

/** 漏斗高亮：该列存在生效筛选条件 */
const active = computed(() => hasActiveHeaderFilter(props.getValue?.()))

// ========== 弹层状态（打开时从父级惰性初始化，候选/回显读最新数据） ==========
const panelVisible = ref(false)
const textValues = ref<any[]>([])
const numMin = ref<number | undefined>(undefined)
const numMax = ref<number | undefined>(undefined)
const dateRange = ref<[string, string] | null>(null)

/** 候选项：静态 options 优先，其次惰性 loadOptions（每次打开刷新） */
const optionItems = ref<{ label: string; value: any }[]>([])

const panelWidth = computed(() => (props.kind === 'number' ? 260 : 220))

/** 日期值格式：与后端字符串比较语义对齐 */
const dateValueFormat = computed(() => (props.dateType === 'datetimerange' ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD'))

function handlePanelOpen() {
  optionItems.value = props.options || props.loadOptions?.() || []
  const current = props.getValue?.()
  textValues.value = current?.mode === 'in' ? [...current.values] : []
  numMin.value = current?.mode === 'range' && current.min !== '' ? Number(current.min) : undefined
  numMax.value = current?.mode === 'range' && current.max !== '' ? Number(current.max) : undefined
  dateRange.value = current?.mode === 'range' ? [String(current.min), String(current.max)] : null
}

/** 区间半填：禁止应用（后端 range 要求起止同时存在，丢弃会造成"看起来筛了实际没筛"） */
const rangeIncomplete = computed(() => {
  if (props.kind === 'text') return false
  const hasMin = props.kind === 'number' ? numMin.value !== undefined && numMin.value !== null : !!dateRange.value?.[0]
  const hasMax = props.kind === 'number' ? numMax.value !== undefined && numMax.value !== null : !!dateRange.value?.[1]
  return hasMin !== hasMax
})

const canApply = computed(() => {
  if (props.kind === 'text') return textValues.value.length > 0
  return !rangeIncomplete.value && (numMin.value !== undefined || dateRange.value !== null)
})

function toFilterValue(): HeaderFilterValue | null {
  if (props.kind === 'text') {
    return textValues.value.length ? { mode: 'in', values: [...textValues.value] } : null
  }
  if (props.kind === 'number') {
    if (numMin.value === undefined || numMin.value === null || numMax.value === undefined || numMax.value === null) return null
    return { mode: 'range', min: numMin.value, max: numMax.value }
  }
  if (!dateRange.value || !dateRange.value[0] || !dateRange.value[1]) return null
  return { mode: 'range', min: dateRange.value[0], max: dateRange.value[1] }
}

function handleApply() {
  const value = toFilterValue()
  if (value && buildHeaderFilterCondition(props.columnKey, value) === null) return
  panelVisible.value = false
  emit('apply', { key: props.columnKey, value })
}

function handleClear() {
  panelVisible.value = false
  emit('apply', { key: props.columnKey, value: null })
}
</script>

<style scoped>
.thf-wrap {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
}
.thf-trigger {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  min-width: 0;
}
.thf-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.thf-icon {
  flex-shrink: 0;
  color: #c0c4cc;
  transition: color 0.15s;
}
.thf-trigger:hover .thf-icon {
  color: var(--el-color-primary);
}
/* 漏斗高亮：该列筛选生效中 */
.thf-icon.is-active {
  color: var(--el-color-primary);
}
.thf-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.thf-range {
  display: flex;
  align-items: center;
  gap: 6px;
}
.thf-range-input {
  width: 100%;
}
.thf-sep {
  flex-shrink: 0;
  color: #909399;
}
.thf-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}
.thf-tip {
  font-size: 12px;
  color: var(--el-color-warning);
  line-height: 1.2;
}
</style>
