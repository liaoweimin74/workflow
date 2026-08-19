/**
 * BPMN XML 校验辅助函数。
 *
 * <p>从导出 XML 的 DOM 层面判断元素是否为发起人节点。
 * 发起人节点在 XML 中带有 wf:nodeRole="initiator" 扩展属性（assignee 为 ${initiator}），
 * 由发起人自己填报，无需配置审批人。
 *
 * <p>属性名兼容两种形式（与后端 InitiatorNodeResolver 一致）：
 * <ul>
 *   <li>"wf:nodeRole"（带命名空间前缀，bpmn-js 序列化形式）</li>
 *   <li>"nodeRole"（部分解析器剥离前缀后的形式）</li>
 * </ul>
 */
export function isInitiatorTaskElement(el: Element): boolean {
  if (!el || typeof el.getAttribute !== 'function') return false
  const role = el.getAttribute('wf:nodeRole') ?? el.getAttribute('nodeRole')
  return role === 'initiator'
}

/** 校验每个内嵌子流程内部是否包含开始与结束事件（基于直接子元素，兼容命名空间前缀）。
 *  返回错误消息列表，无错误返回空数组。 */
export function validateSubProcessBoundaries(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) return []
  const errors: string[] = []
  const subProcesses = doc.querySelectorAll('bpmn\\:subProcess, subProcess')
  subProcesses.forEach((sp) => {
    const name = sp.getAttribute('name') || sp.getAttribute('id') || '未命名'
    const children = Array.from(sp.children)
    const hasStart = children.some((c) => c.localName === 'startEvent')
    const hasEnd = children.some((c) => c.localName === 'endEvent')
    if (!hasStart) errors.push(`内嵌子流程「${name}」缺少开始事件`)
    if (!hasEnd) errors.push(`内嵌子流程「${name}」缺少结束事件`)
  })
  return errors
}
