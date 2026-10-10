<template>
  <div class="page-iframe" :style="{ height: normalizedHeight }">
    <!-- 内嵌画布：有 url 时渲染；sandbox 固定安全基线，scrolling 以原生属性透传 -->
    <iframe
      v-if="url"
      class="page-iframe-frame"
      :src="url"
      sandbox="allow-scripts allow-same-origin"
      :scrolling="scrolling ? 'yes' : 'no'"
      frameborder="0"
      allowfullscreen
    />
    <!-- 空态：未配置 url -->
    <el-empty v-else class="page-iframe-empty" description="暂未配置链接地址" :image-size="80" />
  </div>
</template>

<script setup lang="ts">
/**
 * 内嵌网页展示块（Task 3-b 展示五件套 ①）。
 *
 * 职责边界：纯展示组件（Task 3-b），props 驱动不绑数据源；数据源驱动版本由后续任务接线。
 * url/height/scrolling 全部由设计器 props 下发，本组件只负责 iframe 渲染与安全基线：
 * sandbox 固定为 "allow-scripts allow-same-origin"（不加 allow-forms/allow-popups/
 * allow-top-navigation，防内嵌页在设计器/运行页内提交表单、弹窗与顶层跳转）。
 * 空 url 渲染 el-empty 占位，不白屏。
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 内嵌页面地址（空串时渲染 el-empty 占位） */
    url?: string
    /** 容器高度（css 值），缺省 360px */
    height?: string
    /** 是否允许 iframe 内部滚动，缺省允许 */
    scrolling?: boolean
  }>(),
  {
    url: '',
    height: '360px',
    scrolling: true,
  },
)

/** 高度容错：空串/未传回退缺省（设计器 props 可能下发空串） */
const normalizedHeight = computed(() => props.height || '360px')
</script>

<style scoped>
.page-iframe {
  width: 100%;
  overflow: hidden;
}
.page-iframe-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: none;
}
.page-iframe-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>
