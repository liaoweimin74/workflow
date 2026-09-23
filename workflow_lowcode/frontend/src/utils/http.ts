import axios from 'axios'
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'

declare module 'axios' {
  export interface AxiosRequestConfig<D = any> {
    /** GET 短 TTL 响应缓存开关：仅显式声明 true 时读写缓存 */
    cache?: boolean
    /** 缓存 TTL（毫秒），缺省 30s；仅 cache:true 时生效 */
    cacheTtl?: number
  }
}

/** GET 缓存缺省 TTL（毫秒） */
const DEFAULT_CACHE_TTL = 30_000

/** 查询参数序列化：数组重复键、跳过 undefined/null、encodeURIComponent（与 axios paramsSerializer 一致） */
function serializeParams(params: Record<string, unknown> | undefined): string {
  if (!params) return ''
  const parts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`)
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    }
  }
  return parts.join('&')
}

const http: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 15000,
  paramsSerializer: {
    serialize: (params: Record<string, unknown>) => serializeParams(params),
  },
})

http.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    // 多租户：当前为单租户模式，使用固定租户 ID
    config.headers['X-Tenant-Id'] = 'default'
    return config
  },
  (error) => Promise.reject(error)
)

http.interceptors.response.use(
  (response: AxiosResponse) => {
    const data = response.data
    if (data.code !== 200) {
      if (!response.config.headers?.['X-Skip-Error-Toast']) {
        ElMessage.error(data.msg || '请求失败')
      }
      return Promise.reject(new Error(data.msg))
    }
    return data
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      window.location.href = '/login'
    } else if (!error.config?.headers?.['X-Skip-Error-Toast']) {
      // 优先取后端 R 包装返回的业务错误消息
      const bizMsg = error.response?.data?.msg
      ElMessage.error(bizMsg || error.message || '网络错误')
    }
    return Promise.reject(error)
  }
)

// ==================== GET 并发去重与短 TTL 缓存 ====================

/** in-flight 去重键 = 方法 + url + 序列化 params（与 paramsSerializer 输出一致） */
function getCacheKey(url: string, params: Record<string, unknown> | undefined): string {
  return `GET ${url}?${serializeParams(params)}`
}

interface CacheEntry {
  data: unknown
  expiresAt: number
}

/** 并发同键 GET 共享的进行中请求 */
const inFlightGets = new Map<string, Promise<unknown>>()
/** cache:true GET 的短 TTL 内存缓存（刷新即失效） */
const responseCache = new Map<string, CacheEntry>()

type GetFn = typeof http.get
const rawGet: GetFn = http.get.bind(http)

http.get = <T = unknown, R = T, D = unknown>(
  url: string,
  config?: import('axios').AxiosRequestConfig<D>
): Promise<R> => {
  const key = getCacheKey(url, config?.params)
  if (config?.cache) {
    const cached = responseCache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.data as R)
    }
  }
  const existing = inFlightGets.get(key)
  if (existing) {
    return existing as Promise<R>
  }
  const request = rawGet<T, R, D>(url, config)
    .then((data: R) => {
      if (config?.cache) {
        responseCache.set(key, { data, expiresAt: Date.now() + (config.cacheTtl ?? DEFAULT_CACHE_TTL) })
      }
      return data
    })
    .finally(() => {
      inFlightGets.delete(key)
    })
  inFlightGets.set(key, request)
  return request
}

export default http