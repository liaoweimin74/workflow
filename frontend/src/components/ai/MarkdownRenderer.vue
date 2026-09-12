<template>
  <div class="ai-markdown" @click="onClick" v-html="html" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/utils/markdown'
import type { MenuPage } from '@/utils/menuIndex'

const props = defineProps<{ text: string; pages?: MenuPage[] }>()
const emit = defineEmits<{ (e: 'navigate', path: string): void }>()

const html = computed(() => renderMarkdown(props.text, props.pages ?? []))

/** 站内链接（data-nav）→ 交给父级路由跳转 */
function onClick(event: MouseEvent) {
  const element = event.target as HTMLElement | null
  const anchor = element?.closest('a[data-nav]') as HTMLAnchorElement | null
  if (!anchor) return
  event.preventDefault()
  const path = anchor.getAttribute('data-nav') ?? ''
  if (path) emit('navigate', path)
}
</script>

<style scoped>
.ai-markdown {
  font-size: 13px;
  line-height: 1.6;
  color: #303133;
  word-break: break-word;
}
.ai-markdown :deep(p) {
  margin: 0.4em 0;
}
.ai-markdown :deep(h1),
.ai-markdown :deep(h2),
.ai-markdown :deep(h3),
.ai-markdown :deep(h4) {
  margin: 0.6em 0 0.4em;
  font-weight: 600;
  font-size: 14px;
}
.ai-markdown :deep(ul),
.ai-markdown :deep(ol) {
  margin: 0.4em 0;
  padding-left: 1.4em;
}
.ai-markdown :deep(li) {
  margin: 0.2em 0;
}
.ai-markdown :deep(code) {
  background: #f1f4fe;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: Consolas, Monaco, monospace;
  font-size: 0.92em;
}
.ai-markdown :deep(pre) {
  background: #f6f8ff;
  padding: 10px 12px;
  border-radius: 6px;
  overflow-x: auto;
}
.ai-markdown :deep(pre code) {
  background: transparent;
  padding: 0;
}
.ai-markdown :deep(blockquote) {
  margin: 0.4em 0;
  padding: 0 12px;
  border-left: 3px solid #c6edf4;
  color: #606266;
}
.ai-markdown :deep(table) {
  border-collapse: collapse;
  margin: 0.5em 0;
}
.ai-markdown :deep(th),
.ai-markdown :deep(td) {
  border: 1px solid #e9edfa;
  padding: 4px 8px;
}
.ai-markdown :deep(a) {
  color: #5755ee;
  text-decoration: none;
}
.ai-markdown :deep(a:hover) {
  text-decoration: underline;
}
.ai-markdown :deep(.ai-md-nav) {
  cursor: pointer;
}
</style>
