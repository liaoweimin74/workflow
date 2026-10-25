import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * 客户端上下文存储（模式对齐 `user-context`：AsyncLocalStorage 隐式携带）。
 *
 * 【为什么需要】多端交付下，认证链的权限聚合（getInfo/登录的 roles/permissions、
 * 菜单树取数）都要按「本次请求来自哪个客户端」过滤角色。取值点散布在
 * service → repository 的聚合查询里，逐层显式传参会污染整条调用链签名 ——
 * 与用户/租户上下文同理，用 ALS 让请求链隐式携带。
 *
 * 【P0 来源】`X-Client-Id` 请求头（client.interceptor.ts 解析）；
 * 渠道签名/APP 注册等 P2 来源接入后仍走同一 setter，消费方零改动。
 *
 * 【为什么放在 framework/security】与 user-context 同层；eslint 边界规则
 * 规定 framework 只可依赖 common —— 本文件只依赖 node 内置，不越界。
 *
 * ⚠️ 与 user/tenant-context 同一条铁律：绝不把端 id 放进模块级变量 —— 并发请求会串号。
 * 唯一正确的取值途径是 tryGetClient()。
 */
const storage = new AsyncLocalStorage<number>()

/** 默认平台客户端 id（sys_client seed id=1）；无端上下文的请求按 portal 处理（零破坏）。 */
export const DEFAULT_CLIENT_ID = 1

/** 在指定客户端作用域内执行 fn。interceptor 恒传有效 id（非法头已归一为缺省）。 */
export function runWithClient<T>(clientId: number, fn: () => T): T {
  return storage.run(clientId, fn)
}

/** 读取当前请求的客户端 id；不在作用域内（测试直调 service/系统内部调用）返回缺省 portal。 */
export function tryGetClient(): number {
  return storage.getStore() ?? DEFAULT_CLIENT_ID
}

/** 解析 X-Client-Id 头：正整数（≥1）才有效，其余（缺失/非数字/<1）一律按缺省端处理。 */
export function parseClientIdHeader(raw: unknown): number {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string' && typeof value !== 'number') return DEFAULT_CLIENT_ID
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : DEFAULT_CLIENT_ID
}
