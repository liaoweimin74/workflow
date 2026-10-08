/**
 * 存储安全兜底（Task 25）。
 *
 * 背景：预览面板（Edge iframe 沙箱上下文）可能禁用 web storage，
 * 访问 window.localStorage / sessionStorage 的 getter 本身就会同步抛出
 * "Access to storage is not allowed from this context"。auth store 等模块
 * 在初始化时直接读 localStorage → 模块图加载失败 → 白屏。
 *
 * 方案：本模块必须在 main.ts 的所有 import 之前引入（side-effect self-install）。
 * 探测真实 storage 可写性；不可用时以内存 Map 兜底替换 window 上的属性——
 * 代价是刷新后数据丢失（登录态需重新登录），但页面功能完整可用。
 * jsdom/正常浏览器环境下探测通过，不做任何替换，行为与原来完全一致。
 */

type StorageKind = 'localStorage' | 'sessionStorage'

function createMemoryStorage(): Storage {
  const mem = new Map<string, string>()
  return {
    get length() {
      return mem.size
    },
    clear() {
      mem.clear()
    },
    getItem(key: string) {
      return mem.has(key) ? mem.get(key)! : null
    },
    key(index: number) {
      return Array.from(mem.keys())[index] ?? null
    },
    removeItem(key: string) {
      mem.delete(key)
    },
    setItem(key: string, value: string) {
      mem.set(key, String(value))
    },
  } as Storage
}

function installOnce(kind: StorageKind): void {
  try {
    // 访问 getter 本身就可能抛错（禁用上下文），必须连同读写一起探测
    const store = window[kind]
    const probeKey = '__wf_storage_probe__'
    store.setItem(probeKey, '1')
    store.removeItem(probeKey)
  } catch {
    try {
      Object.defineProperty(window, kind, {
        value: createMemoryStorage(),
        configurable: true,
        writable: false,
      })
      // eslint-disable-next-line no-console
      console.warn(`[safe-storage] ${kind} 不可用，已启用内存兜底（刷新后数据不保留）`)
    } catch {
      /* defineProperty 也被冻结的极端环境：无法兜底，保持原状 */
    }
  }
}

;['localStorage', 'sessionStorage'].forEach((kind) => installOnce(kind as StorageKind))
