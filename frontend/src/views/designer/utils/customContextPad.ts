/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 自定义 ContextPad Provider
 *
 * 完全替换 bpmn-js 默认 context-pad provider（默认会追加无类型的
 * 抽象 Task，Flowable 无法执行）。此 provider 提供有实际语义的节点：
 * - 用户任务 (UserTask)
 * - 服务任务 (ServiceTask)
 * - 排他网关 / 并行网关 / 包含网关
 * - 结束事件
 * - 连线 / 删除
 *
 * 作为 DI 模块导出，通过 additionalModules 覆盖 contextPadProvider。
 */

// 依赖注入标记，bpmn-js 会按名称注入对应服务
CustomContextPadProvider.$inject = [
  'contextPad',
  'elementFactory',
  'create',
  'autoPlace',
  'connect',
  'modeling'
]

function CustomContextPadProvider(
  this: any,
  contextPad: any,
  elementFactory: any,
  create: any,
  autoPlace: any,
  connect: any,
  modeling: any
) {
  contextPad.registerProvider(this)

  this.getContextPadEntries = function (element: any) {
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
      entries['connect'] = {
        group: 'connect',
        className: 'bpmn-icon-connection-multi',
        title: '连接到其他节点',
        action: {
          click(event: any, el: any) {
            connect.start(event, el)
          }
        }
      }
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
}

/**
 * DI 模块：覆盖 bpmn-js 默认 contextPadProvider。
 * 放入 Modeler additionalModules 即可生效。
 */
export const customContextPadModule = {
  contextPadProvider: ['type', CustomContextPadProvider]
}
