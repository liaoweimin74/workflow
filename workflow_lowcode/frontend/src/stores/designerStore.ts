import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * 单个表单字段的数据来源映射配置。
 *
 * source 取值（与后端 FormDataMapping 一致）：
 * - form:initiator   发起人表单（sourceField 必填）
 * - form:&lt;nodeId&gt;   指定节点的表单（sourceField 必填）
 * - variable:&lt;name&gt; 流程变量（sourceField 省略）
 */
export interface FormFieldDataMapping {
  targetField: string
  source: string
  sourceField?: string
}

/** 节点类别：审批节点 / 办理节点（userTask 专用，缺省 approver；发起节点以 BPMN wf:nodeRole=initiator 标识，不写此字段） */
export type NodeTaskRole = 'approver' | 'handler'

export interface NodeConfigData {
  basic?: {
    name?: string
    description?: string
  }
  /** userTask 专用：approver=审批节点 / handler=办理节点；缺省 approver */
  taskRole?: NodeTaskRole
  /** 审批节点专用「审批类型」；缺省 artificial */
  approvalType?: 'artificial' | 'auto_pass' | 'auto_reject'
  approval?: {
    type?:
      | 'user'
      | 'initiator_select'
      | 'role'
      | 'initiator_self'
      | 'form_user'
      | 'external'
      | 'expression'
      // 兼容旧数据的历史类型（引擎不支持，运行时按「找不到办理人」策略处理）：
      | 'post'
      | 'member_group'
      | 'dept_head'
      | 'multi_level'
      | 'report_superior'
      | 'approval_role'
      | 'matrix'
      | 'form_dept_leader'
      | 'form_dept_approval_role'
      | 'approver_designate'
      | 'external_push'
    userIds?: (string | number)[]
    /** 角色编码（type='role' 时生效；引擎按 sys_role.role_code 解析成员） */
    roleCodes?: string[]
    expression?: string
    /** 表单内用户字段名（type='form_user' 时生效；引擎从流程变量取该字段值解析用户） */
    formUserField?: string
    /** 自定义选人（type='external' 时生效；业务系统通过引擎扩展点注册的选人函数） */
    external?: {
      /** 选人函数注册名（引擎进程内 registry 查找） */
      resolver?: string
      /** 节点配置的参数值表（面板按注册函数的参数声明渲染；运行时作为函数第二参传入） */
      params?: Record<string, unknown>
    }
    multiMode?: 'countersign' | 'or_sign' | 'sequential' | ''
  }
  assigneeOptions?: {
    allowInitiatorAdjust?: boolean
    noAssigneePolicy?: '' | 'auto_pass' | 'block' | 'to_admin' | 'to_user' | 'skip' | 'supervisor'
    toUserId?: string | null
  }
  form?: {
    formDefId?: string
    fieldPermissions?: Record<string, 'EDIT' | 'VIEW' | 'HIDDEN'>
    dataMappings?: FormFieldDataMapping[]
  }
  operations?: {
    allowPass?: boolean
    allowRefuse?: boolean
    allowReturn?: boolean
    allowReject?: boolean
    allowAddSign?: boolean
    allowTransfer?: boolean
    allowDelegate?: boolean
  }
  returnOptions?: {
    restartFromHere?: boolean
    chooseStartNode?: boolean
    mustAddSign?: boolean
  }
  commentRequired?: boolean
  /** 意见必填范围：REJECT_RETURN=拒绝/退回必填（缺省按 ALL 兼容旧数据）；ALL=全部操作必填 */
  commentRequiredScope?: 'REJECT_RETURN' | 'ALL'
  blockRecall?: boolean
  timeout?: {
    enabled?: boolean
    duration?: number
    action?: 'remind' | 'escalate' | 'transfer' | 'pass' | 'refuse'
    /** 节点级超时规则组（非空时运行时按规则组处理；legacy duration/action 保留兼容） */
    rules?: ProcessTimeoutRule[]
  }
  dedup?: {
    enabled?: boolean
    skipSameAsInitiator?: boolean
    /** 去重命中口径：CONSECUTIVE=上一节点此审批人已同意 / FIRST=前面任意节点已同意；缺省回落流程级 */
    mode?: 'CONSECUTIVE' | 'FIRST'
  }
  signature?: {
    enabled?: boolean
    useLast?: boolean
    allowUpload?: boolean
    required?: boolean
  }
  notify?: {
    sms?: boolean
  }
  initiator?: {
    disallowRecall?: boolean
    urge?: {
      enabled?: boolean
      interval?: number
      unit?: 'minute' | 'hour' | 'day'
    }
    reInitiate?: boolean
    smsOnEnd?: boolean
  }
  condition?: string
  callActivity?: {
    calledElement?: string
    inParams?: ParamMapping[]
    outParams?: ParamMapping[]
  }
  backendLogic?: BackendLogicItem[]
}

