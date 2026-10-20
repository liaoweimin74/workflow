// ----- 字典项拖动排序的落点换算（纯函数，无 DOM/无请求）-----
// 表格可能被搜索过滤、也可能只剩一页，拖动的只是「当前可见的那几行」，
// 而后端 PUT /dict-data/sort 需要整个字典类型的完整 id 顺序才能归一化 sortOrder。
// 所以分两步：先在可见序列里挪位，再把新顺序塞回整表原来占据的那些槽位
// （没露面的项保持自己的位置不动）。

export type DropBand = 'before' | 'after'

/**
 * 把 dragId 挪到 hoverId 的前面或后面。
 * 返回挪动后的新序列；任一个 id 不在序列里、或挪完顺序没变（比如就贴在邻居原位）时返回 null，
 * 调用方据此不发请求、也不弹提示。
 */
export function moveWithinVisible<T>(
  visibleIds: T[],
  dragId: T,
  hoverId: T,
  band: DropBand,
): T[] | null {
  if (dragId === hoverId) return null
  if (visibleIds.indexOf(dragId) < 0 || visibleIds.indexOf(hoverId) < 0) return null

  const rest = visibleIds.filter((id) => id !== dragId)
  const anchor = rest.indexOf(hoverId)
  const insertAt = band === 'before' ? anchor : anchor + 1
  const next = [...rest.slice(0, insertAt), dragId, ...rest.slice(insertAt)]

  return sameSequence(visibleIds, next) ? null : next
}

/**
 * 把可见子集的新顺序映射回整表 id 顺序：
 * 整表里原本属于可见子集的那些位置，按新顺序依次填进去；未出现在子集里的项留在自己的槽位。
 * 例：full=[1,2,3,4,5]、visible=[1,3,5]、newVisible=[3,1,5] → [3,2,1,4,5]
 *
 * newVisibleIds 必须是 visibleIds 的一个排列（长度相同、无重复、无外来 id），
 * 否则视为状态错位，原样返回整表顺序，绝不提交一个会打乱数据的顺序。
 */
export function applyVisibleReorder<T>(
  fullIds: T[],
  visibleIds: T[],
  newVisibleIds: T[],
): T[] {
  if (!isPermutation(visibleIds, newVisibleIds)) return fullIds.slice()

  const inVisible = new Set(visibleIds)
  let cursor = 0
  return fullIds.map((id) => (inVisible.has(id) ? newVisibleIds[cursor++] : id))
}

function isPermutation(from: unknown[], to: unknown[]): boolean {
  if (from.length !== to.length) return false
  const remaining = new Set(from)
  for (const id of to) {
    if (!remaining.delete(id)) return false
  }
  return true
}

function sameSequence(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false
  return a.every((id, i) => id === b[i])
}
