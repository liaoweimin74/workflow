import type { Directive } from 'vue'
import { useAuthStore } from '@/stores/auth'

export const permission: Directive<HTMLElement, string | undefined> = {
  mounted(el, binding) {
    const { value } = binding
    if (!value) {
      // 未声明权限点：默认全员可见。
      // 说明：通用组件（如 SearchTable 的行按钮）允许合法地不配置权限点（如"查看"），
      // 全库不存在手写裸 v-permission，故不再输出 DEV 警告以保持控制台干净。
      return
    }
    const authStore = useAuthStore()
    if (!authStore.hasPermission(value)) {
      el.parentNode?.removeChild(el)
    }
  },
}