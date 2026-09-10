<template>
  <div class="process-form-property-tab">
    <el-form label-width="90px" size="small" :disabled="readOnly">
      <el-form-item label="表单配置">
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

      <el-form-item v-if="!formConfig.formDefId">
        <span style="color: #909399; font-size: 12px;">
          配置流程默认表单后，未单独配置表单的节点将使用此表单。
        </span>
      </el-form-item>

      <template v-if="formConfig.formDefId && fieldList.length > 0">
        <el-divider content-position="left">字段权限</el-divider>

        <el-table :data="fieldList" border size="small" style="width: 100%">
          <el-table-column prop="label" label="字段名" min-width="120" />
          <el-table-column label="权限" width="120" align="center">
            <template #default="{ row }">
              <el-select
                v-model="formConfig.fieldPermissions[row.field]"
                size="small"
                style="width: 100%"
                :disabled="readOnly"
                @change="saveConfig"
              >
                <el-option label="可编辑" value="EDIT" />
                <el-option label="只读" value="VIEW" />
                <el-option label="隐藏" value="HIDDEN" />
              </el-select>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <el-form-item v-if="formConfig.formDefId && fieldList.length === 0 && !loadingFields">
        <span style="color: #909399; font-size: 12px;">该表单暂无字段</span>
      </el-form-item>
    </el-form>

    <template v-if="formConfig.formDefId">
      <el-divider content-position="left">流程变量映射</el-divider>

      <div class="mapping-rows">
        <div v-for="(m, i) in mappings" :key="i" class="mapping-row">
          <div class="mapping-row-line">
            <el-input
              v-model="m.variable"
              class="mapping-variable-input"
              size="small"
              placeholder="流程变量名"
              :disabled="readOnly"
            />
            <el-select
              v-model="m.source"
              class="mapping-source-select"
              size="small"
              style="width: 140px"
              placeholder="数据来源"
              :disabled="readOnly"
              @change="onSourceChange(i)"
            >
              <el-option label="发起人表单字段" value="initiator" />
              <el-option label="指定节点字段" value="node" />
              <el-option label="流程变量" value="variable" />
            </el-select>
            <el-button
              class="mapping-remove-btn"
              size="small"
              type="danger"
              link
              :disabled="readOnly"
              @click="removeMapping(i)"
            >
              删除
            </el-button>
          </div>
          <el-select
            v-if="m.source === 'initiator'"
            v-model="m.sourceField"
            class="mapping-source-field-select"
            size="small"
            placeholder="选择源字段"
            :disabled="readOnly"
          >
            <el-option v-for="f in initiatorFormFields" :key="f.field" :label="f.label" :value="f.field" />
          </el-select>
          <template v-else-if="m.source === 'node'">
            <el-select
              v-model="m.sourceNodeId"
              class="mapping-source-node-select"
              size="small"
              placeholder="选择源节点"
              :disabled="readOnly"
              @change="onNodeChange(i)"
            >
              <el-option v-for="n in formTaskNodes" :key="n.id" :label="n.label" :value="n.id" />
            </el-select>
            <el-select
              v-if="m.sourceNodeId"
              v-model="m.sourceField"
              class="mapping-source-field-select"
              size="small"
              placeholder="选择源字段"
              :disabled="readOnly"
            >
              <el-option v-for="f in nodeFormFields" :key="f.field" :label="f.label" :value="f.field" />
            </el-select>
          </template>
          <el-input
            v-else-if="m.source === 'variable'"
            v-model="m.variableName"
            class="mapping-source-variable-input"
            size="small"
            placeholder="源变量名"
            :disabled="readOnly"
          />
          <div v-if="isDuplicateVariable(i)" class="mapping-variable-error">
            变量名已存在，请更换
          </div>
        </div>
      </div>

      <el-button
        class="add-mapping-btn"
        size="small"
        :disabled="readOnly"
        @click="addMapping"
      >
        + 添加映射
      </el-button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Edit } from '@element-plus/icons-vue'
import { useDesignerStore, type ProcessVariableMapping } from '@/stores/designerStore'
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

const formConfig = reactive<{
  formDefId: string
  fieldPermissions: Record<string, 'EDIT' | 'VIEW' | 'HIDDEN'>
}>({
  formDefId: '',
  fieldPermissions: {},
})

/** 流程变量映射条目（UI 态） */
interface VariableMappingRow {
  variable: string
  source: '' | 'initiator' | 'node' | 'variable'
  sourceField?: string
  sourceNodeId?: string
  variableName?: string
}

const mappings = reactive<VariableMappingRow[]>([])

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

