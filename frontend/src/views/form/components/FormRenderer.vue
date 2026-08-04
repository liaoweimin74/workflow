<template>
  <div class="form-renderer" v-loading="loading">
    <!-- FormRule[] 路径：直接渲染 XForm + XField -->
    <XForm
      v-if="formRules"
      ref="xFormRef"
      :model="formData"
      :label-width="formOptions.labelWidth || '100px'"
      :label-position="formOptions.labelPosition || 'right'"
      :footer="false"
    >
      <XField
        v-for="rule in formRules"
        :key="rule.field || rule.prop"
        :name="rule.field || rule.prop"
        :label="rule.title || rule.label"
        :editor="getEditor(rule) as any"
        :props="getFieldProps(rule)"
        :options="rule.options"
        :required="isRequired(rule)"
        :rules="getRules(rule)"
      />
    </XForm>

    <!-- VTJ DSL 路径：使用 createRenderer -->
    <template v-else-if="renderer">
      <Suspense>
        <template #default>
          <component :is="renderer" />
        </template>
        <template #fallback>
          <div style="text-align: center; padding: 20px;">加载中...</div>
        </template>
      </Suspense>
    </template>

    <el-empty v-else-if="!loading" description="暂无表单" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, shallowRef, computed } from 'vue'
import { ElMessage, ElTreeSelect } from 'element-plus'
import { createRenderer } from '@vtj/renderer'
import type { Context } from '@vtj/renderer'
import type { BlockSchema } from '@vtj/core'
import { XForm, XField, registerFieldEditors } from '@vtj/ui'
import { formApi, type FormDataDTO } from '@/api/form'
import { applyPermissionsToDsl, isFormRuleArray, type VtjDsl, type FieldPermission } from '@/utils/vtjDsl'
import type { FormRule } from '@/components/business/types'
import LookupPicker from '@/components/business/LookupPicker.vue'

/** 注册自定义编辑器 */
registerFieldEditors({
  treeSelect: {
    component: ElTreeSelect,
    props: {
      clearable: true,
      checkStrictly: true,
      nodeKey: 'id',
    },
  },
  LookupPicker: {
    component: LookupPicker,
    props: {},
  },
})

/** DSL shape used internally — VtjDsl (loose) avoids TS2589 from BlockSchema's recursive unions */
type RendererDsl = VtjDsl

/** form-create type → VTJ XField editor 映射 */
const FORM_TYPE_TO_EDITOR: Record<string, string> = {
  input: 'text',
  textarea: 'textarea',
  select: 'select',
  radio: 'radio',
  checkbox: 'checkbox',
  inputNumber: 'number',
  number: 'number',
  date: 'date',
  datePicker: 'date',
  time: 'time',
  timePicker: 'time',
  datetime: 'datetime',
  dateTimePicker: 'datetime',
  switch: 'switch',
  slider: 'slider',
  rate: 'rate',
  cascader: 'cascader',
  treeSelect: 'treeSelect',
  LookupPicker: 'LookupPicker',
}

const props = defineProps<{
  /** 表单定义 ID，传入后通过 API 加载 schema。与 rule 互斥，formDefId 优先。 */
  formDefId?: string
  /** 直接传入 VTJ DSL 对象或旧版 FormRule 数组，无需 API 调用。用于 CRUD 页面。 */
  rule?: BlockSchema | FormRule[]
  /** 预填表单数据，变化时自动同步到 formData。 */
  initialValues?: Record<string, unknown>
  processInstanceId?: string
  taskId?: string
  fieldPermissions?: Record<string, 'EDIT' | 'VIEW' | 'HIDDEN'>
}>()

const emit = defineEmits<{
  (e: 'loaded', formData: Record<string, any>): void
  (e: 'submitted', formDataId: string): void
}>()

const loading = ref(false)
const resolvedSchema = ref<RendererDsl | null>(null)
const formData = ref<Record<string, any>>({})
const existingFormDataId = ref<string | null>(null)
const formVersion = ref<number | null>(null)

/** XForm ref（FormRule[] 路径） */
const xFormRef = ref<any>(null)

/** VTJ renderer context — holds reactive state（DSL 路径） */
const vtjContext = shallowRef<Context | null>(null)

/** 判断是否为 FormRule[] 路径 */
const formRules = computed<FormRule[] | null>(() => {
  if (!props.rule) return null
  if (isFormRuleArray(props.rule)) return props.rule as FormRule[]
  return null
})

/** FormRule[] 路径的表单选项 */
const formOptions = computed(() => ({
  labelWidth: '100px',
  labelPosition: 'right',
}))

// ============================================================
// FormRule[] 路径的辅助函数
// ============================================================

function getEditor(rule: FormRule): string {
  return FORM_TYPE_TO_EDITOR[rule.type] || 'text'
}

function getFieldProps(rule: FormRule): Record<string, any> {
  const p: Record<string, any> = { ...(rule.props || {}) }
  if (rule.options) {
    p.options = rule.options
  }
  // LookupPicker: returnFields 回填逻辑
  if (rule.type === 'LookupPicker' && rule.props?.returnFields) {
    const returnFields = rule.props.returnFields
    const fieldName = rule.field || rule.prop || ''
    p.onSelect = (row: any) => {
      if (!row || !xFormRef.value?.model) return
      // 选中的行赋值给当前字段
      xFormRef.value.model[fieldName] = row
      // 回填其他字段
      for (const [sourceField, targetField] of Object.entries(returnFields)) {
        xFormRef.value.model[targetField as string] = row[sourceField]
      }
    }
    delete p.returnFields
  }
  return p
}

