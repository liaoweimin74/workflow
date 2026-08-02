/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 自定义 ContextPad Provider
 *
 * 在 bpmn-js 默认 context-pad 基础上追加节点创建快捷入口：
 * - 用户任务 (UserTask)
 * - 服务任务 (ServiceTask)
 * - 排他网关 / 并行网关 / 包含网关
 *
 * 通过 registerProvider 覆盖默认 provider，保留原有条目并扩展。
 */
import type Modeler from 'bpmn-js/lib/BaseModeler'

export function registerCustomContextPad(modeler: Modeler): void {
  const contextPad: any = (modeler as any).get('contextPad')
  const elementFactory: any = (modeler as any).get('elementFactory')
  const create: any = (modeler as any).get('create')
  const autoPlace: any = (modeler as any).get('autoPlace', false)
  const connect: any = (modeler as any).get('connect', false)
  const modeling: any = (modeler as any).get('modeling')

  contextPad.registerProvider({
    getContextPadEntries: (element: any) => {
      const entries: Record<string, any> = {}

      /**
       * 创建一个 append 操作：在选中元素右侧创建新节点并自动连线。
       * 若 autoPlace 可用则自动放置，否则启动 create 交互。
       */
      function appendAction(type: string, className: string, title: string, options?: any) {
        function appendStart(event: any, _element: any) {
          const shape = elementFactory.createShape({ type, ...(options || {}) })
          create.start(event, shape, {
            source: _element
          })
        }

        const append = autoPlace
          ? (_event: any, _element: any) => {
              const shape = elementFactory.createShape({ type, ...(options || {}) })
              autoPlace.append(_element, shape)
            }
          : appendStart

        return {
          group: 'model',
          className,
          title,
          action: {
            dragstart: appendStart,
            click: append
          }
        }
      }

      /**
       * 连线操作：启动 connect 交互，从当前节点拉出一条 sequence flow。
       */
      function connectAction() {
        return {
          group: 'connect',
          className: 'bpmn-icon-connection-multi',
          title: '连接到其他节点',
          action: {
            click(event: any, element: any) {
              connect.start(event, element)
            }
          }
        }
      }

      // 仅对 FlowNode 提供节点追加入口（EndEvent 等特殊节点除外）
      const bo = element.businessObject
      const isFlowNode = bo && bo.$instanceOf && bo.$instanceOf('bpmn:FlowNode')
      const isEndEvent = bo && bo.$instanceOf && bo.$instanceOf('bpmn:EndEvent')
      const isCompensation = bo && bo.isForCompensation

      if (isFlowNode && !isEndEvent && !isCompensation) {
        entries['append.user-task'] = appendAction(
          'bpmn:UserTask',
          'bpmn-icon-user-task',
          '追加用户任务'
        )
        entries['append.service-task'] = appendAction(
          'bpmn:ServiceTask',
          'bpmn-icon-service-task',
          '追加服务任务'
        )
        entries['append.exclusive-gateway'] = appendAction(
          'bpmn:ExclusiveGateway',
          'bpmn-icon-gateway-xor',
          '追加排他网关'
        )
        entries['append.parallel-gateway'] = appendAction(
          'bpmn:ParallelGateway',
          'bpmn-icon-gateway-parallel',
          '追加并行网关'
        )
        entries['append.inclusive-gateway'] = appendAction(
          'bpmn:InclusiveGateway',
          'bpmn-icon-gateway-or',
          '追加包含网关'
        )
        entries['append.end-event'] = appendAction(
          'bpmn:EndEvent',
          'bpmn-icon-end-event-none',
          '追加结束事件'
        )
      }

      // 连线入口（所有 FlowNode）
      if (isFlowNode && !isCompensation && connect) {
        entries['connect'] = connectAction()
      }

      // 删除入口
      entries['delete'] = {
        group: 'edit',
        className: 'bpmn-icon-trash',
        title: '删除',
        action: {
          click(_event: any, el: any) {
            modeling.removeElements([el])
          }
        }
      }

      return entries
    }
  })
}
