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

/** 节点类型 → 中文标签（校验消息用，与后端编译器一致）。 */
const NODE_TYPE_LABELS: Record<string, string> = {
  startEvent: '开始事件',
  endEvent: '结束事件',
  userTask: '用户任务',
  serviceTask: '服务任务',
  manualTask: '人工任务',
  receiveTask: '接收任务',
  scriptTask: '脚本任务',
  businessRuleTask: '规则任务',
  sendTask: '发送任务',
  task: '任务',
  callActivity: '调用活动',
  subProcess: '子流程',
  exclusiveGateway: '排他网关',
  parallelGateway: '并行网关',
  inclusiveGateway: '包容网关',
  eventBasedGateway: '事件网关',
  complexGateway: '复杂网关',
  intermediateCatchEvent: '中间捕获事件',
  intermediateThrowEvent: '中间抛出事件',
  boundaryEvent: '边界事件',
}

/** userTask 的展示名：按 wf:nodeRole 细分发起/办理/审批（缺省归审批）。 */
function userTaskRoleLabel(el: Element): string {
  const role = el.getAttribute('wf:nodeRole') ?? el.getAttribute('nodeRole')
  if (role === 'initiator') return '发起节点'
  if (role === 'handler') return '办理节点'
  return '审批节点'
}

/**
 * 生成节点展示名：优先 name；无 name 时用角色/类型标签 + ID，
 * 让用户能在画布上对号入座（例如「办理节点(Activity_12aok35)」）。
 */
function describeNode(el: Element): string {
  const name = (el.getAttribute('name') || '').trim()
  const id = el.getAttribute('id') || ''
  if (name) return `${name}(${id})`
  const local = el.localName
  const base = local === 'userTask' ? userTaskRoleLabel(el) : (NODE_TYPE_LABELS[local] ?? local)
  return id ? `${base}(${id})` : base
}

/** 组合选择器：每个标签同时匹配带/不带 bpmn: 前缀两种形式（与既有校验一致）。 */
function flowObjectSelector(): string {
  return Object.keys(NODE_TYPE_LABELS)
    .map((t) => `bpmn\\:${t}, ${t}`)
    .join(', ')
}

/**
 * 连通性校验（与后端 process-compiler validate 图结构规则对齐）：
 * 1. 除 endEvent 外每个节点必须有出边（否则流程走死）；
 * 2. 除 startEvent 外每个节点必须有入边（否则永远不可达）；
 * 3. 排他网关多条出边时无条件分支至多一条（default 不算无条件）。
 * 返回错误消息列表，无错误返回空数组。
 */
export function validateFlowConnectivity(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) return []
  const errors: string[] = []

  const flows = Array.from(doc.querySelectorAll('bpmn\\:sequenceFlow, sequenceFlow'))
  const outgoing = new Map<string, number>()
  const incoming = new Map<string, number>()
  flows.forEach((f) => {
    const s = f.getAttribute('sourceRef')
    const t = f.getAttribute('targetRef')
    if (s) outgoing.set(s, (outgoing.get(s) ?? 0) + 1)
    if (t) incoming.set(t, (incoming.get(t) ?? 0) + 1)
  })

  doc.querySelectorAll(flowObjectSelector()).forEach((el) => {
    const local = el.localName
    const id = el.getAttribute('id')
    if (!id) return
    const label = describeNode(el)
    if (local !== 'endEvent' && !(outgoing.get(id) ?? 0)) {
      errors.push(`节点「${label}」没有出边，流程会走死，请连线到下游节点或结束事件`)
    }
    if (local !== 'startEvent' && !(incoming.get(id) ?? 0)) {
      errors.push(`节点「${label}」没有入边，永远无法到达，请从上游节点连线`)
    }
    if (local === 'exclusiveGateway') {
      const outFlows = flows.filter((f) => f.getAttribute('sourceRef') === id)
      if (outFlows.length > 1) {
        const defaultFlowId = el.getAttribute('default')
        const unconditional = outFlows.filter((f) => {
          const hasCondition = !!f.querySelector('bpmn\\:conditionExpression, conditionExpression')
          return !hasCondition && f.getAttribute('id') !== defaultFlowId
        })
        if (unconditional.length > 1) {
          errors.push(`排他网关「${label}」有 ${unconditional.length} 条无条件分支，无法确定走哪条`)
        }
      }
    }
  })
  return errors
}

export interface ProcessValidationResult {
  /** 阻断性错误（多问题时以换行拼接）；null 表示通过。 */
  error: string | null
  /** 非阻断警告（展示在部署确认中）。 */
  warnings: string[]
}

/**
 * 流程 BPMN 发布前完整校验（设计器与流程列表共用）。
 *
 * 规则：
 * 1. 必须有且仅有一个开始事件；
 * 2. 必须有结束事件，且每个结束事件必须有入口连线；
 * 3. 开始事件必须有出口连线；
 * 4. 连通性（出/入边、排他网关分支）——与后端部署校验对齐，提前给出可读提示；
 * 5. userTask 必须配置审批/办理人（发起节点除外；有兜底策略的降级为警告）；
 * 6. 内嵌子流程必须包含开始与结束事件。
 */
