/**
 * 契约场景模型。
 *
 * 单步的「固定请求」不足以覆盖 P1 的有状态流程（建草稿 → 部署 → 发起 → 审批），
 * 因此把契约样本组织成**场景**：一个场景是若干有序步骤，后续步骤可以引用前面步骤
 * 响应里的值（如把上一步返回的草稿 id 填进下一步的 URL）。
 *
 * 录制与比对都执行同一批场景：
 *   - 录制：对 Java 后端跑一遍，把每步的 (状态码, 响应形状) 落盘
 *   - 比对：对 Node 后端跑**同一批场景**，用 Node 自己的返回值做替换，逐字段比对
 *
 * 这一点很关键：不能拿 Java 录到的具体 id 去回放 Node —— 两个后端的 id 不同。
 * 必须让两边各自跑完整流程，再比形状。
 */

/** 一个场景步骤。path / query / body 里都可以写 `{{stepId.json.path}}` 占位。 */
export interface ScenarioStep {
  /** 步骤标识，供后续步骤引用其响应。同一场景内唯一。 */
  id: string
  httpMethod: string
  /** 端点模板（含 {var}），用于与 endpoints.generated.json 校验，保证场景没写错路径。 */
  fullPath: string
  /** 实际请求路径，可含 `{{...}}` 占位。 */
  path: string
  query?: Record<string, string>
  /** 额外请求头。 */
  headers?: Record<string, string>
  /** 便捷字段：等价于 headers['X-Tenant-Id']。引擎端点几乎都需要它。 */
  tenant?: string
  /** 请求体，可含 `{{...}}` 占位（会深度替换）。 */
  body?: unknown
  auth?: 'admin' | 'none'
  /**
   * **本步骤专属**的「仅比形状、不比取值」路径覆盖（写法同 `compare.ts` 的匹配规则：
   * `$.a.b` 精确匹配、`.b` 后缀匹配）。
   *
   * 【为什么需要】`SHAPE_ONLY_PATHS` 是全局的，而 `$.data` 这种路径一旦写进全局列表，
   * 会同时废掉**所有**端点的比对。可有些放宽只对某一个端点成立 ——
   * 例如 `/deployed-processes/{id}/xml` 返回的是 Flowable 重新序列化过的 XML
   * （`standalone="no"` + 重新缩进），自研引擎无法逐字节复现。
   * 把放宽附着在具体步骤上，它就在 scenario 文件里**可见、可评审、可追溯**，
   * 而不是藏在一个全局常量里。
   *
   * 【纪律】每加一条都必须写明理由。不允许「为了让契约变绿」而放宽 ——
   * 那是让契约网无声腐烂，比不加更糟。
   */
  shapeOnly?: string[]
  /**
   * **本步骤专属**的「顺序不是契约」路径覆盖（写法同 `shapeOnly`）。
   *
   * 【为什么需要】`UNORDERED_ARRAY_PATHS` 是全局的，而 `$.data` 这种路径一旦写进去，
   * 会让**所有**端点的 `$.data` 数组都按排序后比对 —— 那会废掉
   * `dpVersions`（依赖 version 倒序）、`catList`（依赖 sortOrder 升序）这类
   * **顺序本身就是契约**的断言。
   *
   * 但确实存在顺序真的不确定的端点：Java 的派生查询
   * `findByTenantIdAndProcessInstance(tenantId, pi)` **没有 ORDER BY**，
   * 返回顺序由 MySQL 决定（实测是主键序，而主键是随机 32 位 hex）
   * —— 拿它去比对两侧必然随机失败。
   * 把它声明在**具体步骤**上，既解决了问题，又不会波及别处。
   */
  unorderedArrays?: string[]
}

export interface Scenario {
  name: string
  steps: ScenarioStep[]
}

/** 一步的请求（模板形式，供回放时用 Node 自己的值重新填充）。 */
export interface RecordedRequest {
  path: string
  query: Record<string, string>
  headers: Record<string, string>
  body: unknown
  auth: string
}

export interface RecordedStep {
  id: string
  endpoint: { httpMethod: string; fullPath: string }
  /** 含 `{{...}}` 占位的请求模板 —— 比对时用它回放。 */
  requestTemplate: RecordedRequest
  /** 录制时实际发出的路径（诊断用，含真实 id）。 */
  resolvedPath: string
  /** 本步骤的 shape-only 覆盖（从场景定义原样带过来；缺省表示只用全局规则）。 */
  shapeOnly?: string[]
  /** 本步骤的「顺序不是契约」覆盖（从场景定义原样带过来）。 */
  unorderedArrays?: string[]
  response: { status: number; headers: Record<string, string>; body: unknown }
}

export interface RecordedScenario {
  scenario: string
  recordedAt: string
  steps: RecordedStep[]
}

/** 场景变量表：stepId → 该步的响应体（整体）。 */
export type ScenarioVars = Map<string, unknown>

