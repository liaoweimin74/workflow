<template>
  <div class="h-screen flex flex-col bg-white dark:bg-[#181d1b]">
    <!-- 顶栏：独立标签页形态 -->
    <header class="h-12 shrink-0 flex items-center gap-2 px-4 border-b border-[#e6e9e4] dark:border-[#2b332e]">
      <span class="text-sm font-medium text-gray-700 dark:text-gray-200">帮助文档</span>
      <span class="text-xs text-gray-400 dark:text-gray-500">开发手册 · 管理手册</span>
    </header>
    <div class="flex-1 min-h-0 flex">
    <!-- 左侧章节目录 -->
    <aside class="w-60 shrink-0 border-r border-[#e6e9e4] dark:border-[#2b332e] overflow-y-auto py-4 px-3">
      <div v-for="group in DOC_GROUPS" :key="group.title" class="mb-4">
        <button
          class="w-full flex items-center gap-1.5 text-[15px] font-semibold text-gray-700 dark:text-gray-200 px-2 mb-2 mt-1 rounded-md hover:bg-[#f0f2ee] dark:hover:bg-[#252d28] transition-colors"
          @click="toggleGroup(group.title)"
        >
          <span class="w-1 h-4 rounded-full bg-(--brand, #0f766e) shrink-0" />
          <span class="flex-1 text-left">{{ group.title }}</span>
          <svg
            class="w-3.5 h-3.5 text-gray-400 transition-transform"
            :class="collapsedGroups[group.title] ? '-rotate-90' : ''"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <template v-if="!collapsedGroups[group.title]">
          <div v-for="item in group.items" :key="item.file">
            <button
              class="w-full text-left px-2 py-1.5 rounded-md text-[13px] transition-colors truncate flex items-center gap-1"
              :class="currentFile === item.file
                ? 'bg-[rgb(var(--brand-soft-rgb)/0.12)] text-(--brand) font-medium'
                : 'text-gray-600 dark:text-gray-300 hover:bg-[#f0f2ee] dark:hover:bg-[#252d28]'"
              @click="open(item.file)"
            >
              <svg
                v-if="currentFile === item.file && docSections.length"
                class="w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform"
                :class="sectionsCollapsed ? '-rotate-90' : ''"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                @click.stop="sectionsCollapsed = !sectionsCollapsed"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
              <!-- 无小节（或非当前章）用等宽占位，保证章级节点图标位对齐 -->
              <span v-else class="w-3.5 h-3.5 shrink-0" />
              <span class="flex-1 truncate">{{ item.label }}</span>
            </button>
            <template v-if="currentFile === item.file && docSections.length && !sectionsCollapsed">
              <button
                v-for="sec in docSections"
                :key="sec.id"
                class="w-full text-left pl-[37px] pr-2 py-1 rounded-md text-[13px] text-gray-600 dark:text-gray-300 hover:bg-[#f0f2ee] dark:hover:bg-[#252d28] hover:text-(--brand) transition-colors flex items-center gap-1.5"
                :title="sec.label"
                @click="scrollToSection(sec.id)"
              >
                <span class="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 shrink-0" />
                <span class="flex-1 truncate">{{ sec.label }}</span>
              </button>
            </template>
          </div>
        </template>
      </div>
    </aside>

    <!-- 右侧正文 -->
    <div class="flex-1 min-w-0 overflow-y-auto">
      <div class="w-full px-8 py-6">
        <div v-if="loading" class="text-sm text-gray-400 py-16 text-center">加载中…</div>
        <div v-else-if="error" class="text-sm text-red-500 py-16 text-center">{{ error }}</div>
        <article v-else class="help-md" v-html="renderedHtml" @click="onContentClick" />
      </div>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MarkdownIt from 'markdown-it'

interface DocItem { label: string; file: string }
interface DocGroup { title: string; items: DocItem[] }

const HOME_FILE = 'README.md'

