/**
 * 自定义选人函数注册表（业务系统扩展点）。
 *
 * 业务系统在进程内注册「选人函数」，流程节点的
 * approval.type='external' + approval.external.resolver='<注册名>' 时，
 * 引擎运行时调用该函数动态解析办理/审批人。
 *
 * 注册时可以携带**元数据**（中文名 / 描述 / 参数声明）：
 * - 中文名（displayName）会显示在设计器面板的下拉里，**全局唯一**（注册时校验）；
 * - 参数声明（params）决定面板渲染的参数配置表单，运行时把配置值作为
 *   函数第二参传入（`fn(ctx, params)`），同一函数可被不同节点以不同参数复用。
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
 * }, {
 *   displayName: '客户负责人',
 *   description: '按流程变量 crm_owner_id 解析客户负责人',
 *   params: [{ key: 'fallback', label: '兜底用户', type: 'string' }],
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

/** 选人函数参数类型（面板按类型渲染配置控件） */
export type AssigneeParamType = 'string' | 'number' | 'boolean' | 'select'

/** 选人函数参数声明（业务系统注册时声明，设计器面板按此渲染配置表单） */
export interface AssigneeParamDef {
  /** 参数键（保存进 approval.external.params；运行时 fn(ctx, params) 取同名字段） */
  key: string
  /** 参数中文名（面板显示） */
  label: string
  /** 控件类型，缺省 string */
  type?: AssigneeParamType
  /** 是否必填（面板标红星；仅前端引导，引擎不做强校验） */
  required?: boolean
  /** 输入占位提示 */
  placeholder?: string
  /** 缺省值（面板首次配置时预填） */
  defaultValue?: string | number | boolean
  /** type='select' 时的候选项 */
  options?: { label: string; value: string }[]
  /** 参数说明（面板 tooltip/灰色提示） */
  description?: string
}

/** 选人函数元数据（设计器面板展示用） */
export interface AssigneeResolverMeta {
  /** 注册名（唯一，节点配置 approval.external.resolver 引用键） */
  name: string
  /** 中文名（唯一，设计器面板下拉展示） */
  displayName: string
  /** 功能说明（面板灰色提示） */
  description?: string
  /** 参数声明（面板渲染参数配置表单） */
  params?: AssigneeParamDef[]
}

/**
 * 选人函数签名：**必须同步**返回用户 ID 数组（string[]）。
 * 返回 Promise 在类型上不兼容 —— 引擎同步解析链无法 await。
 *
 * 第二参 params 为节点配置的参数值表（approval.external.params），
 * 未配置参数时传 `{}`；同一函数可被多个节点以不同参数复用。
 */
export type AssigneeResolveFn = (
  ctx: AssigneeResolveContext,
  params: Record<string, unknown>,
) => string[];

interface RegistryEntry {
  fn: AssigneeResolveFn
  meta: AssigneeResolverMeta
}

const registry = new Map<string, RegistryEntry>()

/** 业务系统扩展点：注册选人函数。
 *
 * - name（注册名）：重复注册覆盖后者，返回是否为覆盖；
 * - meta.displayName（中文名）：缺省取 name；**全局唯一** —— 与其他注册名
 *   的中文名重复时抛错（面板靠中文名区分函数，重复会造成歧义）；
 * - meta.params：参数声明，面板据此渲染配置表单并保存进节点配置。
 */
export function registerAssigneeResolver(
  name: string,
  fn: AssigneeResolveFn,
  meta?: { displayName?: string; description?: string; params?: AssigneeParamDef[] },
): boolean {
  const key = String(name ?? '').trim()
  if (key === '') {
    throw new Error('registerAssigneeResolver: 注册名不能为空')
  }
  if (typeof fn !== 'function') {
    throw new Error(`registerAssigneeResolver: "${key}" 的选人函数必须为 function`)
  }
  const displayName = String(meta?.displayName ?? '').trim() || key
  const entry: RegistryEntry | undefined = registry.get(key)
  // 中文名唯一性：允许覆盖自己（同名重注册），不允许抢占他人的中文名
  if (entry !== undefined && entry.meta.displayName !== displayName) {
    assertDisplayNameFree(displayName, key)
  } else if (entry === undefined) {
    assertDisplayNameFree(displayName, key)
  }
  const overwritten = registry.has(key)
  registry.set(key, {
    fn,
    meta: {
      name: key,
      displayName,
      description: meta?.description === '' ? undefined : meta?.description,
      params: meta?.params,
    },
  })
  return overwritten
}

/** 中文名查重（跳过注册名 ownKey 自己的槽位）。 */
function assertDisplayNameFree(displayName: string, ownKey: string): void {
  for (const [key, entry] of registry) {
    if (key !== ownKey && entry.meta.displayName === displayName) {
      throw new Error(
        `registerAssigneeResolver: 中文名 "${displayName}" 已被选人函数 "${key}" 使用（中文名不可重复）`,
      )
    }
  }
}

/** 注销选人函数（测试清理/业务下线用）。 */
export function unregisterAssigneeResolver(name: string): void {
  registry.delete(String(name ?? '').trim())
}

/** 读取选人函数（未注册返回 undefined）。 */
export function getAssigneeResolver(name: string): AssigneeResolveFn | undefined {
  return registry.get(String(name ?? '').trim())?.fn
}

/** 读取选人函数元数据（未注册返回 undefined）。 */
export function getAssigneeResolverMeta(name: string): AssigneeResolverMeta | undefined {
  return registry.get(String(name ?? '').trim())?.meta
}

/**
 * 已注册的选人函数元数据清单（设计器面板下拉数据源 / 运维诊断用）。
 * 按注册名排序，输出稳定。
 */
export function listAssigneeResolvers(): AssigneeResolverMeta[] {
  return [...registry.values()].map((e) => e.meta).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * 快照全部注册函数（EngineRuntime 构造注入用）。
 * 返回浅拷贝 —— 注册表后续变化不影响已注入的 runtime。
 */
export function snapshotAssigneeResolvers(): Record<string, AssigneeResolveFn> {
  const out: Record<string, AssigneeResolveFn> = {}
  for (const [name, entry] of registry) out[name] = entry.fn
  return out
}

/** 清空注册表（仅测试用）。 */
export function clearAssigneeResolvers(): void {
  registry.clear()
}
