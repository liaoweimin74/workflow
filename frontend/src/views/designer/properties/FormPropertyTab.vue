<template>
  <div class="form-property-tab">
    <el-divider content-position="left">表单配置</el-divider>

    <el-form label-width="90px" size="small" :disabled="readOnly">
      <el-form-item label="关联表单">
        <div style="display: flex; gap: 8px; width: 100%;">
          <el-select
            v-model="formConfig.formDefId"
            placeholder="请选择已发布的表单"
            filterable
            clearable
            style="flex: 1"
            @change="handleFormChange"
          >
            <el-option
              v-for="form in formList"
              :key="form.id"
              :label="`${form.name} (v${form.version})`"
              :value="form.id"
            />
          </el-select>
          <el-tooltip content="编辑表单" placement="top">
            <el-button
              v-if="formConfig.formDefId && !readOnly"
              :icon="Edit"
              circle
              size="small"
              type="primary"
              plain
              @click="jumpToFormDesigner"
            />
          </el-tooltip>
        </div>
      </el-form-item>

      <template v-if="formConfig.formDefId && fieldList.length > 0">
        <el-divider content-position="left">字段权限</el-divider>

        <el-table :data="fieldList" border size="small" style="width: 100%">
          <el-table-column prop="label" label="字段名" min-width="100" />
          <el-table-column label="权限" width="80" align="center">
            <template #default="{ row }">
              <el-select
                v-model="formConfig.fieldPermissions[row.field]"
                size="small"
                style="width: 100%"
                class="perm-select"
                :disabled="readOnly"
                @change="saveConfig"
              >
                <el-option label="编辑" value="EDIT" />
                <el-option label="只读" value="VIEW" />
                <el-option label="隐藏" value="HIDDEN" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="数据来源" min-width="130" align="center">
            <template #default="{ row }">
              <div class="source-cell">
                <el-select
                  v-model="formConfig.dataMappings[row.field].source"
                  size="small"
                  style="width: 100%"
                  class="source-select"
                  :disabled="readOnly"
                  @change="onSourceChange(row.field)"
                >
                  <el-option label="无" value="" />
                  <el-option label="发起人表单" value="initiator" />
                  <el-option label="指定节点" value="node" />
                  <el-option label="流程变量" value="variable" />
                </el-select>
                <el-select
                  v-if="formConfig.dataMappings[row.field].source === 'initiator'"
                  v-model="formConfig.dataMappings[row.field].sourceField"
                  size="small"
                  style="width: 100%"
                  class="source-field-select"
                  placeholder="选择源字段"
                  :disabled="readOnly"
                  @change="saveConfig"
                >
                  <el-option v-for="f in initiatorFormFields" :key="f.field" :label="f.label" :value="f.field" />
                </el-select>
                <template v-else-if="formConfig.dataMappings[row.field].source === 'node'">
                  <el-select
                    v-model="formConfig.dataMappings[row.field].sourceNodeId"
                    size="small"
                    style="width: 100%"
                    class="source-node-select"
                    placeholder="选择源节点"
                    :disabled="readOnly"
                    @change="onNodeChange(row.field)"
                  >
                    <el-option v-for="n in formTaskNodes" :key="n.id" :label="n.label" :value="n.id" />
                  </el-select>
                  <el-select
                    v-if="formConfig.dataMappings[row.field].sourceNodeId"
                    v-model="formConfig.dataMappings[row.field].sourceField"
                    size="small"
                    style="width: 100%"
                    class="source-field-select"
                    placeholder="选择源字段"
                    :disabled="readOnly"
                    @change="saveConfig"
                  >
                    <el-option v-for="f in nodeFormFields" :key="f.field" :label="f.label" :value="f.field" />
                  </el-select>
                </template>
                <el-input
                  v-else-if="formConfig.dataMappings[row.field].source === 'variable'"
                  v-model="formConfig.dataMappings[row.field].variableName"
                  size="small"
                  class="variable-name-input"
                  placeholder="变量名"
                  :disabled="readOnly"
                  @change="saveConfig"
                />
              </div>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <el-form-item v-if="formConfig.formDefId && fieldList.length === 0 && !loadingFields">
        <span style="color: #909399; font-size: 12px;">该表单暂无字段</span>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Edit } from '@element-plus/icons-vue'
import { useDesignerStore, type NodeConfigData, type FormFieldDataMapping } from '@/stores/designerStore'
import { formApi, type FormDefinitionDTO, type FormDefinitionDetailDTO } from '@/api/form'
import { isInitiatorTaskElement } from '../utils/bpmnValidation'

defineProps<{ readOnly?: boolean }>()

const designerStore = useDesignerStore()
const router = useRouter()
const route = useRoute()

let isLoading = false

