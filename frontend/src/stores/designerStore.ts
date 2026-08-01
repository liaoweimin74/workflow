import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface NodeConfigData {
  basic?: {
    name?: string
    description?: string
  }
  approval?: {
    type?: 'user' | 'role' | 'dept_head' | 'initiator_self' | 'expression'
    value?: string
    multiMode?: 'countersign' | 'or_sign'
  }
  form?: {
    formDefId?: string
    fieldPermissions?: Record<string, 'EDIT' | 'VIEW'>
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
}

export interface DesignerState {
  bpmnXml: string
  nodeConfigs: Record<string, string>
  selectedNodeId: string | null
  selectedNodeType: string | null
  draftId: string | null
  draftName: string | null
}

export const useDesignerStore = defineStore('designer', () => {
  const bpmnXml = ref<string>('')
  const nodeConfigs = ref<Record<string, string>>({})
  const selectedNodeId = ref<string | null>(null)
  const selectedNodeType = ref<string | null>(null)
  const draftId = ref<string | null>(null)
  const draftName = ref<string | null>(null)
  const isDirty = ref(false)

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

  function deleteNodeConfig(nodeId: string) {
    const { [nodeId]: _removed, ...rest } = nodeConfigs.value
    nodeConfigs.value = rest
    isDirty.value = true
  }

  function selectNode(nodeId: string | null, nodeType: string | null) {
    selectedNodeId.value = nodeId
    selectedNodeType.value = nodeType
  }

  function setDraft(id: string, name: string) {
    draftId.value = id
    draftName.value = name
  }

  function clearConfigs() {
    nodeConfigs.value = {}
    selectedNodeId.value = null
    selectedNodeType.value = null
    bpmnXml.value = ''
    draftId.value = null
    draftName.value = null
    isDirty.value = false
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
    isDirty,
    selectedNodeConfig,
    setBpmnXml,
    setNodeConfigs,
    setNodeConfig,
    getNodeConfig,
    deleteNodeConfig,
    selectNode,
    setDraft,
    clearConfigs,
    markClean
  }
})
