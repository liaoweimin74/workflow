import type { Directive } from 'vue'
import { useAuthStore } from '@/stores/auth'

export const permission: Directive<HTMLElement, string | undefined> = {
  mounted(el, binding) {
    const { value } = binding
    if (!value) {
      // 未声明权限点：保留显示，开发环境警告提醒漏配
      if (import.meta.env.DEV) {
        console.warn(
          '[v-permission] 未声明权限点，按钮将对所有登录用户可见。' +
          '若该按钮涉及写操作，请补齐 permission 字段。元素：',
          el,
        )
      }
      return
    }
    const authStore = useAuthStore()
    if (!authStore.hasPermission(value)) {
      el.parentNode?.removeChild(el)
    }
  },
}