// 流程级配置不依赖 selectedNodeId，但需要响应 store 变化
watch(() => designerStore.draftId, () => {
  loadConfig()
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

/** 从 bpmnXml 解析已绑定表单的 userTask 节点（供"指定节点"下拉） */
function loadTaskNodes() {
  formTaskNodes.value = []
  const xml = designerStore.bpmnXml
  if (!xml) return
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  const tasks = doc.querySelectorAll('bpmn\\:userTask, userTask')
  tasks.forEach((el) => {
    const id = el.getAttribute('id')
    if (id) {
      const name = el.getAttribute('name')
      const config = designerStore.getNodeConfig(id)
      // 仅展示已绑定表单的节点
      if (config?.form?.formDefId) {
        formTaskNodes.value.push({ id, label: name || id })
      }
    }
  })
}

/** 反向解析已保存的 variableMappings → UI 态 */
function parseVariableMappings(list: ProcessVariableMapping[] | undefined): VariableMappingRow[] {
  return (list || []).map((m) => {
    const [prefix, ...rest] = m.source.split(':')
    if (prefix === 'variable') {
      return { variable: m.variable, source: 'variable' as const, variableName: rest.join(':') }
    }
    if (prefix === 'form') {
      const key = rest.join(':')
      if (key === 'initiator') {
        return { variable: m.variable, source: 'initiator' as const, sourceField: m.sourceField }
      }
      return { variable: m.variable, source: 'node' as const, sourceNodeId: key, sourceField: m.sourceField }
    }
    return { variable: m.variable, source: '' as const }
  })
}

function loadConfig() {
  isLoading = true

  const processConfig = designerStore.getProcessConfig()
  formConfig.formDefId = processConfig.form?.formDefId || ''
  formConfig.fieldPermissions = { ...(processConfig.form?.fieldPermissions || {}) }
  mappings.splice(0, mappings.length, ...parseVariableMappings(processConfig.variableMappings))

  if (formConfig.formDefId) {
    loadFormFields(formConfig.formDefId)
  } else {
    fieldList.value = []
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
  if (formDefId) {
    await loadFormFields(formDefId)
    fieldList.value.forEach(f => {
      formConfig.fieldPermissions[f.field] = 'EDIT'
    })
  } else {
    fieldList.value = []
  }
  saveConfig()
}

function addMapping() {
  mappings.push({ variable: '', source: '' })
  saveConfig()
}

function removeMapping(index: number) {
  mappings.splice(index, 1)
  saveConfig()
}

/** 目标变量名是否与前面的行重复（保留先出现者，仅标记后加入的重复行） */
function isDuplicateVariable(index: number): boolean {
  const name = mappings[index]?.variable?.trim()
  if (!name) return false
  return mappings.some((row, j) => j < index && row.variable?.trim() === name)
}

/** 数据来源类型切换：重置子配置，并按需加载源字段/节点列表 */
async function onSourceChange(index: number) {
  const row = mappings[index]
  row.sourceField = undefined
  row.sourceNodeId = undefined
  row.variableName = undefined
  if (row.source === 'initiator') {
    await loadInitiatorFields()
  } else if (row.source === 'node') {
    await loadTaskNodes()
  }
  saveConfig()
}

/** 指定节点切换：加载该节点表单字段 */
async function onNodeChange(index: number) {
  const row = mappings[index]
  row.sourceField = undefined
  nodeFormFields.value = []
  if (row.sourceNodeId) {
    const nodeConfig = designerStore.getNodeConfig(row.sourceNodeId)
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

/** 组装保存格式；过滤空行、未配全的行与重复变量名行 */
function buildVariableMappings(): ProcessVariableMapping[] {
  return mappings
    .map((row, i) => {
      const variable = row.variable.trim()
      if (!variable || isDuplicateVariable(i)) return null
      if (row.source === 'variable') {
        return row.variableName ? { variable, source: `variable:${row.variableName}` } : null
      }
      if (row.source === 'initiator') {
        return row.sourceField ? { variable, source: 'form:initiator', sourceField: row.sourceField } : null
      }
      if (row.source === 'node') {
        return row.sourceNodeId && row.sourceField
          ? { variable, source: `form:${row.sourceNodeId}`, sourceField: row.sourceField }
          : null
      }
      return null
    })
    .filter((m): m is ProcessVariableMapping => m !== null)
}

function saveConfig() {
  if (isLoading) return

  const processConfig = designerStore.getProcessConfig()
  processConfig.form = {
    formDefId: formConfig.formDefId || undefined,
    fieldPermissions: Object.keys(formConfig.fieldPermissions).length > 0
      ? formConfig.fieldPermissions
      : undefined,
  }
  const vm = buildVariableMappings()
  processConfig.variableMappings = vm.length > 0 ? vm : undefined

  designerStore.setProcessConfig(processConfig)
}

watch(mappings, () => {
  saveConfig()
}, { deep: true })
</script>

<style scoped>
.process-form-property-tab {
  padding: 0;
}

.mapping-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 10px;
}

.mapping-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
}

.mapping-row-line {
  display: flex;
  gap: 8px;
  align-items: center;
}

.mapping-row-line .mapping-variable-input {
  flex: 1;
}

.mapping-variable-error {
  color: #f56c6c;
  font-size: 12px;
}
</style>
