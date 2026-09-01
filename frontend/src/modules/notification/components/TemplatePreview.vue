<template>
  <div class="template-preview">
    <div class="template-preview__label">{{ label }}</div>
    <!-- Markdown 内容：渲染为富文本 -->
    <div v-if="isMarkdown" class="template-preview__md" v-html="displayHtml"></div>
    <!-- 纯文本内容：pre-wrap 展示 -->
    <div v-else class="template-preview__text">{{ displayText }}</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import MarkdownIt from 'markdown-it'

/** Markdown 渲染器：不转义原始 HTML（html:false），开启链接识别 */
const md = new MarkdownIt({ html: false, linkify: true })

/**
 * 模板预览静态展示组件（form-create 自定义组件）
 *
 * <p>通过 formCreateInject 实时读取模板字段值，
 * 以自动高度静态文本展示（含 ${变量} → [变量] 高亮替换），
 * 支持纯文本与 Markdown 两种内容类型（按 contentType 字段区分），
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

/** 将 ${变量} 转为 [变量] 展示，模拟渲染效果（支持中文变量名） */
function previewText(text?: string) {
  if (!text) return ''
  return text.replace(/\$\{([^}]+)\}/g, '[$1]')
}

/** HTML 转义（占位文本用于 markdown 模式时防止注入） */
function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const displayText = ref('（未填写）')
const displayHtml = ref('（未填写）')
const isMarkdown = ref(false)

/** 从 formCreateInject 读取字段值并刷新展示状态 */
function sync() {
  const api = props.formCreateInject?.api
  const ct = api?.form?.['contentType'] ?? api?.getValue?.('contentType')
  isMarkdown.value = ct === 'MARKDOWN'

  const value = api?.form?.[props.source] ?? api?.getValue?.(props.source)
  if (value === undefined || value === null || value === '') {
    displayText.value = props.placeholder || '（未填写）'
    displayHtml.value = escapeHtml(props.placeholder || '（未填写）')
    return
  }
  const text = previewText(String(value))
  displayText.value = text
  displayHtml.value = md.render(text)
}

// form-create 注入的 formCreateInject 在 Vue props（shallowReactive）边界内，
// deep watch / computed 无法可靠追踪其内部变化（实测不触发）。
// setup 时立即同步一次（props 已就绪），再用轻量轮询兜底实时更新（300ms 内）。
sync()
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timer = setInterval(sync, 300)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
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
.template-preview__md {
  line-height: 1.6;
  color: #303133;
  padding: 0 0 8px;
  word-break: break-word;
}
.template-preview__md :deep(h1),
.template-preview__md :deep(h2),
.template-preview__md :deep(h3) {
  margin: 0.6em 0 0.4em;
  font-weight: 600;
}
.template-preview__md :deep(h1) { font-size: 20px; }
.template-preview__md :deep(h2) { font-size: 18px; }
.template-preview__md :deep(h3) { font-size: 16px; }
.template-preview__md :deep(p) { margin: 0.4em 0; }
.template-preview__md :deep(ul),
.template-preview__md :deep(ol) { margin: 0.4em 0; padding-left: 1.6em; }
.template-preview__md :deep(li) { margin: 0.2em 0; }
.template-preview__md :deep(code) {
  background: #f5f7fa;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: Consolas, Monaco, monospace;
  font-size: 0.9em;
}
.template-preview__md :deep(pre) {
  background: #f5f7fa;
  padding: 10px 12px;
  border-radius: 4px;
  overflow-x: auto;
}
.template-preview__md :deep(pre code) {
  background: transparent;
  padding: 0;
}
.template-preview__md :deep(blockquote) {
  margin: 0.4em 0;
  padding: 0 12px;
  border-left: 3px solid #dcdfe6;
  color: #909399;
}
.template-preview__md :deep(a) { color: #409eff; }
</style>
