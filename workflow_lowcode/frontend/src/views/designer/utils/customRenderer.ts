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
import { append, create, attr, remove as svgRemove } from 'tiny-svg'

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

/**
 * 调用活动（CallActivity）左上角调用图标 —— 主描边色
 * 方框 + 右下箭头，象征"调用其他流程/跳转到外部流程"
 */
const CALL_ICON_COLOR = '#5755ee'

/**
 * BPMN 元素类型 → CSS 标记 class（加在 .djs-element 上，供 designer-theme.css 精准命中）
 * 注：bpmn-js 的 data-element-id 是内部随机 id（如 Activity_xxx），与类型无映射，
 *     无法用 [data-element-id*="UserTask"] 选择，必须显式打上类型标记。
 */
const TYPE_MARKER_MAP: Record<string, string> = {
  'bpmn:StartEvent': 'start-event',
  'bpmn:EndEvent': 'end-event',
  'bpmn:IntermediateThrowEvent': 'intermediate-throw-event',
  'bpmn:IntermediateCatchEvent': 'intermediate-catch-event',
  'bpmn:UserTask': 'user-task',
  'bpmn:ServiceTask': 'service-task',
  'bpmn:ScriptTask': 'service-task',
  'bpmn:SendTask': 'task',
  'bpmn:ReceiveTask': 'task',
  'bpmn:ManualTask': 'task',
  'bpmn:BusinessRuleTask': 'service-task',
  'bpmn:Task': 'task',
  'bpmn:CallActivity': 'call-activity',
  'bpmn:SubProcess': 'subprocess',
  'bpmn:ExclusiveGateway': 'exclusive-gateway',
  'bpmn:ParallelGateway': 'parallel-gateway',
  'bpmn:InclusiveGateway': 'inclusive-gateway',
  'bpmn:EventBasedGateway': 'gateway'
}

// 依赖注入标记
CustomRenderer.$inject = ['eventBus', 'bpmnRenderer', 'styles', 'canvas', 'elementRegistry']

/**
 * 自定义渲染器：发起人节点高亮显示。
 *
 * @param eventBus    事件总线（BaseRenderer 构造需要）
 * @param bpmnRenderer 默认 BPMN 渲染器，用于委托绘制默认图形
 * @param styles      样式工具
 */
function CustomRenderer(this: any, eventBus: any, bpmnRenderer: any, styles: any, canvas: any, elementRegistry: any) {
  // 调用 BaseRenderer 构造函数，注册渲染优先级（高于默认 1000）
  BaseRenderer.call(this, eventBus, 2000)

  this.bpmnRenderer = bpmnRenderer
  this.styles = styles
  this.canvas = canvas
  this.elementRegistry = elementRegistry

  /**
   * 给流程节点打上 CSS 类型标记。
   * 遍历 elementRegistry 中对每个 shape 按其 BPMN 类型 addMarker，
   * 使 designer-theme.css 能用 .djs-element.<type> 精准命中节点样式。
   */
  const applyTypeMarkers = () => {
    if (!this.canvas || !this.elementRegistry) return
    this.elementRegistry.filter((e: any) => e && e.id).forEach((e: any) => {
      const marker = TYPE_MARKER_MAP[e.type]
      if (marker) {
        this.canvas.addMarker(e, marker)
      }
    })
  }

  // import 完成后：为所有已渲染节点打标记
  eventBus.on('import.done', applyTypeMarkers)
  // 拖入新节点后：为新节点打标记
  eventBus.on('shape.added', applyTypeMarkers)

  /**
   * 判断元素是否可由本渲染器渲染：
   * - 调用活动（bpmn:CallActivity）：移除底部折叠 marker，左上角绘制调用图标
   * - 折叠态内嵌子流程（bpmn:SubProcess collapsed）：左上角绘制折叠图标，与 CallActivity 区分
   * - businessObject 上 wf:nodeRole === 'initiator' 的发起人节点
   */
  this.canRender = function (element: any): boolean {
    const bo = element && element.businessObject
    if (!bo) return false
    if (bo.$instanceOf && bo.$instanceOf('bpmn:CallActivity')) return true
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
    const isCallActivity = bo && bo.$instanceOf && bo.$instanceOf('bpmn:CallActivity')
    if (isCallActivity) {
      // 移除底部的折叠子流程 marker（14px 小矩形 + 两条横线），换成左上角的调用图标
      ;[].forEach.call(parent.querySelectorAll && parent.querySelectorAll('path[data-marker], rect'), (el: any) => {
        if (el === parent) return
        const w = Number(el.getAttribute && el.getAttribute('width')) || 0
        const h = Number(el.getAttribute && el.getAttribute('height')) || 0
        // 移除 data-marker（两条横线）以及小尺寸 markerRect（宽高 < 30）
        if (el.hasAttribute && el.hasAttribute('data-marker')) {
          svgRemove(el)
        } else if (w > 0 && h > 0 && w < 30 && h < 30) {
          svgRemove(el)
        }
      })

      // 左上角绘制"调用其他流程"图标：方框 + 右下箭头
      const icon = create('path')
      attr(icon, {
        d: 'M1,1 h13 v13 h-13 z M4,12 L11,5 M6,5 h5 v5',
        transform: 'translate(10,10)',
        fill: 'none',
        stroke: CALL_ICON_COLOR,
        'stroke-width': 1.4,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      })
      append(parent, icon)
    }

    const isSubProcess = !isCallActivity && bo && bo.$instanceOf && bo.$instanceOf('bpmn:SubProcess')
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
