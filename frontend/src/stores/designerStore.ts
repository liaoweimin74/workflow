import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface NodeConfigData {
  basic?: {
    name?: string
    description?: string
  }
  approval?: {
    type?: 'user' | 'dept_head' | 'expression'
    userIds?: number[]
    expression?: string
    multiMode?: 'countersign' | 'or_sign'
  }
  form?: {
    formDefId?: string
    fieldPermissions?: Record<string, 'EDIT' | 'VIEW' | 'HIDDEN'>
  }
  timeout?: {
    duration?: number
    action?: 'remind' | 'escalate'
  }
  operations?: {
    allowReject?: boolean
    allowAddSign?: boolean
    allowTransfer?: boolean
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

export interface ProcessConfigData {
  approvalPolicy: {
    deduplication: {
      enabled: boolean
      scope: 'GLOBAL' | 'PHASE'
      action: 'AUTO_PASS' | 'SKIP' | 'ESCALATE'
    }
    allowRecall: boolean
    allowAddSigner: boolean
    allowDelegate: boolean
  }
  numberRule: {
    enabled: boolean
    pattern: string
  }
  form?: {
    formDefId?: string
    fieldPermissions?: Record<string, 'EDIT' | 'VIEW' | 'HIDDEN'>
  }
}

export const DEFAULT_PROCESS_CONFIG: ProcessConfigData = {
  approvalPolicy: {
    deduplication: {
      enabled: false,
      scope: 'GLOBAL',
      action: 'AUTO_PASS',
    },
    allowRecall: true,
    allowAddSigner: true,
    allowDelegate: true,
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
      return {
        ...DEFAULT_PROCESS_CONFIG,
        ...parsed,
        approvalPolicy: {
          ...DEFAULT_PROCESS_CONFIG.approvalPolicy,
          ...parsed.approvalPolicy,
          deduplication: {
            ...DEFAULT_PROCESS_CONFIG.approvalPolicy.deduplication,
            ...parsed.approvalPolicy?.deduplication,
          },
        },
        numberRule: {
          ...DEFAULT_PROCESS_CONFIG.numberRule,
          ...parsed.numberRule,
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

  function selectNode(nodeId: string | null, nodeType: string | null) {
    selectedNodeId.value = nodeId
    selectedNodeType.value = nodeType
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
    getProcessConfig,
    setProcessConfig,
    deleteNodeConfig,
    selectNode,
    setDraft,
    setDraftBasicInfo,
    setSavedSnapshot,
    isUnchanged,
    clearConfigs,
    markClean
  }
})
