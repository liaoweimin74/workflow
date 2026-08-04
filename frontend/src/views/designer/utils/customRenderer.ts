/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 自定义 Renderer — 发起人节点高亮
 *
 * 继承 BaseRenderer，对 wf:nodeRole="initiator" 的 UserTask
 * 在默认渲染之上追加浅蓝色（#e3f2fd）填充矩形。
 *
 * 作为 DI 模块导出，通过 additionalModules 注册。
 */

import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer'
import { append, create, attr } from 'tiny-svg'

/**
 * 发起人节点填充色
 */
const INITIATOR_FILL_COLOR = '#e3f2fd'

// 依赖注入标记
CustomRenderer.$inject = ['eventBus', 'bpmnRenderer', 'styles']

/**
 * 自定义渲染器：发起人节点高亮显示。
 *
 * @param eventBus    事件总线（BaseRenderer 构造需要）
 * @param bpmnRenderer 默认 BPMN 渲染器，用于委托绘制默认图形
 * @param styles      样式工具
 */
function CustomRenderer(this: any, eventBus: any, bpmnRenderer: any, styles: any) {
  // 调用 BaseRenderer 构造函数，注册渲染优先级（高于默认 1000）
  BaseRenderer.call(this, eventBus, 2000)

  this.bpmnRenderer = bpmnRenderer
  this.styles = styles

  /**
   * 判断元素是否可由本渲染器渲染：
   * 仅处理 businessObject 上 wf:nodeRole === 'initiator' 的元素。
   */
  this.canRender = function (element: any): boolean {
    const bo = element && element.businessObject
    if (!bo) return false
    const nodeRole = bo.get && bo.get('wf:nodeRole')
    return nodeRole === 'initiator'
  }

  /**
   * 绘制形状：
   * 1. 委托默认 bpmnRenderer 完成基础绘制
   * 2. 追加浅蓝色填充 rect 覆盖在默认图形上方
   *
   * @returns 默认渲染器返回的 SVG 元素
   */
  this.drawShape = function (parent: SVGElement, shape: any): SVGElement {
    // 委托默认渲染器绘制
    const gfx = this.bpmnRenderer.drawShape(parent, shape)

    // 追加浅蓝色填充矩形
    const rect = create('rect')
    attr(rect, {
      x: 0,
      y: 0,
      width: shape.width,
      height: shape.height,
      fill: INITIATOR_FILL_COLOR,
      'fill-opacity': 0.3
    })
    append(parent, rect)

    return gfx
  }

  /**
   * 连线绘制：委托默认渲染器。
   */
  this.drawConnection = function (parent: SVGElement, connection: any): SVGElement {
    return this.bpmnRenderer.drawConnection(parent, connection)
  }

  /**
   * 形状路径：委托默认渲染器。
   */
  this.getShapePath = function (shape: any): string {
    return this.bpmnRenderer.getShapePath(shape)
  }

  /**
   * 连线路径：委托默认渲染器。
   */
  this.getConnectionPath = function (connection: any): string {
    return this.bpmnRenderer.getConnectionPath(connection)
  }
}

// 原型链继承 BaseRenderer
CustomRenderer.prototype = Object.create(BaseRenderer.prototype)
CustomRenderer.prototype.constructor = CustomRenderer

/**
 * DI 模块：注册自定义渲染器。
 * 放入 Modeler additionalModules 即可生效。
 */
export const customRendererModule = {
  __init__: ['customRenderer'],
  customRenderer: ['type', CustomRenderer]
}
