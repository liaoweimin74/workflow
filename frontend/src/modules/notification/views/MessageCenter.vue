<template>
  <div class="message-center">
    <el-container style="height: calc(100vh - 60px)">
      <!-- 左侧分类 -->
      <el-aside width="180px" class="category-panel">
        <div class="category-title">消息分类</div>
        <el-menu :default-active="activeCategory" @select="handleCategorySelect">
          <el-menu-item index="all">全部消息</el-menu-item>
          <el-menu-item index="WORKFLOW">工作流</el-menu-item>
          <el-menu-item index="SYSTEM">系统消息</el-menu-item>
          <el-menu-item index="USER">用户通信</el-menu-item>
          <el-menu-item index="EXTERNAL">外部业务</el-menu-item>
        </el-menu>
      </el-aside>

      <!-- 中间消息列表 -->
      <el-main class="message-list-panel">
        <div class="list-header">
          <el-input v-model="keyword" placeholder="搜索消息" clearable style="width: 300px" @keyup.enter="handleSearch" />
          <el-button type="primary" @click="handleReadAll">全部已读</el-button>
        </div>
        <el-table :data="store.messages" v-loading="store.loading" @row-click="handleRowClick" stripe>
          <el-table-column prop="title" label="标题" min-width="200">
            <template #default="{ row }">
              <span :class="{ 'unread': row.status === 'PENDING' }">{{ row.title }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="category" label="分类" width="100">
            <template #default="{ row }">
              <el-tag size="small">{{ categoryLabel(row.category) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="时间" width="160">
            <template #default="{ row }">
              {{ formatDateTime(row.createdAt) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button type="danger" link @click.stop="handleDelete(row.id)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="store.pageSize"
          :total="store.total"
          layout="total, prev, pager, next"
          style="margin-top: 16px; justify-content: flex-end"
          @current-change="handlePageChange"
        />
      </el-main>

      <!-- 右侧消息详情 -->
      <el-aside width="350px" class="detail-panel">
        <template v-if="selectedMessage">
          <div class="detail-title">{{ selectedMessage.title }}</div>
          <div class="detail-meta">
            <span>分类：{{ categoryLabel(selectedMessage.category) }}</span>
            <span>优先级：{{ selectedMessage.priority }}</span>
          </div>
          <div class="detail-time">{{ formatDateTime(selectedMessage.createdAt) }}</div>
          <el-divider />
          <div class="detail-content">{{ JSON.stringify(selectedMessage.content) }}</div>
          <div v-if="selectedMessage.linkJson" class="detail-action">
            <el-button type="primary" @click="handleJump">查看详情</el-button>
          </div>
        </template>
        <div v-else class="detail-empty">选择一条消息查看详情</div>
      </el-aside>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationStore } from '../stores/notification'
import type { Message, MessageCategory } from '../types'

const store = useNotificationStore()
const router = useRouter()

const activeCategory = ref('all')
const keyword = ref('')
const currentPage = ref(1)
const selectedMessage = ref<Message | null>(null)

onMounted(() => {
  store.fetchMessages(0)
})

function categoryLabel(category: MessageCategory) {
  const labels: Record<string, string> = {
    WORKFLOW: '工作流',
    SYSTEM: '系统',
    USER: '用户',
    EXTERNAL: '外部',
  }
  return labels[category] || category
}

function formatDateTime(time: string) {
  return new Date(time).toLocaleString('zh-CN')
}

function handleCategorySelect(index: string) {
  activeCategory.value = index
  // TODO: 按分类筛选
  store.fetchMessages(0)
}

function handleSearch() {
  // TODO: 按关键词搜索
  store.fetchMessages(0)
}

function handlePageChange(page: number) {
  store.fetchMessages(page - 1)
}

function handleRowClick(row: Message) {
  selectedMessage.value = row
  if (row.status === 'PENDING') {
    store.readMessage(row.id)
  }
}

async function handleDelete(id: number) {
  await store.removeMessage(id)
}

function handleReadAll() {
  store.readAllMessages()
}

function handleJump() {
  if (selectedMessage.value?.linkJson) {
    const link = selectedMessage.value.linkJson as { type?: string; url?: string }
    if (link.url) {
      if (link.type === 'EXTERNAL') {
        window.open(link.url, '_blank')
      } else {
        router.push(link.url)
      }
    }
  }
}
</script>

<style scoped>
.message-center {
  height: 100%;
}
.category-panel {
  border-right: 1px solid #e4e7ed;
  padding: 16px;
}
.category-title {
  font-weight: 600;
  margin-bottom: 12px;
}
.message-list-panel {
  padding: 16px;
}
.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.unread {
  font-weight: 600;
}
.detail-panel {
  border-left: 1px solid #e4e7ed;
  padding: 16px;
}
.detail-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
}
.detail-meta {
  font-size: 13px;
  color: #666;
  display: flex;
  gap: 16px;
}
.detail-time {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}
.detail-content {
  font-size: 14px;
  line-height: 1.6;
  color: #333;
}
.detail-action {
  margin-top: 16px;
}
.detail-empty {
  text-align: center;
  color: #999;
  padding: 40px 0;
}
</style>
