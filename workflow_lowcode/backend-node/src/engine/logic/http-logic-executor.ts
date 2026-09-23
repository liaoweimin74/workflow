import { Injectable } from '@nestjs/common'
import { BusinessException } from '../../common/exception/business-exception'

/** 参数映射（对齐 Java `com.workflow.engine.logic.parse.ParamMapping`）。 */
export interface ParamMapping {
  /** 变量名（从 `vars` 里取值）。 */
  source: string
  /** 落地到 query key 或 body 字段名。 */
  target: string
}

/** `{{ name }}` 占位符（对齐 Java `VariableResolver.PLACEHOLDER_PATTERN`）。 */
const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g

/** 重试间隔（对齐 Java `Thread.sleep(200)`）。 */
const RETRY_DELAY_MS = 200

/**
 * 出站 HTTP 执行器（对齐 Java `HttpLogicExecutor`，141 行）。
 *
 * 用途：`explore-api` 探测、API 数据源的 `apiGet/apiCreate/apiUpdate/apiDelete`、
 * 逻辑节点的出站调用。返回的是**响应体字符串**（Java 是 `RestClient...body(String.class)`，
 * 交给调用方自己解析）。
 *
 * ## 三处必须逐字对齐 Java 的地方
 * 1. **URL 变量**：`{{ name }}`（允许空格）→ `vars[name]`，取不到就给**空串**（不是报错）；
 * 2. **非 2xx 一律抛错**（Spring `RestClient.retrieve()` 的默认行为），消息格式是
 *    `<状态码> <原因短语>: "<响应体>"` —— 实测 Java 为
 *    `401 Unauthorized: "{"code":401,...}"`（**内层引号不转义**，是 Spring 的 `quote()` 行为）；
 * 3. **只对网络类异常重试**（Java 的 `ResourceAccessException`：连接失败 / 读超时），
 *    重试次数 = `1 + retryCount`，每次间隔 200ms，全部失败后抛
 *    `HTTP request failed after N attempts`（N 是尝试次数）。
 *
 * ## ⚠️ 未覆盖的部分（留痕）
 * Java 的 `connectTimeoutMs` 与 `readTimeoutMs` 是两个独立超时（JDK HttpClient 的连接超时 +
 * 请求工厂的读超时），而 Node 的 `fetch` 只有 `signal` 一个超时 —— 这里用 `readTimeoutMs`
 * （`explore-api` 传的是 10000/10000，两者相同，行为一致）。**连接超时单独设置时会分叉**，
 * 记入规格 §9（U30）。
 */
@Injectable()
export class HttpLogicExecutor {
  /**
   * 执行一次出站调用。
   *
   * @param url             目标地址（可含 `{{ var }}`）
   * @param method          HTTP 方法（大小写不敏感；空/非法由 fetch 抛错）
   * @param headers         请求头（值也支持 `{{ var }}`）
   * @param query          query 参数映射
   * @param body           body 参数映射（非空时才带 body，且 content-type 固定 application/json）
   * @param vars           变量表
   * @param readTimeoutMs  读超时（> 0 才生效）
   * @param retryCount     额外重试次数
   */
  async execute(
    url: string,
    method: string,
    headers: Record<string, string>,
    query: ParamMapping[],
    body: ParamMapping[],
    vars: Record<string, unknown>,
    connectTimeoutMs: number,
    readTimeoutMs: number,
    retryCount: number,
  ): Promise<string> {
    const attempts = 1 + Math.max(0, retryCount)
    let lastError: unknown

    for (let i = 0; i < attempts; i++) {
      try {
        return await this.doExecute(url, method, headers, query, body, vars, connectTimeoutMs, readTimeoutMs)
      } catch (error) {
        // 只对「网络类」异常重试：HTTP 4xx/5xx 与非法 URL 都是确定性结果，不该重试
        if (!isNetworkError(error)) throw error
        lastError = error
        if (i < attempts - 1) await sleep(RETRY_DELAY_MS)
      }
    }
    throw new Error(`HTTP request failed after ${attempts} attempts`, { cause: lastError })
  }

