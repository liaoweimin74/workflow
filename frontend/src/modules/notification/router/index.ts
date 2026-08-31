/**
 * 消息通知模块路由
 */
import type { RouteRecordRaw } from 'vue-router'

export const notificationRoutes: RouteRecordRaw[] = [
  {
    path: '/messages',
    name: 'MessageCenter',
    component: () => import('../views/MessageCenter.vue'),
    meta: { title: '消息中心' },
  },
]
