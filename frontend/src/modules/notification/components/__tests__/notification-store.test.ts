import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// 在导入 store 之前 mock http
vi.mock('@/utils/http', () => {
  return {
    default: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  }
})

// 动态导入 mock 和 store
import http from '@/utils/http'
import { useNotificationStore } from '../../stores/notification'

const mockGet = vi.mocked(http.get)

describe('useNotificationStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mockGet.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('unread-count')) {
        return Promise.resolve({ data: 0 })
      }
      return Promise.resolve({ data: { rows: [], total: 0, page: 0, size: 20 } })
    })
  })

  it('initializes with default values', () => {
    const store = useNotificationStore()
    expect(store.unreadCount).toBe(0)
    expect(store.messages).toEqual([])
    expect(store.hasUnread).toBe(false)
    expect(store.loading).toBe(false)
  })

  it('hasUnread reflects unreadCount', () => {
    const store = useNotificationStore()
    expect(store.hasUnread).toBe(false)
    store.unreadCount = 5
    expect(store.hasUnread).toBe(true)
  })

  it('fetchMessages calls API and updates state', async () => {
    const store = useNotificationStore()
    await store.fetchMessages(0)
    expect(store.loading).toBe(false)
    expect(mockGet).toHaveBeenCalled()
  })

  it('fetchUnreadCount updates unreadCount', async () => {
    mockGet.mockResolvedValueOnce({ data: 3 })
    const store = useNotificationStore()
    await store.fetchUnreadCount()
    expect(store.unreadCount).toBe(3)
  })
})