export interface ParamMapping {
  source: string
  target: string
}

export type BackendLogicTrigger = 'ENTER' | 'COMPLETE'
export type BackendLogicErrorAction = 'IGNORE_CONTINUE' | 'FAIL_FLOW'
export type BackendLogicType = 'http' | 'bean' | 'script'

export interface BackendLogicHttpConfig {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  queryParams?: ParamMapping[]
  bodyParams?: ParamMapping[]
  connTimeoutMs?: number
  readTimeoutMs?: number
  retryCount?: number
}

export interface BackendLogicBeanConfig {
  beanName: string
  methodName: string
  params?: ParamMapping[]
}

export interface BackendLogicScriptConfig {
  language: 'groovy'
  source: string
}

export interface BackendLogicItem {
  id: string
  name: string
  enabled: boolean
  trigger: BackendLogicTrigger
  type: BackendLogicType
  errorAction: BackendLogicErrorAction
  http?: BackendLogicHttpConfig
  bean?: BackendLogicBeanConfig
  script?: BackendLogicScriptConfig
}

// ========== 流程级配置 ==========
export const PROCESS_CONFIG_KEY = '__PROCESS__'

export interface ProcessVariableMapping {
  /** 目标流程变量名（流程级唯一，区分大小写） */
  variable: string
  /** 数据源：form:initiator / form:<nodeId> / variable:<name> */
  source: string
  /** 源表单字段名（仅 form:* 源需要） */
  sourceField?: string
}

/** 流程级超时规则（规则组；对齐钉钉「添加超时规则」）。
 * 约束：remind 可多条；transfer 最多 1 条；pass/refuse 互斥且各最多 1 条；
 * pass/refuse 对办理（handler）节点不生效（引擎扫描时跳过）。 */
export interface ProcessTimeoutRule {
  id: string
  action: 'remind' | 'transfer' | 'pass' | 'refuse'
  /** 超时时长（配合 unit） */
  duration: number
  unit: 'minute' | 'hour' | 'day'
  /** 重复提醒（仅 remind；间隔 = duration） */
  repeat: boolean
  /** 被提醒人：当前审批人（仅 remind/transfer） */
  notifyAssignee: boolean
  /** 被提醒人：审批管理员（仅 remind/transfer） */
  notifyAdmin: boolean
  /** 被提醒人：更多员工（仅 remind；用户 ID 列表） */
  notifyUserIds: string[]
  /** 通知方式：短信（落 wf_engine_notify） */
  sms: boolean
}

