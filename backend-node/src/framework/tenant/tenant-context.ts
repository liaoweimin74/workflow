import { AsyncLocalStorage } from 'node:async_hooks'
import { TenantNotSetException } from '../../common/exception/tenant-not-set.exception'

/** 租户 HTTP 头名，对齐 Java TenantInterceptor.TENANT_HEADER。 */
export const TENANT_HEADER = 'X-Tenant-Id'

interface TenantScope {
  tenantId: string | null
}

/**
 * 租户上下文存储。
 *
 * Java 侧用 ThreadLocal（com.workflow.engine.tenant.TenantContext），
 * Node 是单线程异步模型，ThreadLocal 语义不存在，必须用 AsyncLocalStorage。
 *
 * ⚠️ 绝对不要把租户 ID 放进模块级变量 —— 并发请求会串号。
 * 唯一正确的取值途径是 getTenantId() / tryGetTenantId()。
 *
 * 【为什么放在 framework 而不是 engine】
 *   Java 侧它住在 `com.workflow.engine.tenant`，但 Node 这边 engine / notification /
 *   system 三个平级模块都要取租户，而 eslint 的边界规则（见 eslint.config.mjs）
 *   **禁止 notification / system 依赖 engine**。放在 engine 下会让 notification
 *   要么违规导入，要么再抄一份 AsyncLocalStorage（那才是真危险：两份上下文＝串租户）。
 *   所以按「谁是横切基础设施」而不是「Java 放在哪个包」来决定归属。
 */
const storage = new AsyncLocalStorage<TenantScope>()

/** 在指定租户作用域内执行 fn。tenantId 为 null/空 时不设置租户。 */
export function runWithTenant<T>(tenantId: string | null | undefined, fn: () => T): T {
  const normalized =
    tenantId !== null && tenantId !== undefined && tenantId.trim() !== '' ? tenantId : null
  return storage.run({ tenantId: normalized }, fn)
}

/** 在当前作用域内设置租户 ID。 */
export function setTenantId(tenantId: string): void {
  const scope = storage.getStore()
  if (scope === undefined) {
    throw new Error('setTenantId 必须在 runWithTenant 作用域内调用')
  }
  scope.tenantId = tenantId
}

/** 读取租户 ID；未设置时抛 TenantNotSetException（对齐 Java TenantProvider.getTenantId）。 */
export function getTenantId(): string {
  const tenantId = tryGetTenantId()
  if (tenantId === null) {
    throw new TenantNotSetException()
  }
  return tenantId
}

/** 是否已设置租户（对齐 Java TenantProvider.hasTenantId）。 */
export function hasTenantId(): boolean {
  const tenantId = tryGetTenantId()
  return tenantId !== null && tenantId.trim() !== ''
}

/** 读取租户 ID；未设置返回 null。 */
export function tryGetTenantId(): string | null {
  return storage.getStore()?.tenantId ?? null
}

/** 清空当前作用域的租户 ID。 */
export function clearTenant(): void {
  const scope = storage.getStore()
  if (scope !== undefined) {
    scope.tenantId = null
  }
}
