<template>
  <div
    class="dash-notice"
    :class="{ 'is-design': designMode, 'is-fixed-height': fixedHeight, 'is-fill-height': fillHeight }"
    :style="layoutStyle"
  >
    <div class="dash-notice-head">
      <span class="dash-notice-title">{{ title || '公告' }}</span>
      <span v-if="total" class="dash-notice-count">{{ total }}</span>
    </div>

    <!-- 轮播形态：一条一屏，正文作摘要，点击进详情 -->
    <el-carousel
      v-if="display === 'carousel' && rows.length"
      class="dash-notice-carousel"
      :height="carouselHeight"
      :interval="interval"
      trigger="click"
      :arrow="designMode ? 'never' : 'hover'"
    >
      <el-carousel-item v-for="row in rows" :key="row.id" class="dash-notice-item" @click="openDetail(row)">
        <div class="dash-notice-carousel-body">
          <div class="dash-notice-carousel-line">
            <span class="dash-notice-item-title">{{ rowTitle(row) }}</span>
            <span v-if="isUnread(row)" class="dash-notice-tag-unread">未读</span>
          </div>
          <p class="dash-notice-item-meta">{{ formatTime(row.createdAt) }}</p>
          <p class="dash-notice-carousel-text">{{ previewOf(row) }}</p>
        </div>
      </el-carousel-item>
    </el-carousel>

    <!-- 列表形态：卡片内滚动 -->
    <div v-else-if="rows.length" class="dash-notice-list">
      <div v-for="row in rows" :key="row.id" class="dash-notice-item" @click="openDetail(row)">
        <div class="dash-notice-item-line">
          <span class="dash-notice-item-title">{{ rowTitle(row) }}</span>
          <span v-if="isUnread(row)" class="dash-notice-tag-unread">未读</span>
        </div>
        <div class="dash-notice-item-meta">{{ formatTime(row.createdAt) }}</div>
      </div>
    </div>
    <div v-else class="dash-notice-empty">{{ emptyText }}</div>

    <!-- 详情：正文已在列表响应里，不再发第二次请求；未读点开即标记已读 -->
    <el-dialog
      :model-value="!!detailRow"
      :title="detailRow ? rowTitle(detailRow) : '公告详情'"
      width="560px"
      append-to-body
      @update:model-value="(v: boolean) => !v && (detailRow = null)"
    >
      <template v-if="detailRow">
        <p class="dash-notice-detail-time">{{ formatTime(detailRow.createdAt) }}</p>
        <div v-if="isMarkdown(detailRow)" class="dash-notice-detail-body" v-html="bodyHtml"></div>
        <pre v-else class="dash-notice-detail-body">{{ textOf(detailRow) }}</pre>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 公告栏：仪表盘里的公告清单/轮播件。
 *
 * 与数据源驱动的族内成员不同，它不配 dataSourceId——公告来自用户端消息接口
 * （GET /v1/notifications，messageType=PUBLIC 即管理员发布的公告）。
 *
 * 身份是硬约束，但这里的实现方式与 dash-todo 相反：不传身份参数。该接口的用户身份
 * 取自后端 SecurityContext，「谁能看到哪几条」由服务端按登录态判定，前端无从伪造，
 * 设计器也因此不该出现任何身份槽位——一旦出现，就等于把别人的公告翻给所有人看。
 */
import { ref, computed, onMounted, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import { getNotifications, markAsRead } from '@/modules/notification/api/notification'
import type { Message } from '@/modules/notification/types'
import {
  dashSpanGapStyle,
  dashHeightStyle,
  isDashFillHeight,
  upsertDashConditions,
  type DashCondition,
} from './dash-shared'

const props = withDefaults(
  defineProps<{
    title?: string
    /** 列表条数（接口 size） */
    limit?: number
    /** list = 卡片内滚动列表；carousel = 一条一屏轮播 */
    display?: 'list' | 'carousel'
    /** 轮播自动切换间隔（毫秒，仅 carousel 生效） */
    interval?: number
    span?: number
    height?: string
    designMode?: boolean
  }>(),
  {
    title: '',
    limit: 6,
    display: 'list',
    interval: 4000,
    span: 24,
    height: '',
    designMode: false,
  },
)

const emit = defineEmits<{ (e: 'ready', instance: unknown): void }>()

/** 正文按 Markdown 渲染时不放行原始 HTML（与消息中心详情抽屉同一防注入口径） */
const md = new MarkdownIt({ html: false, linkify: true })

const rows = ref<Message[]>([])
const total = ref(0)
const emptyText = ref('加载中…')
const detailRow = ref<Message | null>(null)
const conditions = ref<DashCondition[]>([])

const layoutStyle = computed<Record<string, string>>(() => ({
  ...dashSpanGapStyle(props.span),
  ...(dashHeightStyle(props.height) || {}),
}))
const fixedHeight = computed(() => !!dashHeightStyle(props.height))
const fillHeight = computed(() => isDashFillHeight(props.height))

/** el-carousel 必须是具体像素高度：自适应与 100% 撑满都退回缺省高度 */
const carouselHeight = computed(() => {
  const raw = String(props.height || '').trim()
  if (!raw || raw === 'auto' || raw === '100%') return '180px'
  return /^\d+$/.test(raw) ? `${raw}px` : raw
})

function textOf(row: Message): string {
  return String((row.content as { text?: unknown })?.text ?? '')
}

function isUnread(row: Message): boolean {
  return row.readStatus === 'PENDING'
}

function isMarkdown(row: Message): boolean {
  return row.contentType === 'MARKDOWN'
}

/** 标题容错：公告标题为空时退回正文首句，不至于渲染成空行 */
function rowTitle(row: Message): string {
  return row.title || previewOf(row) || '无标题公告'
}

/** 轮播正文位：列表已带回完整正文，取首行前 80 字作摘要 */
function previewOf(row: Message): string {
  const firstLine = textOf(row).split('\n').find((l) => l.trim() !== '') || ''
  return firstLine.trim().slice(0, 80)
}

const bodyHtml = computed(() => (detailRow.value ? md.render(textOf(detailRow.value)) : ''))

/** 后端时间是 ISO 串（带 T 与时区尾巴），列表与详情都只到分钟 */
function formatTime(value: string): string {
  const raw = String(value || '')
  if (!raw) return ''
  return raw.replace('T', ' ').slice(0, 16)
}

/**
 * 广播值 → 接口的 start / end 参数（`YYYY-MM-DD HH:mm:ss`）。
 * 这两个参数是后端 @DateTimeFormat(pattern="yyyy-MM-dd HH:mm:ss")，与任务接口正好相反：
 * 那里只认 ISO，这里带 T 会解析失败，所以空格格式是出网的唯一形态。
 * 纯日期按区间语义补时刻——截止补到当天末尾，否则「10-01 ~ 10-08」会静默漏掉 8 号一整天；
 * 认不出的形状原样透传，让后端报错，也好过把它拼成一个假日期。
 */
function toNoticeTime(value: unknown, isEnd = false): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!m) return raw
  const [, date, hh, mm, ss] = m
  if (!hh) return `${date} ${isEnd ? '23:59:59' : '00:00:00'}`
  return `${date} ${hh}:${mm}:${ss ?? '00'}`
}

