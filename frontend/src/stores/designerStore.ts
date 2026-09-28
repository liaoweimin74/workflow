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
      | 'post'
      | 'member_group'
      | 'role'
      | 'initiator_self'
      | 'dept_head'
      | 'multi_level'
      | 'report_superior'
      | 'approval_role'
      | 'matrix'
      | 'form_user'
      | 'form_dept_leader'
      | 'form_dept_approval_role'
      | 'approver_designate'
      | 'external'
      | 'external_push'
      | 'expression'
    userIds?: (string | number)[]
    /** 角色编码（type='role' 时生效；引擎按 sys_role.role_code 解析成员） */
    roleCodes?: string[]
    expression?: string
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
  blockRecall?: boolean
  timeout?: {
    enabled?: boolean
    duration?: number
    action?: 'remind' | 'escalate' | 'transfer' | 'pass' | 'refuse'
  }
  dedup?: {
    enabled?: boolean
    skipSameAsInitiator?: boolean
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
  resultVar?: string
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

export interface ProcessConfigData {
  approvalPolicy: {
    deduplication: {
      enabled: boolean
      scope: 'GLOBAL' | 'PHASE'
      action: 'AUTO_PASS' | 'SKIP' | 'ESCALATE'
    }
    // 流程级操作权限总控（节点级 operations 覆盖，生效 = AND）
    operations: {
      allowReject: boolean
      allowAddSign: boolean
      allowTransfer: boolean
      allowDelegate: boolean
    }
  }
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
      action: 'AUTO_PASS',
    },
    operations: {
      allowReject: true,
      allowAddSign: true,
      allowTransfer: true,
      allowDelegate: true,
    },
  },
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
        },
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

  function setDraftBasicInfo(data: { categoryId?: string | null; description?: string }) {
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