export interface ProcessConfigData {
  approvalPolicy: {
    deduplication: {
      enabled: boolean
      scope: 'GLOBAL' | 'PHASE'
      /** 去重命中口径：CONSECUTIVE=连续出现仅需一次 / FIRST=全流程仅首次需审批 / LAST=全流程仅最后需审批 */
      mode: 'CONSECUTIVE' | 'FIRST' | 'LAST'
      action: 'AUTO_PASS' | 'SKIP' | 'ESCALATE'
      /** 发起人与审批人为同一人时无需审批 */
      skipSameAsInitiator: boolean
    }
    // 流程级操作权限总控（节点级 operations 覆盖，生效 = AND）
    operations: {
      allowReject: boolean
      allowAddSign: boolean
      allowTransfer: boolean
      allowDelegate: boolean
    }
    /** 审批处理意见必填（流程级）：REJECT_RETURN=拒绝/退回必填；ALL=全部操作必填。与节点级冲突时取更严 */
    commentPolicy: {
      enabled: boolean
      scope: 'REJECT_RETURN' | 'ALL'
    }
    /** 手写签名（流程级总控+默认值）：enabled=false 时全部节点禁用；节点未配置时作为默认 */
    signaturePolicy: {
      enabled: boolean
      useLast: boolean
      allowUpload: boolean
      required: boolean
    }
    /** 评论管理（引擎预留：评论端点落地后生效；详情 VO 透出供前端门禁） */
    comment: {
      disabled: boolean
      disallowDelete: boolean
      disallowAttachment: boolean
    }
    /** 审批召回：审批人可在下个节点审批前召回自己已办的审批重新处理 */
    approveRecall: boolean
    /** 流程退回后重新审批时，已通过节点无需再审批（自动通过） */
    retakeSkipApproved: boolean
  }
  /** 自定义审批标题模板：{{processName}}/{{initiator}}/{{date}}/{{表单字段名}} */
  titleRule: {
    enabled: boolean
    pattern: string
  }
  /** 自定义摘要（最多 5 个表单字段）；showInSms=在短信中展示摘要 */
  summaryRule: {
    enabled: boolean
    fields: string[]
    showInSms: boolean
  }
  /** 动态流程：实时查找审批人与条件分支（引擎审批人本就运行时解析；配置存档供扩展） */
  dynamicProcess: boolean
  /** 流程级超时规则组（节点未开启超时处理时兜底生效） */
  timeoutRules: ProcessTimeoutRule[]
  /** 可发起人员范围：ALL=所有人可发起；SPECIFIED=仅命中用户/角色可发起（引擎 start() 门禁） */
  starterScope: {
    mode: 'ALL' | 'SPECIFIED'
    /** 用户 ID 列表（字符串，与实例 initiator 同口径） */
    userIds: string[]
    /** 角色编码列表（与审批节点 role 选人口径一致，引擎按 sys_role.role_code 解析） */
    roleIds: string[]
  }
  /** 流程级审批管理员（用户 ID 列表）：超时转派/被提醒人、找不到办理人兜底优先取此名单，未配置回落系统管理员 */
  adminUserIds: string[]
  numberRule: {
    enabled: boolean
    pattern: string
  }
  form?: {
    formDefId?: string
    fieldPermissions?: Record<string, 'EDIT' | 'VIEW' | 'HIDDEN'>
  }
  variableMappings?: ProcessVariableMapping[]
}

export const DEFAULT_PROCESS_CONFIG: ProcessConfigData = {
  approvalPolicy: {
    deduplication: {
      enabled: false,
      scope: 'GLOBAL',
      mode: 'CONSECUTIVE',
      action: 'AUTO_PASS',
      skipSameAsInitiator: false,
    },
    operations: {
      allowReject: true,
      allowAddSign: true,
      allowTransfer: true,
      allowDelegate: true,
    },
    commentPolicy: {
      enabled: false,
      scope: 'REJECT_RETURN',
    },
    signaturePolicy: {
      enabled: false,
      useLast: false,
      allowUpload: false,
      required: false,
    },
    comment: {
      disabled: false,
      disallowDelete: false,
      disallowAttachment: false,
    },
    approveRecall: false,
    retakeSkipApproved: false,
  },
  titleRule: {
    enabled: false,
    pattern: '',
  },
  summaryRule: {
    enabled: false,
    fields: [],
    showInSms: false,
  },
  dynamicProcess: false,
  timeoutRules: [],
  starterScope: {
    mode: 'ALL',
    userIds: [],
    roleIds: [],
  },
  adminUserIds: [],
  numberRule: {
    enabled: false,
    pattern: '{{year}}-{{seq:4}}',
  },
}

export interface DesignerState {
  bpmnXml: string
  nodeConfigs: Record<string, string>
  selectedNodeId: string | null
  selectedNodeType: string | null
  /** 当前选中节点的 wf:nodeRole（initiator/approver/handler），非 userTask 为 null */
  selectedNodeRole: string | null
  draftId: string | null
  draftName: string | null
  draftKey: string | null
  draftCategoryId: string | null
  draftDescription: string
}