  private async doExecute(
    url: string,
    method: string,
    headers: Record<string, string>,
    query: ParamMapping[],
    body: ParamMapping[],
    vars: Record<string, unknown>,
    connectTimeoutMs: number,
    readTimeoutMs: number,
  ): Promise<string> {
    const resolvedUrl = resolveVars(url, vars)
    const queryString = buildQueryString(query, vars)
    const fullUrl =
      queryString === ''
        ? resolvedUrl
        : `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}${queryString}`

    const requestHeaders: Record<string, string> = {}
    for (const [key, value] of Object.entries(headers)) {
      requestHeaders[key] = resolveVars(value, vars)
    }

    const init: RequestInit = { method: method.toUpperCase(), headers: requestHeaders }
    if (body.length > 0) {
      requestHeaders['content-type'] = 'application/json'
      init.body = buildJsonBody(body, vars)
    }

    const timeoutMs = readTimeoutMs > 0 ? readTimeoutMs : connectTimeoutMs
    if (timeoutMs > 0) init.signal = AbortSignal.timeout(timeoutMs)

    const response = await fetch(fullUrl, init)
    const text = await response.text()
    if (!response.ok) {
      // ⚠️ 消息格式逐字对齐 Spring：`<code> <reason>: "<body>"`，响应体两侧加引号
      //    且**不转义内部引号**（实测 `401 Unauthorized: "{"code":401,...}"`）。
      throw new Error(
        `${response.status} ${response.statusText === '' ? reasonPhrase(response.status) : response.statusText}: "${text}"`,
      )
    }
    return text
  }
}

/** `{{ name }}` → `vars[name]`（取不到 → 空串），对齐 Java `VariableResolver.resolve`。 */
export function resolveVars(text: string, vars: Record<string, unknown>): string {
  return text.replace(PLACEHOLDER, (_match, name: string) => {
    const value = vars[name]
    return value === null || value === undefined ? '' : String(value)
  })
}

/** 对齐 Java `buildQueryString`：`encode(target)=encode(value)`，用 `&` 连接。 */
function buildQueryString(query: ParamMapping[], vars: Record<string, unknown>): string {
  return query
    .map(
      (mapping) =>
        `${javaUrlEncode(mapping.target)}=${javaUrlEncode(String(sourceValue(mapping, vars)))}`,
    )
    .join('&')
}

/** 对齐 Java `buildJsonBody`：target → 值，保持插入顺序。 */
function buildJsonBody(body: ParamMapping[], vars: Record<string, unknown>): string {
  const out: Record<string, unknown> = {}
  for (const mapping of body) out[mapping.target] = sourceValue(mapping, vars)
  return JSON.stringify(out)
}

/** 对齐 Java `resolveSource`：取不到 → 空串。 */
function sourceValue(mapping: ParamMapping, vars: Record<string, unknown>): unknown {
  const value = vars[mapping.source]
  return value === null || value === undefined ? '' : value
}

/**
 * 对齐 Java `URLEncoder.encode(s, UTF_8)`。
 *
 * ⚠️ **不能直接用 `encodeURIComponent`**：两者对空格与几个标点的处理不同 ——
 *    Java 把空格编成 `+`，并保留 `-_.*`；`encodeURIComponent` 编成 `%20` 且不编 `!'()*`。
 *    query 参数一旦带空格就会分叉（`explore-api` 不传 query 映射，golden 覆盖不到，
 *    但 API 数据源的调用会用到）。
 */
export function javaUrlEncode(text: string): string {
  let out = ''
  for (const char of text) {
    if (/[A-Za-z0-9\-_.*]/.test(char)) {
      out += char
    } else if (char === ' ') {
      out += '+'
    } else {
      const bytes = Buffer.from(char, 'utf8')
      for (const byte of bytes) out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
    }
  }
  return out
}

/** 网络类异常（对应 Java 的 `ResourceAccessException`）：连接失败 / 超时。 */
function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  // fetch 在网络失败时抛 TypeError；超时抛 DOMException(name=TimeoutError/AbortError)
  return (
    error.name === 'TypeError' ||
    error.name === 'TimeoutError' ||
    error.name === 'AbortError' ||
    error instanceof TypeError
  )
}

/** HTTP 原因短语（Node 的 fetch 在部分服务端不返回 statusText 时兜底）。 */
function reasonPhrase(status: number): string {
  const phrases: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    500: 'Internal Server Error',
  }
  return phrases[status] ?? ''
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 供调用方判断「响应体不是 JSON」时抛的统一错误（对齐 Java 的 `接口返回解析失败`）。 */
export function parseFailure(message: string): BusinessException {
  return new BusinessException(400, `接口返回解析失败: ${message}`)
}
