<template>
  <div class="form-renderer" v-loading="loading">
    <form-create
      v-if="resolvedSchema && resolvedSchema.length > 0"
      :rule="resolvedSchema"
      :option="renderOption"
      v-model="formData"
    />
    <el-empty v-else-if="!loading" description="暂无表单" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import formCreate from '@form-create/element-ui'
import { formApi, type FormDataDTO } from '@/api/form'

const props = defineProps<{
  formDefId: string
  processInstanceId?: string
  taskId?: string
  fieldPermissions?: Record<string, 'EDIT' | 'VIEW' | 'HIDDEN'>
}>()

const emit = defineEmits<{
  (e: 'loaded', formData: Record<string, any>): void
  (e: 'submitted', formDataId: string): void
}>()

const loading = ref(false)
const resolvedSchema = ref<any[]>([])
const formData = ref<Record<string, any>>({})
const existingFormDataId = ref<string | null>(null)
const formVersion = ref<number | null>(null)

const renderOption = ref({
  submitBtn: false,
  resetBtn: false,
})

onMounted(async () => {
  await loadSchema()
  if (props.processInstanceId) {
    await loadData()
  }
  if (props.fieldPermissions) {
    applyPermissions(props.fieldPermissions)
  }
})

async function loadSchema() {
  loading.value = true
  try {
    const res = await formApi.getFormDefinition(props.formDefId)
    const formDef = res.data
    if (!formDef.schema || formDef.schema === '[]') {
      ElMessage.warning('表单 schema 为空')
      return
    }
    const schema = JSON.parse(formDef.schema)
    resolvedSchema.value = schema
    formVersion.value = formDef.version
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    loading.value = false
  }
}

async function loadData() {
  if (!props.processInstanceId) return
  try {
    const res = await formApi.getFormData(props.processInstanceId, props.formDefId)
    if (res.data) {
      const formDataDto = res.data as FormDataDTO
      existingFormDataId.value = formDataDto.id
      try {
        formData.value = JSON.parse(formDataDto.dataJson || '{}')
      } catch {
        formData.value = {}
      }
      emit('loaded', formData.value)
    }
  } catch {
    // http 拦截器已弹出错误消息
  }
}

function applyPermissions(permissions: Record<string, 'EDIT' | 'VIEW' | 'HIDDEN'>) {
  resolvedSchema.value = resolvedSchema.value.map(field => {
    const permission = permissions[field.field]
    if (!permission) return field

    const updatedField = { ...field }
    if (permission === 'VIEW') {
      updatedField.disabled = true
    } else if (permission === 'HIDDEN') {
      updatedField.display = false
    }
    return updatedField
  })
}

async function submit(): Promise<boolean> {
  try {
    const dataJson = JSON.stringify(formData.value)
    if (existingFormDataId.value) {
      const res = await formApi.updateFormData(existingFormDataId.value, {
        formDefId: props.formDefId,
        processInstanceId: props.processInstanceId,
        taskId: props.taskId,
        dataJson,
      })
      ElMessage.success('表单已保存')
      emit('submitted', res.data.id)
    } else {
      const res = await formApi.saveFormData({
        formDefId: props.formDefId,
        processInstanceId: props.processInstanceId,
        taskId: props.taskId,
        dataJson,
      })
      existingFormDataId.value = res.data.id
      ElMessage.success('表单已保存')
      emit('submitted', res.data.id)
    }
    return true
  } catch {
    return false
  }
}

function getFormData(): Record<string, any> {
  return formData.value
}

defineExpose({ submit, getFormData, loadSchema, loadData })
</script>

<style scoped>
.form-renderer {
  min-height: 200px;
}
</style>
