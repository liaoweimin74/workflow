/**
 * @lc/runtime-uni/http：uni.request 封装（Task 3.3 HTTP 适配层）。
 *
 * 对位 web 端 src/utils/http.ts 的拦截器语义（design D6 / PROFILES.uniapp.apiAdapter）：
 *  · 请求拦截：Bearer token（本地存储 access_token）+ X-Tenant-Id 租户头注入 + timeout；
 *  · 响应拦截：R 约定 HTTP 200 + body.code 承载状态——code!==200 拒绝并挂业务码
 *    （error.code），code===200 原样放行整个 R 包装（与 web 拦截器 return data 一致，
 *    调用方取 res.data）；
 *  · HTTP 层错误优先取 R 包装的 msg 作错误消息；401 清 token（access/refresh）并按
 *    loginPath 跳登录（不 toast，对位 web 401 分支）；
 *  · 错误自动 uni.showToast(icon:none)，call.silent 对位 web 的 X-Skip-Error-Toast。
 * web 端 GET 缓存与并发去重属性能管道，uniapp 产物页无此需求，不搬。
 */

export interface UniRequestOptions {
  /** 租户头名称（后端为 X-Tenant-Id） */
  tenantHeader: string
  /** 租户 id（缺省 default，与 web 端同口径） */
  tenantId?: string
  /** 网关基址（缺省空 = 同源相对路径） */
  baseURL?: string
  /** token 在本地存储的键名（缺省 access_token，与 web 端 localStorage 键一致） */
  tokenKey?: string
  /** 请求超时毫秒（缺省 15000，对位 web axios timeout） */
  timeout?: number
  /** 401 清 token 后跳转的登录页路由（缺省仅清 token；shell 接线真实登录页，Task 10.3） */
  loginPath?: string
}

export interface UniRequestCall {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: unknown
  header?: Record<string, string>
  /** true 时不自动 toast 错误（对位 web X-Skip-Error-Toast） */
  silent?: boolean
}

/** 后端 R 包装：HTTP 200 + body.code 承载状态（与 web 端约定一致） */
export interface R<T = unknown> {
  code: number
  msg?: string
  data: T
}

type BizError = Error & { code?: number; statusCode?: number }

const REFRESH_TOKEN_KEY = 'refresh_token'

function toastError(message: string, silent?: boolean): void {
  if (silent || !message) return
  uni.showToast({ title: message, icon: 'none' })
}

/** 构造请求器：每次调用都现读 token（登录态切换后无需重建） */
export function uniRequest(options: UniRequestOptions) {
  const {
    tenantHeader,
    tenantId = 'default',
    baseURL = '',
    tokenKey = 'access_token',
    timeout = 15000,
    loginPath,
  } = options

  return function request<T = unknown>(call: UniRequestCall): Promise<R<T>> {
    const header: Record<string, string> = { ...(call.header ?? {}) }
    const token = uni.getStorageSync(tokenKey)
    if (token) header['Authorization'] = `Bearer ${token}`
    header[tenantHeader] = tenantId
    return new Promise<R<T>>((resolve, reject) => {
      uni.request({
        url: `${baseURL}${call.url}`,
        method: call.method ?? 'GET',
        data: call.data,
        header,
        timeout,
        success: (res: { statusCode: number; data: unknown }) => {
          if (res.statusCode === 401) {
            // 对位 web 401 分支：清 token + 跳登录，不 toast
            uni.removeStorageSync(tokenKey)
            uni.removeStorageSync(REFRESH_TOKEN_KEY)
            if (loginPath) uni.reLaunch({ url: loginPath })
            const body = res.data as R<T> | undefined
            const err = new Error(body?.msg || '登录已过期') as BizError
            err.statusCode = 401
            reject(err)
            return
          }
          const body = res.data as R<T> | undefined
          const bizMsg = body && typeof body === 'object' ? body.msg : undefined
          if (res.statusCode < 200 || res.statusCode >= 300) {
            // HTTP 层错误：优先取 R 包装业务消息（对位 web 拦截器 error 分支）
            const message = bizMsg || `请求失败 ${res.statusCode}`
            toastError(message, call.silent)
            const err = new Error(message) as BizError
            err.statusCode = res.statusCode
            reject(err)
            return
          }
          // R 约定：HTTP 200 + body.code 承载状态（调用方需要区分 404/403/409 取 error.code）
          if (!body || typeof body !== 'object' || body.code !== 200) {
            const message = bizMsg || '请求失败'
            toastError(message, call.silent)
            const err = new Error(message) as BizError
            err.code = body && typeof body === 'object' ? body.code : undefined
            reject(err)
            return
          }
          resolve(body)
        },
        fail: (err: { errMsg?: string } | undefined) => {
          const message = err?.errMsg || '网络错误'
          toastError(message, call.silent)
          reject(new Error(message))
        },
      })
    })
  }
}
