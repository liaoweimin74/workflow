/**
 * 树表格（PageTreeTable）纯函数层（Task 3-h）。
 *
 * 后端列表接口（dataSourceApi.queryData）返回平铺 records，不保证树形；
 * 组件在客户端按 idKey/parentKey 组树。孤儿节点挂根、环引用断链挂根，
 * 保证任何脏数据都能渲染成合法森林（不丢行、不死循环）。
 */

export interface TreeBuildOptions {
  /** 节点唯一键字段名（默认 'id'） */
  idKey?: string
  /** 父引用字段名（默认 'parentId'） */
  parentKey?: string
}

/** 判定「无父」：null/undefined/空串都视为根候选 */
function isNoParent(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

/** 键归一：数字 id 与字符串 parentId（'1' vs 1）按 String 比较 */
function keyOf(v: unknown): string {
  return String(v)
}

/**
 * 平铺 rows → 树形 rows（每节点浅拷贝，children 挂在同名字段）。
 *
 * 规则：
 *   1. parentKey 能命中某行 idKey → 挂为其 children；
 *   2. 孤儿（父 id 不在集合内 / 父引用为空）→ 挂根；
 *   3. 环引用（含自指 parentId===id、多节点环、悬挂在环上的节点）→ 全部断链挂根；
 *   4. children 为空的节点删除 children 字段（避免 el-table 出幽灵展开图标）；
 *   5. 根顺序 = 平铺输入顺序（稳定）。
 */
export function buildTreeRows<T extends Record<string, any>>(flat: T[] | null | undefined, options: TreeBuildOptions = {}): T[] {
  type WorkNode = T & { children?: T[] }
  const idKey = options.idKey || 'id'
  const parentKey = options.parentKey || 'parentId'
  const rows = Array.isArray(flat) ? flat : []
  if (rows.length === 0) return []

  // 每行浅拷贝并预挂空 children（children 数组是组树的工作区，空数组最后剔除）
  const nodes = rows.map((r) => ({ ...r, children: [] as T[] })) as WorkNode[]
  const byId = new Map<string, WorkNode>()
  for (const node of nodes) {
    if (!isNoParent(node[idKey])) byId.set(keyOf(node[idKey]), node)
  }

  /**
   * 环检测：从 node 沿 parentKey 向上走，若回到 node 自身或链上出现已访问键 → 环。
   * visited 上限即集合大小，天然不会死循环。
   */
  function inCycle(node: WorkNode): boolean {
    const selfKey = keyOf(node[idKey])
    const seen = new Set<string>([selfKey])
    let curKey = isNoParent(node[parentKey]) ? '' : keyOf(node[parentKey])
    while (curKey !== '') {
      if (seen.has(curKey)) return true
      seen.add(curKey)
      const parent = byId.get(curKey)
      if (!parent) return false // 链上出现孤儿 → node 本身不是环成员
      const nextRaw = parent[parentKey]
      curKey = isNoParent(nextRaw) ? '' : keyOf(nextRaw)
    }
    return false
  }

  const roots: WorkNode[] = []
  for (const node of nodes) {
    const rawParent = node[parentKey]
    const parent = !isNoParent(rawParent) && byId.has(keyOf(rawParent)) ? byId.get(keyOf(rawParent)) : undefined
    if (parent && parent !== node && !inCycle(node)) {
      ;(parent.children ??= []).push(node)
    } else {
      // 孤儿 / 自指 / 环成员 → 根
      roots.push(node)
    }
  }

  // 剔除空 children（el-table 对 children: [] 仍可能渲染展开位）
  for (const node of nodes) {
    if (Array.isArray(node.children) && node.children.length === 0) {
      delete node.children
    }
  }
  return roots as unknown as T[]
}
