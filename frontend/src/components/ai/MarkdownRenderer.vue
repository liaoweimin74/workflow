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
  color: var(--el-text-color-regular);
  word-break: break-word;
  white-space: normal;
}
.ai-markdown :deep(p) {
  margin: 0.35em 0;
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
  background: var(--el-fill-color-light);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: Consolas, Monaco, monospace;
  font-size: 0.92em;
}
.ai-markdown :deep(pre) {
  background: var(--el-fill-color-light);
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
  border-left: 3px solid color-mix(in srgb, var(--brand-bright, #46c9d6) 45%, transparent);
  color: var(--el-text-color-regular);
}
.ai-markdown :deep(table) {
  border-collapse: collapse;
  margin: 0.5em 0;
}
.ai-markdown :deep(th),
.ai-markdown :deep(td) {
  border: 1px solid var(--el-border-color-lighter);
  padding: 4px 8px;
}
.ai-markdown :deep(a) {
  color: var(--el-color-primary);
  text-decoration: none;
}
.ai-markdown :deep(a:hover) {
  text-decoration: underline;
}
/* 白名单站内链接：行内胶囊 tag（带 → 前缀） */
.ai-markdown :deep(a.ai-md-nav) {
  display: inline-flex;
  align-items: center;
  margin: 0 2px;
  padding: 1px 9px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 45%, transparent);
  background: var(--ds-industrial-50);
  color: var(--el-color-primary);
  font-size: 12px;
  line-height: 1.9;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
}
.ai-markdown :deep(a.ai-md-nav)::before {
  content: '→';
  margin-right: 3px;
  font-weight: 600;
}
.ai-markdown :deep(a.ai-md-nav:hover) {
  background: var(--ds-selected);
  text-decoration: none;
}
</style>
