import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/LoginPage.vue'),
    meta: { title: '登录' }
  },
  {
    path: '/designer',
    name: 'ProcessDesigner',
    component: () => import('@/views/designer/ProcessDesigner.vue'),
    meta: { title: '流程设计器', fullScreen: true }
  },
  {
    path: '/category',
    name: 'CategoryManagement',
    component: () => import('@/views/category/CategoryPage.vue'),
    meta: { title: '流程分类' }
  },
  {
    path: '/process',
    name: 'ProcessList',
    component: () => import('@/views/process/ProcessListPage.vue'),
    meta: { title: '流程定义' }
  },
  {
    path: '/',
    component: () => import('@/layouts/AdminLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/DashboardPage.vue'),
        meta: { title: '首页' }
      },
      {
        path: 'system/user',
        name: 'UserManagement',
        component: () => import('@/views/system/user/UserPage.vue'),
        meta: { title: '用户管理' }
      },
      {
        path: 'system/role',
        name: 'RoleManagement',
        component: () => import('@/views/system/role/RolePage.vue'),
        meta: { title: '角色管理' }
      },
      {
        path: 'system/menu',
        name: 'MenuManagement',
        component: () => import('@/views/system/menu/MenuPage.vue'),
        meta: { title: '菜单管理' }
      },
      {
        path: 'system/org',
        name: 'OrgManagement',
        component: () => import('@/views/system/org/OrgPage.vue'),
        meta: { title: '组织机构管理' }
      },
      {
        path: 'system/dict',
        name: 'DictManagement',
        component: () => import('@/views/system/dict/DictPage.vue'),
        meta: { title: '数据字典管理' }
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/profile/ProfilePage.vue'),
        meta: { title: '个人中心' }
      },
      {
        path: '404',
        name: 'NotFound',
        component: () => import('@/views/error/NotFoundPage.vue'),
        meta: { title: '404' }
      },
      {
        path: '/:pathMatch(.*)*',
        redirect: '/404'
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to, _from, next) => {
  const token = localStorage.getItem('access_token')
  if (to.name !== 'Login' && !token) {
    next({ name: 'Login' })
    return
  }
  if (token) {
    const authStore = useAuthStore()
    if (!authStore.user) {
      try {
        await authStore.fetchUserInfo()
        await authStore.fetchMenus()
      } catch {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        if (to.name !== 'Login') {
          next({ name: 'Login' })
          return
        }
      }
    }
  }
  next()
})

export default router