/**
 * 生成一次运行的随机后缀。
 *
 * 为什么需要：契约场景会创建流程定义，而 `version` 对同一个 processKey 是**递增**的。
 * 若录制与比对用同一个 key，两侧拿到的 version 会不同（Java 跑出了 v1，Node 跑就成了 v2），
 * 值是契约的一部分又不好忽略。因此让 key 每次运行唯一 → 两侧 version 都恒为 1。
 *
 * 生成的值会同时交给规范化器，在响应里替换成 `<RUN>` 占位符，
 * 这样响应中回显的 key 也不会造成假差异。
 */
export function createRunId(): string {
  return Math.random().toString(36).slice(2, 8)
}

/** 内置变量的前缀，与步骤 id 区分开。 */
const BUILTIN_PREFIX = '$'

/** 按点路径取值：`a.b[0].c` → obj.a.b[0].c；任一层缺失返回 undefined。 */
export function getByPath(root: unknown, path: string): unknown {
  if (path === '') return root
  const segments = path.split('.')
  let current: unknown = root
  for (const rawSegment of segments) {
    if (current === null || current === undefined) return undefined
    // 支持 `list[0]` 形式
    const m = /^([^[\]]*)((?:\[\d+\])*)$/.exec(rawSegment)
    if (m === null) return undefined
    const [, name, indexes] = m
    if (name !== '') {
      if (typeof current !== 'object') return undefined
      current = (current as Record<string, unknown>)[name]
    }
    if (indexes !== '') {
      for (const idx of indexes.matchAll(/\[(\d+)\]/g)) {
        if (!Array.isArray(current)) return undefined
        current = current[Number(idx[1])]
      }
    }
  }
  return current
}

const PLACEHOLDER = /\{\{([^}]+)\}\}/g

/**
 * 替换字符串里的 `{{stepId.json.path}}` 或 `{{$runId}}`。
 * 若整个字符串恰好就是一个占位符，则返回**原始类型**（数字/对象保持原样，不转成字符串）。
 *
 * ⚠️ 取不到值（路径不存在）时**抛错**，而不是替换成空串。
 *    实测踩到过：把 `{{pageList2.data.content[0].id}}` 写成 `{{pageList2.content[0].id}}`
 *    （漏了 `data.`），静默替换成空串后请求路径变成 `/api/v1/pages/`，
 *    Java 侧返回 500 —— 于是整整录了一轮全是 500 的垃圾 golden，
 *    排查时还以为是后端的问题。契约场景里「空值」几乎永远是笔误，不是意图。
 *
 *    只有 `null` 仍然替换成空串：那是**存在的**字段值为空（如某字段为 null），
 *    属于合法情形。
 */
export function resolveTemplate(template: string, vars: ScenarioVars, runId = ''): unknown {
  const whole = /^\{\{([^}]+)\}\}$/.exec(template)
  if (whole !== null) {
    return lookupVar(whole[1], vars, runId)
  }
  return template.replace(PLACEHOLDER, (_, expr: string) => {
    const value = lookupVar(expr.trim(), vars, runId)
    return value === null ? '' : String(value)
  })
}

function lookupVar(expr: string, vars: ScenarioVars, runId: string): unknown {
  const dot = expr.indexOf('.')
  const stepId = dot === -1 ? expr : expr.slice(0, dot)
  const rest = dot === -1 ? '' : expr.slice(dot + 1)

  if (stepId.startsWith(BUILTIN_PREFIX)) {
    if (stepId !== '$runId') {
      throw new Error(`未知的内置变量 "${stepId}"（目前仅支持 $runId）`)
    }
    if (runId === '') {
      throw new Error('模板用到了 {{$runId}}，但调用方没有传入 runId')
    }
    return required(expr, getByPath(runId, rest))
  }

  const root = vars.get(stepId)
  if (root === undefined) {
    throw new Error(`场景变量 ${expr} 引用了未知或尚未执行的步骤 "${stepId}"`)
  }
  return required(expr, getByPath(root, rest))
}

/** 路径取不到值时抛错（见 resolveTemplate 的说明）。 */
function required(expr: string, value: unknown): unknown {
  if (value === undefined) {
    throw new Error(
      `场景变量 {{${expr}}} 取不到值：该路径在上一步的响应里不存在。` +
        `常见原因是漏写了 data. 前缀（响应形状是 {code,msg,data}）。`,
    )
  }
  return value
}

/** 深度替换对象/数组/字符串里的占位符。 */
export function resolveDeep(value: unknown, vars: ScenarioVars, runId = ''): unknown {
  if (typeof value === 'string') return resolveTemplate(value, vars, runId)
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, vars, runId))
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveDeep(v, vars, runId)
    }
    return out
  }
  return value
}

/** 某一步的请求头（合并 tenant 便捷字段）。 */
export function stepHeaders(step: ScenarioStep): Record<string, string> {
  const headers: Record<string, string> = { ...(step.headers ?? {}) }
  if (step.tenant !== undefined) headers['X-Tenant-Id'] = step.tenant
  return headers
}

/** 把场景名转成安全的文件名。 */
export function scenarioFileName(index: number, name: string): string {
  const safe = name.replace(/[^\w\u4e00-\u9fa5]+/g, '_').replace(/^_|_$/g, '')
  return `${String(index + 1).padStart(2, '0')}__${safe}.json`
}
