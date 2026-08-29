/**
 * 视图脚本沙箱：声明式动作链 type=script 的执行环境。
 *
 * 隔离策略：`new Function` + with 白名单代理。
 * - 脚本源码编译为 `new Function('__sandbox', 'with (__sandbox) { 源码 }')`
 * - `__sandbox` 是 Proxy(context)：上下文键透传（含 ctx 自引用）；白名单全局
 *   （console/Math/Date/JSON/Object/Array/String/Number 等）放行；
 *   其余标识符（window/document/globalThis/process 等）解析为 undefined，阻止逃逸。
 * - 异常全部捕获并 console.error，不向上抛出。
 */

const SANDBOX_GLOBALS = [
  'console',
  'Math',
  'Date',
  'JSON',
  'Object',
  'Array',
  'String',
  'Number',
  'Boolean',
  'Promise',
  'Map',
  'Set',
  'RegExp',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'encodeURIComponent',
  'decodeURIComponent',
  'Infinity',
  'NaN',
]

/** 脚本事件开关：默认关闭，通过 VITE_PAGE_SCRIPT_ENABLED=true 开启 */
export function isScriptEventEnabled(): boolean {
  return import.meta.env.VITE_PAGE_SCRIPT_ENABLED === 'true'
}

/** 构建 with 绑定对象：Proxy 拦截所有标识符查找，限制逃逸 */
function createSandbox(context: Record<string, any>): Record<string, any> {
  return new Proxy(context, {
    // 所有标识符都命中沙箱（has=true），防止沿作用域链逃逸到真实全局
    has() {
      return true
    },
    get(target, key, receiver) {
      if (typeof key === 'symbol') return Reflect.get(target, key, receiver)
      // 上下文键优先（ctx 自引用 → context 本体）
      if (key === 'ctx') return context
      if (key in target) return Reflect.get(target, key, receiver)
      // 白名单全局放行
      if (SANDBOX_GLOBALS.includes(key)) return (globalThis as Record<string, any>)[key]
      // 其余受限：解析为 undefined
      return undefined
    },
  })
}

/**
 * 在沙箱中执行脚本（异常捕获，不抛出）。
 * @param source 脚本源码
 * @param context 注入上下文：row/params/selectedRows/ds/api/actions/$ 等
 */
export async function executeScript(source: string, context: Record<string, any>): Promise<void> {
  if (typeof source !== 'string' || !source.trim()) return
  try {
    const sandbox = createSandbox(context)
    // eslint-disable-next-line no-new-func
    const fn = new Function('__sandbox', `with (__sandbox) { ${source} }`)
    await fn(sandbox)
  } catch (e) {
    console.error('[script] 执行失败:', e)
  }
}

/**
 * 在沙箱中求值单个表达式并返回结果（异常捕获，返回 undefined）。
 *
 * 用于列动态内容 / 条件样式等"取结果"而非"执行动作"的场景。
 * 与 {@link executeScript} 共用同一沙箱安全模型（with + 白名单 Proxy）。
 *
 * @param source 表达式源码，如 `$row.amount > 1000 ? '高' : '低'`
 * @param context 注入上下文：$row/row/value/column 等（随需要传）
 */
export function evalCellExpression(source: string, context: Record<string, any>): unknown {
  if (typeof source !== 'string' || !source.trim()) return undefined
  try {
    const sandbox = createSandbox(context)
    // eslint-disable-next-line no-new-func
    const fn = new Function('__sandbox', `with (__sandbox) { return (${source}) }`)
    return fn(sandbox)
  } catch (e) {
    console.error('[script] 表达式求值失败:', e)
    return undefined
  }
}