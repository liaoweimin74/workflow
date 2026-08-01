import type { Directive } from 'vue'
import { useAuthStore } from '@/stores/auth'

export const permission: Directive = {
  mounted(el: HTMLElement, binding) {
    const { value } = binding
    if (value) {
      const authStore = useAuthStore()
      const hasPermission = authStore.hasPermission(value)
      if (!hasPermission) {
        el.parentNode?.removeChild(el)
      }
    }
  }
}