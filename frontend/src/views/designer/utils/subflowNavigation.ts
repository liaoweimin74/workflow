export interface CanvasPoint { x: number; y: number }

/**
 * 解析拖入节点的父容器：按落点坐标命中「展开态子流程」（bpmn-js 内建界面语义——
 * 双击/点击箭头展开子流程后，拖入其内部即落入该子流程）。
 * 命中多个嵌套展开子流程时取最内层（bounds 面积最小）；未命中则返回 fallbackRoot
 * （当前 plane 的根元素——主流程 plane 为主流程，子流程 plane 为子流程）。
 * registry 未同步时降级回 fallbackRoot。
 */
export function resolveDropParent(
  point: CanvasPoint,
  registry: { getAll(): any[]; find(pred: (el: any) => boolean): any },
  fallbackRoot: any
): any {
  const expandedSubflows = registry.getAll().filter(
    (el: any) => el.type === 'bpmn:SubProcess' && !el.collapsed
  )
  const hit = expandedSubflows
    .filter((el: any) =>
      point.x >= el.x && point.x <= el.x + el.width &&
      point.y >= el.y && point.y <= el.y + el.height
    )
    // 取最内层：面积最小的命中子流程
    .sort((a: any, b: any) => a.width * a.height - b.width * b.height)[0]
  if (hit) return hit
  return fallbackRoot
}

/**
 * 在指定容器作用域内查找 StartEvent（仅 parent 直接为该容器的元素）。
 * 子流程可拥有自己的开始事件，校验时不得与主流程的开始事件互相干扰。
 */
export function findStartEventInScope(
  container: any,
  registry: { getAll(): any[] }
): any {
  return registry.getAll().find(
    (el: any) => el.type === 'bpmn:StartEvent' && el.parent === container
  )
}