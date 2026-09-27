/**
 * AI 流程计划：LLM 输出的中间表示 + 归一化校验（纯函数，无依赖）。
 *
 * 设计约束：
 *   - LLM 只产出「计划」（plan），不直接产出 BPMN XML —— XML 由 ai-process-bpmn
 *     按确定性模板拼装，杜绝模型生成 XML 的格式风险。
 *   - 归一化必须让产物「保存即可部署」：审批人类型缺名单时降级为部门负责人，
 *     key 非法时 slug 化，节点缺失时自动补发起节点。
 */

/** 审批人配置（与设计器 UserTaskProperty 的 config.approval 契约一致）。 */
export interface PlanApproval {
  type: 'user' | 'dept_head' | 'expression'
  userIds: number[]
  expression: string
  multiMode: '' | 'countersign' | 'or_sign' | 'sequential'
}

/** 操作权限（与设计器 UserTaskProperty 的 config.operations 契约一致）。 */
export interface PlanOperations {
  allowReject: boolean
  allowAddSign: boolean
  allowTransfer: boolean
  allowDelegate: boolean
}

/** 超时设置（与设计器 UserTaskProperty 的 config.timeout 契约一致）。 */
export interface PlanTimeout {
  duration: number
  action: 'remind' | 'escalate'
}

/** 节点表单引用：优先按名称匹配已有表单，匹配不到且有描述则新建表单。 */
export interface PlanFormRef {
  formName: string
  formDescription: string
}

/** 节点计划（首版支持发起节点与审批节点，线性串联）。 */
export interface PlanNode {
  type: 'initiator' | 'userTask'
  name: string
  approval: PlanApproval | null
  operations: PlanOperations | null
  timeout: PlanTimeout | null
  formRef: PlanFormRef | null
}

/** 流程计划。 */
export interface ProcessPlan {
  name: string
  key: string
  nodes: PlanNode[]
  /** 流程级（发起）表单引用；为 null 时尝试沿用首个带表单引用的节点。 */
  processFormRef: PlanFormRef | null
}

export interface NormalizedPlan {
  plan: ProcessPlan
  /** 归一化期间做的修正（回复给用户/日志）。 */
  warnings: string[]
}

/** 流程 key 规则：小写字母开头，小写字母/数字/下划线，3~50 位。 */
const KEY_PATTERN = /^[a-z][a-z0-9_]{2,49}$/

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

/** key slug 化：非 [a-z0-9_] 字符转下划线、压缩连续下划线、数字开头补前缀。 */
export function slugifyKey(raw: string): string {
  const lowered = raw.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  const prefixed = /^[0-9]/.test(lowered) ? `p_${lowered}` : lowered
  const trimmed = prefixed.slice(0, 50)
  return trimmed.length >= 3 ? trimmed : `process_${trimmed}`
}

/** 归一化审批人配置：type=user 且无名单 → 降级 dept_head（保证保存即可部署）。 */
function normalizeApproval(raw: unknown, nodeName: string, warnings: string[]): PlanApproval | null {
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return null
  }
  const obj = raw as Record<string, unknown>
  const rawType = str(obj['type']).toLowerCase()
  let type: PlanApproval['type']
  if (rawType === 'user' || rawType.includes('指定用户') || rawType.includes('指定人')) {
    type = 'user'
  } else if (rawType === 'expression' || rawType.includes('表达式')) {
    type = 'expression'
  } else {
    // dept_head / 缺省 / 中文「部门负责人」等一律归一为 dept_head
    type = 'dept_head'
  }

  const userIds = Array.isArray(obj['userIds'])
    ? obj['userIds'].map((u) => Number(u)).filter((u) => Number.isInteger(u) && u > 0)
    : []
  let expression = str(obj['expression'])
  if (type === 'user' && userIds.length === 0) {
    warnings.push(`节点「${nodeName}」审批类型为指定用户但无名单，已降级为部门负责人`)
    type = 'dept_head'
  }
  if (type === 'expression' && expression === '') {
    expression = '${initiator.deptManager}'
    warnings.push(`节点「${nodeName}」审批类型为流程表达式但未给出，已使用默认表达式 ${expression}`)
  }

  const rawMode = str(obj['multiMode']).toLowerCase()
  const multiMode =
    rawMode === 'countersign' || rawMode === 'or_sign' || rawMode === 'sequential'
      ? (rawMode as PlanApproval['multiMode'])
      : ''

  return { type, userIds, expression, multiMode }
}

function normalizeOperations(raw: unknown): PlanOperations {
  const obj = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    allowReject: bool(obj['allowReject'], true),
    allowAddSign: bool(obj['allowAddSign'], false),
    allowTransfer: bool(obj['allowTransfer'], true),
    allowDelegate: bool(obj['allowDelegate'], false),
  }
}

