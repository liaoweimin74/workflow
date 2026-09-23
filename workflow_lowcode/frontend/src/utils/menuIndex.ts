import type { MenuTree } from '@/types/menu'

/** 可跳转页面 */
export interface MenuPage {
  path: string
  label: string
}

/**
 * 展平菜单树为可跳转页面列表（仅保留带路由 path 的项）。
 * 供 AI 助手 open_page 白名单与页面入口使用。
 */
export function flattenMenuPages(menus: MenuTree[] | undefined | null): MenuPage[] {
  const pages: MenuPage[] = []
  const walk = (items: MenuTree[] | undefined | null) => {
    if (!items) return
    for (const item of items) {
      if (item.path && item.path.startsWith('/')) {
        pages.push({ path: item.path, label: item.menuName })
      }
      if (item.children?.length) walk(item.children)
    }
  }
  walk(menus)
  return pages
}
