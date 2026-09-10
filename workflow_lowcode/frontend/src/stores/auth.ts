import { defineStore } from 'pinia'
import { ref } from 'vue'
import http from '@/utils/http'
import type { LoginRequest, LoginResponse, UserInfo } from '@/types/auth'
import type { MenuTree } from '@/types/menu'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserInfo | null>(null)
  const token = ref<string | null>(localStorage.getItem('access_token'))
  const menus = ref<MenuTree[]>([])
  const permissions = ref<string[]>([])

  function flattenPermissions(menuList: MenuTree[]): string[] {
    const perms: string[] = []
    function walk(items: MenuTree[]) {
      for (const item of items) {
        if (item.permission) perms.push(item.permission)
        if (item.children?.length) walk(item.children)
      }
    }
    walk(menuList)
    return perms
  }

  function hasPermission(perm: string): boolean {
    return permissions.value.includes(perm)
  }

  async function login(data: LoginRequest) {
    const res = await http.post('/auth/login', data)
    const loginRes = res.data as LoginResponse
    token.value = loginRes.accessToken
    user.value = loginRes.user
    localStorage.setItem('access_token', loginRes.accessToken)
    localStorage.setItem('refresh_token', loginRes.refreshToken)
    return loginRes
  }

  async function fetchMenus() {
    const res = await http.get('/auth/menus')
    menus.value = res.data as MenuTree[]
    permissions.value = flattenPermissions(menus.value)
  }

  async function logout() {
    try { await http.post('/auth/logout') } finally {
      token.value = null; user.value = null
      menus.value = []; permissions.value = []
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
    }
  }

  async function fetchUserInfo() {
    const res = await http.get('/auth/userinfo')
    user.value = (res.data as LoginResponse).user
  }

  return { user, token, menus, permissions, login, logout, fetchUserInfo, fetchMenus, hasPermission }
})