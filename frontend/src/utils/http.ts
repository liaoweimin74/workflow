import axios from 'axios'
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'

const http: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 15000,
  paramsSerializer: {
    serialize: (params: Record<string, unknown>) => {
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
    },
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

export default http