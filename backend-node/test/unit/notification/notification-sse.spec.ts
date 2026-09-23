import { Logger } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { NotificationSseManager } from '../../../src/notification/sse/notification-sse.manager'

/**
 * SSE 连接管理器的单测（对齐 Java `SseEmitterManager`）。
 *
 * 端到端链路已由 `test/integration/sse.spec.ts` 验证（真起应用、真开流、真推送）；
 * 这里锁住的是**契约网与端到端都够不到的分支**：
 *   - 同一用户重复连接时**旧连接必须被关闭**（否则前端一重连就会收到重复消息）
 *   - 向**离线用户**推送必须静默跳过而不是抛错（消息落库是主流程，推送只是附带）
 *   - 旧连接完成时**不能**把后来替换上来的新连接一并清掉（典型竞态）
 */

Logger.overrideLogger([])

describe('NotificationSseManager', () => {
  it('注册后可收到推送；离线用户静默跳过（不抛错）', () => {
    const manager = new NotificationSseManager()
    expect(manager.getOnlineCount()).toBe(0)

    // 离线：不抛错、不留下任何状态
    expect(() => manager.sendToUser(7, 'new-message', { id: 1 })).not.toThrow()
    expect(manager.getOnlineCount()).toBe(0)

    const received: unknown[] = []
    manager.register(7).subscribe((event) => received.push(event))
    expect(manager.getOnlineCount()).toBe(1)
    manager.sendToUser(7, 'new-message', { id: 2, title: 'x' })
    expect(received).toEqual([{ type: 'new-message', data: { id: 2, title: 'x' } }])
  })

  it('同一用户重复连接：旧连接被关闭，且新连接仍能收到推送', () => {
    const manager = new NotificationSseManager()
    const first: unknown[] = []
    let firstCompleted = false
    manager.register(1).subscribe({
      next: (e) => first.push(e),
      complete: () => {
        firstCompleted = true
      },
    })

    const second: unknown[] = []
    manager.register(1).subscribe((e) => second.push(e))

    expect(firstCompleted, '重连时旧连接必须被 complete（否则同一条消息推两次）').toBe(true)
    expect(manager.getOnlineCount()).toBe(1)

    manager.sendToUser(1, 'new-message', { id: 9 })
    expect(first).toEqual([])
    expect(second).toEqual([{ type: 'new-message', data: { id: 9 } }])
  })

  it('旧连接完成时不能把替换上来的新连接清掉（竞态）', () => {
    const manager = new NotificationSseManager()
    manager.register(3)
    const second = manager.register(3) // 替换掉第一条
    const received: unknown[] = []
    second.subscribe((e) => received.push(e))

    // 旧连接在替换时已经 complete；此时在线数必须是 1（新连接）
    expect(manager.getOnlineCount()).toBe(1)
    manager.sendToUser(3, 'new-message', { id: 1 })
    expect(received).toHaveLength(1)
  })

  it('客户端断开（unsubscribe）后摘掉登记 —— 对应 Java 的 onCompletion/onError', () => {
    const manager = new NotificationSseManager()
    const subscription = manager.register(5).subscribe(() => undefined)
    expect(manager.getOnlineCount()).toBe(1)

    // 浏览器关页面 / 网络断开时 Nest 会 unsubscribe，而不是 complete
    subscription.unsubscribe()
    expect(manager.getOnlineCount(), '断开的连接必须被摘掉，否则 onlineCount 虚高到超时').toBe(0)

    // 断开后再推：静默跳过，不抛错
    expect(() => manager.sendToUser(5, 'new-message', { id: 1 })).not.toThrow()
  })

  it('旧连接迟到的 teardown 不能摘掉替换上来的新连接', () => {
    const manager = new NotificationSseManager()
    const firstSubscription = manager.register(6).subscribe(() => undefined)
    const second = manager.register(6)
    const received: unknown[] = []
    second.subscribe((e) => received.push(e))

    // 旧连接此时才 unsubscribe（真实场景：断开的 socket 稍后才被回收）
    firstSubscription.unsubscribe()
    expect(manager.getOnlineCount()).toBe(1)

    manager.sendToUser(6, 'new-message', { id: 1 })
    expect(received).toHaveLength(1)
  })

  it('超时常量为 30 分钟（对齐 Java SseEmitterManager.TIMEOUT）', () => {
    expect(NotificationSseManager.TIMEOUT_MS).toBe(30 * 60 * 1000)
  })

  it('30 分钟超时后连接被关闭并摘除', async () => {
    vi.useFakeTimers()
    try {
      const manager = new NotificationSseManager()
      let completed = false
      manager.register(11).subscribe({ complete: () => (completed = true) })
      expect(manager.getOnlineCount()).toBe(1)

      vi.advanceTimersByTime(NotificationSseManager.TIMEOUT_MS)
      expect(completed).toBe(true)
      expect(manager.getOnlineCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
