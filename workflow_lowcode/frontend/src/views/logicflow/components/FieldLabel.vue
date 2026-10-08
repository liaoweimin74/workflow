<template>
  <span class="fl-label">
    <span>{{ label }}</span>
    <el-tooltip
      v-if="tip"
      :content="tip"
      popper-class="fl-label-popper"
      placement="top"
      effect="dark"
      :show-after="100"
      :offset="6"
    >
      <el-icon class="fl-help" :class="{ 'is-clickable': clickable }" @click.stop="onIconClick">
        <QuestionFilled />
      </el-icon>
    </el-tooltip>
  </span>
</template>

<script setup lang="ts">
import { QuestionFilled } from '@element-plus/icons-vue'

/**
 * 表单字段标签 + 「?」帮助图标（悬浮显示说明文字）。
 * - 说明文字经悬浮 ? 图标展示，不再占用面板纵向空间；
 * - clickable=true 时拦截点击冒泡（用于调色板等可点击容器内，避免误触添加）。
 */
withDefaults(defineProps<{ label: string; tip?: string; clickable?: boolean }>(), {
  tip: '',
  clickable: false,
})

function onIconClick() {
  /* 仅拦截冒泡；悬浮显示由 el-tooltip 承担 */
}
</script>

<style scoped>
.fl-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  line-height: inherit;
}

.fl-help {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  cursor: help;
  transition: color 0.15s ease;
}

.fl-help:hover,
.fl-help.is-clickable {
  color: var(--el-color-primary);
}
</style>

<style>
/* tooltip 弹层挂在 body 下，需全局样式限制宽度 */
.fl-label-popper {
  max-width: 300px;
  line-height: 1.55;
}
</style>
