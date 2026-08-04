import type { Directive } from 'vue'
import { watch } from 'vue'
import { useAuthStore } from '@/stores/auth'

export const permission: Directive<HTMLElement, string | undefined> = {
  mounted(el, binding) {
    const value = binding.value
    if (!value) return

    const authStore = useAuthStore()

    function update() {
      if (authStore.permissions.length === 0) return
      if (!authStore.hasPermission(value)) {
        el.style.display = 'none'
      } else {
        el.style.display = ''
      }
    }

    update()
    // 监听 permissions 变化，响应式隐藏/显示
    const stop = watch(() => authStore.permissions, update, { deep: true })
    // 元素卸载时停止监听
    ;(el as any).__permissionStop__ = stop
  },
  updated(el, binding) {
    const value = binding.value
    if (!value) return
    const authStore = useAuthStore()
    if (authStore.permissions.length === 0) return
    if (!authStore.hasPermission(value)) {
      el.style.display = 'none'
    } else {
      el.style.display = ''
    }
  },
  beforeUnmount(el) {
    const stop = (el as any).__permissionStop__
    if (stop) stop()
  }
}