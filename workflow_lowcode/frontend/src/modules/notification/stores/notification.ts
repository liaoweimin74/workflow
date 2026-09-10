/**
 * 通知 Store
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getNotifications, getUnreadCount, markAsRead, markAllAsRead, deleteNotification } from '../api/notification'
import type { Message, PageResult } from '../types'

export const useNotificationStore = defineStore('notification', () => {
  const messages = ref<Message[]>([])
  const total = ref(0)
  const unreadCount = ref(0)
  const loading = ref(false)
  const currentPage = ref(0)
  const pageSize = ref(20)
  let eventSource: EventSource | null = null

  /** 加载消息列表 */
  async function fetchMessages(page = 0) {
    loading.value = true
    try {
      const res = await getNotifications({ page, size: pageSize.value })
      const data = res.data as PageResult<Message>
      messages.value = data.rows
      total.value = data.total
      currentPage.value = page
    } finally {
      loading.value = false
    }
  }

  /** 加载未读数 */
  async function fetchUnreadCount() {
    const res = await getUnreadCount()
    unreadCount.value = res.data as number
  }

  /** 建立 SSE 连接 */
  function connectSSE() {
    if (eventSource) {
      eventSource.close()
    }

    const token = localStorage.getItem('access_token') ?? ''
    // EventSource 无法自定义 header，通过 query 参数携带 token
    eventSource = new EventSource(`/api/v1/notifications/sse?token=${encodeURIComponent(token)}`)

    eventSource.addEventListener('new-message', (event) => {
      const message = JSON.parse(event.data) as Message
      // 更新未读数
      unreadCount.value++
      // 如果消息列表有数据，插入到顶部
      if (messages.value.length > 0) {
        messages.value.unshift(message)
        if (messages.value.length > pageSize.value) {
          messages.value.pop()
        }
      }
      total.value++
    })

    eventSource.onerror = () => {
      // SSE 自动重连，浏览器会处理
      console.warn('SSE 连接断开，将自动重连')
    }
  }

  /** 断开 SSE 连接 */
  function disconnectSSE() {
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
  }

  /** 标记已读 */
  async function readMessage(id: number) {
    await markAsRead(id)
    await fetchUnreadCount()
  }

  /** 全部已读 */
  async function readAllMessages() {
    await markAllAsRead()
    unreadCount.value = 0
    await fetchMessages(currentPage.value)
  }

  /** 删除消息 */
  async function removeMessage(id: number) {
    await deleteNotification(id)
    await fetchMessages(currentPage.value)
    await fetchUnreadCount()
  }

  const hasUnread = computed(() => unreadCount.value > 0)

  return {
    messages,
    total,
    unreadCount,
    loading,
    currentPage,
    pageSize,
    hasUnread,
    fetchMessages,
    fetchUnreadCount,
    connectSSE,
    disconnectSSE,
    readMessage,
    readAllMessages,
    removeMessage,
  }
})
