import { describe, it, expect } from 'vitest'
import { resolveDropParent, findStartEventInScope } from '../subflowNavigation'

describe('resolveDropParent — 落点命中展开态子流程', () => {
  const process = { id: 'Process_1', type: 'bpmn:Process' }
  const subPlaneRoot = { id: 'Activity_A_plane', type: 'bpmn:SubProcess', collapsed: false }
  const expandedSub = { id: 'Activity_A', type: 'bpmn:SubProcess', collapsed: false, x: 100, y: 80, width: 200, height: 150 }
  const collapsedSub = { id: 'Activity_C', type: 'bpmn:SubProcess', collapsed: true, x: 400, y: 80, width: 120, height: 100 }
  const registry = {
    getAll: () => [process, expandedSub, collapsedSub],
    find: (pred: (el: any) => boolean) => [process, expandedSub, collapsedSub].find(pred),
  }

  it('落点命中展开态子流程内部：返回该子流程作为父容器', () => {
    expect(resolveDropParent({ x: 200, y: 150 }, registry, process)).toBe(expandedSub)
  })

  it('展开态子流程的边界点也算命中（含右/下边缘）', () => {
    expect(resolveDropParent({ x: 100, y: 80 }, registry, process)).toBe(expandedSub)
    expect(resolveDropParent({ x: 300, y: 230 }, registry, process)).toBe(expandedSub)
  })

  it('落点命中折叠态子流程：不返回（需先双击/点箭头展开）', () => {
    // 折叠态子流程应通过双击/箭头展开后才承接拖入，不直接命中
    expect(resolveDropParent({ x: 450, y: 130 }, registry, process)).toBe(process)
  })

  it('落点在展开子流程之外：返回 fallbackRoot（当前 plane 根）', () => {
    expect(resolveDropParent({ x: 600, y: 600 }, registry, process)).toBe(process)
  })

  it('在子流程 plane 内未命中展开子流程：返回子流程 plane 根', () => {
    expect(resolveDropParent({ x: 600, y: 600 }, registry, subPlaneRoot)).toBe(subPlaneRoot)
  })

  it('多个嵌套展开子流程：取最内层（面积最小）', () => {
    const outer = { id: 'Outer', type: 'bpmn:SubProcess', collapsed: false, x: 100, y: 80, width: 300, height: 250 }
    const inner = { id: 'Inner', type: 'bpmn:SubProcess', collapsed: false, x: 150, y: 120, width: 100, height: 90 }
    const nestedRegistry = {
      getAll: () => [process, outer, inner],
      find: (pred: (el: any) => boolean) => [process, outer, inner].find(pred),
    }
    // 点 (180, 150) 同时在内层与外层内
    expect(resolveDropParent({ x: 180, y: 150 }, nestedRegistry, process)).toBe(inner)
  })
})

describe('findStartEventInScope', () => {
  const process = { id: 'Process_1', type: 'bpmn:Process', parent: null }
  const sub = { id: 'Activity_A', type: 'bpmn:SubProcess', parent: process }
  const mainStart = { id: 'Start_1', type: 'bpmn:StartEvent', parent: process }
  const subStart = { id: 'Start_2', type: 'bpmn:StartEvent', parent: sub }
  const task = { id: 'Task_1', type: 'bpmn:UserTask', parent: process }
  const registry = { getAll: () => [process, sub, mainStart, subStart, task] }

  it('主流程作用域：只统计 parent 直接为主流程的 StartEvent', () => {
    expect(findStartEventInScope(process, registry)).toBe(mainStart)
  })

  it('子流程作用域：子流程内可拥有自己的 StartEvent，不被主流程的干扰', () => {
    expect(findStartEventInScope(sub, registry)).toBe(subStart)
  })

  it('作用域内无 StartEvent 返回 undefined', () => {
    const emptySub = { id: 'Activity_B', type: 'bpmn:SubProcess', parent: process }
    const emptyRegistry = { getAll: () => [process, emptySub, mainStart, task] }
    expect(findStartEventInScope(emptySub, emptyRegistry)).toBeUndefined()
  })
})