const DOC_GROUPS: DocGroup[] = [
  {
    title: '总览',
    items: [{ label: '帮助首页', file: HOME_FILE }],
  },
  {
    title: '开发手册',
    items: [
      { label: '01 平台介绍', file: 'dev/01-平台介绍.md' },
      { label: '02 新手入门', file: 'dev/02-新手入门.md' },
      { label: '03 表单设计', file: 'dev/03-表单设计.md' },
      { label: '04 页面与数据源', file: 'dev/04-页面与数据源.md' },
      { label: '05 流程编排', file: 'dev/05-流程编排.md' },
      { label: '06 逻辑编排', file: 'dev/06-逻辑编排.md' },
      { label: '07 模块与物料', file: 'dev/07-模块与物料.md' },
      { label: '08 权限与菜单', file: 'dev/08-权限与菜单.md' },
      { label: '09 自定义开发', file: 'dev/09-自定义开发.md' },
      { label: '10 常见场景与 FAQ', file: 'dev/10-常见场景与FAQ.md' },
    ],
  },
  {
    title: '管理手册',
    items: [
      { label: '01 用户与角色', file: 'admin/01-用户与角色.md' },
      { label: '02 组织架构', file: 'admin/02-组织架构.md' },
      { label: '03 字典与菜单', file: 'admin/03-字典与菜单.md' },
      { label: '04 消息管理', file: 'admin/04-消息管理.md' },
      { label: '05 流程运维', file: 'admin/05-流程运维.md' },
      { label: '06 AI 模型配置', file: 'admin/06-AI模型配置.md' },
      { label: '07 常见问题', file: 'admin/07-常见问题.md' },
    ],
  },
]

const route = useRoute()
const router = useRouter()

const currentFile = ref<string>((route.query.doc as string) || HOME_FILE)
const rawMarkdown = ref('')
const loading = ref(false)
const error = ref('')
const collapsedGroups = ref<Record<string, boolean>>({})
const sectionsCollapsed = ref(false)

function toggleGroup(title: string) {
  collapsedGroups.value[title] = !collapsedGroups.value[title]
}

// html:false 禁止文档内嵌原始 HTML，避免 XSS；帮助文档由仓库统一维护，链接仍走 linkify
const md = new MarkdownIt({ html: false, linkify: true, breaks: false })

// 二级目录：取当前文档的 h2 小节；id 与渲染 HTML 时注入的标题 id 一一对应
interface DocSection { id: string; label: string }
const docSections = computed<DocSection[]>(() => {
  const sections: DocSection[] = []
  for (const line of rawMarkdown.value.split('\n')) {
    const m = /^##\s+(.+?)\s*$/.exec(line)
    if (m) {
      const label = m[1].replace(/[*`[\]]/g, '')
      // 编号小节（如「9.4.4 xxx」）用 sec-<编号> 作锚点，正文跨章引用直接指向它
      const num = /^(\d+(?:\.\d+)*)/.exec(label)
      sections.push({ id: num ? `sec-${num[1]}` : `sec-h2-${sections.length}`, label })
    }
  }
  return sections
})

// 渲染时给 <h2>/<h3> 注入 id：有编号前缀的小节用 sec-<编号>（与二级目录、跨章锚点共用同一体系），
// 无编号的按顺序兜底；图片统一写 images/xxx.png（相对 docs/help/），重写为静态资源绝对路径，
// 否则浏览器会按当前页面 URL（/help）解析导致 404
const renderedHtml = computed(() => {
  const ids: string[] = []
  let fallback = 0
  for (const line of rawMarkdown.value.split('\n')) {
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line)
    if (!m) continue
    const num = /^(\d+(?:\.\d+)*)/.exec(m[2].replace(/[*`[\]]/g, ''))
    ids.push(num ? `sec-${num[1]}` : `sec-h2-${fallback++}`)
  }
  let i = 0
  return md
    .render(rawMarkdown.value)
    .replace(/<h([23])>/g, (_m, lvl) => `<h${lvl} id="${ids[i++] ?? ''}">`)
    .replace(/src="(?!https?:|\/)([^"]+)"/g, (_m, src) => `src="${import.meta.env.BASE_URL}docs/help/${src}"`)
})

function scrollToSection(id: string) {
  // 目录传的是已带 sec- 前缀的 id；文档锚点（#9.2、跨章 #4.8.4）是裸编号，需补前缀兜底
  const el = document.getElementById(id) ?? document.getElementById(`sec-${id}`)
  el?.scrollIntoView({ block: 'start' })
}

