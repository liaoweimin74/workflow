<template>
  <!-- 步骤条：有数据时渲染 el-steps；active/direction/processStatus/finishStatus 透传 -->
  <el-steps
    v-if="normalizedItems.length > 0"
    class="page-steps"
    :active="active"
    :direction="direction"
    :process-status="processStatus"
    :finish-status="finishStatus"
  >
    <el-step
      v-for="(item, idx) in normalizedItems"
      :key="idx"
      class="page-steps-item"
      :title="item.title"
      :description="item.description"
    />
  </el-steps>
  <!-- 空态：未配置步骤 -->
  <el-empty v-else class="page-steps-empty" description="暂无步骤数据" :image-size="80" />
</template>

<script setup lang="ts">
/**
 * 步骤条展示块（Task 3-b 展示五件套 ⑤）。
 *
 * 职责边界：纯展示组件（Task 3-b），props 驱动不绑数据源；数据源驱动版本由后续任务接线。
 * items/active/direction/processStatus/finishStatus 全部由设计器 props 下发，本组件只负责
 * el-steps 包装渲染（静态只读步骤条：不含 el-steps 内置的点击切换，进程态由 active 决定）。
 * processStatus/finishStatus 未传时沿用 el-steps 缺省（process/finish）。
 * 空 items 渲染 el-empty 占位，不白屏。
 */
import { computed } from 'vue'

interface StepsItem {
  /** 步骤标题 */
  title?: string
  /** 步骤描述 */
  description?: string
}

type StepsStatus = 'wait' | 'process' | 'finish' | 'error' | 'success'

const props = withDefaults(
  defineProps<{
    /** 步骤项列表（空数组渲染 el-empty 占位） */
    items?: StepsItem[]
    /** 当前激活步骤（下标从 0 起），缺省 0 */
    active?: number
    /** 显示方向，缺省 horizontal */
    direction?: 'vertical' | 'horizontal'
    /** 当前步骤状态（未传沿用 el-steps 缺省 process） */
    processStatus?: StepsStatus
    /** 已完成步骤状态（未传沿用 el-steps 缺省 finish） */
    finishStatus?: StepsStatus
  }>(),
  {
    items: () => [],
    active: 0,
    direction: 'horizontal',
    processStatus: undefined,
    finishStatus: undefined,
  },
)

/** 容错：非数组（设计器 schema 漂移）回退空列表 */
const normalizedItems = computed<StepsItem[]>(() => (Array.isArray(props.items) ? props.items : []))
</script>

<style scoped>
.page-steps {
  width: 100%;
}
</style>
