<template>
  <span class="flt-wrap">
    <span class="flt-text"><slot /></span>
    <el-tooltip
      :content="tip"
      placement="top"
      effect="dark"
      :show-after="120"
      popper-style="max-width: 280px; line-height: 1.5;"
    >
      <span class="flt-icon" aria-label="说明">
        <el-icon :size="10"><QuestionFilled /></el-icon>
      </span>
    </el-tooltip>
  </span>
</template>

<script setup lang="ts">
import { QuestionFilled } from '@element-plus/icons-vue'

/**
 * 表单 Label 说明提示：Label 文本后跟一个圆形「?」图标，
 * 与 Label 文本**垂直居中对齐**，鼠标悬浮弹出说明 tooltip。
 *
 * 用法（el-form-item 的 label 插槽内）：
 * ```vue
 * <el-form-item>
 *   <template #label>
 *     <FormLabelTip tip="开启后，最多添加5个摘要">自定义摘要</FormLabelTip>
 *   </template>
 *   <el-switch ... />
 * </el-form-item>
 * ```
 */
defineProps<{
  /** 悬浮展示的说明文字 */
  tip: string
}>()
</script>

<style scoped>
.flt-wrap {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 100%;
}

.flt-text {
  white-space: nowrap;
}

/* 圆形 ? 图标：与 Label 文本垂直居中 */
.flt-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  color: var(--el-text-color-secondary, #909399);
  background: var(--el-fill-color, #f0f2f5);
  cursor: help;
  flex-shrink: 0;
  transition: color 0.15s, background-color 0.15s;
}

.flt-icon:hover {
  color: var(--el-color-primary, #409eff);
  background: var(--el-color-primary-light-9, #ecf5ff);
}
</style>
