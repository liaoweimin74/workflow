<template>
  <div class="template-preview">
    <div class="template-preview__label">{{ label }}</div>
    <div class="template-preview__text">{{ displayText }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * 模板预览静态展示组件（form-create 自定义组件）
 *
 * <p>通过 formCreateInject 实时读取模板字段值，
 * 以自动高度静态文本展示（含 ${变量} → [变量] 高亮替换），
 * 供消息模板表单底部预览标题/内容渲染效果。
 */
const props = defineProps<{
  /** 预览来源字段名（如 title / content） */
  source: string
  /** 分组标题 */
  label: string
  /** 占位文本（未填写时显示） */
  placeholder?: string
  /** form-create 自动注入 */
  formCreateInject?: any
}>()

/** 将 ${变量} 转为 [变量] 展示，模拟渲染效果 */
function previewText(text?: string) {
  if (!text) return ''
  return text.replace(/\$\{(\w+)\}/g, '[$1]')
}

const displayText = computed(() => {
  const value = props.formCreateInject?.api?.form?.[props.source]
  if (value === undefined || value === null || value === '') {
    return props.placeholder || '（未填写）'
  }
  return previewText(String(value))
})
</script>

<style scoped>
.template-preview {
  width: 100%;
}
.template-preview__label {
  font-weight: 600;
  color: #606266;
  margin-bottom: 4px;
}
.template-preview__text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
  color: #303133;
  padding: 0 0 8px;
}
</style>
