/**
 * 自定义选人函数注册表（业务系统扩展点）。
 *
 * 业务系统在进程内注册「选人函数」（名字 → 同步函数），流程节点的
 * approval.type='external' + approval.external.resolver='<注册名>' 时，
 * 引擎运行时调用该函数动态解析办理/审批人。
 *
 * 约束（v1）：
 * - 选人函数必须**同步**返回 string[]（引擎解析链是同步纯内存的）；
 *   如需查库，请在启动时预载或用进程内缓存。
 * - 返回空数组/未注册的 resolver → 落到「找不到办理人」策略
 *   （或变量兜底 assignee_ext_<nodeId>，见 EngineRuntime.resolveAssignees）。
 *
 * 用法（业务系统接入示例）：
 * ```ts
 * import { registerAssigneeResolver } from '@/engine/runtime/assignee-resolver-registry'
 *
 * registerAssigneeResolver('crm_owner_resolver', ({ initiator, variables }) => {
 *   const ownerId = variables?.crm_owner_id
 *   return ownerId != null ? [String(ownerId)] : []
 * })
 * ```
 */

/** 选人函数上下文（引擎注入；variables 为快照，修改无效） */
export interface AssigneeResolveContext {
  /** 流程实例 ID（推进路径上可能尚未生成，缺省 undefined） */
  processInstanceId?: string
  /** 流程 key */
  processKey?: string
  /** 当前节点 ID */
  nodeId: string
  /** 当前节点名 */
  nodeName: string
  /** 发起人（未注入时 null） */
  initiator: string | null
  /** 流程变量快照（含发起表单字段） */
  variables: Record<string, unknown>
}

/**
 * 选人函数签名：**必须同步**返回用户 ID 数组（string[]）。
 * 返回 Promise 在类型上不兼容 —— 引擎同步解析链无法 await。
 */
export type AssigneeResolveFn = (ctx: AssigneeResolveContext) => string[]

const registry = new Map<string, AssigneeResolveFn>()

/** 业务系统扩展点：注册选人函数（同名重复注册覆盖后者，返回是否为覆盖）。 */
export function registerAssigneeResolver(name: string, fn: AssigneeResolveFn): boolean {
  const key = String(name ?? '').trim()
  if (key === '') {
    throw new Error('registerAssigneeResolver: 注册名不能为空')
  }
  if (typeof fn !== 'function') {
    throw new Error(`registerAssigneeResolver: "${key}" 的选人函数必须为 function`)
  }
  const overwritten = registry.has(key)
  registry.set(key, fn)
  return overwritten
}

/** 注销选人函数（测试清理/业务下线用）。 */
export function unregisterAssigneeResolver(name: string): void {
  registry.delete(String(name ?? '').trim())
}

/** 读取选人函数（未注册返回 undefined）。 */
export function getAssigneeResolver(name: string): AssigneeResolveFn | undefined {
  return registry.get(String(name ?? '').trim())
}

/** 已注册的选人函数名清单（诊断/运维接口用）。 */
export function listAssigneeResolvers(): string[] {
  return [...registry.keys()]
}

/**
 * 快照全部注册函数（EngineRuntime 构造注入用）。
 * 返回浅拷贝 —— 注册表后续变化不影响已注入的 runtime。
 */
export function snapshotAssigneeResolvers(): Record<string, AssigneeResolveFn> {
  const out: Record<string, AssigneeResolveFn> = {}
  for (const [name, fn] of registry) out[name] = fn
  return out
}

/** 清空注册表（仅测试用）。 */
export function clearAssigneeResolvers(): void {
  registry.clear()
}
