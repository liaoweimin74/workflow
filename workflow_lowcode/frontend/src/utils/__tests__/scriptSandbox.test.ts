import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { executeScript, isScriptEventEnabled, evalCellExpression } from '../scriptSandbox'

describe('scriptSandbox — 视图脚本沙箱', () => {
  const originalEnv = import.meta.env

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('上下文注入：脚本可直接读写 ctx 对象键（row 透传引用）', async () => {
    const ctx = { row: { name: '张三', age: 30 } }
    await executeScript('row.name = "李四"; ctx.row.age = 31', ctx)
    expect(ctx.row).toEqual({ name: '李四', age: 31 })
  })

  it('全局访问受限：window/document 不可用，真实全局不被污染', async () => {
    const ctx = { res: '' }
    // typeof 解析为 undefined（被 sandbox 拦截，未逃逸到真实全局）
    await executeScript('ctx.res = typeof window + "|" + typeof document', ctx)
    expect(ctx.res).toBe('undefined|undefined')
    // 赋值给受限键抛错会被捕获，不冒出；真实 window 不受污染
    await expect(executeScript('window.__leak = 1', {})).resolves.toBeUndefined()
    expect((window as any).__leak).toBeUndefined()
  })

  it('异常被捕获不抛出，console.error 记录', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(executeScript('throw new Error("boom")', {})).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
  })

  it('actions/api/ds 透传可调用', async () => {
    const ctx = {
      actions: { run: vi.fn(), refresh: vi.fn() },
      api: { query: vi.fn().mockResolvedValue([1, 2]) },
      ds: { ready: true },
      res: false,
    }
    await executeScript('actions.run(); ctx.res = ds.ready && typeof api.query === "function"', ctx)
    expect(ctx.actions.run).toHaveBeenCalled()
    expect(ctx.res).toBe(true)
  })

  it('上下文键访问优先于全局白名单（同名覆盖）', async () => {
    const ctx = { Math: { custom: true } }
    await executeScript('ctx.customMath = typeof Math', ctx)
    expect(ctx.customMath).toBe('object')
  })

  it('isScriptEventEnabled 默认关闭（VITE_PAGE_SCRIPT_ENABLED 未设置）', () => {
    expect(isScriptEventEnabled()).toBe(false)
  })

  it('isScriptEventEnabled 随 VITE_PAGE_SCRIPT_ENABLED=true 开启', () => {
    vi.stubEnv('VITE_PAGE_SCRIPT_ENABLED', 'true')
    expect(isScriptEventEnabled()).toBe(true)
    vi.stubEnv('VITE_PAGE_SCRIPT_ENABLED', 'false')
    expect(isScriptEventEnabled()).toBe(false)
  })
})

describe('evalCellExpression — 列动态表达式求值', () => {
  it('求值单表达式并返回结果（$row 上下文）', () => {
    const row = { amount: 5000 }
    const result = evalCellExpression('$row.amount > 1000 ? "高" : "低"', { $row: row, row })
    expect(result).toBe('高')
  })

  it('注入 value 上下文（当前单元格值）', () => {
    const result = evalCellExpression('value > 100 ? "big" : "small"', { $row: {}, row: {}, value: 500 })
    expect(result).toBe('big')
  })

  it('表达式异常返回 undefined 且不抛出', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(evalCellExpression('undefinedFn()', { $row: {}, row: {} })).toBeUndefined()
    expect(spy).toHaveBeenCalled()
  })

  it('空 source 返回 undefined', () => {
    expect(evalCellExpression('', { $row: {}, row: {} })).toBeUndefined()
    expect(evalCellExpression('   ', { $row: {}, row: {} })).toBeUndefined()
  })

  it('受限全局不可用，逃逸被拦截', () => {
    expect(evalCellExpression('typeof window', { $row: {}, row: {} })).toBe('undefined')
  })
})