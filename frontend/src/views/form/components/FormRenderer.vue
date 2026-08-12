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
import { ref, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import formCreate, { type Rule } from '@form-create/element-ui'
import { formApi, type FormDataDTO } from '@/api/form'

const props = defineProps<{
  /** 表单定义 ID，传入后通过 API 加载 schema。与 rule 互斥，formDefId 优先。 */
  formDefId?: string
  /** 直接传入 form-create rule 数组，无需 API 调用。用于 CRUD 页面。 */
  rule?: Rule[]
  /** 预填表单数据，变化时自动同步到 formData。 */
  initialValues?: Record<string, unknown>
  processInstanceId?: string
  taskId?: string
  fieldPermissions?: Record<string, 'EDIT' | 'VIEW' | 'HIDDEN'>
  /** 是否只读模式。true 时所有字段 disabled，用于已办详情等查看场景。 */
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'loaded', formData: Record<string, any>): void
  (e: 'submitted', formDataId: string): void
}>()

const loading = ref(false)
const resolvedSchema = ref<Rule[]>([])
const formData = ref<Record<string, unknown>>({})
const existingFormDataId = ref<string | null>(null)
const formVersion = ref<number | null>(null)

const renderOption = ref({
  submitBtn: false,
  resetBtn: false,
})

onMounted(async () => {
  if (props.formDefId) {
    await loadSchema()
  } else if (props.rule) {
    resolvedSchema.value = props.rule
  }
  if (props.initialValues) {
    formData.value = { ...props.initialValues }
  }
  if (props.processInstanceId) {
    await loadData()
  }
  if (props.readonly) {
    // form-create 的 rule 用 props.disabled 控制字段禁用
    resolvedSchema.value = resolvedSchema.value.map(f => {
      const props = f.props || {}
      return { ...f, props: { ...props, disabled: true } }
    })
  }
  if (props.fieldPermissions) {
    applyPermissions(props.fieldPermissions)
  }
})

// 监听 initialValues 变化，同步到 formData
watch(() => props.initialValues, (newVal) => {
  if (newVal) {
    formData.value = { ...newVal }
  }
})

async function loadSchema() {
  if (!props.formDefId) return
  loading.value = true
  try {
    const res = await formApi.getFormDefinition(props.formDefId)
    const formDef = res.data
    if (!formDef.schema || formDef.schema === '[]') {
      ElMessage.warning('表单 schema 为空')
      return
    }
    const schema = JSON.parse(formDef.schema)
    const rules = Array.isArray(schema) ? schema : (schema.rule || [])
    resolvedSchema.value = rules
    formVersion.value = formDef.version
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    loading.value = false
  }
}

async function loadData() {
  if (!props.processInstanceId || !props.formDefId) return
  try {
    // 1. 优先按 taskId 查审批快照（已办详情场景）
    if (props.taskId) {
      const snapRes = await formApi.getFormDataByTask(props.taskId)
      if (snapRes.data) {
        existingFormDataId.value = snapRes.data.id
        try {
          formData.value = JSON.parse(snapRes.data.dataJson || '{}')
        } catch {
          formData.value = {}
        }
        emit('loaded', formData.value)
        return
      }
    }
    // 2. 查当前数据（节点间传递场景）
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
    const fieldName = (field as Record<string, unknown>).field as string | undefined
    if (!fieldName) return field
    const permission = permissions[fieldName]
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
    const formDefId = props.formDefId ?? ''
    // 保存当前数据（upsert，用于节点间传递）
    const res = await formApi.saveFormData({
      formDefId,
      processInstanceId: props.processInstanceId,
      taskId: props.taskId,
      dataJson,
    })
    existingFormDataId.value = res.data.id
    emit('submitted', res.data.id)
    return true
  } catch {
    return false
  }
}

function getFormData(): Record<string, unknown> {
  return formData.value
}

/**
 * 保存审批快照（冻结当前表单数据，供历史查看）。
 * 与 submit 不同：submit 保存可变的当前数据，saveSnapshot 创建不可变的历史记录。
 */
async function saveSnapshot(): Promise<boolean> {
  try {
    const dataJson = JSON.stringify(formData.value)
    const formDefId = props.formDefId ?? ''
    await formApi.saveSnapshot({
      formDefId,
      processInstanceId: props.processInstanceId,
      taskId: props.taskId,
      dataJson,
    })
    return true
  } catch {
    return false
  }
}

defineExpose({ submit, saveSnapshot, getFormData, loadSchema, loadData })
</script>

<style scoped>
.form-renderer {
  min-height: 200px;
}
</style>
