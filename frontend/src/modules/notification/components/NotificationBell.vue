<template>
  <el-badge :value="store.unreadCount" :hidden="!store.hasUnread" :max="99" class="notification-bell">
    <el-popover placement="bottom-end" :width="360" trigger="click">
      <template #reference>
        <el-button :icon="Bell" circle />
      </template>
      <div class="bell-panel">
        <div class="bell-header">
          <span>消息通知</span>
          <el-button v-if="store.hasUnread" type="primary" link @click="handleReadAll">全部已读</el-button>
        </div>
        <el-divider style="margin: 8px 0" />
        <div v-if="recentMessages.length === 0" class="bell-empty">暂无消息</div>
        <div v-else class="bell-list">
          <div v-for="msg in recentMessages" :key="msg.id" class="bell-item" @click="handleClick(msg)">
            <div class="bell-item-title">{{ msg.title }}</div>
            <div class="bell-item-time">{{ formatTime(msg.createdAt) }}</div>
          </div>
        </div>
        <el-divider style="margin: 8px 0" />
        <div class="bell-footer">
          <el-button type="primary" link @click="goToCenter">查看全部</el-button>
        </div>
      </div>
    </el-popover>
  </el-badge>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Bell } from '@element-plus/icons-vue'
import { useNotificationStore } from '../stores/notification'
import type { Message } from '../types'

const store = useNotificationStore()
const router = useRouter()

const recentMessages = computed(() => store.messages.slice(0, 5))

onMounted(() => {
  store.fetchMessages(0)
  store.fetchUnreadCount()
  store.connectSSE()
})

onUnmounted(() => {
  store.disconnectSSE()
})

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

async function handleClick(msg: Message) {
  await store.readMessage(msg.id)
  // 根据 linkJson 跳转
  if (msg.linkJson) {
    const link = msg.linkJson as { type?: string; url?: string }
    if (link.type === 'WORKFLOW_INSTANCE' && link.url) {
      router.push(link.url)
    } else if (link.url) {
      router.push(link.url)
    }
  }
}

function handleReadAll() {
  store.readAllMessages()
}

function goToCenter() {
  router.push('/messages')
}
</script>

<style scoped>
.bell-panel {
  padding: 0;
}
.bell-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}
.bell-empty {
  text-align: center;
  color: #999;
  padding: 20px 0;
}
.bell-list {
  max-height: 300px;
  overflow-y: auto;
}
.bell-item {
  padding: 8px 0;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
}
.bell-item:hover {
  background: #f5f7fa;
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
  text-align: center;
}
</style>
