import http from '@/utils/http'
import router from '@/router'
import type { LocationQueryRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/**
 * 平台物料 SDK（change: remote-materials）。
 *
 * 宿主与物料之间的长期契约：物料通过 import map 拿到本模块（裸名 '@platform/sdk'），
 * 不自行打包 axios/pinia/router。破坏性变更必须升 HOST_SDK_VERSION 主版本。
 */
export const HOST_SDK_VERSION = '1'

export interface MaterialUser {
  username: string
  name?: string
  roles: string[]
  permissions: string[]
}

/** 复用宿主 axios 实例：baseURL=/api、自动带 Authorization、统一错误提示与 401 跳登录。 */
export { http }

export const auth = {
  /** 当前登录用户；未登录返回 null。 */
  currentUser(): MaterialUser | null {
    const store = useAuthStore()
    const user = store.user
    if (!user) return null
    return {
      username: user.username,
      name: user.nickname,
      roles: user.roles ?? [],
      permissions: store.permissions ?? user.permissions ?? []
    }
  },
  /** 是否持有指定权限（管理员角色由 store 侧判定）。 */
  hasPermission(permission: string): boolean {
    return useAuthStore().hasPermission(permission)
  }
}

export const navigate = {
  /** 站内跳转（vite base 前缀由 router 处理）。 */
  to(path: string, query?: Record<string, unknown>) {
    void router.push({ path, query: query as LocationQueryRaw | undefined })
  },
  back() {
    router.back()
  }
}
