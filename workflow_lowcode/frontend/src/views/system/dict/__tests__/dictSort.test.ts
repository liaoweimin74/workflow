// ----- 字典项拖动排序落点换算的单测 -----
// npx vitest run src/views/system/dict/__tests__/dictSort.test.ts
//
// 锁定两条语义：
//   1. 原位放下（含贴着邻居放回原槽）→ null，不发请求；
//   2. 可见子集的新顺序映射回整表时，没露面的项必须留在自己的槽位，
//      否则一次翻页后的拖动会把整表顺序打乱。

import { describe, it, expect } from 'vitest'
import { applyVisibleReorder, moveWithinVisible } from '../dictSort'

describe('moveWithinVisible 可见序列内挪位', () => {
  const ids = [11, 12, 13, 14]

  it('before：插到目标行前面', () => {
    expect(moveWithinVisible(ids, 14, 11, 'before')).toEqual([14, 11, 12, 13])
  })

  it('after：插到目标行后面', () => {
    expect(moveWithinVisible(ids, 11, 14, 'after')).toEqual([12, 13, 14, 11])
  })

  it('贴着自己下边缘放下（下一行的上半带）：顺序没变，返回 null', () => {
    // [11,12,13] 把 11 插到 12 前面 → 仍是 [11,12,13]
    expect(moveWithinVisible([11, 12, 13], 11, 12, 'before')).toBeNull()
  })

  it('贴着自己上边缘放下（上一行的下半带）：顺序没变，返回 null', () => {
    expect(moveWithinVisible([11, 12, 13], 13, 12, 'after')).toBeNull()
  })

  it('整个跨过相邻行：是真实换位，不是 noop', () => {
    expect(moveWithinVisible([11, 12, 13], 11, 12, 'after')).toEqual([12, 11, 13])
  })

  it('拖到自己身上返回 null', () => {
    expect(moveWithinVisible(ids, 12, 12, 'before')).toBeNull()
  })

  it('目标行不在可见序列里（取数竞态）返回 null，不瞎排', () => {
    expect(moveWithinVisible(ids, 11, 99, 'after')).toBeNull()
    expect(moveWithinVisible(ids, 99, 11, 'after')).toBeNull()
  })
})

describe('applyVisibleReorder 可见子集映射回整表', () => {
  it('整表都在可见子集里时，结果就是新顺序', () => {
    expect(applyVisibleReorder([1, 2, 3], [1, 2, 3], [3, 1, 2])).toEqual([3, 1, 2])
  })

  it('未露面的项保持自己的槽位', () => {
    // 第 1 页只显示 1/3/5（过滤或分页），拖动后 2、4 仍待在原位
    expect(applyVisibleReorder([1, 2, 3, 4, 5], [1, 3, 5], [3, 1, 5])).toEqual([3, 2, 1, 4, 5])
  })

  it('子集只有一项时顺序不变', () => {
    expect(applyVisibleReorder([1, 2, 3], [2], [2])).toEqual([1, 2, 3])
  })

  it('传入不是排列的新顺序时原样返回，绝不提交乱序', () => {
    const full = [1, 2, 3]
    // 少了 1
    expect(applyVisibleReorder(full, [1, 2, 3], [2, 3])).toEqual(full)
    // 有重复
    expect(applyVisibleReorder(full, [1, 2, 3], [2, 2, 3])).toEqual(full)
    // 混入外来 id
    expect(applyVisibleReorder(full, [1, 2, 3], [2, 3, 99])).toEqual(full)
  })

  it('返回新数组，不改调用方的整表顺序', () => {
    const full = [1, 2, 3]
    const next = applyVisibleReorder(full, [1, 2], [2, 1])
    expect(next).not.toBe(full)
    expect(full).toEqual([1, 2, 3])
  })
})
