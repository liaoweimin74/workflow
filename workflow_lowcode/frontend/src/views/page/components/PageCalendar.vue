<template>
  <el-calendar v-model="selected" class="page-calendar">
    <!-- 单元格：默认只显示「日」号；命中 highlightedDates 追加小圆点标记 -->
    <template #date-cell="{ data }">
      <div class="page-calendar-cell" :class="{ 'is-highlighted': isHighlighted(data.day) }">
        <span class="page-calendar-cell-day">{{ dayLabel(data.day) }}</span>
        <span v-if="isHighlighted(data.day)" class="page-calendar-cell-dot" />
      </div>
    </template>
  </el-calendar>
</template>

<script setup lang="ts">
/**
 * 日历展示块（Task 3-b 展示五件套 ③）。
 *
 * 职责边界：纯展示组件（Task 3-b），props 驱动不绑数据源；数据源驱动版本由后续任务接线。
 * modelValue/highlightedDates 全部由设计器 props 下发，本组件只负责 el-calendar 包装渲染：
 * modelValue 兼容 Date 与 'yyyy-MM-dd' 字符串（字符串按本地时区解析，避免 new Date(str)
 * 的 UTC 偏移把日期漂移一天）；选中变化通过 update:modelValue 抛出（类型归一为 Date）。
 * 单元格经 date-cell 插槽定制：命中的日期渲染小圆点，其余观感与默认日历一致。
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 选中日期（Date 或 'yyyy-MM-dd' 字符串；未传时日历定位到今天） */
    modelValue?: Date | string
    /** 高亮日期集合（'yyyy-MM-dd'，命中的单元格渲染小圆点标记） */
    highlightedDates?: string[]
  }>(),
  {
    modelValue: undefined,
    highlightedDates: () => [],
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: Date): void
}>()

/** 'yyyy-MM-dd' → 本地时区 Date；非法格式返回 undefined（日历回退定位今天） */
function parseDay(day: string): Date | undefined {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(day).trim())
  if (!m) return undefined
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** v-model 双向：get 兼容 Date/string，set 归一为 Date 向外抛 update:modelValue */
const selected = computed<Date | undefined>({
  get: () => (typeof props.modelValue === 'string' ? parseDay(props.modelValue) : props.modelValue),
  set: (value) => {
    if (value) emit('update:modelValue', value)
  },
})

/** Set 化避免每格 O(n) 查找 */
const highlightSet = computed(() => new Set(props.highlightedDates))

function isHighlighted(day: string): boolean {
  return highlightSet.value.has(day)
}

/** 单元格只显示「日」号（与 el-calendar 默认观感一致） */
function dayLabel(day: string): string {
  return day.split('-')[2] ?? day
}
</script>

<style scoped>
.page-calendar-cell {
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.page-calendar-cell.is-highlighted {
  font-weight: 600;
}
.page-calendar-cell-dot {
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--el-color-primary, #409eff);
}
</style>
