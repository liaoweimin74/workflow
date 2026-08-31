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
    path: '/form/designer',
    name: 'FormDesigner',
    component: () => import('@/views/form/FormDesigner.vue'),
    meta: { title: '表单设计器', fullScreen: true }
  },
  {
    path: '/page/designer',
    name: 'PageDesigner',
    component: () => import('@/views/page/PageDesignerRouter.vue'),
    meta: { title: '页面设计器', fullScreen: true }
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
        path: 'process/definition',
        name: 'ProcessDefinition',
        component: () => import('@/views/process/ProcessListPage.vue'),
        meta: { title: '流程定义' }
      },
      {
        path: 'process/center',
        name: 'ProcessCenter',
        component: () => import('@/views/process/ProcessCenterPage.vue'),
        meta: { title: '流程中心' }
      },
      {
        path: 'process/todo',
        name: 'ProcessTodo',
        component: () => import('@/views/process/ProcessTodoPage.vue'),
        meta: { title: '待办处理' }
      },
      {
        path: 'process/todo/done/:taskId',
        name: 'TaskDoneDetail',
        component: () => import('@/views/process/TaskDoneDetailPage.vue'),
        meta: { title: '已办详情' }
      },
      {
        path: 'process/todo/:taskId',
        name: 'TaskDetail',
        component: () => import('@/views/process/TaskDetailPage.vue'),
        meta: { title: '任务处理' }
      },
      {
        path: 'process/instance/:instanceId',
        name: 'ProcessInstanceTrack',
        component: () => import('@/views/process/ProcessInstanceTrackPage.vue'),
        meta: { title: '流程跟踪' }
      },
      {
        path: 'process/start/:processDefinitionId',
        name: 'ProcessStart',
        component: () => import('@/views/process/ProcessStartPage.vue'),
        meta: { title: '发起流程' }
      },
      {
        path: 'form',
        name: 'FormList',
        component: () => import('@/views/form/FormListPage.vue'),
        meta: { title: '表单管理' }
      },
      {
        path: 'biz-data/:formKey',
        name: 'BizDataList',
        component: () => import('@/views/form/BizDataListPage.vue'),
        meta: { title: '业务数据管理' }
      },
      {
        path: 'page',
        name: 'PageList',
        component: () => import('@/views/page/PageListPage.vue'),
        meta: { title: '页面管理' }
      },
      {
        path: 'page/:pageKey',
        name: 'PageRenderer',
        component: () => import('@/views/page/PageRenderer.vue'),
        meta: { title: '页面' }
      },
      {
        path: 'data-source/list',
        name: 'DataSourceList',
        component: () => import('@/views/dataSource/DataSourceListPage.vue'),
        meta: { title: '数据源管理' }
      },
      {
        path: '404',
        name: 'NotFound',
        component: () => import('@/views/error/NotFoundPage.vue'),
        meta: { title: '404' }
      },
      {
        path: 'messages',
        name: 'MessageCenter',
        component: () => import('@/modules/notification/views/MessageCenter.vue'),
        meta: { title: '消息中心' }
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