export function validateProcessXml(
  xml: string,
  nodeConfigs: Record<string, string> = {},
): ProcessValidationResult {
  const warnings: string[] = []
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    return { error: 'BPMN XML 解析失败，请检查流程定义。', warnings }
  }

  const startEvents = doc.querySelectorAll('bpmn\\:startEvent, startEvent')
  const endEvents = doc.querySelectorAll('bpmn\\:endEvent, endEvent')
  const userTasks = doc.querySelectorAll('bpmn\\:userTask, userTask')

  // 1. 必须有开始事件
  if (startEvents.length === 0) {
    return { error: '流程缺少开始事件，请添加一个开始事件。', warnings }
  }
  // 2. 开始事件只能有一个
  if (startEvents.length > 1) {
    return { error: `流程存在 ${startEvents.length} 个开始事件，只允许一个。`, warnings }
  }
  // 3. 必须有结束事件
  if (endEvents.length === 0) {
    return { error: '流程缺少结束事件，请添加至少一个结束事件。', warnings }
  }

  // 4. 开始事件必须有出口连线
  const startEvent = startEvents[0]
  const startId = startEvent.getAttribute('id')
  const hasOutgoingFromStart = doc.querySelector(
    `bpmn\\:sequenceFlow[sourceRef="${startId}"], sequenceFlow[sourceRef="${startId}"]`
  )
  if (!hasOutgoingFromStart) {
    return { error: '开始事件没有出口连线，请连接到下一个节点。', warnings }
  }

  // 5. 每个结束事件必须有入口连线
  for (let i = 0; i < endEvents.length; i++) {
    const endId = endEvents[i].getAttribute('id')
    const hasIncomingToEnd = doc.querySelector(
      `bpmn\\:sequenceFlow[targetRef="${endId}"], sequenceFlow[targetRef="${endId}"]`
    )
    if (!hasIncomingToEnd) {
      return { error: `结束事件「${endEvents[i].getAttribute('name') || endId}」没有入口连线，请连接上游节点。`, warnings }
    }
  }

  // 6. 连通性（出/入边、排他网关）
  const connectivityErrors = validateFlowConnectivity(xml)
  if (connectivityErrors.length) {
    return { error: connectivityErrors.join('\n'), warnings }
  }

  // 7. UserTask 必须配置审批/办理人（发起节点除外，其 assignee 为 ${initiator}）
  for (let i = 0; i < userTasks.length; i++) {
    const taskEl = userTasks[i]
    const taskId = taskEl.getAttribute('id')
    const taskName = taskEl.getAttribute('name') || taskId
    // 发起人节点由发起人自己填报，无需配置审批人
    if (isInitiatorTaskElement(taskEl)) {
      continue
    }
    if (!taskId) {
      continue
    }
    // 节点类别文案：办理节点→办理人，其余（含旧数据无 nodeRole）→审批人
    const role = taskEl.getAttribute('wf:nodeRole') || taskEl.getAttribute('nodeRole')
    const personLabel = role === 'handler' ? '办理人' : '审批人'
    const typeLabel = role === 'handler' ? '办理节点' : '审批节点'
    const configStr = nodeConfigs[taskId]
    if (configStr) {
      try {
        const config = JSON.parse(configStr)
        // 自动审批（自动通过/自动拒绝）无需配置审批人，跳过人员校验
        if (config.approvalType === 'auto_pass' || config.approvalType === 'auto_reject') {
          continue
        }
        const approval = config.approval
        if (!approval || !approval.type) {
          return { error: `${typeLabel}「${taskName}」未配置${personLabel}，请设置类型。`, warnings }
        }
        if (approval.type === 'user' && (!approval.userIds || approval.userIds.length === 0)) {
          const policy = config.assigneeOptions?.noAssigneePolicy || ''
          if (policy === 'auto_pass' || policy === 'to_admin' || policy === 'to_user' || policy === 'skip' || policy === 'supervisor') {
            // 有兜底策略：仅警告，不阻断部署
            warnings.push(`节点「${taskName}」未指定具体人员，将按找不到${personLabel}策略处理`)
          } else {
            return { error: `${typeLabel}「${taskName}」的${personLabel}类型为「指定用户」但未选择用户。`, warnings }
          }
        }
        if (approval.type === 'expression' && !approval.expression) {
          return { error: `${typeLabel}「${taskName}」的${personLabel}类型为「流程表达式」但未设置表达式。`, warnings }
        }
      } catch {
        return { error: `${typeLabel}「${taskName}」的节点配置解析失败。`, warnings }
      }
    } else {
      return { error: `${typeLabel}「${taskName}」未配置${personLabel}，请设置类型。`, warnings }
    }
  }

  // 8. 内嵌子流程必须包含开始与结束事件
  const subErrors = validateSubProcessBoundaries(xml)
  if (subErrors.length) return { error: subErrors.join('；'), warnings }

  return { error: null, warnings }
}