export const useDesignerStore = defineStore('designer', () => {
  const bpmnXml = ref<string>('')
  const nodeConfigs = ref<Record<string, string>>({})
  const selectedNodeId = ref<string | null>(null)
  const selectedNodeType = ref<string | null>(null)
  const selectedNodeRole = ref<string | null>(null)
  const draftId = ref<string | null>(null)
  const draftName = ref<string | null>(null)
  const draftKey = ref<string | null>(null)
  const draftCategoryId = ref<string | null>(null)
  const draftDescription = ref<string>('')
  const isDirty = ref(false)

  // 保存快照：记录上次加载/保存时的 XML 和 nodeConfigs，用于判断是否有实际变更
  const lastSavedXml = ref<string>('')
  const lastSavedNodeConfigs = ref<string>('')

  const selectedNodeConfig = computed<NodeConfigData | null>(() => {
    if (!selectedNodeId.value) return null
    const raw = nodeConfigs.value[selectedNodeId.value]
    if (!raw) return null
    try {
      return JSON.parse(raw) as NodeConfigData
    } catch {
      return null
    }
  })

  function setBpmnXml(xml: string) {
    bpmnXml.value = xml
    isDirty.value = true
  }

  function setNodeConfigs(configs: Record<string, string>) {
    nodeConfigs.value = { ...configs }
    isDirty.value = false
  }

  function setNodeConfig(nodeId: string, config: NodeConfigData) {
    nodeConfigs.value = {
      ...nodeConfigs.value,
      [nodeId]: JSON.stringify(config)
    }
    isDirty.value = true
  }

  function getNodeConfig(nodeId: string): NodeConfigData | null {
    const raw = nodeConfigs.value[nodeId]
    if (!raw) return null
    try {
      return JSON.parse(raw) as NodeConfigData
    } catch {
      return null
    }
  }

  function getProcessConfig(): ProcessConfigData {
    const raw = nodeConfigs.value[PROCESS_CONFIG_KEY]
    if (!raw) return { ...DEFAULT_PROCESS_CONFIG }
    try {
      const parsed = JSON.parse(raw) as Partial<ProcessConfigData>
      // 兼容旧配置：忽略已废弃的 allowAddSigner / allowDelegate / allowRecall 字段。
      // allowRecall 曾是流程属性面板的「允许撤回」开关，但引擎从未读取（撤回门禁
      // 只看发起节点 initiator.disallowRecall 与活跃节点 blockRecall），已移除 UI，
      // 存量 JSON 里的该键在此剔除，避免透传成幽灵字段。
      const storedApprovalPolicy = parsed.approvalPolicy as
        | (Partial<ProcessConfigData['approvalPolicy']> & {
            allowAddSigner?: boolean
            allowDelegate?: boolean
            allowRecall?: boolean
          })
        | undefined
      const {
        allowAddSigner: _allowAddSigner,
        allowDelegate: _allowDelegate,
        allowRecall: _allowRecall,
        ...restApprovalPolicy
      } = storedApprovalPolicy ?? {}
      return {
        ...DEFAULT_PROCESS_CONFIG,
        ...parsed,
        approvalPolicy: {
          ...DEFAULT_PROCESS_CONFIG.approvalPolicy,
          ...restApprovalPolicy,
          deduplication: {
            ...DEFAULT_PROCESS_CONFIG.approvalPolicy.deduplication,
            ...(restApprovalPolicy.deduplication ?? {}),
          },
          operations: {
            ...DEFAULT_PROCESS_CONFIG.approvalPolicy.operations,
            ...(restApprovalPolicy.operations ?? {}),
          },
          commentPolicy: {
            ...DEFAULT_PROCESS_CONFIG.approvalPolicy.commentPolicy,
            ...(restApprovalPolicy.commentPolicy ?? {}),
          },
          signaturePolicy: {
            ...DEFAULT_PROCESS_CONFIG.approvalPolicy.signaturePolicy,
            ...(restApprovalPolicy.signaturePolicy ?? {}),
          },
          comment: {
            ...DEFAULT_PROCESS_CONFIG.approvalPolicy.comment,
            ...(restApprovalPolicy.comment ?? {}),
          },
        },
        titleRule: {
          ...DEFAULT_PROCESS_CONFIG.titleRule,
          ...(parsed.titleRule ?? {}),
        },
        summaryRule: {
          ...DEFAULT_PROCESS_CONFIG.summaryRule,
          ...(parsed.summaryRule ?? {}),
        },
        timeoutRules: Array.isArray(parsed.timeoutRules)
          ? parsed.timeoutRules
          : DEFAULT_PROCESS_CONFIG.timeoutRules,
        starterScope: {
          ...DEFAULT_PROCESS_CONFIG.starterScope,
          ...(parsed.starterScope ?? {}),
          userIds: Array.isArray(parsed.starterScope?.userIds)
            ? parsed.starterScope.userIds
            : [],
          roleIds: Array.isArray(parsed.starterScope?.roleIds)
            ? parsed.starterScope.roleIds
            : [],
        },
        adminUserIds: Array.isArray(parsed.adminUserIds) ? parsed.adminUserIds : [],
        numberRule: {
          ...DEFAULT_PROCESS_CONFIG.numberRule,
          ...(parsed.numberRule ?? {}),
        },
      }
    } catch {
      return { ...DEFAULT_PROCESS_CONFIG }
    }
  }

  function setProcessConfig(config: ProcessConfigData) {
    nodeConfigs.value = {
      ...nodeConfigs.value,
      [PROCESS_CONFIG_KEY]: JSON.stringify(config),
    }
    isDirty.value = true
  }

  function deleteNodeConfig(nodeId: string) {
    const { [nodeId]: _removed, ...rest } = nodeConfigs.value
    nodeConfigs.value = rest
    isDirty.value = true
  }

  function selectNode(nodeId: string | null, nodeType: string | null, nodeRole: string | null = null) {
    selectedNodeId.value = nodeId
    selectedNodeType.value = nodeType
    selectedNodeRole.value = nodeRole
  }

  /**
   * 读取节点类别（审批/办理）：取 nodeConfigs JSON 的 taskRole，缺省 approver。
   * 与后端约定一致：旧数据无 taskRole 一律按审批节点处理。
   */
  function getNodeTaskRole(nodeId: string): NodeTaskRole {
    const raw = nodeConfigs.value[nodeId]
    if (!raw) return 'approver'
    try {
      const parsed = JSON.parse(raw) as NodeConfigData
      return parsed.taskRole === 'handler' ? 'handler' : 'approver'
    } catch {
      return 'approver'
    }
  }

  function setDraft(id: string, name: string, key: string) {
    draftId.value = id
    draftName.value = name
    draftKey.value = key
  }

  /** 流程基本属性入 store（Task 74：名称/分类/说明均可由设计器「基本属性」分组维护） */
  function setDraftBasicInfo(data: { name?: string; categoryId?: string | null; description?: string }) {
    if (data.name !== undefined) draftName.value = data.name
    if (data.categoryId !== undefined) draftCategoryId.value = data.categoryId
    if (data.description !== undefined) draftDescription.value = data.description
    isDirty.value = true
  }

  /** 记录保存快照（加载流程或保存成功后调用） */
  function setSavedSnapshot(xml: string, configs: Record<string, string>) {
    lastSavedXml.value = xml
    lastSavedNodeConfigs.value = JSON.stringify(configs)
  }

  /** 判断当前数据是否与上次快照一致（无变化） */
  function isUnchanged(currentXml: string): boolean {
    return currentXml === lastSavedXml.value
      && JSON.stringify(nodeConfigs.value) === lastSavedNodeConfigs.value
  }

  function clearConfigs() {
    nodeConfigs.value = {}
    selectedNodeId.value = null
    selectedNodeType.value = null
    selectedNodeRole.value = null
    bpmnXml.value = ''
    draftId.value = null
    draftName.value = null
    draftKey.value = null
    draftCategoryId.value = null
    draftDescription.value = ''
    isDirty.value = false
    lastSavedXml.value = ''
    lastSavedNodeConfigs.value = ''
  }

  function markClean() {
    isDirty.value = false
  }

  return {
    bpmnXml,
    nodeConfigs,
    selectedNodeId,
    selectedNodeType,
    selectedNodeRole,
    draftId,
    draftName,
    draftKey,
    draftCategoryId,
    draftDescription,
    isDirty,
    selectedNodeConfig,
    setBpmnXml,
    setNodeConfigs,
    setNodeConfig,
    getNodeConfig,
    getNodeTaskRole,
    getProcessConfig,
    setProcessConfig,
    deleteNodeConfig,
    selectNode,
    setDraft,
    setDraftBasicInfo,
    setSavedSnapshot,
    isUnchanged,
    clearConfigs,
    markClean,
  }
})
