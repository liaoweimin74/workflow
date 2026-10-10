<template>
  <!-- 时间线：有数据时渲染 el-timeline；reverse 透传（倒序展示） -->
  <el-timeline v-if="normalizedItems.length > 0" class="page-timeline" :reverse="reverse">
    <el-timeline-item
      v-for="(item, idx) in normalizedItems"
      :key="idx"
      class="page-timeline-item"
      :timestamp="item.timestamp"
      :color="item.color"
    >
      <!-- icon 为字符串（如 emoji/字符图标）：经 dot 插槽渲染为节点文本；未传走默认圆点（color 生效） -->
      <template v-if="item.icon" #dot>
        <span class="page-timeline-item-dot-icon" :style="item.color ? { color: item.color } : undefined">
          {{ item.icon }}
        </span>
      </template>
      <div class="page-timeline-item-title">{{ item.title }}</div>
      <p class="page-timeline-item-content">{{ item.content }}</p>
    </el-timeline-item>
  </el-timeline>
  <!-- 空态：未配置时间线节点 -->
  <el-empty v-else class="page-timeline-empty" description="暂无时间线数据" :image-size="80" />
</template>

<script setup lang="ts">
/**
 * 时间线展示块（Task 3-b 展示五件套 ④）。
 *
 * 职责边界：纯展示组件（Task 3-b），props 驱动不绑数据源；数据源驱动版本由后续任务接线。
 * items/reverse 全部由设计器 props 下发，本组件只负责 el-timeline 包装渲染：
 * item 内 timestamp 走节点时间戳、title 加粗 + content 段落、color 作为节点色；
 * icon 为字符串（设计器侧存文本图标），经 dot 插槽渲染（el-timeline-item 的 icon prop
 * 只接受组件，字符串会落成无法解析的组件引用），未传 icon 时走默认圆点节点（color 生效）。
 * 空 items 渲染 el-empty 占位。
 */
import { computed } from 'vue'

interface TimelineItem {
  /** 节点时间戳文本（如 '2026-01-02 10:00'） */
  timestamp?: string
  /** 节点标题（加粗展示） */
  title?: string
  /** 节点正文（段落展示） */
  content?: string
  /** 节点颜色（css 颜色值；icon 文本同步继承） */
  color?: string
  /** 节点图标文本（emoji/字符，经 dot 插槽渲染） */
  icon?: string
}

const props = withDefaults(
  defineProps<{
    /** 时间线节点列表（空数组渲染 el-empty 占位） */
    items?: TimelineItem[]
    /** 是否倒序渲染（最新在上），缺省正序 */
    reverse?: boolean
  }>(),
  {
    items: () => [],
    reverse: false,
  },
)

/** 容错：非数组（设计器 schema 漂移）回退空列表 */
const normalizedItems = computed<TimelineItem[]>(() => (Array.isArray(props.items) ? props.items : []))
</script>

<style scoped>
.page-timeline {
  padding-left: 4px;
}
.page-timeline-item-dot-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 14px;
  line-height: 1;
}
.page-timeline-item-title {
  font-weight: 700;
  font-size: 14px;
  line-height: 1.6;
  color: var(--el-text-color-primary, #303133);
}
.page-timeline-item-content {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--el-text-color-secondary, #909399);
}
.page-timeline-empty {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
