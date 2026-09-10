/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 自定义 Rules — 开始节点只能连接至发起人节点
 *
 * 覆盖 connection.create / connection.reconnect 规则：
 * - 源为 StartEvent 时，目标必须是 wf:nodeRole=initiator 的 UserTask
 *
 * 作为 DI 模块导出，通过 additionalModules 注册。
 */

import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider'

// 依赖注入标记
CustomRules.$inject = ['eventBus']

function CustomRules(this: any, eventBus: any) {
  RuleProvider.call(this, eventBus)

  /**
   * 判断元素是否为发起人节点（UserTask + wf:nodeRole=initiator）
   */
  function isInitiatorNode(element: any): boolean {
    const bo = element && element.businessObject
    if (!bo || !bo.$instanceOf || !bo.$instanceOf('bpmn:UserTask')) return false
    const nodeRole = bo.get && bo.get('wf:nodeRole')
    return nodeRole === 'initiator'
  }

  /**
   * 判断元素是否为开始事件
   */
  function isStartEvent(element: any): boolean {
    const bo = element && element.businessObject
    return !!(bo && bo.$instanceOf && bo.$instanceOf('bpmn:StartEvent'))
  }

  this.addRule('connection.create', 2000, function (context: any) {
    const source = context.source
    const target = context.target

    // 开始节点只能连到发起人节点
    if (isStartEvent(source)) {
      return isInitiatorNode(target)
    }

    return // 不干预其他情况
  })

  this.addRule('connection.reconnect', 2000, function (context: any) {
    const source = context.source
    const target = context.target

    // 开始节点的连线重连，目标仍必须是发起人节点
    if (isStartEvent(source)) {
      return isInitiatorNode(target)
    }

    return
  })
}

// 原型链继承 RuleProvider
CustomRules.prototype = Object.create(RuleProvider.prototype)
CustomRules.prototype.constructor = CustomRules

/**
 * DI 模块：注册自定义规则。
 * 放入 Modeler additionalModules 即可生效。
 */
export const customRulesModule = {
  __init__: ['customRules'],
  customRules: ['type', CustomRules]
}
