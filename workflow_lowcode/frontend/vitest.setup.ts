/**
 * Vitest 全局 setup：jsdom 环境缺失的浏览器 API stub。
 * CodeMirror 6 的 EditorView 依赖 ResizeObserver 观测编辑器容器尺寸。
 * Vant 4 的 List 组件依赖 IntersectionObserver 做可见性检测（use-visibility）。
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

class IntersectionObserverStub {
  constructor(_callback: unknown, _options?: unknown) {}
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): unknown[] {
    return []
  }
}

const g = globalThis as unknown as Record<string, unknown>
if (!g.ResizeObserver) g.ResizeObserver = ResizeObserverStub
if (!g.IntersectionObserver) g.IntersectionObserver = IntersectionObserverStub
