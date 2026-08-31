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
        <el-descriptions-item label="状态">{{ detail?.status === 'PENDING' ? '未读' : '已读' }}</el-descriptions-item>
        <el-descriptions-item label="优先级">{{ priorityLabel(detail?.priority) }}</el-descriptions-item>
        <el-descriptions-item label="时间">{{ formatDateTime(detail?.createdAt || '') }}</el-descriptions-item>
      </el-descriptions>

      <el-divider content-position="left">消息内容</el-divider>
      <pre class="detail-body">{{ renderContent(detail?.content) }}</pre>

      <template v-if="linkUrl">
        <el-divider content-position="left">相关链接</el-divider>
        <el-link type="primary" :href="linkUrl" target="_blank">{{ linkUrl }}</el-link>
      </template>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { getNotification, markAsRead } from '../api/notification'
import type { Message, MessageCategory, MessagePriority } from '../types'

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
  () => [props.modelValue, props.messageId],
  async ([visible, id]) => {
    if (visible && id) {
      loading.value = true
      detail.value = null
      try {
        const res = await getNotification(id)
        detail.value = res.data
        if (res.data.status === 'PENDING') {
          await markAsRead(id)
          detail.value.status = 'SENT'
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
</style>
