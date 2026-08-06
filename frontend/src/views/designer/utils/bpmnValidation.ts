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
