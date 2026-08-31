import { reactive } from 'vue'

/**
 * 页面查询状态缓存（按 key 隔离）。
 *
 * 背景：视图/页面渲染的页面（如 PageRenderer 的 page/:pageKey 动态路由）共用同一个
 * 路由组件，keep-alive 按组件 name 无法区分不同实例，因此无法用 keep-alive 缓存状态。
 * 这里以「菜单全路径」（如 "表单视图管理/测试视图2"）为 key，手动保存/恢复查询状态，
 * 使页签切换后查询条件、分页、排序得以保留。
 */
export interface PageQueryState {
  /** SearchTable 内部 query（含 page / size 及筛选字段值） */
  query: Record<string, any>
  /** 排序状态（服务器端排序归一化后的 prop/order） */
  sort: { prop: string; order: string } | null
}

/** 单例响应式缓存：key = 菜单全路径（或路由 path 兜底） */
export const pageQueryState = reactive<Record<string, PageQueryState>>({})

/** 读取某 key 的状态（深度拷贝，避免外部改动污染缓存；无则返回 null） */
export function getPageQueryState(key: string): PageQueryState | null {
  const s = pageQueryState[key]
  if (!s) return null
  return {
    query: { ...(s.query || {}) },
    sort: s.sort ? { ...s.sort } : null,
  }
}

/** 保存某 key 的状态 */
export function setPageQueryState(key: string, state: PageQueryState) {
  pageQueryState[key] = {
    query: { ...(state.query || {}) },
    sort: state.sort ? { ...state.sort } : null,
  }
}

/** 清除某 key 的状态（菜单重新点击强制刷新用） */
export function clearPageQueryState(key: string) {
  delete pageQueryState[key]
}

/**
 * 按前缀清除若干 key 的状态。
 * PAGE 自定义页面按「菜单路径/容器id」复合 key 保存（页内多个表格隔离），
 * 菜单重击强制刷新时需连同这些复合 key 一并清除（仅清纯菜单路径 key 会漏掉）。
 * 返回被清除的 key 列表。
 */
export function clearPageQueryStatesByPrefix(prefix: string): string[] {
  const removed: string[] = []
  for (const key of Object.keys(pageQueryState)) {
    if (key === prefix || key.startsWith(prefix + '/')) {
      delete pageQueryState[key]
      removed.push(key)
    }
  }
  return removed
}

/**
 * 页面强制刷新信号：key = 菜单路径，值 = 刷新代次。
 * 菜单重击同一路由时组件不会重挂载，PageRenderer 通过监听此信号强制重建页面（清空缓存 + 重拉数据）。
 */
export const pageRefreshSignal = reactive<Record<string, number>>({})

/** 递增某菜单路径的刷新代次，通知该页面强制刷新 */
export function bumpPageRefresh(key: string) {
  pageRefreshSignal[key] = (pageRefreshSignal[key] || 0) + 1
}

/** 读取某菜单路径的当前刷新代次 */
export function getPageRefreshSignal(key: string): number {
  return pageRefreshSignal[key] || 0
}

/**
 * 路由 path → 菜单全路径 映射。
 * AdminLayout（Pinia 保证就绪处）根据 authStore.menus 计算并写入；PageRenderer 等
 * 渲染组件（可能运行在没有 Pinia 的测试/预览环境）从本 map 读取状态 key，避免直接依赖
 * useAuthStore 而在无 Pinia 环境下崩溃。
 */
export const menuPathMap = reactive<Record<string, string>>({})

/** 注册（或更新）某路由 path 对应的菜单全路径（如 "表单视图管理/测试视图2"） */
export function registerMenuPath(path: string, fullPath: string) {
  menuPathMap[path] = fullPath
}

/** 读取某路由 path 对应的菜单全路径；未注册返回原 path（兜底） */
export function getMenuPathByRoute(path: string): string {
  return menuPathMap[path] || path
}
