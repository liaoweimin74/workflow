/**
 * 租户上下文未设置。对齐 Java com.workflow.engine.tenant.TenantNotSetException：
 * 由全局异常处理器映射为 HTTP 400 + code 400。
 *
 * ⚠️ 默认消息必须与 Java 侧的**逐字一致**（契约冻结包含错误信息）。
 *    它是 TenantProvider.getTenantId() 抛出的字面量，已由黄金样本实测确认：
 *      {"code":400,"msg":"Tenant ID is not set. Ensure X-Tenant-Id header is provided.","data":null}
 *
 * 为什么放在 common 而不是 engine/tenant：
 *   它是被**全局异常过滤器**（framework 层）消费的跨层错误类型。
 *   若留在 engine 层，framework 就必须反向依赖 engine —— 这正是模块边界规则
 *   （eslint no-restricted-imports）抓到的问题。异常类型属于跨层契约，归 common。
 */
export const TENANT_NOT_SET_MESSAGE = 'Tenant ID is not set. Ensure X-Tenant-Id header is provided.'

export class TenantNotSetException extends Error {
  constructor(message: string = TENANT_NOT_SET_MESSAGE) {
    super(message)
    this.name = 'TenantNotSetException'
  }
}
