import type { Directive } from 'vue'
import { useAuthStore } from '@/stores/auth'

export const permission: Directive<HTMLElement, string | undefined> = {
  mounted(el, binding) {
    const { value } = binding
    if (!value) {
      // 未挂权限点 = 有意设计：页面级授权模型下按钮对所有登录用户可见（页面本身已由路由/菜单守卫控制）。
      // 不再 DEV 警告：全站大量按钮无需权限点，常驻警告只会淹没真正需要关注的控制台输出。
      // 若某按钮需按钮级权限，请显式传码（如 v-permission="'data-source:manage'"），缺失码会被移除。
      return
    }
    const authStore = useAuthStore()
    if (!authStore.hasPermission(value)) {
      el.parentNode?.removeChild(el)
    }
  },
}