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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Edit } from '@element-plus/icons-vue'
import { useDesignerStore } from '@/stores/designerStore'
import { formApi, type FormDefinitionDTO, type FormDefinitionDetailDTO } from '@/api/form'

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
    const res = await formApi.getFormDefinitions({ status: 'PUBLISHED', size: 1000 })
    const data = res.data as any
    formList.value = data.content || data.rows || []
  } catch {
    // http 拦截器已弹出错误消息
  }
}

function loadConfig() {
  isLoading = true

  const processConfig = designerStore.getProcessConfig()
  formConfig.formDefId = processConfig.form?.formDefId || ''
  formConfig.fieldPermissions = { ...(processConfig.form?.fieldPermissions || {}) }

  if (formConfig.formDefId) {
    loadFormFields(formConfig.formDefId)
  } else {
    fieldList.value = []
  }

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

function saveConfig() {
  if (isLoading) return

  const processConfig = designerStore.getProcessConfig()
  processConfig.form = {
    formDefId: formConfig.formDefId || undefined,
    fieldPermissions: Object.keys(formConfig.fieldPermissions).length > 0
      ? formConfig.fieldPermissions
      : undefined,
  }

  designerStore.setProcessConfig(processConfig)
}
</script>