const formList = ref<FormDefinitionDTO[]>([])
const fieldList = ref<{ field: string; label: string }[]>([])
const loadingFields = ref(false)

/** 数据来源配置（按 targetField 索引，UI 态） */
interface FieldSourceConfig {
  source: '' | 'initiator' | 'node' | 'variable'
  sourceField?: string
  sourceNodeId?: string
  variableName?: string
}

const formConfig = reactive<{
  formDefId: string
  fieldPermissions: Record<string, 'EDIT' | 'VIEW' | 'HIDDEN'>
  dataMappings: Record<string, FieldSourceConfig>
}>({
  formDefId: '',
  fieldPermissions: {},
  dataMappings: {},
})

/** 发起人表单的字段列表（供源字段下拉） */
const initiatorFormFields = ref<{ field: string; label: string }[]>([])
/** 指定节点表单的字段列表 */
const nodeFormFields = ref<{ field: string; label: string }[]>([])
/** 已绑定表单的节点列表（供"指定节点"下拉） */
const formTaskNodes = ref<{ id: string; label: string }[]>([])

onMounted(async () => {
  await loadFormList()
  loadConfig()
})

watch(() => designerStore.selectedNodeId, (newId, oldId) => {
  if (newId && newId !== oldId) {
    loadConfig()
  }
})

async function loadFormList() {
  try {
    const res = await formApi.getFormDefinitions({ type: 'WORKFLOW', status: 'PUBLISHED', size: 1000 })
    const data = res.data as any
    formList.value = data.content || data.rows || []
  } catch {
    // http 拦截器已弹出错误消息
  }
}

/** 从 bpmnXml 解析发起人节点 id（wf:nodeRole=initiator） */
function findInitiatorNodeId(): string | null {
  const xml = designerStore.bpmnXml
  if (!xml) return null
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  const tasks = doc.querySelectorAll('bpmn\\:userTask, userTask')
  for (const el of tasks) {
    if (isInitiatorTaskElement(el)) return el.getAttribute('id')
  }
  return null
}

/** 从 bpmnXml 解析所有 userTask 节点（供"指定节点"下拉） */
function loadTaskNodes() {
  formTaskNodes.value = []
  const xml = designerStore.bpmnXml
  if (!xml) return
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  const tasks = doc.querySelectorAll('bpmn\\:userTask, userTask')
  tasks.forEach((el) => {
    const id = el.getAttribute('id')
    if (id && id !== designerStore.selectedNodeId) {
      const name = el.getAttribute('name')
      const config = designerStore.getNodeConfig(id)
      // 仅展示已绑定表单的节点
      if (config?.form?.formDefId) {
        formTaskNodes.value.push({ id, label: name || id })
      }
    }
  })
}

function loadConfig() {
  isLoading = true

  formConfig.formDefId = ''
  formConfig.fieldPermissions = {}
  formConfig.dataMappings = {}
  fieldList.value = []

  const existing = designerStore.getNodeConfig(designerStore.selectedNodeId!)
  if (existing?.form) {
    formConfig.formDefId = existing.form.formDefId || ''
    const fp = existing.form.fieldPermissions || {}
    formConfig.fieldPermissions = { ...fp }
    // 反向解析已保存的 dataMappings → UI 态
    const savedMappings = existing.form.dataMappings || []
    savedMappings.forEach((m) => {
      const [prefix, ...rest] = m.source.split(':')
      if (prefix === 'variable') {
        formConfig.dataMappings[m.targetField] = { source: 'variable', variableName: rest.join(':') }
      } else if (prefix === 'form') {
        const key = rest.join(':')
        if (key === 'initiator') {
          formConfig.dataMappings[m.targetField] = { source: 'initiator', sourceField: m.sourceField }
        } else {
          formConfig.dataMappings[m.targetField] = { source: 'node', sourceNodeId: key, sourceField: m.sourceField }
        }
      }
    })
  }

  if (formConfig.formDefId) {
    loadFormFields(formConfig.formDefId)
  }

  loadTaskNodes()
  setTimeout(() => { isLoading = false }, 0)
}

async function loadFormFields(formDefId: string) {
  loadingFields.value = true
  try {
    const res = await formApi.getFormDefinition(formDefId)
    const formDef = res.data as FormDefinitionDetailDTO
    if (formDef.schema && formDef.schema !== '[]') {
      const schema = JSON.parse(formDef.schema)
      const rules = Array.isArray(schema) ? schema : (schema.rule || [])
      fieldList.value = rules.map((item: any) => ({
        field: item.field || item.prop || '',
        label: item.title || item.label || item.field || '',
      })).filter((item: any) => item.field)
      // 确保每个字段在 dataMappings 中有条目（模板 v-model 直接访问）
      fieldList.value.forEach((f) => {
        if (!formConfig.dataMappings[f.field]) {
          formConfig.dataMappings[f.field] = { source: '' }
        }
      })
    } else {
      fieldList.value = []
    }
  } catch {
    fieldList.value = []
  } finally {
    loadingFields.value = false
  }
}

