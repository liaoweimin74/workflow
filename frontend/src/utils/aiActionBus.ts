/**
 * AI 助手 → 宿主页 动作总线。
 *
 * 助手产出结果（如表单 schema）后，通过动作总线请求当前页面执行动作，
 * 页面在 onMounted 注册处理器、onUnmounted 注销。
 */

export type AiActionHandler = (payload: any) => void

const handlers = new Map<string, Set<AiActionHandler>>()

export const aiActionBus = {
  /** 注册动作处理器，返回注销函数 */
  on(action: string, handler: AiActionHandler): () => void {
    let set = handlers.get(action)
    if (!set) {
      set = new Set()
      handlers.set(action, set)
    }
    set.add(handler)
    return () => aiActionBus.off(action, handler)
  },

  off(action: string, handler: AiActionHandler): void {
    handlers.get(action)?.delete(handler)
  },

  /** 派发动作；处理器异常不影响其他处理器 */
  emit(action: string, payload?: any): void {
    handlers.get(action)?.forEach((handler) => {
      try {
        handler(payload)
      } catch {
        // 单个处理器异常不影响整体
      }
    })
  },

  /** 清空所有处理器（测试用） */
  clear(): void {
    handlers.clear()
  },
}
