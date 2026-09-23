import type { ParamMapping } from './http-logic-executor'

/**
 * 节点级「后端逻辑」配置（对齐 Java `BackendLogicItemConfig` 及其三个子配置类）。
 *
 * 存在位置：`wf_node_config.config_json.backendLogic[]`，而 `wf_node_config` 里既有
 * 「编辑态」行（`process_definition_id IS NULL`）也有「部署快照」行。**运行时只认快照行** ——
 * 这正是 Java `ProcessConfigResolver.resolve(processDefinitionId)` 的语义
 * （配置随部署版本冻结，部署后改配置不影响已发起的实例）。
 */

/** HTTP 子配置（对齐 Java `BackendLogicHttpConfig`；三个超时字段有字段初始化器默认值）。 */
export interface BackendLogicHttpConfig {
  url: string | null
  method: string | null
  headers: Record<string, string>
  queryParams: ParamMapping[]
  bodyParams: ParamMapping[]
  /** 默认 3000（Java 字段初始化器）。 */
  connTimeoutMs: number
  /** 默认 5000。 */
  readTimeoutMs: number
  /** 默认 0。 */
  retryCount: number
}

/** Bean 子配置（对齐 Java `BackendLogicBeanConfig`）。Node 无 Spring 容器，只解析不执行。 */
export interface BackendLogicBeanConfig {
  beanName: string | null
  methodName: string | null
  params: ParamMapping[]
}

/** 脚本子配置（对齐 Java `BackendLogicScriptConfig`）。Node 无 Groovy，只解析不执行。 */
export interface BackendLogicScriptConfig {
  language: string | null
  source: string | null
}

/** 一条后端逻辑（对齐 Java `BackendLogicItemConfig`）。 */
export interface BackendLogicItemConfig {
  id: string | null
  name: string | null
  /** ⚠️ Java 侧是 `boolean` 基本类型 ⇒ **配置里没写 `enabled` 时是 `false`**（默认不执行）。 */
  enabled: boolean
  /** 触发时机：`ENTER` | `COMPLETE`（比较时大小写不敏感）。 */
  trigger: string | null
  /** 逻辑类型：`http` | `bean` | `script`。 */
  type: string | null
  /** 异常策略：`IGNORE_CONTINUE` | `FAIL_FLOW`（见 executor 的说明：两者可观测行为相同）。 */
  errorAction: string | null
  /** 结果写回的流程变量名（可选；空白则不写）。 */
  resultVar: string | null
  http: BackendLogicHttpConfig | null
  bean: BackendLogicBeanConfig | null
  script: BackendLogicScriptConfig | null
}

/**
 * 解析 `config_json` 里的 `backendLogic[]`（对齐 Java `ProcessConfigResolver.parseBackendLogic`）。
 *
 * 三个必须照抄的语义：
 *   1. `configJson` 为空、不是对象、`backendLogic` 不是数组或是**空数组** → 返回 `[]`（该节点无逻辑）；
 *   2. **解析异常不抛错**（Java 只 `log.warn` 后返回 null ⇒ 等同于「该节点没有逻辑」）
 *      —— 一条坏配置不能让整个流程引擎事件炸掉；
 *   3. 布尔字段只认 JSON `true`（Java 的 `boolean` 基本类型：`"true"` 字符串不算），
 *      数值字段只在是数字时取用，否则回落字段初始化器默认值。
 */
export function parseBackendLogicItems(configJson: string | null | undefined): BackendLogicItemConfig[] {
  if (configJson === null || configJson === undefined || configJson.trim() === '') return []
  let root: unknown
  try {
    root = JSON.parse(configJson)
  } catch {
    return []
  }
  if (root === null || typeof root !== 'object' || Array.isArray(root)) return []
  const array = (root as Record<string, unknown>).backendLogic
  if (!Array.isArray(array) || array.length === 0) return []

  const items: BackendLogicItemConfig[] = []
  for (const raw of array) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue
    const record = raw as Record<string, unknown>
    items.push({
      id: text(record.id),
      name: text(record.name),
      enabled: record.enabled === true,
      trigger: text(record.trigger),
      type: text(record.type),
      errorAction: text(record.errorAction),
      resultVar: text(record.resultVar),
      http: parseHttp(record.http),
      bean: parseBean(record.bean),
      script: parseScript(record.script),
    })
  }
  return items
}

function parseHttp(node: unknown): BackendLogicHttpConfig | null {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return null
  const record = node as Record<string, unknown>
  return {
    url: text(record.url),
    method: text(record.method),
    headers: parseHeaders(record.headers),
    queryParams: parseMappings(record.queryParams),
    bodyParams: parseMappings(record.bodyParams),
    connTimeoutMs: intOrDefault(record.connTimeoutMs, 3000),
    readTimeoutMs: intOrDefault(record.readTimeoutMs, 5000),
    retryCount: intOrDefault(record.retryCount, 0),
  }
}

function parseBean(node: unknown): BackendLogicBeanConfig | null {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return null
  const record = node as Record<string, unknown>
  return {
    beanName: text(record.beanName),
    methodName: text(record.methodName),
    params: parseMappings(record.params),
  }
}

function parseScript(node: unknown): BackendLogicScriptConfig | null {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return null
  const record = node as Record<string, unknown>
  return { language: text(record.language), source: text(record.source) }
}

function parseHeaders(node: unknown): Record<string, string> {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    out[key] = text(value) ?? ''
  }
  return out
}

/** `ParamMapping[]`（`{source, target}`）—— 非对象项跳过，字段缺失取空串（Java 侧是 null）。 */
function parseMappings(node: unknown): ParamMapping[] {
  if (!Array.isArray(node)) return []
  const out: ParamMapping[] = []
  for (const raw of node) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue
    const record = raw as Record<string, unknown>
    out.push({ source: text(record.source) ?? '', target: text(record.target) ?? '' })
  }
  return out
}

/** Java 的 `String` 字段：缺失/非文本 → null（`asText()` 对对象返回空串，这里简化成 null）。 */
function text(node: unknown): string | null {
  if (node === null || node === undefined) return null
  if (typeof node === 'string') return node
  if (typeof node === 'number' || typeof node === 'boolean') return String(node)
  return null
}

function intOrDefault(node: unknown, fallback: number): number {
  return typeof node === 'number' && Number.isFinite(node) ? Math.trunc(node) : fallback
}
