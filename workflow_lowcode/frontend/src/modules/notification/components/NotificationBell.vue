<template>
  <el-badge :value="store.unreadCount" :hidden="!store.hasUnread" :max="99" class="notification-bell">
    <el-popover ref="popRef" placement="bottom-end" :width="380" trigger="click" @show="handleShow">
      <template #reference>
        <el-button :icon="Bell" circle />
      </template>
      <div class="bell-panel">
        <div class="bell-header">
          <span class="bell-title">消息通知</span>
          <el-tooltip :content="`只显示最新${MAX_LIST_SIZE}条消息，更多消息到消息中心查看`" placement="top">
            <el-icon class="bell-hint" :size="15"><WarningFilled /></el-icon>
          </el-tooltip>
        </div>
        <el-tabs v-model="activeTab" @tab-change="handleTabChange">
          <el-tab-pane label="未读" name="unread">
            <div v-loading="loading" class="bell-list-wrap">
              <div v-if="unreadList.length === 0" class="bell-empty">暂无未读消息</div>
              <div v-else class="bell-list">
                <div v-for="msg in unreadList" :key="msg.id" class="bell-item" @click="handleClick(msg)">
                  <div class="bell-item-main">
                    <div class="bell-item-title">{{ msg.title }}</div>
                    <div class="bell-item-time">{{ formatTime(msg.createdAt) }}</div>
                  </div>
                  <el-button
                    v-if="msg.category === 'WORKFLOW'"
                    class="bell-item-action"
                    type="primary"
                    link
                    size="small"
                    @click.stop="goToProcess(msg)"
                  >
                    去处理<el-icon><Promotion /></el-icon>
                  </el-button>
                </div>
              </div>
            </div>
          </el-tab-pane>
          <el-tab-pane label="已读" name="read">
            <div v-loading="loading" class="bell-list-wrap">
              <div v-if="readList.length === 0" class="bell-empty">暂无已读消息</div>
              <div v-else class="bell-list">
                <div v-for="msg in readList" :key="msg.id" class="bell-item" @click="handleClick(msg)">
                  <div class="bell-item-main">
                    <div class="bell-item-title">{{ msg.title }}</div>
                    <div class="bell-item-time">{{ formatTime(msg.createdAt) }}</div>
                  </div>
                  <el-button
                    v-if="msg.category === 'WORKFLOW'"
                    class="bell-item-action"
                    type="primary"
                    link
                    size="small"
                    @click.stop="goToProcess(msg)"
                  >
                    去处理<el-icon><Promotion /></el-icon>
                  </el-button>
                </div>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
        <el-divider style="margin: 8px 0" />
        <div class="bell-footer">
          <el-button v-if="activeTab === 'unread' && unreadList.length > 0" type="primary" link @click="handleReadAll">
            全部已读
          </el-button>
          <el-button type="primary" link @click="goToCenter">查看全部</el-button>
        </div>
      </div>
    </el-popover>
  </el-badge>

  <MessageDetailDrawer
    v-model="detailVisible"
    :message-id="detailId"
    @read="handleDrawerRead"
  />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Bell, WarningFilled, Promotion } from '@element-plus/icons-vue'
import { useNotificationStore } from '../stores/notification'
import MessageDetailDrawer from './MessageDetailDrawer.vue'
import { getNotifications } from '../api/notification'
import type { Message, PageResult } from '../types'

const store = useNotificationStore()
const router = useRouter()

/** 当前页签：unread=未读，read=已读 */
const activeTab = ref<'unread' | 'read'>('unread')
/** 小窗口每个页签最多展示的消息数 */
const MAX_LIST_SIZE = 50
const unreadList = ref<Message[]>([])
const readList = ref<Message[]>([])
const loading = ref(false)

/** 详情抽屉 */
const detailVisible = ref(false)
const detailId = ref<number | null>(null)

/** popover 实例引用：跳转前手动收起下拉 */
const popRef = ref<{ hide?: () => void } | null>(null)

onMounted(() => {
  store.fetchUnreadCount()
  store.connectSSE()
})

onUnmounted(() => {
  store.disconnectSSE()
})

/** popover 打开：拉当前页签列表 */
function handleShow() {
  loadList(activeTab.value === 'unread')
}

/** 切换页签 */
function handleTabChange() {
  loadList(activeTab.value === 'unread')
}

/** 按已读状态拉取最近消息 */
async function loadList(unread: boolean) {
  loading.value = true
  try {
  const res = await getNotifications({ page: 1, size: MAX_LIST_SIZE, unread })
    const rows = (res.data as PageResult<Message>).rows || []
    if (unread) {
      unreadList.value = rows
    } else {
      readList.value = rows
    }
  } finally {
    loading.value = false
  }
}

function formatTime(time: string) {
  const date = new Date(time)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  return `${days}天前`
}

/** 点击消息：以抽屉打开详情（未读自动已读由抽屉处理） */
function handleClick(msg: Message) {
  detailId.value = msg.id
  detailVisible.value = true
}

/** 收起下拉（Element Plus el-popover 暴露 hide；兼容旧版经 popperRef） */
function closePopover() {
  const pop = popRef.value as { hide?: () => void; popperRef?: { hide?: () => void } } | null
  if (pop?.hide) pop.hide()
  else pop?.popperRef?.hide?.()
}

/** 工作流消息直达（与消息中心 goToProcess 同规则的三级跳转）：
 *  taskId → 任务处理页；instanceId → 流程跟踪页；旧消息兑底待办列表 */
function goToProcess(msg: Message) {
  const vars = (msg.content as Record<string, any>)?.variables || {}
  const taskId = typeof vars.taskId === 'string' && vars.taskId !== '-' ? vars.taskId : ''
  const instanceId = typeof vars.processInstanceId === 'string' && vars.processInstanceId !== '-' ? vars.processInstanceId : ''
  closePopover()
  if (taskId) {
    router.push(`/process/todo/${taskId}`)
  } else if (instanceId) {
    router.push(`/process/instance/${instanceId}`)
  } else {
    router.push({ name: 'ProcessTodo' })
  }
}

/** 抽屉内消息从未读变为已读：刷新角标与当前列表 */
async function handleDrawerRead() {
  store.fetchUnreadCount()
  await loadList(activeTab.value === 'unread')
}

async function handleReadAll() {
  await store.readAllMessages()
  await loadList(true)
  await loadList(false)
}

function goToCenter() {
  router.push('/messages')
}
</script>

<style scoped>
.bell-panel {
  padding: 0;
}
.bell-list-wrap {
  min-height: 60px;
  max-height: 300px;
}
.bell-empty {
  text-align: center;
  color: #999;
  padding: 20px 0;
}
.bell-list {
  max-height: 260px;
  overflow-y: auto;
}
.bell-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
}
.bell-item:hover {
  background: #f5f7fa;
}
.bell-item-main {
  flex: 1;
  min-width: 0;
}
.bell-item-action {
  flex-shrink: 0;
  opacity: 0.75;
  transition: opacity 0.2s;
}
.bell-item:hover .bell-item-action {
  opacity: 1;
}
.bell-item-title {
  font-size: 14px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bell-item-time {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}
.bell-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