/**
 * 广播条件 → 消息接口查询参数。
 * 接口能表达的只有「发布时间窗口 + 标题关键词」：range 一律落到发布时间轴
 * （公告只有 createdAt 一条时间，不认广播里的字段名）；title 的等值/模糊落到 keyword。
 * 其余条件（优先级、分类等）接口无法表达，忽略而不是硬塞参数。
 */
function conditionParams(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of conditions.value) {
    if (c.op === 'range' && Array.isArray(c.value)) {
      const [start, end] = c.value as [unknown, unknown]
      const startText = toNoticeTime(start)
      const endText = toNoticeTime(end, true)
      if (startText) out.start = startText
      if (endText) out.end = endText
      continue
    }
    if (c.column === 'title' && (c.op === 'eq' || c.op === 'like') && c.value !== null && c.value !== undefined) {
      out.keyword = String(c.value)
    }
  }
  return out
}

async function fetchNotices(): Promise<void> {
  try {
    const res = await getNotifications({ messageType: 'PUBLIC', page: 1, size: props.limit, ...conditionParams() })
    rows.value = res.data?.rows ?? []
    total.value = Number(res.data?.total ?? rows.value.length)
    emptyText.value = rows.value.length ? '' : '暂无公告'
  } catch (e: unknown) {
    console.warn('[dash-notice] load announcements failed:', e instanceof Error ? e.message : e)
    rows.value = []
    total.value = 0
    emptyText.value = '暂无公告'
  }
}

function openDetail(row: Message): void {
  // 设计态不弹层：画布上点条目只是选中组件，不该被弹窗盖住
  if (props.designMode) return
  detailRow.value = row
  if (!isUnread(row)) return
  void markAsRead(row.id)
    .then(() => {
      row.readStatus = 'SENT'
    })
    .catch(() => undefined)
}

function setFilter(cond: Record<string, unknown>): void {
  upsertDashConditions(conditions.value, cond)
  void fetchNotices()
}

function refresh(): void {
  conditions.value = []
  detailRow.value = null
  void fetchNotices()
}

watch(() => props.limit, () => void fetchNotices())

onMounted(() => {
  // 设计态也取数：可见范围由后端按登录态判定，设计师看到的是自己收到的公告，无越权风险
  void fetchNotices()
  emit('ready', { setFilter, refresh })
})

defineExpose({ setFilter, refresh })
</script>

<style scoped>
.dash-notice {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  min-height: 104px;
}
.dash-notice.is-fixed-height {
  overflow: hidden;
}
.dash-notice.is-design {
  outline: 1px dashed var(--el-color-primary-light-5, #a7c4ff);
}
.dash-notice-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dash-notice-title {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
  font-weight: 500;
}
.dash-notice-count {
  margin-left: 4px;
  padding: 0 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  color: var(--el-color-primary, #2e73ff);
  background: var(--el-color-primary-light-9, #eef3ff);
  font-variant-numeric: tabular-nums;
}
.dash-notice-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: auto;
}
.dash-notice-item {
  padding: 7px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.dash-notice-item:hover {
  background: var(--el-fill-color-light, #f5f7fa);
}
.dash-notice-item-line,
.dash-notice-carousel-line {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dash-notice-item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary, #303133);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dash-notice-tag-unread {
  flex: none;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 17px;
  color: var(--el-color-danger, #f43f5e);
  background: var(--el-color-danger-light-9, #fef0f3);
}
.dash-notice-item-meta {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dash-notice-carousel {
  flex: 1;
  min-height: 0;
}
.dash-notice-carousel-body {
  padding: 6px 8px;
}
.dash-notice-carousel-text {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular, #606266);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}
.dash-notice-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder, #c0c4cc);
}
.dash-notice-detail-time {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}
.dash-notice-detail-body {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--el-text-color-primary, #303133);
  word-break: break-word;
  max-height: 55vh;
  overflow: auto;
}
/* 纯文本正文保留换行与空格；Markdown 分支不能继承 pre-wrap，否则渲染出的标签间空隙会被放大 */
pre.dash-notice-detail-body {
  white-space: pre-wrap;
}
</style>
