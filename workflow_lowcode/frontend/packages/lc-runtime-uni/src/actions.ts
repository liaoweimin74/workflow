/**
 * @lc/runtime-uni/actions：动作 op 的 uni 侧分发（Task 3.2 骨架）。
 *
 * 出码产物里的按钮/事件链调用 runAction(op, ctx)，由这里分发到 uni API：
 * open-link→uni.navigateTo、message→uni.showToast；判不了的 op 拒绝执行
 * （返回 false，宁可不接线也不假执行——与 web 链判定同纪律）。
 * list-ref / container 族与 export 的端语义适配在 Task 5.3 落地。
 */

export interface UniActionOp {
  op: string
  /** open-link：页内路由（/pages/...） */
  url?: string
  /** message：提示文案 */
  text?: string
  [key: string]: unknown
}

export type UniActionCtx = Record<string, unknown>

function navigateTo(url: string): boolean {
  if (!url) return false
  uni.navigateTo({ url })
  return true
}

function toast(text: string): boolean {
  uni.showToast({ title: text, icon: 'none' })
  return true
}

/** 分发一个动作 op；返回是否真实执行（未适配 op 返回 false 并告警） */
export async function runAction(op: UniActionOp, _ctx: UniActionCtx = {}): Promise<boolean> {
  switch (op.op) {
    case 'open-link':
      return navigateTo(String(op.url ?? ''))
    case 'message':
      return toast(String(op.text ?? ''))
    default:
      console.warn(`[lc-runtime-uni] 未适配的动作 op: ${op.op}，已拒绝执行`)
      return false
  }
}

/**
 * 脚本上下文的 message 材料（Task 5.3）：对位 web 产物 `const message = ElMessage` 的调用面
 * （{ message, type } 对象与裸字符串都收），映射 uni.showToast——success/error 之外图标取
 * none（ElMessage 无图标语义，语义不投机增）。
 */
export function uniMessage(opts: { message?: string; type?: string } | string): void {
  const o = typeof opts === 'string' ? { message: opts } : opts
  const icon = o.type === 'success' ? 'success' : o.type === 'error' ? 'error' : 'none'
  uni.showToast({ title: String(o.message ?? ''), icon })
}