function normalizeTimeout(raw: unknown, nodeName: string, warnings: string[]): PlanTimeout | null {
  if (raw === null || raw === undefined || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const duration = Number(obj['duration'])
  if (!Number.isFinite(duration) || duration <= 0) return null
  const action = obj['action'] === 'escalate' ? 'escalate' : 'remind'
  if (duration > 24 * 30) {
    warnings.push(`节点「${nodeName}」超时时间超过 720 小时，已截断为 720`)
    return { duration: 720, action }
  }
  return { duration: Math.round(duration), action }
}

function normalizeFormRef(raw: unknown): PlanFormRef | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string') {
    const name = raw.trim()
    return name === '' ? null : { formName: name, formDescription: '' }
  }
  if (typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const formName = str(obj['formName']) || str(obj['name'])
  const formDescription = str(obj['formDescription']) || str(obj['description'])
  if (formName === '' && formDescription === '') return null
  return { formName, formDescription }
}

/**
 * 归一化 LLM 产出的计划：
 *   - name 缺省 → 用 key/固定名兜底；key 非法 → slug 化
 *   - nodes 为空 → 报错（无法成流程）
 *   - 首节点非发起 → 自动补「提交申请」发起节点
 *   - 发起节点配置了审批 → 清掉（发起人即申请人，无需审批人）
 */
export function normalizePlan(raw: unknown): NormalizedPlan {
  const warnings: string[] = []
  const obj = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}

  const name = str(obj['name']) || str(obj['title']) || 'AI 生成流程'
  let key = str(obj['key'])
  if (!KEY_PATTERN.test(key)) {
    const slugged = slugifyKey(key || name)
    if (key !== '') {
      warnings.push(`流程标识「${key}」不符合规则，已调整为「${slugged}」`)
    }
    key = slugged
  }

  const rawNodes = Array.isArray(obj['nodes']) ? obj['nodes'] : []
  const nodes: PlanNode[] = []
  for (const item of rawNodes.slice(0, 20)) {
    if (item === null || typeof item !== 'object') continue
    const nodeObj = item as Record<string, unknown>
    const rawType = str(nodeObj['type']).toLowerCase()
    const nodeName = str(nodeObj['name']) || `审批节点${nodes.length + 1}`
    const isInitiator =
      rawType === 'initiator' || rawType.includes('发起') || rawType.includes('提交')
    if (!isInitiator && rawType !== 'usertask' && rawType !== 'user_task' && rawType !== 'approval' && !rawType.includes('审批')) {
      // 未知类型（gateway/serviceTask 等）首版跳过并提示
      warnings.push(`节点「${nodeName}」类型 ${rawType || '未知'} 暂不支持自动生成，已跳过`)
      continue
    }
    if (isInitiator) {
      nodes.push({
        type: 'initiator',
        name: nodeName,
        approval: null,
        operations: null,
        timeout: null,
        formRef: normalizeFormRef(nodeObj['form'] ?? nodeObj['formRef'] ?? nodeObj['formDef']),
      })
      continue
    }
    nodes.push({
      type: 'userTask',
      name: nodeName,
      approval: normalizeApproval(nodeObj['approval'], nodeName, warnings),
      operations: normalizeOperations(nodeObj['operations']),
      timeout: normalizeTimeout(nodeObj['timeout'], nodeName, warnings),
      formRef: normalizeFormRef(nodeObj['form'] ?? nodeObj['formRef'] ?? nodeObj['formDef']),
    })
  }

  // 补发起节点：用户需求里常省略「提交申请」环节
  if (nodes.length === 0 || nodes[0].type !== 'initiator') {
    warnings.push('已自动补充发起节点「提交申请」')
    nodes.unshift({
      type: 'initiator',
      name: '提交申请',
      approval: null,
      operations: null,
      timeout: null,
      formRef: null,
    })
  }

  // 发起节点清掉审批配置（发起人即申请人）
  for (const node of nodes) {
    if (node.type === 'initiator' && node.approval !== null) {
      node.approval = null
    }
  }

  const processFormRef = normalizeFormRef(obj['processForm'] ?? obj['processFormRef'])
  // 发起节点未给表单引用时沿用流程级引用（两者本就同源）
  const initiator = nodes[0]
  if (initiator.formRef === null && processFormRef !== null) {
    initiator.formRef = processFormRef
  }
  if (initiator.formRef !== null && processFormRef === null) {
    warnings.push('流程级表单将跟随发起节点的表单绑定')
  }

  return {
    plan: { name, key, nodes, processFormRef: initiator.formRef },
    warnings,
  }
}