function isRequired(rule: FormRule): boolean {
  if (!rule.validate) return false
  return rule.validate.some((v: any) => v.required)
}

function getRules(rule: FormRule): any[] | undefined {
  if (!rule.validate) return undefined
  const requiredRule = rule.validate.find((v: any) => v.required)
  if (requiredRule && requiredRule.message) {
    return [{ required: true, message: requiredRule.message, trigger: requiredRule.trigger || 'blur' }]
  }
  return undefined
}

// ============================================================
// VTJ DSL 路径的 renderer
// ============================================================

const renderer = computed(() => {
  if (!resolvedSchema.value) return null
  const dsl = resolvedSchema.value
  try {
    const { renderer: r, context } = createRenderer({
      dsl: dsl as unknown as BlockSchema,
      components: { XForm, XField },
    })
    vtjContext.value = context
    // Sync initial form data into VTJ context state
    if (Object.keys(formData.value).length > 0) {
      syncToContext()
    }
    return r
  } catch (e) {
    console.error('[FormRenderer] createRenderer error:', e)
    return null
  }
})

function syncToContext() {
  if (vtjContext.value && formData.value) {
    for (const key of Object.keys(formData.value)) {
      vtjContext.value.state[key] = formData.value[key]
    }
  }
}

// ============================================================
// 生命周期
// ============================================================

onMounted(async () => {
  if (props.formDefId) {
    await loadSchema()
  } else if (props.rule && !isFormRuleArray(props.rule)) {
    // VTJ DSL 直接使用
    resolvedSchema.value = props.rule as unknown as RendererDsl
  }
  if (props.initialValues) {
    formData.value = { ...props.initialValues }
  }
  if (props.processInstanceId) {
    await loadData()
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
}, { immediate: true })

// DSL 路径：formData 变化时同步到 VTJ context state
watch(formData, () => {
  if (resolvedSchema.value) {
    syncToContext()
  }
}, { deep: true })

async function loadSchema() {
  if (!props.formDefId) return
  loading.value = true
  try {
    const res = await formApi.getFormDefinition(props.formDefId)
    const formDef = res.data
    if (!formDef.schema || formDef.schema === '[]' || formDef.schema === '{}') {
      ElMessage.warning('表单 schema 为空')
      return
    }
    const schema = JSON.parse(formDef.schema) as RendererDsl
    resolvedSchema.value = schema
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
    const res = await formApi.getFormData(props.processInstanceId, props.formDefId)
    if (res.data) {
      const formDataDto = res.data as FormDataDTO
      existingFormDataId.value = formDataDto.id
      try {
        formData.value = JSON.parse(formDataDto.dataJson)
      } catch {
        formData.value = {}
      }
      emit('loaded', formData.value)
    }
  } catch {
    // http 拦截器已弹出错误消息
  }
}

function applyPermissions(permissions: Record<string, FieldPermission>) {
  if (!resolvedSchema.value) return
  const dsl: VtjDsl = JSON.parse(JSON.stringify(resolvedSchema.value))
  const result = applyPermissionsToDsl(dsl, permissions)
  resolvedSchema.value = result as RendererDsl
}

async function submit(): Promise<boolean> {
  try {
    // FormRule[] 路径：从 XForm 内部 model 读取
    if (formRules.value && xFormRef.value?.model) {
      const valid = await xFormRef.value?.validate?.().catch(() => false)
      if (!valid) return false
      formData.value = { ...xFormRef.value.model }
    }
    // DSL 路径：从 VTJ context 读取
    if (vtjContext.value && vtjContext.value.state) {
      formData.value = { ...vtjContext.value.state }
    }
    const dataJson = JSON.stringify(formData.value)
    const formDefId = props.formDefId ?? ''
    if (existingFormDataId.value) {
      const res = await formApi.updateFormData(existingFormDataId.value, {
        formDefId,
        processInstanceId: props.processInstanceId,
        taskId: props.taskId,
        dataJson,
      })
      ElMessage.success('表单已保存')
      emit('submitted', res.data.id)
    } else {
      const res = await formApi.saveFormData({
        formDefId,
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

function getFormData(): Record<string, unknown> {
  // FormRule[] 路径：从 XForm 内部 model 读取（用户编辑后的真实数据）
  if (xFormRef.value?.model) {
    return { ...xFormRef.value.model }
  }
  // DSL 路径：从 VTJ context 读取
  if (vtjContext.value && vtjContext.value.state) {
    return { ...vtjContext.value.state }
  }
  return { ...formData.value }
}

function validate(): Promise<boolean> {
  if (xFormRef.value) {
    return xFormRef.value.validate().then(() => true).catch(() => false)
  }
  return Promise.resolve(true)
}

function resetFields() {
  if (xFormRef.value) {
    xFormRef.value.resetFields()
  } else {
    formData.value = {}
  }
}

defineExpose({ submit, getFormData, validate, resetFields })
</script>
