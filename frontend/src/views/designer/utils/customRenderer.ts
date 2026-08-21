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

/**
 * 发起人节点图标色（画布内左上角标记）
 */
const INITIATOR_ICON_COLOR = '#409eff'

/**
 * 折叠态内嵌子流程左上角图标色（与 CallActivity 折叠态默认 marker 区分）
 */
const SUBFLOW_ICON_COLOR = '#409eff'

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
   * - 折叠态内嵌子流程（bpmn:SubProcess collapsed）：左上角绘制折叠图标，与 CallActivity 区分
   * - businessObject 上 wf:nodeRole === 'initiator' 的发起人节点
   */
  this.canRender = function (element: any): boolean {
    const bo = element && element.businessObject
    if (!bo) return false
    if (bo.$instanceOf && bo.$instanceOf('bpmn:SubProcess') && element.collapsed) return true
    const nodeRole = bo.get && bo.get('wf:nodeRole')
    return nodeRole === 'initiator'
  }

  /**
   * 绘制形状：
   * 1. 委托默认 bpmnRenderer 完成基础绘制
   * 2. 折叠态子流程：左上角追加蓝色折叠图标（\e81f），与 CallActivity 折叠态默认 marker 区分
   * 3. 发起人节点：追加浅蓝色填充矩形 + 蓝色手形图标
   *
   * @returns 默认渲染器返回的 SVG 元素
   */
  this.drawShape = function (parent: SVGElement, shape: any): SVGElement {
    // 委托默认渲染器绘制
    const gfx = this.bpmnRenderer.drawShape(parent, shape)

    const bo = shape.businessObject
    const isSubProcess = bo && bo.$instanceOf && bo.$instanceOf('bpmn:SubProcess')
    if (isSubProcess) {
      // 折叠态子流程：左上角蓝色折叠图标（bpmn-font \e81f）
      const icon = create('text')
      attr(icon, {
        x: 8,
        y: 18,
        'font-family': 'bpmn',
        'font-size': 14,
        fill: SUBFLOW_ICON_COLOR
      })
      icon.textContent = '\uE81F'
      append(parent, icon)
      return gfx
    }

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

    // 在默认人形图标后方追加蓝色手形图标（bpmn-font \e828）
    const icon = create('text')
    attr(icon, {
      x: 30,
      y: 24,
      'font-family': 'bpmn',
      'font-size': 16,
      fill: INITIATOR_ICON_COLOR
    })
    icon.textContent = '\uE828'
    append(parent, icon)

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
