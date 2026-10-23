/**
 * @lc/runtime-uni/http：uni.request 封装（Task 3.2 骨架）。
 *
 * 口径来自 PROFILES.uniapp.apiAdapter（target-profile，Task 2.3）：
 * 请求器 uni.request + Bearer token（本地存储）+ 租户头。emit 产物与后续
 * uni-shell 的取数都经此处发出，token/租户口径与 web 端 http.ts 同语义。
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
}

export interface UniRequestCall {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: unknown
  header?: Record<string, string>
}

/** 构造请求器：每次调用都现读 token（登录态切换后无需重建） */
export function uniRequest(options: UniRequestOptions) {
  const { tenantHeader, tenantId = 'default', baseURL = '', tokenKey = 'access_token' } = options
  return function request<T = unknown>(call: UniRequestCall): Promise<T> {
    const header: Record<string, string> = { ...(call.header ?? {}) }
    const token = uni.getStorageSync(tokenKey)
    if (token) header['Authorization'] = `Bearer ${token}`
    header[tenantHeader] = tenantId
    return new Promise<T>((resolve, reject) => {
      uni.request({
        url: `${baseURL}${call.url}`,
        method: call.method ?? 'GET',
        data: call.data,
        header,
        success: (res: { statusCode: number; data: unknown }) => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data as T)
          else reject(new Error(`请求失败 ${res.statusCode}`))
        },
        fail: (err: unknown) => reject(err),
      })
    })
  }
}