async function load(file: string) {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}docs/help/${file}`)
    if (!res.ok) throw new Error(`加载失败（HTTP ${res.status}）`)
    rawMarkdown.value = await res.text()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
    rawMarkdown.value = ''
  } finally {
    loading.value = false
  }
  // 锚点滚动必须等 loading=false、正文真正渲染到 DOM 之后再执行
  if (pendingAnchor) {
    const anchor = pendingAnchor
    pendingAnchor = null
    await nextTick()
    scrollToSection(anchor)
  }
}

function open(file: string) {
  currentFile.value = file
}

// 文档内相对链接（如 dev/01-平台介绍.md、../dev/08-权限与菜单.md、带锚点的 04-页面与数据源.md#4.8.4）
// 解析为帮助页内导航；返回 null 表示非文档链接（外链按默认行为打开）
function resolveDocHref(href: string): { file: string; anchor: string | null } | null {
  const [path, hash] = href.split('#')
  if (!path || !path.toLowerCase().endsWith('.md')) return null
  const baseDir = currentFile.value.includes('/')
    ? currentFile.value.slice(0, currentFile.value.lastIndexOf('/') + 1)
    : ''
  const parts = `${baseDir}${path}`.split('/')
  const stack: string[] = []
  for (const p of parts) {
    if (p === '' || p === '.') continue
    if (p === '..') stack.pop()
    else stack.push(p)
  }
  return { file: stack.join('/'), anchor: hash || null }
}

function onContentClick(e: MouseEvent) {
  const anchor = (e.target as HTMLElement).closest('a')
  if (!anchor) return
  const href = anchor.getAttribute('href') || ''
  if (href.startsWith('#')) {
    // 同文档内锚点（如 [跳转](#9.4.4)）
    e.preventDefault()
    scrollToSection(href.slice(1))
    return
  }
  const doc = resolveDocHref(href)
  if (doc) {
    e.preventDefault()
    pendingAnchor = doc.anchor
    open(doc.file)
  }
}

// 跨章跳转携带的目标锚点：load 完成、正文渲染后滚动到位
let pendingAnchor: string | null = null

watch(currentFile, (file) => {
  sectionsCollapsed.value = false
  router.replace({ query: { ...route.query, doc: file === HOME_FILE ? undefined : file } })
  load(file)
}, { immediate: true })
</script>

<style scoped>
.help-md {
  color: #374151;
  font-size: 14px;
  line-height: 1.75;
}
.help-md :deep(h1) {
  font-size: 22px;
  font-weight: 600;
  margin: 8px 0 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e6e9e4;
}
.help-md :deep(h2) {
  font-size: 18px;
  font-weight: 600;
  margin: 28px 0 12px;
  scroll-margin-top: 8px;
}
.help-md :deep(h3) {
  font-size: 15px;
  font-weight: 600;
  margin: 20px 0 8px;
  scroll-margin-top: 8px;
}
.help-md :deep(p) { margin: 8px 0; }
.help-md :deep(img) {
  max-width: 100%;
  border: 1px solid #e6e9e4;
  border-radius: 8px;
  margin: 8px 0;
}
.help-md :deep(ul),
.help-md :deep(ol) { padding-left: 22px; margin: 8px 0; }
.help-md :deep(li) { margin: 3px 0; }
.help-md :deep(a) { color: var(--brand, #0f766e); text-decoration: none; }
.help-md :deep(a:hover) { text-decoration: underline; }
.help-md :deep(code) {
  background: #f0f2ee;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 13px;
}
.help-md :deep(pre) {
  background: #f6f7f5;
  border: 1px solid #e6e9e4;
  border-radius: 8px;
  padding: 12px 14px;
  overflow-x: auto;
  margin: 10px 0;
}
.help-md :deep(pre code) { background: transparent; padding: 0; }
.help-md :deep(blockquote) {
  border-left: 3px solid var(--brand, #0f766e);
  background: #f6f7f5;
  border-radius: 0 8px 8px 0;
  padding: 8px 14px;
  margin: 10px 0;
  color: #4b5563;
}
.help-md :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 12px 0;
  font-size: 13px;
}
.help-md :deep(th),
.help-md :deep(td) {
  border: 1px solid #e6e9e4;
  padding: 6px 10px;
  text-align: left;
}
.help-md :deep(th) { background: #f6f7f5; font-weight: 600; }
.help-md :deep(hr) { border: none; border-top: 1px solid #e6e9e4; margin: 20px 0; }

/* 暗色模式 */
.dark .help-md { color: #c9d1c9; }
.dark .help-md :deep(h1) { border-bottom-color: #2b332e; }
.dark .help-md :deep(code) { background: #252d28; }
.dark .help-md :deep(pre) { background: #20261f; border-color: #2b332e; }
.dark .help-md :deep(blockquote) { background: #20261f; color: #9aa89f; }
.dark .help-md :deep(th),
.dark .help-md :deep(td) { border-color: #2b332e; }
.dark .help-md :deep(th) { background: #20261f; }
.dark .help-md :deep(hr) { border-top-color: #2b332e; }
</style>
