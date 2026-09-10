<template>
  <el-drawer
    v-model="drawerVisible"
    :title="detail?.title || '消息详情'"
    size="480px"
    :destroy-on-close="true"
  >
    <div v-loading="loading" class="detail-content">
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="分类">{{ categoryLabel(detail?.category) }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ detail?.readStatus === 'PENDING' ? '未读' : '已读' }}</el-descriptions-item>
        <el-descriptions-item label="优先级">{{ priorityLabel(detail?.priority) }}</el-descriptions-item>
        <el-descriptions-item label="时间">{{ formatDateTime(detail?.createdAt || '') }}</el-descriptions-item>
      </el-descriptions>

      <el-divider content-position="left">消息内容</el-divider>
      <!-- Markdown 内容：按 contentType 渲染为富文本 -->
      <div v-if="isMarkdown" class="detail-body detail-body--md" v-html="bodyHtml"></div>
      <!-- 纯文本内容：pre-wrap 展示 -->
      <pre v-else class="detail-body">{{ renderContent(detail?.content) }}</pre>

      <template v-if="linkUrl">
        <el-divider content-position="left">相关链接</el-divider>
        <el-link type="primary" :href="linkUrl" target="_blank">{{ linkUrl }}</el-link>
      </template>

      <!-- 流程上下文：工作流消息且携带流程变量时展示（WorkflowNotifier 写入 content.variables） -->
      <template v-if="processCtx">
        <el-divider content-position="left">流程上下文</el-divider>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="流程名称">{{ ctxVal('processName') }}</el-descriptions-item>
          <el-descriptions-item v-if="ctxVal('taskName')" label="任务节点">{{ ctxVal('taskName') }}</el-descriptions-item>
          <el-descriptions-item v-if="ctxVal('initiatorName')" label="发起人">{{ ctxVal('initiatorName') }}</el-descriptions-item>
          <el-descriptions-item v-if="ctxVal('businessKey')" label="业务单号">{{ ctxVal('businessKey') }}</el-descriptions-item>
          <el-descriptions-item label="实例ID">
            <span class="ctx-mono">{{ ctxRaw('processInstanceId') }}</span>
          </el-descriptions-item>
        </el-descriptions>
        <div class="ctx-actions">
          <el-button v-if="taskId" type="primary" size="small" :icon="Promotion" @click="goTask">去处理该任务</el-button>
          <el-button v-if="instanceId" size="small" :icon="Share" @click="goTrack">查看流程跟踪</el-button>
        </div>
      </template>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import MarkdownIt from 'markdown-it'
import { Promotion, Share } from '@element-plus/icons-vue'
import { getNotification, markAsRead } from '../api/notification'
import type { Message, MessageCategory, MessagePriority } from '../types'

/** Markdown 渲染器：不转义原始 HTML（html:false），开启链接识别（与模板预览保持一致，防注入） */
const md = new MarkdownIt({ html: false, linkify: true })

const props = defineProps<{
  modelValue: boolean
  messageId: number | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  /** 打开详情时若消息从未读变为已读，触发一次 */
  (e: 'read'): void
}>()

const drawerVisible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const loading = ref(false)
const detail = ref<Message | null>(null)

/** 打开抽屉时加载详情；未读消息自动标记已读 */
watch(
  [() => props.modelValue, () => props.messageId],
  async ([visible, id]) => {
    if (visible && id) {
      loading.value = true
      detail.value = null
      try {
        const res = await getNotification(id)
        detail.value = res.data
        if (res.data.readStatus === 'PENDING') {
          await markAsRead(id)
          detail.value.readStatus = 'SENT'
          emit('read')
        }
      } finally {
        loading.value = false
      }
    }
  },
)

/** 抽屉里展示的链接 */
const linkUrl = computed(() => {
  const link = detail.value?.linkJson as { url?: string } | undefined
  return link?.url || ''
})

/** 是否为 Markdown 富文本内容（由消息 contentType 决定；缺省按纯文本处理） */
const isMarkdown = computed(() => detail.value?.contentType === 'MARKDOWN')

/** Markdown 正文：优先取 content.text（发送时渲染后的可读正文），渲染为富文本 HTML */
const bodyHtml = computed(() => {
  if (!isMarkdown.value) return ''
  const text = detail.value?.content?.text
  if (typeof text !== 'string' || !text) return ''
  return md.render(text)
})

// ========== 展示辅助 ==========
function categoryLabel(category?: MessageCategory) {
  const labels: Record<string, string> = {
    WORKFLOW: '工作流', SYSTEM: '系统', NOTIFICATION: '通知', TASK: '任务', APPROVAL: '审批',
  }
  return (category && labels[category]) || category || '--'
}

function priorityLabel(priority?: MessagePriority) {
  const labels: Record<string, string> = {
    LOW: '低', NORMAL: '普通', HIGH: '高', URGENT: '紧急',
  }
  return (priority && labels[priority]) || priority || '--'
}

/** 渲染消息正文：content 为 JSON，优先取常见文本字段，否则格式化 JSON 展示 */
function renderContent(content: Record<string, any> | undefined): string {
  if (!content) return '--'
  const textKeys = ['text', 'content', 'message', 'body', 'description', 'msg']
  for (const k of textKeys) {
    const v = content[k]
    if (typeof v === 'string' && v) return v
    if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  }
  try {
    return JSON.stringify(content, null, 2)
  } catch {
    return String(content)
  }
}

function formatDateTime(time: string) {
  if (!time) return '--'
  const d = new Date(time)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ========== 流程上下文（工作流消息专用） ==========
const router = useRouter()

/** 工作流消息携带的流程变量（WorkflowNotifier 写入 content.variables）；非工作流消息返回 null */
const processCtx = computed<Record<string, any> | null>(() => {
  if (detail.value?.category !== 'WORKFLOW') return null
  const vars = detail.value?.content?.variables
  if (!vars || typeof vars !== 'object') return null
  return vars as Record<string, any>
})

const taskId = computed(() => {
  const v = processCtx.value?.taskId
  return typeof v === 'string' && v && v !== '-' ? v : ''
})

const instanceId = computed(() => {
  const v = processCtx.value?.processInstanceId
  return typeof v === 'string' && v && v !== '-' ? v : ''
})

/** 上下文取值：过滤占位符 "-"，为空返回空串（模板层用 v-if 隐藏） */
function ctxRaw(key: string): string {
  const v = processCtx.value?.[key]
  return typeof v === 'string' && v && v !== '-' ? v : ''
}
function ctxVal(key: string): string {
  return ctxRaw(key) || '--'
}

/** 精确直达待办任务处理页（taskId 为发送时刻的活跃任务，可能已被处理） */
function goTask() {
  drawerVisible.value = false
  router.push(`/process/todo/${taskId.value}`)
}

/** 打开流程跟踪页（流程图 + 节点轨迹） */
function goTrack() {
  drawerVisible.value = false
  router.push(`/process/instance/${instanceId.value}`)
}
</script>

<style scoped>
.detail-body {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  color: #303133;
}

/* 流程上下文操作区：右对齐按钮组，与描述列表留出间距 */
.ctx-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

/* 实例 ID 等技术标识：等宽字体 + 可选中复制 */
.ctx-mono {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 12px;
  color: #606266;
  word-break: break-all;
  user-select: all;
}
</style>
