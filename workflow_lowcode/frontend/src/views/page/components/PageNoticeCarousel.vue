<template>
  <!-- 轮播：有数据时渲染 el-carousel；indicatorPosition 透传（''/outside/none） -->
  <el-carousel
    v-if="items.length > 0"
    class="page-notice-carousel"
    :height="normalizedHeight"
    :interval="interval"
    :arrow="arrow"
    :indicator-position="indicatorPosition"
    trigger="click"
  >
    <el-carousel-item
      v-for="(item, idx) in items"
      :key="idx"
      class="page-notice-carousel-item"
      @click="handleClick(item)"
    >
      <div class="page-notice-carousel-body" :style="item.color ? { color: item.color } : undefined">
        <div class="page-notice-carousel-title">{{ item.title }}</div>
        <p class="page-notice-carousel-content">{{ item.content }}</p>
      </div>
    </el-carousel-item>
  </el-carousel>
  <!-- 空态：未配置公告项 -->
  <el-empty v-else class="page-notice-carousel-empty" description="暂无公告" :image-size="80" />
</template>

<script setup lang="ts">
/**
 * 公告轮播展示块（Task 3-b 展示五件套 ②）。
 *
 * 职责边界：纯展示组件（Task 3-b），props 驱动不绑数据源；数据源驱动版本由后续任务接线。
 * items/height/interval/arrow/indicatorPosition 全部由设计器 props 下发，本组件只负责
 * el-carousel 包装渲染：item 内 title 加粗 + content 段落，item.color 作为该条公告的
 * 文本色（标题/正文继承）。空 items 渲染 el-empty 占位；点击条目向外抛 item-click
 * （设计器可挂交互，本组件不消费事件）。
 */
import { computed } from 'vue'

interface NoticeCarouselItem {
  /** 公告标题（加粗展示） */
  title?: string
  /** 公告正文（段落展示） */
  content?: string
  /** 本条公告文本色（css 颜色值，标题/正文继承） */
  color?: string
}

const props = withDefaults(
  defineProps<{
    /** 公告项列表（空数组渲染 el-empty 占位） */
    items?: NoticeCarouselItem[]
    /** 轮播容器高度（css 值；el-carousel 非卡片模式必填高度），缺省 180px */
    height?: string
    /** 自动切换间隔（毫秒），缺省 4000 */
    interval?: number
    /** 切换箭头显示时机，缺省 hover */
    arrow?: 'always' | 'hover' | 'never'
    /** 指示器位置（'' 页面内 / 'outside' 容器外 / 'none' 隐藏），缺省页面内 */
    indicatorPosition?: '' | 'outside' | 'none'
  }>(),
  {
    items: () => [],
    height: '180px',
    interval: 4000,
    arrow: 'hover',
    indicatorPosition: '',
  },
)

const emit = defineEmits<{
  (e: 'item-click', item: NoticeCarouselItem): void
}>()

/** 高度容错：空串/未传回退缺省 */
const normalizedHeight = computed(() => props.height || '180px')

function handleClick(item: NoticeCarouselItem): void {
  emit('item-click', item)
}
</script>

<style scoped>
.page-notice-carousel-item {
  cursor: pointer;
}
.page-notice-carousel-body {
  height: 100%;
  box-sizing: border-box;
  padding: 14px 18px;
  overflow: hidden;
}
.page-notice-carousel-title {
  font-weight: 700;
  font-size: 15px;
  line-height: 1.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.page-notice-carousel-content {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.7;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}
.page-notice-carousel-empty {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
