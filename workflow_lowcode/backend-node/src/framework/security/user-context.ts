import { AsyncLocalStorage } from 'node:async_hooks'
import type { LoginUser } from './jwt-auth.guard'

/**
 * 用户上下文存储（模式对齐 `tenant-context`：AsyncLocalStorage 隐式携带）。
 *
 * 【为什么需要】内建系统数据源「待办任务」的取数要按**当前登录人**过滤，
 * 但取数发生在 engine 层适配器深处，调用链（page-definition → DataSourceService
 * → adapter）上没有任何地方显式传用户 —— 与租户上下文同理，用 ALS 让整条
 * 请求链隐式携带，避免为一个分支改穿整条调用链签名。
 *
 * 【为什么放在 framework/security】LoginUser 类型就住在本目录；且 eslint 边界
 * 规则（eslint.config.mjs）规定 framework 只可依赖 common —— 本文件只依赖
 * node 内置 + 同目录类型，不越界。
 *
 * ⚠️ 与 tenant-context 同一条铁律：绝不把用户放进模块级变量 —— 并发请求会串号。
 * 唯一正确的取值途径是 tryGetUser() / tryGetUserId()。
 */
const storage = new AsyncLocalStorage<LoginUser>()

/** 在指定用户作用域内执行 fn；user 为 null/undefined 时原样执行（不设置作用域）。 */
export function runWithUser<T>(user: LoginUser | null | undefined, fn: () => T): T {
  if (user === null || user === undefined) return fn()
  return storage.run(user, fn)
}

/** 读取当前登录人；未认证请求（@Public 端点/系统内部调用）返回 null。 */
export function tryGetUser(): LoginUser | null {
  return storage.getStore() ?? null
}

/** 读取当前登录人 id；未认证返回 null。 */
export function tryGetUserId(): number | null {
  return storage.getStore()?.userId ?? null
}
