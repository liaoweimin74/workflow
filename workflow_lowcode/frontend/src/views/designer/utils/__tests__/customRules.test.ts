/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { customRulesModule } from '../customRules'

/**
 * 轻量测试：用假 eventBus 捕获 CommandInterceptor 注册的
 * commandStack.<action>.canExecute 处理器，直接调用断言规则返回值。
 * （RuleProvider → CommandInterceptor 链路见 diagram-js 源码；
 *  处理器经 unwrapEvent 以 (context, command, event) 形式回调，
 *  addRule 包装后实际入参是 context）
 */

function createListenerCapture() {
  const listeners: Record<string, Function> = {}
  const eventBus = {
    on(type: string, _priority?: any, fn?: Function) {
      listeners[type] = fn as Function
    }
  }
  return { eventBus, listeners }
}

/** 构造 $instanceOf 可控的假 businessObject */
function boOf(startEvent: boolean, nodeRole?: string) {
  return {
    $instanceOf: (t: string) => {
      if (startEvent && t === 'bpmn:StartEvent') return true
      if (!startEvent && t === 'bpmn:UserTask') return true
      return false
    },
    get: (name: string) => (name === 'wf:nodeRole' ? nodeRole : undefined)
  }
}

const startEl = () => ({ businessObject: boOf(true) })
const userTaskEl = () => ({ businessObject: boOf(false) })
const initiatorEl = () => ({ businessObject: boOf(false, 'initiator') })

function loadRules() {
  const { eventBus, listeners } = createListenerCapture()
  // DI 以 ['type', CustomRules] 注册，等价于 new CustomRules(eventBus)
  const CustomRules = customRulesModule.customRules[1] as any
  new CustomRules(eventBus)
  return listeners
}

describe('customRules — 开始节点不可删除', () => {
  it('注册了 elements.delete 与 shape.delete 规则', () => {
    const listeners = loadRules()
    expect(listeners['commandStack.elements.delete.canExecute']).toBeTypeOf('function')
    expect(listeners['commandStack.shape.delete.canExecute']).toBeTypeOf('function')
  })

  it('elements.delete：选中含开始节点时返回剔除开始节点的可删数组', () => {
    const listeners = loadRules()
    const fn = listeners['commandStack.elements.delete.canExecute']
    const start = startEl()
    const task = userTaskEl()
    const result = fn({ context: { elements: [start, task] } })
    expect(result).toEqual([task])
    expect(result).not.toContain(start)
  })

  it('elements.delete：只选开始节点时返回 false（整体禁止）', () => {
    const listeners = loadRules()
    const fn = listeners['commandStack.elements.delete.canExecute']
    expect(fn({ context: { elements: [startEl()] } })).toBe(false)
  })

  it('elements.delete：不含开始节点时不干预（undefined，交给默认规则）', () => {
    const listeners = loadRules()
    const fn = listeners['commandStack.elements.delete.canExecute']
    expect(fn({ context: { elements: [userTaskEl()] } })).toBeUndefined()
  })

  it('shape.delete：开始节点返回 false，其余不干预', () => {
    const listeners = loadRules()
    const fn = listeners['commandStack.shape.delete.canExecute']
    expect(fn({ context: { shape: startEl() } })).toBe(false)
    expect(fn({ context: { shape: userTaskEl() } })).toBeUndefined()
  })
})

describe('customRules — 开始节点只能连接发起人节点（既有规则回归）', () => {
  it('connection.create：开始节点 → 发起节点允许，→ 普通任务拒绝', () => {
    const listeners = loadRules()
    const fn = listeners['commandStack.connection.create.canExecute']
    expect(fn({ context: { source: startEl(), target: initiatorEl() } })).toBe(true)
    expect(fn({ context: { source: startEl(), target: userTaskEl() } })).toBe(false)
  })

  it('connection.create：非开始节点连线不干预', () => {
    const listeners = loadRules()
    const fn = listeners['commandStack.connection.create.canExecute']
    expect(fn({ context: { source: userTaskEl(), target: userTaskEl() } })).toBeUndefined()
  })
})
