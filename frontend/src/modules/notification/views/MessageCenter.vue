<template>
  <div class="message-center-page">
    <SearchTable
      ref="tableRef"
      :search-fields="searchFields"
      :columns="columns"
      :action-buttons="actionButtons"
      :toolbar-buttons="toolbarButtons"
      :fetch-api="fetchApi"
      :show-selection="true"
      :default-page-size="10"
      @selection-change="handleSelectionChange"
      @row-click="handleRowClick"
    />

    <!-- 消息详情抽屉 -->
    <el-drawer
      v-model="drawerVisible"
      :title="currentDetail?.title || '消息详情'"
      size="480px"
      :destroy-on-close="true"
    >
      <div v-loading="detailLoading" class="detail-content">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="分类">{{ categoryLabel(currentDetail?.category) }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ currentDetail?.status === 'PENDING' ? '未读' : '已读' }}</el-descriptions-item>
          <el-descriptions-item label="优先级">{{ priorityLabel(currentDetail?.priority) }}</el-descriptions-item>
          <el-descriptions-item label="时间">{{ formatDateTime(currentDetail?.createdAt || '') }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">消息内容</el-divider>
        <pre class="detail-body">{{ renderContent(currentDetail?.content) }}</pre>

        <template v-if="linkUrl">
          <el-divider content-position="left">相关链接</el-divider>
          <el-link type="primary" :href="linkUrl" target="_blank">{{ linkUrl }}</el-link>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { SearchTable } from '@/components/business'
import { Check, Reading, Message as MessageIcon, Delete, View } from '@element-plus/icons-vue'
import type { SearchField, TableColumn, ActionButton, ToolbarButton } from '@/components/business/types'
import { ElMessage } from 'element-plus'
import { getNotifications, getNotification, markAsRead, markBatchAsRead, markAllAsRead, toggleRead, deleteNotification } from '../api/notification'
import { useNotificationStore } from '../stores/notification'
import type { Message, MessageCategory, MessagePriority, MessageStatus } from '../types'

const tableRef = ref<InstanceType<typeof SearchTable>>()
const store = useNotificationStore()
const router = useRouter()

/** 当前勾选的行（批量已读用） */
const selectedRows = ref<Message[]>([])

/** 消息详情抽屉 */
const drawerVisible = ref(false)
const detailLoading = ref(false)
const currentDetail = ref<Message | null>(null)

// ========== 查询栏 ==========
const searchFields: SearchField[] = [
  { type: 'input', label: '标题', prop: 'keyword', placeholder: '按标题搜索', style: 'width: 200px' },
  {
    type: 'select', label: '分类', prop: 'category', placeholder: '全部分类', style: 'width: 140px',
    options: [
      { label: '工作流', value: 'WORKFLOW' },
      { label: '系统', value: 'SYSTEM' },
      { label: '通知', value: 'NOTIFICATION' },
      { label: '任务', value: 'TASK' },
      { label: '审批', value: 'APPROVAL' },
    ],
  },
  {
    type: 'select', label: '状态', prop: 'unread', placeholder: '全部', style: 'width: 120px',
    options: [
      { label: '未读', value: true },
      { label: '已读', value: false },
    ],
  },
  { type: 'date-range', label: '时间', prop: 'timeRange', time: true, style: 'width: 360px' },
]

// ========== 列 ==========
const columns: TableColumn[] = [
  {
    prop: 'title', label: '标题', minWidth: 220,
    render: (row: any) => (row.status === 'PENDING' ? `◉ ${row.title || '--'}` : row.title || '--'),
  },
  {
    prop: 'status', label: '状态', width: 90, align: 'center',
    render: (row: any) => (row.status === 'PENDING' ? '未读' : '已读'),
  },
  {
    prop: 'category', label: '分类', width: 110, align: 'center',
    render: (row: any) => categoryLabel(row.category),
  },
  {
    prop: 'createdAt', label: '时间', width: 170,
    render: (row: any) => formatDateTime(row.createdAt),
  },
]

// ========== 工具栏按钮（带图标普通按钮） ==========
const toolbarButtons: ToolbarButton[] = [
  {
    label: '批量已读', icon: Check, type: 'primary',
    onClick: handleBatchRead,
  },
  {
    label: '全部已读', icon: Reading, type: 'success',
    onClick: handleReadAll,
  },
]

// ========== 操作列（全部图标按钮） ==========
const actionButtons: ActionButton[] = [
  {
    label: '查看', icon: View, size: 'small',
    onClick: openDetail,
  },
  {
    label: '切换已读状态', size: 'small',
    // 图标随状态切换：未读→Check（标记已读），已读→Message（标记未读）
    icon: (row: any) => (row.status === 'PENDING' ? Check : MessageIcon),
    onClick: async (row: any) => {
      const res = await toggleRead(row.id)
      row.status = (res.data as MessageStatus) || (row.status === 'PENDING' ? 'SENT' : 'PENDING')
      ElMessage.success(row.status === 'PENDING' ? '已标记为未读' : '已标记为已读')
      refreshUnread()
      tableRef.value?.fetchList()
    },
  },
  {
    label: '删除', icon: Delete, type: 'danger', size: 'small',
    confirm: '确定删除该消息吗？',
    onClick: async (row: any) => {
      await deleteNotification(row.id)
      ElMessage.success('删除成功')
      refreshUnread()
      tableRef.value?.fetchList()
    },
  },
]

// ========== 数据获取 ==========
async function fetchApi(params: any) {
  const [start, end] = params.timeRange || []
  const res = await getNotifications({
    page: (params.page || 1) - 1,
    size: params.size || 10,
    keyword: params.keyword || undefined,
    category: params.category || undefined,
    unread: params.unread ?? undefined,
    start: start || undefined,
    end: end || undefined,
  })
  const data = res.data as any
  return {
    rows: data.rows || [],
    total: data.total || 0,
  }
}

// ========== 交互 ==========
function handleSelectionChange(selection: any[]) {
  selectedRows.value = selection
}

/** 点击行：仅处理跳转链接，不再改变已读状态 */
function handleRowClick(row: Message) {
  if (row.linkJson) {
    const link = row.linkJson as { type?: string; url?: string }
    if (link.url) {
      if (link.type === 'EXTERNAL') {
        window.open(link.url, '_blank')
      } else {
        router.push(link.url)
      }
    }
  }
}

/** 打开详情抽屉：拉取完整内容，未读时自动标记已读 */
async function openDetail(row: Message) {
  drawerVisible.value = true
  detailLoading.value = true
  currentDetail.value = null
  try {
    const res = await getNotification(row.id)
    currentDetail.value = res.data
    if (row.status === 'PENDING') {
      await markAsRead(row.id)
      row.status = 'SENT'
      refreshUnread()
    }
  } finally {
    detailLoading.value = false
  }
}

async function handleBatchRead() {
  const ids = selectedRows.value.filter(r => r.status === 'PENDING').map(r => r.id)
  if (ids.length === 0) {
    ElMessage.warning('请先勾选未读消息')
    return
  }
  await markBatchAsRead(ids)
  ElMessage.success(`已将 ${ids.length} 条消息标记为已读`)
  refreshUnread()
  tableRef.value?.clearSelection()
  tableRef.value?.fetchList()
}

async function handleReadAll() {
  await markAllAsRead()
  ElMessage.success('全部消息已读')
  refreshUnread()
  tableRef.value?.fetchList()
}

/** 刷新未读数角标 */
function refreshUnread() {
  store.fetchUnreadCount()
}

// ========== 展示辅助 ==========
function categoryLabel(category?: MessageCategory) {
  const labels: Record<string, string> = {
    WORKFLOW: '工作流', SYSTEM: '系统', NOTIFICATION: '通知', TASK: '任务', APPROVAL: '审批',
  }
  return labels[category] || category || '--'
}

function priorityLabel(priority?: MessagePriority) {
  const labels: Record<string, string> = {
    LOW: '低', NORMAL: '普通', HIGH: '高', URGENT: '紧急',
  }
  return (priority && labels[priority]) || priority || '--'
}

/** 抽屉里展示的链接 */
const linkUrl = computed(() => {
  const link = currentDetail.value?.linkJson as { url?: string } | undefined
  return link?.url || ''
})

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
.message-center-page {
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
}

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