function jumpToFormDesigner() {
  if (!formConfig.formDefId) return
  router.push({
    name: 'FormDesigner',
    query: {
      id: formConfig.formDefId,
      returnTo: `/designer?id=${route.query.id}`
    }
  })
}

async function handleFormChange(formDefId: string) {
  formConfig.fieldPermissions = {}
  formConfig.dataMappings = {}
  if (formDefId) {
    await loadFormFields(formDefId)
    // 默认所有字段为 EDIT
    fieldList.value.forEach(f => {
      formConfig.fieldPermissions[f.field] = 'EDIT'
    })
    // 默认数据来源为"无"
    fieldList.value.forEach(f => {
      formConfig.dataMappings[f.field] = { source: '' }
    })
  } else {
    fieldList.value = []
  }
  saveConfig()
}

/** 数据来源类型切换：重置子配置，并按需加载源字段/节点列表 */
async function onSourceChange(targetField: string) {
  const mapping = formConfig.dataMappings[targetField]
  mapping.sourceField = undefined
  mapping.sourceNodeId = undefined
  mapping.variableName = undefined
  if (mapping.source === 'initiator') {
    await loadInitiatorFields()
  } else if (mapping.source === 'node') {
    await loadTaskNodes()
  }
  saveConfig()
}

/** 指定节点切换：加载该节点表单字段 */
async function onNodeChange(targetField: string) {
  const mapping = formConfig.dataMappings[targetField]
  mapping.sourceField = undefined
  nodeFormFields.value = []
  if (mapping.sourceNodeId) {
    const nodeConfig = designerStore.getNodeConfig(mapping.sourceNodeId)
    if (nodeConfig?.form?.formDefId) {
      await loadFields(nodeConfig.form.formDefId, nodeFormFields.value)
    }
  }
  saveConfig()
}

/** 加载发起人表单字段（源字段下拉） */
async function loadInitiatorFields() {
  initiatorFormFields.value = []
  const initiatorNodeId = findInitiatorNodeId()
  if (!initiatorNodeId) return
  const initiatorConfig = designerStore.getNodeConfig(initiatorNodeId)
  if (initiatorConfig?.form?.formDefId) {
    await loadFields(initiatorConfig.form.formDefId, initiatorFormFields.value)
  }
}

async function loadFields(formDefId: string, target: { field: string; label: string }[]) {
  try {
    const res = await formApi.getFormDefinition(formDefId)
    const formDef = res.data as FormDefinitionDetailDTO
    if (formDef.schema && formDef.schema !== '[]') {
      const schema = JSON.parse(formDef.schema)
      const rules = Array.isArray(schema) ? schema : (schema.rule || [])
      target.splice(0, target.length, ...rules.map((item: any) => ({
        field: item.field || item.prop || '',
        label: item.title || item.label || item.field || '',
      })).filter((item: any) => item.field))
    }
  } catch {
    target.splice(0, target.length)
  }
}

function buildDataMappings(): FormFieldDataMapping[] {
  return Object.entries(formConfig.dataMappings)
    .filter(([, v]) => v.source !== '')
    .map(([targetField, v]) => {
      if (v.source === 'variable') {
        return v.variableName ? { targetField, source: `variable:${v.variableName}` } : null
      }
      if (v.source === 'initiator') {
        return v.sourceField ? { targetField, source: 'form:initiator', sourceField: v.sourceField } : null
      }
      if (v.source === 'node') {
        return v.sourceNodeId && v.sourceField
          ? { targetField, source: `form:${v.sourceNodeId}`, sourceField: v.sourceField }
          : null
      }
      return null
    })
    .filter((m): m is FormFieldDataMapping => m !== null)
}

function saveConfig() {
  if (!designerStore.selectedNodeId) return
  if (isLoading) return

  const existing = designerStore.getNodeConfig(designerStore.selectedNodeId!) || {}

  const nodeConfig: NodeConfigData = {
    ...existing,
    form: {
      formDefId: formConfig.formDefId || undefined,
      fieldPermissions: Object.keys(formConfig.fieldPermissions).length > 0
        ? formConfig.fieldPermissions
        : undefined,
      dataMappings: buildDataMappings().length > 0 ? buildDataMappings() : undefined,
    },
  }

  designerStore.setNodeConfig(designerStore.selectedNodeId, nodeConfig)
}

watch(formConfig, () => {
  saveConfig()
}, { deep: true })
</script>

<style scoped>
.form-property-tab {
  padding: 0 4px;
}

.source-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
