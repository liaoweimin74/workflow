/**
 * 平台物料 SDK 类型声明（宿主运行时提供实现，构建时 external，不打进物料包）。
 *
 * 版本协商：material.json 的 sdkVersion 主版本必须与宿主一致，否则宿主拒绝加载。
 */
declare module '@platform/sdk' {
  /** 带 Authorization/X-Tenant-Id 的 axios 实例等价物（baseURL=/api）。 */
  export const http: {
    get<T = any>(url: string, config?: { params?: Record<string, any> }): Promise<{ data: T }>
    post<T = any>(url: string, body?: any, config?: any): Promise<{ data: T }>
    put<T = any>(url: string, body?: any, config?: any): Promise<{ data: T }>
    delete<T = any>(url: string, config?: any): Promise<{ data: T }>
  }

  export interface MaterialUser {
    username: string
    name?: string
    roles: string[]
    permissions: string[]
  }

  export const auth: {
    /** 当前登录用户，未登录返回 null。 */
    currentUser(): MaterialUser | null
    /** 是否持有指定权限（管理员角色恒为 true）。 */
    hasPermission(permission: string): boolean
  }

  export const navigate: {
    /** 站内路由跳转（应用前缀由宿主处理）。 */
    to(path: string, query?: Record<string, any>): void
    back(): void
  }
}
